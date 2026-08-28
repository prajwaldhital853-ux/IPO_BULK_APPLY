import type { AccountMeta } from '../../types/account';
import { isMockAccountId } from '../../data/mockAccounts';
import { getSecrets } from '../../storage/accountsStorage';
import { MeroshareClient } from './client';
import {
  isTransientMeroshareError,
  isTransientMeroshareMessage,
  MeroshareError,
} from './errors';
import type {
  ApplicationReportDetail,
  ApplicationReportRow,
  BulkResultSummary,
  OpenIssue,
  ResultAccountStatus,
} from './types';

/** Parallel workers + adaptive gap between MeroShare session starts. */
const BULK_RESULT_CONCURRENCY = 6;
const BULK_RESULT_GAP_MS = 350;
const BULK_RESULT_GAP_MAX_MS = 2800;
const BULK_RESULT_PAUSE_MS = 2200;
const DEMO_ACCOUNT_GAP_MS = 120;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function friendlyResultError(msg: string): string {
  if (isTransientMeroshareMessage(msg)) {
    return 'MeroShare is busy right now. Retry this account in a moment.';
  }
  if (
    /insufficient|not enough|low balance|block[_\s-]?fail/i.test(msg)
  ) {
    return 'Rejected — you have insufficient amount in your bank account';
  }
  return msg;
}

/** Deterministic fake result for a mock/demo account, cycling through outcomes. */
function makeDemoResult(
  account: AccountMeta,
  index: number,
  issue: OpenIssue,
): ResultAccountStatus {
  const base = {
    accountId: account.id,
    accountName: account.name,
    username: account.username,
    dryRun: true,
    companyName: issue.companyName,
    appliedKitta: 10,
  };
  const bucket = index % 5;
  if (bucket === 0 || bucket === 3) {
    // Allotted
    return {
      ...base,
      ok: true,
      status: 'ALLOTTED',
      allotmentStatus: 'Alloted',
      message: 'Alloted ( quantity : 10 )',
      remarks: 'Block Amount Status - Amount Released',
    };
  }
  if (bucket === 4) {
    // Rejected — insufficient balance (most common real rejection reason)
    return {
      ...base,
      ok: false,
      status: 'REJECTED',
      allotmentStatus: 'Rejected',
      message: 'Rejected ( quantity : 10 )',
      remarks: 'Insufficient Balance',
    };
  }
  // Not allotted
  return {
    ...base,
    ok: true,
    status: 'NOT_ALLOTTED',
    allotmentStatus: 'Not Alloted',
    message: 'Not Alloted ( quantity : 10 )',
    remarks: 'Block Amount Status - Amount Released',
  };
}

function resultRowFromCheck(
  account: AccountMeta,
  issue: OpenIssue,
  dryRun: boolean,
  res: {
    dryRun: boolean;
    status: string;
    message: string;
    appliedKitta?: number;
    allotmentStatus?: string;
    remarks?: string;
  },
): ResultAccountStatus {
  return {
    accountId: account.id,
    accountName: account.name,
    username: account.username,
    ok: true,
    dryRun: res.dryRun,
    status: res.status,
    message: friendlyResultError(res.message),
    companyName: issue.companyName,
    appliedKitta: res.appliedKitta,
    allotmentStatus: res.allotmentStatus,
    remarks: res.remarks,
  };
}

function resultRowFromError(
  account: AccountMeta,
  issue: OpenIssue,
  dryRun: boolean,
  e: unknown,
): ResultAccountStatus {
  const raw = e instanceof Error ? e.message : 'Unknown error';
  const code = e instanceof MeroshareError ? e.code : 'UNKNOWN';
  return {
    accountId: account.id,
    accountName: account.name,
    username: account.username,
    ok: false,
    dryRun,
    status: code,
    message: friendlyResultError(raw),
    companyName: issue.companyName,
  };
}

type BulkThrottle = {
  acquire: () => Promise<void>;
  backoff: (e: unknown) => void;
  relax: () => void;
};

function createBulkThrottle(): BulkThrottle {
  let gapMs = BULK_RESULT_GAP_MS;
  let nextSlot = 0;
  let pauseUntil = 0;

  return {
    async acquire() {
      const now = Date.now();
      const pause = Math.max(0, pauseUntil - now);
      if (pause > 0) await sleep(pause);
      const slot = Math.max(Date.now(), nextSlot);
      nextSlot = slot + gapMs;
      const wait = slot - Date.now();
      if (wait > 0) await sleep(wait);
    },
    backoff(e: unknown) {
      const isRate =
        e instanceof MeroshareError && e.code === 'RATE';
      gapMs = Math.min(
        BULK_RESULT_GAP_MAX_MS,
        Math.round(gapMs * (isRate ? 1.8 : 1.4)),
      );
      pauseUntil = Math.max(
        pauseUntil,
        Date.now() + (isRate ? BULK_RESULT_PAUSE_MS : 1200),
      );
    },
    relax() {
      gapMs = Math.max(BULK_RESULT_GAP_MS, Math.round(gapMs * 0.92));
    },
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        out[idx] = await fn(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function checkOneAccountResult(
  account: AccountMeta,
  issue: OpenIssue,
  dryRun: boolean,
  simulateLogin: boolean,
  throttle: BulkThrottle,
): Promise<ResultAccountStatus> {
  const secrets = await getSecrets(account.id);
  if (!secrets?.password) {
    return {
      accountId: account.id,
      accountName: account.name,
      username: account.username,
      ok: false,
      dryRun,
      status: 'MISSING_SECRETS',
      message: 'Missing password in SecureStore',
      companyName: issue.companyName,
    };
  }

  const client = new MeroshareClient();
  const loginArgs = {
    clientId: account.dpId,
    dpCode: account.dpCode,
    username: account.username,
    password: secrets.password,
  };
  const statusOpts = {
    dryRun,
    companyName: issue.companyName,
    bulkFast: true,
  };

  const runCheck = async () => {
    await throttle.acquire();
    await client.loginOrSimulate(loginArgs, {
      simulate: simulateLogin,
      skipOwnDetail: true,
    });
    const res = await client.checkApplicationStatus(
      issue.companyShareId,
      statusOpts,
    );
    throttle.relax();
    return resultRowFromCheck(account, issue, dryRun, res);
  };

  try {
    return await runCheck();
  } catch (e) {
    if (!isTransientMeroshareError(e)) {
      throttle.backoff(e);
      return resultRowFromError(account, issue, dryRun, e);
    }
    try {
      client.clearSession();
      throttle.backoff(e);
      await sleep(900);
      return await runCheck();
    } catch (e2) {
      throttle.backoff(e2);
      return resultRowFromError(account, issue, dryRun, e2);
    }
  } finally {
    client.clearSession();
  }
}

export type BulkResultOptions = {
  accounts: AccountMeta[];
  issue: OpenIssue;
  /** Default false — live MeroShare application reports */
  dryRun?: boolean;
  simulateLogin?: boolean;
  onProgress?: (msg: string, index: number, total: number) => void;
  /** Called as soon as each account finishes, for progressive UI rendering. */
  onAccountResult?: (
    row: ResultAccountStatus,
    index: number,
    total: number,
  ) => void;
};

/**
 * Parallel bulk result / application-status check across local accounts.
 * Uses limited concurrency + adaptive throttling to stay fast without
 * hammering CDSC rate limits.
 */
export async function runBulkResultCheck(
  opts: BulkResultOptions,
): Promise<BulkResultSummary> {
  const dryRun = opts.dryRun === true;
  const simulateLogin = opts.simulateLogin ?? dryRun;
  const total = opts.accounts.length;
  const throttle = createBulkThrottle();
  let finished = 0;

  const emit = (row: ResultAccountStatus, i: number) => {
    finished += 1;
    opts.onAccountResult?.(row, i, total);
    opts.onProgress?.(
      `Checked ${finished}/${total} — ${row.accountName}`,
      finished - 1,
      total,
    );
  };

  const processAt = async (i: number): Promise<ResultAccountStatus> => {
    const account = opts.accounts[i];

    if (account.id.startsWith('demo_') || isMockAccountId(account.id)) {
      await sleep(DEMO_ACCOUNT_GAP_MS);
      const row = makeDemoResult(account, i, opts.issue);
      emit(row, i);
      return row;
    }

    const row = await checkOneAccountResult(
      account,
      opts.issue,
      dryRun,
      simulateLogin,
      throttle,
    );
    emit(row, i);
    return row;
  };

  const slots = opts.accounts.map((_, i) => i);
  const rows = await mapPool(slots, BULK_RESULT_CONCURRENCY, async (i) =>
    processAt(i),
  );

  const results = rows.filter(
    (r): r is ResultAccountStatus => r != null,
  );

  const stoppedEarly = results.some(
    (r) =>
      !r.ok &&
      r.status === 'AUTH' &&
      !isMockAccountId(r.accountId) &&
      !r.accountId.startsWith('demo_'),
  );

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
  reports: ApplicationReportRow[];
}> {
  if (!account) {
    return { issues: [], source: 'empty', reportCount: 0, reports: [] };
  }

  const secrets = await getSecrets(account.id);
  if (!secrets?.password) {
    return { issues: [], source: 'empty', reportCount: 0, reports: [] };
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

    return { issues, source, reportCount: reports.length, reports };
  } catch {
    return { issues: [], source: 'empty', reportCount: 0, reports: [] };
  } finally {
    client.clearSession();
  }
}

/**
 * Load Application Report detail for IPO Status details screen.
 */
export async function loadApplicationReportDetailForUi(
  account: AccountMeta,
  report: ApplicationReportRow,
): Promise<ApplicationReportDetail> {
  const secrets = await getSecrets(account.id);
  if (!secrets?.password) {
    throw new MeroshareError('AUTH', 'Account password missing');
  }

  const client = new MeroshareClient();
  try {
    await client.login({
      clientId: account.dpId,
      dpCode: account.dpCode,
      username: account.username,
      password: secrets.password,
    });

    const withFallbacks = (
      detail: ApplicationReportDetail,
    ): ApplicationReportDetail => {
      const bankName = detail.bankName || account.bankName;
      const accountNumber = detail.accountNumber || account.accountNumber;
      const branchName = resolveBranchName(detail.branchName, bankName);
      return {
        ...detail,
        bankName,
        accountNumber,
        branchName,
        boid: detail.boid || account.demat,
        amount:
          detail.amount ??
          (detail.appliedKitta != null ? detail.appliedKitta * 100 : null),
      };
    };

    if (report.applicantFormId != null) {
      const detail = await client.getApplicationReportDetail(
        report.applicantFormId,
        report,
      );
      return withFallbacks(detail);
    }

    return withFallbacks({
      companyShareId: report.companyShareId,
      companyName: report.companyName,
      scrip: report.scrip,
      shareTypeName: report.shareTypeName,
      statusName: report.statusName,
      applicantFormId: report.applicantFormId,
      appliedKitta: report.appliedKitta,
      amount:
        report.appliedKitta != null ? report.appliedKitta * 100 : null,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      boid: account.demat,
      appliedDate: report.appliedDate,
    });
  } finally {
    client.clearSession();
  }
}

/** When CDSC omits branch, show "{Bank} - Head Office". */
function resolveBranchName(
  branch: string | undefined,
  bank: string | undefined,
): string | undefined {
  const b = (branch || '').trim();
  if (b && !/^n\/?a$/i.test(b) && !/^-+$/.test(b)) return b;
  const bankName = (bank || '').trim();
  if (!bankName) return undefined;
  // Avoid duplicating if bank string already ends with Head Office.
  if (/head\s*office/i.test(bankName)) return bankName;
  return `${bankName} - Head Office`;
}

/**
 * Load Application Report list + detail rows for one account (single login).
 * Used by All IPO Statistics / Allotment Status.
 */
export async function loadAllApplicationDetailsForUi(
  account: AccountMeta,
): Promise<ApplicationReportDetail[]> {
  const secrets = await getSecrets(account.id);
  if (!secrets?.password) {
    throw new MeroshareError('AUTH', 'Account password missing');
  }

  const client = new MeroshareClient();
  try {
    await client.login({
      clientId: account.dpId,
      dpCode: account.dpCode,
      username: account.username,
      password: secrets.password,
    });

    const reports = await client.listApplicationReports();
    const out: ApplicationReportDetail[] = [];

    for (const report of reports) {
      if (report.applicantFormId != null) {
        try {
          const detail = await client.getApplicationReportDetail(
            report.applicantFormId,
            report,
          );
          out.push({
            ...detail,
            bankName: detail.bankName || account.bankName,
            accountNumber: detail.accountNumber || account.accountNumber,
            branchName: resolveBranchName(
              detail.branchName,
              detail.bankName || account.bankName,
            ),
            boid: detail.boid || account.demat,
          });
          continue;
        } catch {
          // Fall through to list-row fallback.
        }
      }
      out.push({
        companyShareId: report.companyShareId,
        companyName: report.companyName,
        scrip: report.scrip,
        shareTypeName: report.shareTypeName,
        statusName: report.statusName,
        applicantFormId: report.applicantFormId,
        appliedKitta: report.appliedKitta,
        amount:
          report.appliedKitta != null ? report.appliedKitta * 100 : null,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        branchName: resolveBranchName(undefined, account.bankName),
        boid: account.demat,
        appliedDate: report.appliedDate,
      });
    }

    return out;
  } finally {
    client.clearSession();
  }
}
