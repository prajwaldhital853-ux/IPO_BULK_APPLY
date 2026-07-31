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

const ACCOUNT_GAP_MS = 2200;

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

  const total = opts.accounts.length;
  const emit = (row: ResultAccountStatus, i: number) => {
    results.push(row);
    opts.onAccountResult?.(row, i, total);
  };

  for (let i = 0; i < opts.accounts.length; i++) {
    const account = opts.accounts[i];
    opts.onProgress?.(
      `Checking ${account.name}…`,
      i,
      opts.accounts.length,
    );

    // Demo accounts (added via the dev "dry run" tool) don't have real
    // MeroShare logins — synthesize a realistic mix of outcomes so the UI can
    // be exercised without live credentials.
    if (account.id.startsWith('demo_') || isMockAccountId(account.id)) {
      await sleep(350);
      emit(makeDemoResult(account, i, opts.issue), i);
      continue;
    }

    const secrets = await getSecrets(account.id);
    if (!secrets?.password) {
      emit(
        {
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          ok: false,
          dryRun,
          status: 'MISSING_SECRETS',
          message: 'Missing password in SecureStore',
          companyName: opts.issue.companyName,
        },
        i,
      );
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

      emit(
        {
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          ok: true,
          dryRun: res.dryRun,
          status: res.status,
          message: friendlyResultError(res.message),
          companyName: opts.issue.companyName,
          appliedKitta: res.appliedKitta,
          allotmentStatus: res.allotmentStatus,
          remarks: res.remarks,
        },
        i,
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Unknown error';
      const code = e instanceof MeroshareError ? e.code : 'UNKNOWN';
      // One more full-session retry for transient flakiness (fresh login).
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
          const res = await client.checkApplicationStatus(
            opts.issue.companyShareId,
            {
              dryRun,
              companyName: opts.issue.companyName,
            },
          );
          emit(
            {
              accountId: account.id,
              accountName: account.name,
              username: account.username,
              ok: true,
              dryRun: res.dryRun,
              status: res.status,
              message: friendlyResultError(res.message),
              companyName: opts.issue.companyName,
              appliedKitta: res.appliedKitta,
              allotmentStatus: res.allotmentStatus,
              remarks: res.remarks,
            },
            i,
          );
          continue;
        } catch (e2) {
          const raw2 = e2 instanceof Error ? e2.message : raw;
          const code2 = e2 instanceof MeroshareError ? e2.code : code;
          emit(
            {
              accountId: account.id,
              accountName: account.name,
              username: account.username,
              ok: false,
              dryRun,
              status: code2,
              message: friendlyResultError(raw2),
              companyName: opts.issue.companyName,
            },
            i,
          );
          if (code2 === 'AUTH') {
            stoppedEarly = true;
            break;
          }
          continue;
        }
      }
      emit(
        {
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          ok: false,
          dryRun,
          status: code,
          message: friendlyResultError(raw),
          companyName: opts.issue.companyName,
        },
        i,
      );
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
