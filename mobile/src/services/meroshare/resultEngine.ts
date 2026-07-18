import type { AccountMeta } from '../../types/account';
import { getSecrets } from '../../storage/accountsStorage';
import { MeroshareClient } from './client';
import { MeroshareError } from './errors';
import type {
  BulkResultSummary,
  OpenIssue,
  ResultAccountStatus,
} from './types';

const ACCOUNT_GAP_MS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type BulkResultOptions = {
  accounts: AccountMeta[];
  issue: OpenIssue;
  /** Default false — live MeroShare application reports */
  dryRun?: boolean;
  simulateLogin?: boolean;
  onProgress?: (msg: string, index: number, total: number) => void;
};

/**
 * Sequential bulk result / application-status check across local accounts.
 * Live by default (works with no currently open IPO — uses past reports).
 */
export async function runBulkResultCheck(
  opts: BulkResultOptions,
): Promise<BulkResultSummary> {
  const dryRun = opts.dryRun === true;
  const simulateLogin = opts.simulateLogin ?? dryRun;
  const results: ResultAccountStatus[] = [];
  let stoppedEarly = false;

  for (let i = 0; i < opts.accounts.length; i++) {
    const account = opts.accounts[i];
    opts.onProgress?.(
      `Checking ${account.name}…`,
      i,
      opts.accounts.length,
    );

    const secrets = await getSecrets(account.id);
    if (!secrets?.password) {
      results.push({
        accountId: account.id,
        accountName: account.name,
        username: account.username,
        ok: false,
        dryRun,
        status: 'MISSING_SECRETS',
        message: 'Missing password in SecureStore',
        companyName: opts.issue.companyName,
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

      const res = await client.checkApplicationStatus(opts.issue.companyShareId, {
        dryRun,
        companyName: opts.issue.companyName,
      });

      results.push({
        accountId: account.id,
        accountName: account.name,
        username: account.username,
        ok: true,
        dryRun: res.dryRun,
        status: res.status,
        message: res.message,
        companyName: opts.issue.companyName,
        appliedKitta: res.appliedKitta,
        allotmentStatus: res.allotmentStatus,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const code = e instanceof MeroshareError ? e.code : 'UNKNOWN';
      results.push({
        accountId: account.id,
        accountName: account.name,
        username: account.username,
        ok: false,
        dryRun,
        status: code,
        message: msg,
        companyName: opts.issue.companyName,
      });
      if (code === 'AUTH') {
        stoppedEarly = true;
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
    results,
    stoppedEarly,
  };
}

/**
 * Issues for Check / Bulk Result:
 * MeroShare Application Report only (same list as website without Filter).
 * Older history is not available via API for typical logins.
 */
export async function loadCheckableIssuesForUi(
  account: AccountMeta | null | undefined,
): Promise<{
  issues: OpenIssue[];
  source: 'mixed' | 'reports' | 'open' | 'empty';
  reportCount: number;
}> {
  if (!account) {
    return { issues: [], source: 'empty', reportCount: 0 };
  }

  const secrets = await getSecrets(account.id);
  if (!secrets?.password) {
    return { issues: [], source: 'empty', reportCount: 0 };
  }

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

    const byId = new Map<number, OpenIssue>();

    for (const r of reports) {
      if (byId.has(r.companyShareId)) continue;
      byId.set(r.companyShareId, {
        id: r.companyShareId,
        companyShareId: r.companyShareId,
        companyName: r.companyName,
        scrip: r.scrip,
        shareTypeName: r.shareTypeName,
        alreadyApplied: true,
        issueOpenDate: r.appliedDate,
      });
    }

    for (const o of open) {
      const prev = byId.get(o.companyShareId);
      byId.set(o.companyShareId, {
        ...o,
        alreadyApplied: prev?.alreadyApplied || o.alreadyApplied,
      });
    }

    const issues = Array.from(byId.values()).sort((a, b) =>
      a.companyName.localeCompare(b.companyName),
    );

    const source =
      issues.length === 0
        ? 'empty'
        : open.length && reports.length
          ? 'mixed'
          : open.length
            ? 'open'
            : 'reports';

    return { issues, source, reportCount: reports.length };
  } catch {
    return { issues: [], source: 'empty', reportCount: 0 };
  } finally {
    client.clearSession();
  }
}
