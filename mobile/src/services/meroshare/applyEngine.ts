import type { AccountMeta } from '../../types/account';
import { getSecrets } from '../../storage/accountsStorage';
import { unmarkApplied } from '../../storage/applyHistory';
import { recordIpoApply } from '../../storage/bankTrackerStorage';
import {
  filterRealOperationalAccounts,
  pickLeadAccount,
} from '../../utils/accountOperational';
import { MeroshareClient, DEMO_OPENINGS } from './client';
import {
  buildMockApplyResult,
  isMockAccountId,
  mockApplyScenarioForAccount,
} from '../../data/mockAccounts';
import {
  ALREADY_APPLIED_DISPLAY_MSG,
  ALREADY_APPLIED_USER_MSG,
  isAlreadyAppliedMeroshareMessage,
  isAlreadyAppliedApplyMessage,
  isRejectedApplicantMeroshareMessage,
  isRejectedApplicantApplyMessage,
  isRoleRestrictedMeroshareMessage,
  isTransientMeroshareError,
  isTransientMeroshareMessage,
  MeroshareError,
  sanitizeMeroshareMessage,
} from './errors';
import type {
  ApplyAccountResult,
  BulkApplySummary,
  OpenIssue,
} from './types';

/** Pause between accounts — keep low for bulk speed; MeroShare still gets a fresh login per account. */
const ACCOUNT_GAP_MS = 500;
const ACCOUNT_GAP_BULK_MS = 350;

/** Par value per IPO unit (Rs) — ordinary Nepali IPOs are issued at par. */
const IPO_PRICE_PER_UNIT = 100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const ALREADY_APPLIED_MSG = ALREADY_APPLIED_USER_MSG;

const ROLE_RESTRICTED_MSG =
  'Role Not Authorized — MeroShare blocked this account from the bank/apply API (common for minor or restricted accounts). This is a CDSC permission, not bulk speed.';

function finalizeApplyRow(row: ApplyAccountResult): ApplyAccountResult {
  if (
    isAlreadyAppliedMeroshareMessage(row.message) ||
    isAlreadyAppliedApplyMessage(row.message)
  ) {
    return {
      ...row,
      ok: true,
      message: ALREADY_APPLIED_DISPLAY_MSG,
    };
  }
  return row;
}

function buildApplyResultRow(
  account: AccountMeta,
  applyRes: {
    ok: boolean;
    message: string;
    dryRun: boolean;
    rejectedPrevious?: boolean;
    canReapply?: boolean;
  },
  issue: OpenIssue,
  kitta: number,
): ApplyAccountResult {
  const message = applyRes.ok
    ? sanitizeMeroshareMessage(applyRes.message)
    : applyRes.rejectedPrevious
      ? applyRes.message
      : formatApplyError(applyRes.message);
  return finalizeApplyRow({
    accountId: account.id,
    accountName: account.name,
    username: account.username,
    ok: applyRes.ok,
    dryRun: applyRes.dryRun,
    message,
    companyName: issue.companyName,
    kitta,
    rejectedPrevious: applyRes.rejectedPrevious,
    canReapply: applyRes.canReapply,
  });
}

/** Make MeroShare CRN/PIN apply failures obvious in results UI */
function formatApplyError(msg: string): string {
  const clean = sanitizeMeroshareMessage(msg);
  if (isAlreadyAppliedMeroshareMessage(clean)) {
    return ALREADY_APPLIED_MSG;
  }
  if (isRejectedApplicantMeroshareMessage(clean)) {
    return clean;
  }
  if (isRoleRestrictedMeroshareMessage(clean)) {
    return ROLE_RESTRICTED_MSG;
  }
  const m = clean.toLowerCase();
  if (
    /transaction\s*pin|invalid\s*pin|incorrect\s*pin|wrong\s*pin|pin\s*(code|number)?/i.test(
      m,
    )
  ) {
    return `Wrong transaction PIN — ${clean}`;
  }
  if (/\bcrn\b/i.test(m)) {
    return `Wrong CRN — ${clean}`;
  }
  if (isTransientMeroshareMessage(clean)) {
    return `MeroShare is busy right now. Retry this account in a moment. (${clean})`;
  }
  if (/insufficient|not enough|low balance|block[_\s-]?fail/i.test(m)) {
    return 'Rejected — you have insufficient amount in your bank account';
  }
  return clean;
}

/**
 * CDSC often returns "unable to process" / busy text on repeat apply (same account + IPO).
 * If the application report shows this account already applied, show that instead of busy.
 */
async function finalizeFailedApplyMessage(
  client: MeroshareClient,
  companyShareId: number,
  rawMessage: string,
  opts?: { skipStatusProbe?: boolean },
): Promise<string> {
  const formatted = formatApplyError(rawMessage);
  if (isAlreadyAppliedApplyMessage(formatted)) return formatted;

  const clean = sanitizeMeroshareMessage(rawMessage);
  const looksLikeBusy =
    isTransientMeroshareMessage(clean) ||
    /mero\s*share\s*is\s*busy/i.test(formatted);

  if (!looksLikeBusy || opts?.skipStatusProbe) return formatted;

  try {
    const status = await client.checkApplicationStatus(companyShareId, {
      applicationPhase: true,
      bulkFast: true,
    });
    if (status.status !== 'NOT_APPLIED') {
      return ALREADY_APPLIED_MSG;
    }
  } catch {
    // keep busy — genuine overload or report unavailable
  }
  return formatted;
}

async function failedApplyResult(
  client: MeroshareClient,
  companyShareId: number,
  dryRun: boolean,
  rawMessage: string,
  opts?: { skipStatusProbe?: boolean },
): Promise<{
  ok: false;
  dryRun: boolean;
  message: string;
  rejectedPrevious?: boolean;
  canReapply?: boolean;
}> {
  const message = await finalizeFailedApplyMessage(
    client,
    companyShareId,
    rawMessage,
    opts,
  );
  return {
    ok: false,
    dryRun,
    message,
    rejectedPrevious: isRejectedApplicantMeroshareMessage(rawMessage),
    canReapply: isRejectedApplicantMeroshareMessage(rawMessage),
  };
}

export type BulkApplyOptions = {
  accounts: AccountMeta[];
  issue: OpenIssue;
  kitta: number;
  /** Default false — live apply to MeroShare */
  dryRun?: boolean;
  /** Clear local apply lock + use CDSC reApply flow (status-screen retries). */
  reapply?: boolean;
  /** Default false when dryRun is false; true only for offline demo */
  simulateLogin?: boolean;
  onProgress?: (msg: string, index: number, total: number) => void;
  /** Fired after each account finishes (success or failure) so UI can stream rows. */
  onAccountResult?: (
    result: ApplyAccountResult,
    index: number,
    total: number,
  ) => void;
};

/**
 * Sequential bulk apply across local accounts.
 * Continues through every account even when login/auth fails on one.
 */
export async function runBulkApply(
  opts: BulkApplyOptions,
): Promise<BulkApplySummary> {
  const dryRun = opts.dryRun === true;
  const simulateLogin = opts.simulateLogin ?? dryRun;
  const bulkFast = opts.accounts.length > 1;
  const accountGapMs = bulkFast ? ACCOUNT_GAP_BULK_MS : ACCOUNT_GAP_MS;
  const statusProbeOpts = bulkFast ? { skipStatusProbe: true } : undefined;
  const results: ApplyAccountResult[] = [];
  const stoppedEarly = false;

  const allMockAccounts =
    opts.accounts.length > 0 &&
    opts.accounts.every((a) => isMockAccountId(a.id));
  if (
    !dryRun &&
    opts.issue.companyShareId === 9001 &&
    !allMockAccounts
  ) {
    throw new MeroshareError(
      'UNKNOWN',
      'Cannot live-apply to DEMO issue. Wait for a real opening or refresh IPOs after login.',
    );
  }

  const pushResult = (row: ApplyAccountResult, index: number) => {
    const finalized = finalizeApplyRow(row);
    results.push(finalized);
    opts.onAccountResult?.(finalized, index, opts.accounts.length);
  };

  for (let i = 0; i < opts.accounts.length; i++) {
    const account = opts.accounts[i];
    opts.onProgress?.(
      `Processing ${account.name}…`,
      i,
      opts.accounts.length,
    );

    if (isMockAccountId(account.id)) {
      const scenario = mockApplyScenarioForAccount(account.id);
      pushResult(
        buildMockApplyResult(account, scenario, opts.issue, opts.kitta, dryRun),
        i,
      );
      if (i < opts.accounts.length - 1) await sleep(accountGapMs);
      continue;
    }

    const secrets = await getSecrets(account.id);
    if (!secrets?.password || !secrets.crn || !secrets.pin) {
      pushResult(
        {
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          ok: false,
          dryRun,
          message: 'Missing password / CRN / PIN in SecureStore',
          companyName: opts.issue.companyName,
          kitta: opts.kitta,
        },
        i,
      );
      if (i < opts.accounts.length - 1) await sleep(accountGapMs);
      continue;
    }

    if (opts.reapply && !dryRun) {
      try {
        await unmarkApplied(account.id, opts.issue.companyShareId);
      } catch {
        // never block apply on local history cleanup
      }
    }

    const client = new MeroshareClient();
    const applyReq = {
      companyShareId: opts.issue.companyShareId,
      appliedKitta: opts.kitta,
      crnNumber: secrets.crn,
      transactionPIN: secrets.pin,
      accountId: account.id,
      accountName: account.name,
      username: account.username,
      dpId: account.dpId,
      dpCode: account.dpCode,
    };
    const applyOpts = {
      dryRun,
      ipoStillOpen: true,
      reapply: opts.reapply === true,
      skipCrnPinFastCheck: account.crnPinVerified === true,
    };
    try {
      await client.loginOrSimulate(
        {
          clientId: account.dpId,
          dpCode: account.dpCode,
          username: account.username,
          password: secrets.password,
        },
        {
          simulate: simulateLogin,
          skipOwnDetail: true,
        },
      );

      const applyRes = await client.applyShare(applyReq, applyOpts);

      if (
        !applyRes.ok &&
        !applyRes.rejectedPrevious &&
        !dryRun &&
        !/^wrong (transaction pin|crn)/i.test(applyRes.message)
      ) {
        const resolved = await finalizeFailedApplyMessage(
          client,
          opts.issue.companyShareId,
          applyRes.message,
          statusProbeOpts,
        );
        if (resolved !== applyRes.message) {
          applyRes = { ...applyRes, message: resolved };
        }
      }

      pushResult(
        buildApplyResultRow(account, applyRes, opts.issue, opts.kitta),
        i,
      );

      // On a real successful apply, auto-record the blocked amount + CASBA fee
      // in Bank Tracker (no-op for accounts without tracking enabled).
      if (applyRes.ok && !applyRes.dryRun) {
        try {
          await recordIpoApply(
            account.id,
            opts.issue.scrip || opts.issue.companyName,
            opts.kitta * IPO_PRICE_PER_UNIT,
          );
        } catch {
          // Never let tracker bookkeeping break the apply flow.
        }
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Unknown error';
      const code = e instanceof MeroshareError ? e.code : 'UNKNOWN';
      const shouldRetry =
        isTransientMeroshareError(e) &&
        !isAlreadyAppliedMeroshareMessage(raw) &&
        !isAlreadyAppliedApplyMessage(raw) &&
        !isRejectedApplicantMeroshareMessage(raw) &&
        !isRoleRestrictedMeroshareMessage(raw);
      if (shouldRetry) {
        try {
          client.clearSession();
          await sleep(800);
          await client.loginOrSimulate(
            {
              clientId: account.dpId,
              dpCode: account.dpCode,
              username: account.username,
              password: secrets.password,
            },
            {
              simulate: simulateLogin,
              skipOwnDetail: opts.reapply !== true,
            },
          );
          let applyRes = await client.applyShare(applyReq, applyOpts);
          if (
            !applyRes.ok &&
            !applyRes.rejectedPrevious &&
            !dryRun &&
            !/^wrong (transaction pin|crn)/i.test(applyRes.message)
          ) {
            const resolved = await finalizeFailedApplyMessage(
              client,
              opts.issue.companyShareId,
              applyRes.message,
              statusProbeOpts,
            );
            if (resolved !== applyRes.message) {
              applyRes = { ...applyRes, message: resolved };
            }
          }
          pushResult(
            buildApplyResultRow(account, applyRes, opts.issue, opts.kitta),
            i,
          );
          if (applyRes.ok && !applyRes.dryRun) {
            try {
              await recordIpoApply(
                account.id,
                opts.issue.scrip || opts.issue.companyName,
                opts.kitta * IPO_PRICE_PER_UNIT,
              );
            } catch {
              // ignore tracker errors
            }
          }
        } catch (e2) {
          const raw2 = e2 instanceof Error ? e2.message : raw;
          const applyRes = await failedApplyResult(
            client,
            opts.issue.companyShareId,
            dryRun,
            raw2,
            statusProbeOpts,
          );
          pushResult(
            buildApplyResultRow(account, applyRes, opts.issue, opts.kitta),
            i,
          );
        }
      } else {
        const applyRes = await failedApplyResult(
          client,
          opts.issue.companyShareId,
          dryRun,
          raw,
          statusProbeOpts,
        );
        pushResult(
          buildApplyResultRow(account, applyRes, opts.issue, opts.kitta),
          i,
        );
        // AUTH / other failures: record and continue to next account
        void code;
      }
    } finally {
      client.clearSession();
    }

    if (i < opts.accounts.length - 1) {
      await sleep(accountGapMs);
    }
  }

  return {
    dryRun,
    companyName: opts.issue.companyName,
    companyShareId: opts.issue.companyShareId,
    kitta: opts.kitta,
    results,
    stoppedEarly,
  };
}

/**
 * Load openings using the first *real* saved account (skips demo/mock).
 * Returns [] when none are open (no DEMO placeholder for live Apply).
 */
export async function loadOpenIssuesForUi(
  accounts: AccountMeta[] = [],
): Promise<OpenIssue[]> {
  const account = pickLeadAccount(accounts);
  if (!account) return [];

  const secrets = await getSecrets(account.id);
  if (!secrets?.password) return [];

  const client = new MeroshareClient();
  try {
    await client.login({
      clientId: account.dpId,
      dpCode: account.dpCode,
      username: account.username,
      password: secrets.password,
    });
    return await client.listApplicableIssues();
  } catch {
    return [];
  } finally {
    client.clearSession();
  }
}

/**
 * Current IPO Status list: only currently open/applicable issues
 * (not past application reports).
 */
export async function loadCurrentOpenIssuesForUi(
  accounts: AccountMeta[] = [],
): Promise<OpenIssue[]> {
  const real = filterRealOperationalAccounts(accounts);
  const hasMocks = accounts.some(
    (a) => a.id.startsWith('demo_') || isMockAccountId(a.id),
  );
  const targets = real.slice(0, 5);
  if (!targets.length) {
    return hasMocks ? DEMO_OPENINGS.map((o) => ({ ...o })) : [];
  }

  const byId = new Map<number, OpenIssue>();
  const appliedIds = new Set<number>();

  const loaded = await Promise.all(
    targets.map(async (account) => {
      const secrets = await getSecrets(account.id);
      if (!secrets?.password) return null;

      const client = new MeroshareClient();
      try {
        await client.login({
          clientId: account.dpId,
          dpCode: account.dpCode,
          username: account.username,
          password: secrets.password,
        });

        const [open, reports] = await Promise.all([
          client.listApplicableIssues().catch(() => [] as OpenIssue[]),
          client.listApplicationReports().catch(() => []),
        ]);

        return { open, reports };
      } catch {
        return null;
      } finally {
        client.clearSession();
      }
    }),
  );

  for (const batch of loaded) {
    if (!batch) continue;
    for (const r of batch.reports) {
      if (r.companyShareId > 0) appliedIds.add(r.companyShareId);
    }
    for (const o of batch.open) {
      if (o.companyShareId === 9001) continue;
      const alreadyApplied = o.alreadyApplied || appliedIds.has(o.companyShareId);
      byId.set(o.companyShareId, { ...o, alreadyApplied });
    }
  }

  const list = [...byId.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName),
  );
  if (!list.length && hasMocks) {
    return DEMO_OPENINGS.map((o) => ({ ...o }));
  }
  return list;
}

/** Merge open issues from every saved account (deduped by companyShareId). */
export async function loadAllOpenIssuesForUi(
  accounts: AccountMeta[] = [],
): Promise<OpenIssue[]> {
  const real = filterRealOperationalAccounts(accounts);
  const targets = real.length ? real : accounts.filter(
    (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
  );
  const byId = new Map<number, OpenIssue>();
  for (const account of targets) {
    const rows = await loadOpenIssuesForUi([account]);
    for (const row of rows) {
      if (row.companyShareId === 9001) continue;
      if (!byId.has(row.companyShareId)) {
        byId.set(row.companyShareId, row);
      }
    }
  }
  return [...byId.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName),
  );
}

export { DEMO_OPENINGS };
