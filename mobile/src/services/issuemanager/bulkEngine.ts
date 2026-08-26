import type { AccountMeta } from '../../types/account';
import { maskBoid } from '../../utils/boid';
import { resolveBoidsForAccounts } from '../../utils/resolveBoid';
import { checkViaIssueManager } from './registry';
import type { IssueManagerCheckResult, IssueManagerCompany } from './types';

const BULK_CONCURRENCY = 3;
const ACCOUNT_GAP_MS = 400;
const ACCOUNT_GAP_MAX_MS = 2000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type BulkThrottle = {
  acquire: () => Promise<void>;
  backoff: () => void;
  relax: () => void;
};

function createBulkThrottle(): BulkThrottle {
  let gapMs = ACCOUNT_GAP_MS;
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
    backoff() {
      gapMs = Math.min(ACCOUNT_GAP_MAX_MS, Math.round(gapMs * 1.35));
      pauseUntil = Math.max(pauseUntil, Date.now() + 1000);
    },
    relax() {
      gapMs = Math.max(ACCOUNT_GAP_MS, Math.round(gapMs * 0.92));
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
 * Limited parallelism with adaptive throttling.
 */
export async function runIssueManagerBulkCheck(opts: {
  accounts: AccountMeta[];
  company: IssueManagerCompany;
  onProgress?: (msg: string, index: number, total: number) => void;
  onAccountStart?: (accountId: string, index: number, total: number) => void;
  /** Fires as soon as each account finishes — for live card updates. */
  onAccountResult?: (
    row: IssueManagerBulkRow,
    index: number,
    total: number,
  ) => void;
}): Promise<IssueManagerBulkSummary> {
  const resolved = await resolveBoidsForAccounts(opts.accounts);
  const total = resolved.length;
  const throttle = createBulkThrottle();
  let finished = 0;

  const slots = resolved.map((_, i) => i);

  const rows = await mapPool(slots, BULK_CONCURRENCY, async (i) => {
    const row = resolved[i];
    opts.onAccountStart?.(row.account.id, i, total);
    opts.onProgress?.(
      `Checking ${row.account.name} (${i + 1}/${total})…`,
      i,
      total,
    );

    if (!row.boid) {
      const resultRow: IssueManagerBulkRow = {
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        ok: false,
        allotted: false,
        message: row.error ?? 'Missing BOID',
      };
      finished += 1;
      opts.onAccountResult?.(resultRow, i, total);
      return resultRow;
    }

    await throttle.acquire();

    const masked = maskBoid(row.boid);
    try {
      const check = await checkViaIssueManager(opts.company, row.boid);
      throttle.relax();
      const resultRow: IssueManagerBulkRow = {
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        boidMasked: masked,
        ok: check.ok,
        allotted: check.allotted,
        quantity: check.quantity,
        message: formatAllotmentMessage(check),
      };
      finished += 1;
      opts.onProgress?.(
        `Checked ${finished}/${total} — ${row.account.name}`,
        finished - 1,
        total,
      );
      opts.onAccountResult?.(resultRow, i, total);
      return resultRow;
    } catch (e) {
      throttle.backoff();
      const resultRow: IssueManagerBulkRow = {
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        boidMasked: masked,
        ok: false,
        allotted: false,
        message: e instanceof Error ? e.message : 'Check failed',
      };
      finished += 1;
      opts.onAccountResult?.(resultRow, i, total);
      return resultRow;
    }
  });

  return {
    companyKey: opts.company.key,
    companyName: opts.company.name,
    providerLabel: opts.company.providerLabel,
    source: 'issue-manager',
    results: rows,
  };
}
