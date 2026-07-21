import type { AccountMeta } from '../../types/account';
import { maskBoid } from '../../utils/boid';
import { resolveBoidsForAccounts } from '../../utils/resolveBoid';
import { checkViaIssueManager } from './registry';
import type { IssueManagerCheckResult, IssueManagerCompany } from './types';

const ACCOUNT_GAP_MS = 350;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Clear Alloted / Not Alloted text — never raw "scheme fetched" API noise. */
export function formatAllotmentMessage(
  check: Pick<IssueManagerCheckResult, 'ok' | 'allotted' | 'quantity' | 'message'>,
): string {
  if (!check.ok) {
    const raw = (check.message || '').trim();
    if (/scheme|fetched successfully/i.test(raw)) {
      return 'Check failed';
    }
    return raw || 'Check failed';
  }
  if (check.allotted) {
    return check.quantity != null && check.quantity > 0
      ? `Alloted ( quantity : ${check.quantity} )`
      : 'Alloted';
  }
  const raw = (check.message || '').trim();
  if (raw && !/scheme|fetched successfully|success/i.test(raw)) {
    if (/not\s*allot/i.test(raw)) return raw.replace(/allott?ed/gi, (m) =>
      m.toLowerCase().includes('allott') ? 'alloted' : m,
    );
    return raw;
  }
  return check.quantity != null && check.quantity > 0
    ? `Not Alloted ( quantity : ${check.quantity} )`
    : 'Sorry, not alloted for the entered BOID.';
}

export type IssueManagerBulkRow = {
  accountId: string;
  accountName: string;
  username: string;
  boidMasked?: string;
  ok: boolean;
  allotted: boolean;
  quantity?: number;
  message: string;
};

export type IssueManagerBulkSummary = {
  companyKey: string;
  companyName: string;
  providerLabel: string;
  source: 'issue-manager';
  results: IssueManagerBulkRow[];
};

/**
 * Bulk BOID check via the IPO’s issue manager (no captcha).
 */
export async function runIssueManagerBulkCheck(opts: {
  accounts: AccountMeta[];
  company: IssueManagerCompany;
  onProgress?: (msg: string, index: number, total: number) => void;
}): Promise<IssueManagerBulkSummary> {
  const resolved = await resolveBoidsForAccounts(opts.accounts);
  const results: IssueManagerBulkRow[] = [];

  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    opts.onProgress?.(
      `Checking ${row.account.name} (${i + 1}/${resolved.length})…`,
      i,
      resolved.length,
    );

    if (!row.boid) {
      results.push({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        ok: false,
        allotted: false,
        message: row.error ?? 'Missing BOID',
      });
      continue;
    }

    const masked = maskBoid(row.boid);
    try {
      const check = await checkViaIssueManager(opts.company, row.boid);
      results.push({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        boidMasked: masked,
        ok: check.ok,
        allotted: check.allotted,
        quantity: check.quantity,
        message: formatAllotmentMessage(check),
      });
    } catch (e) {
      results.push({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        boidMasked: masked,
        ok: false,
        allotted: false,
        message: e instanceof Error ? e.message : 'Check failed',
      });
    }

    if (i < resolved.length - 1) {
      await sleep(ACCOUNT_GAP_MS);
    }
  }

  return {
    companyKey: opts.company.key,
    companyName: opts.company.name,
    providerLabel: opts.company.providerLabel,
    source: 'issue-manager',
    results,
  };
}
