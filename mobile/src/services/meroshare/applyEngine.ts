import type { AccountMeta } from '../../types/account';
import { isMockAccountId } from '../../data/mockAccounts';
import { getSecrets } from '../../storage/accountsStorage';
import { recordIpoApply } from '../../storage/bankTrackerStorage';
import { MeroshareClient, DEMO_OPENINGS } from './client';
import {
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

const ACCOUNT_GAP_MS = 2200;

/** Par value per IPO unit (Rs) — ordinary Nepali IPOs are issued at par. */
const IPO_PRICE_PER_UNIT = 100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Make MeroShare CRN/PIN apply failures obvious in results UI */
function formatApplyError(msg: string): string {
  const m = msg.toLowerCase();
  if (
    /transaction\s*pin|invalid\s*pin|incorrect\s*pin|wrong\s*pin|pin\s*(code|number)?/i.test(
      m,
    )
  ) {
    return `Wrong transaction PIN — ${sanitizeMeroshareMessage(msg)}`;
  }
  if (/crn/i.test(m)) {
    return `Wrong CRN — ${sanitizeMeroshareMessage(msg)}`;
  }
  if (isTransientMeroshareMessage(msg)) {
    return 'MeroShare is busy right now. Retry this account in a moment.';
  }
  if (/insufficient|not enough|low balance|block[_\s-]?fail/i.test(msg)) {
    return 'Rejected — you have insufficient amount in your bank account';
  }
  return sanitizeMeroshareMessage(msg);
}

export type BulkApplyOptions = {
  accounts: AccountMeta[];
  issue: OpenIssue;
  kitta: number;
  /** Default false — live apply to MeroShare */
  dryRun?: boolean;
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
  const results: ApplyAccountResult[] = [];
  const stoppedEarly = false;

  if (!dryRun && opts.issue.companyShareId === 9001) {
    throw new MeroshareError(
      'UNKNOWN',
      'Cannot live-apply to DEMO issue. Wait for a real opening or refresh IPOs after login.',
    );
  }

  const pushResult = (row: ApplyAccountResult, index: number) => {
    results.push(row);
    opts.onAccountResult?.(row, index, opts.accounts.length);
  };

  for (let i = 0; i < opts.accounts.length; i++) {
    const account = opts.accounts[i];
    opts.onProgress?.(
      `Processing ${account.name}…`,
      i,
      opts.accounts.length,
    );

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
      if (i < opts.accounts.length - 1) await sleep(ACCOUNT_GAP_MS);
      continue;
    }

    const client = new MeroshareClient();
    try {
      await client.loginOrSimulate(
        {
          clientId: account.dpId,
          dpCode: account.dpCode,
          username: account.username,
          password: secrets.password,
        },
        { simulate: simulateLogin },
      );

      const applyRes = await client.applyShare(
        {
          companyShareId: opts.issue.companyShareId,
          appliedKitta: opts.kitta,
          crnNumber: secrets.crn,
          transactionPIN: secrets.pin,
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          dpId: account.dpId,
          dpCode: account.dpCode,
        },
        { dryRun },
      );

      pushResult(
        {
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          ok: applyRes.ok,
          dryRun: applyRes.dryRun,
          message: sanitizeMeroshareMessage(applyRes.message),
          companyName: opts.issue.companyName,
          kitta: opts.kitta,
        },
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
      if (isTransientMeroshareError(e)) {
        try {
          client.clearSession();
          await sleep(1400);
          await client.loginOrSimulate(
            {
              clientId: account.dpId,
              dpCode: account.dpCode,
              username: account.username,
              password: secrets.password,
            },
            { simulate: simulateLogin },
          );
          const applyRes = await client.applyShare(
            {
              companyShareId: opts.issue.companyShareId,
              appliedKitta: opts.kitta,
              crnNumber: secrets.crn,
              transactionPIN: secrets.pin,
              accountId: account.id,
              accountName: account.name,
              username: account.username,
              dpId: account.dpId,
              dpCode: account.dpCode,
            },
            { dryRun },
          );
          pushResult(
            {
              accountId: account.id,
              accountName: account.name,
              username: account.username,
              ok: applyRes.ok,
              dryRun: applyRes.dryRun,
              message: sanitizeMeroshareMessage(applyRes.message),
              companyName: opts.issue.companyName,
              kitta: opts.kitta,
            },
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
          pushResult(
            {
              accountId: account.id,
              accountName: account.name,
              username: account.username,
              ok: false,
              dryRun,
              message: formatApplyError(raw2),
              companyName: opts.issue.companyName,
              kitta: opts.kitta,
            },
            i,
          );
        }
      } else {
        pushResult(
          {
            accountId: account.id,
            accountName: account.name,
            username: account.username,
            ok: false,
            dryRun,
            message: formatApplyError(raw),
            companyName: opts.issue.companyName,
            kitta: opts.kitta,
          },
          i,
        );
        // AUTH / other failures: record and continue to next account
        void code;
      }
    } finally {
      client.clearSession();
    }

    if (i < opts.accounts.length - 1) {
      await sleep(ACCOUNT_GAP_MS);
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
  const real = accounts.filter(
    (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
  );
  const targets = real.length ? real : accounts;
  const account = targets[0];
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
  const real = accounts.filter(
    (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
  );
  const targets = real.length ? real : [];
  if (!targets.length) return [];

  const byId = new Map<number, OpenIssue>();
  const appliedIds = new Set<number>();

  for (const account of targets) {
    const secrets = await getSecrets(account.id);
    if (!secrets?.password) continue;

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

      for (const r of reports) {
        if (r.companyShareId > 0) appliedIds.add(r.companyShareId);
      }

      for (const o of open) {
        if (o.companyShareId === 9001) continue;
        const alreadyApplied = o.alreadyApplied || appliedIds.has(o.companyShareId);
        byId.set(o.companyShareId, { ...o, alreadyApplied });
      }
    } catch {
      // try next account
    } finally {
      client.clearSession();
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName),
  );
}

/** Merge open issues from every saved account (deduped by companyShareId). */
export async function loadAllOpenIssuesForUi(
  accounts: AccountMeta[] = [],
): Promise<OpenIssue[]> {
  const real = accounts.filter(
    (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
  );
  const targets = real.length ? real : accounts;
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
