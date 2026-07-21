import type { AccountMeta } from '../../types/account';
import { getSecrets } from '../../storage/accountsStorage';
import { recordIpoApply } from '../../storage/bankTrackerStorage';
import { MeroshareClient, DEMO_OPENINGS } from './client';
import { MeroshareError } from './errors';
import type {
  ApplyAccountResult,
  BulkApplySummary,
  OpenIssue,
} from './types';

const ACCOUNT_GAP_MS = 1500;

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
    return `Wrong transaction PIN — ${msg}`;
  }
  if (/crn/i.test(m)) {
    return `Wrong CRN — ${msg}`;
  }
  return msg;
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
};

/**
 * Sequential bulk apply across local accounts.
 * Stops early on AUTH failure to avoid lockouts.
 */
export async function runBulkApply(
  opts: BulkApplyOptions,
): Promise<BulkApplySummary> {
  const dryRun = opts.dryRun === true;
  const simulateLogin = opts.simulateLogin ?? dryRun;
  const results: ApplyAccountResult[] = [];
  let stoppedEarly = false;

  if (!dryRun && opts.issue.companyShareId === 9001) {
    throw new MeroshareError(
      'UNKNOWN',
      'Cannot live-apply to DEMO issue. Wait for a real opening or refresh IPOs after login.',
    );
  }

  for (let i = 0; i < opts.accounts.length; i++) {
    const account = opts.accounts[i];
    opts.onProgress?.(
      `Processing ${account.name}…`,
      i,
      opts.accounts.length,
    );

    const secrets = await getSecrets(account.id);
    if (!secrets?.password || !secrets.crn || !secrets.pin) {
      results.push({
        accountId: account.id,
        accountName: account.name,
        username: account.username,
        ok: false,
        dryRun,
        message: 'Missing password / CRN / PIN in SecureStore',
        companyName: opts.issue.companyName,
        kitta: opts.kitta,
      });
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

      results.push({
        accountId: account.id,
        accountName: account.name,
        username: account.username,
        ok: applyRes.ok,
        dryRun: applyRes.dryRun,
        message: applyRes.message,
        companyName: opts.issue.companyName,
        kitta: opts.kitta,
      });

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
      const msg = formatApplyError(raw);
      results.push({
        accountId: account.id,
        accountName: account.name,
        username: account.username,
        ok: false,
        dryRun,
        message: msg,
        companyName: opts.issue.companyName,
        kitta: opts.kitta,
      });
      if (code === 'AUTH') {
        stoppedEarly = true;
        opts.onProgress?.(
          'Stopped: auth failure (avoid lockout)',
          i,
          opts.accounts.length,
        );
        break;
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
 * Load openings using the first saved account (live).
 * Returns [] when none are open (no DEMO placeholder for live Apply).
 */
export async function loadOpenIssuesForUi(
  accounts: AccountMeta[] = [],
): Promise<OpenIssue[]> {
  const account = accounts[0];
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

/** Merge open issues from every saved account (deduped by companyShareId). */
export async function loadAllOpenIssuesForUi(
  accounts: AccountMeta[] = [],
): Promise<OpenIssue[]> {
  const byId = new Map<number, OpenIssue>();
  for (const account of accounts) {
    const rows = await loadOpenIssuesForUi([account]);
    for (const row of rows) {
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
