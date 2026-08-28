import type { AccountMeta } from '../../types/account';
import { isMockAccountId } from '../../data/mockAccounts';
import { importPortfolioFromMeroshare, type ImportResult } from './portfolioImport';
import { isTransientMeroshareError, MeroshareError } from './errors';

/** Parallel workers — 5 accounts at a time keeps bulk checks fast without hammering CDSC. */
const BULK_PORTFOLIO_CONCURRENCY = 5;
const BULK_PORTFOLIO_GAP_MS = 400;
const BULK_PORTFOLIO_GAP_MAX_MS = 3000;
const BULK_PORTFOLIO_PAUSE_MS = 2500;
const DEMO_ACCOUNT_GAP_MS = 150;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type BulkThrottle = {
  acquire: () => Promise<void>;
  backoff: (e: unknown) => void;
  relax: () => void;
};

function createBulkThrottle(): BulkThrottle {
  let gapMs = BULK_PORTFOLIO_GAP_MS;
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
        BULK_PORTFOLIO_GAP_MAX_MS,
        Math.round(gapMs * (isRate ? 1.8 : 1.4)),
      );
      pauseUntil = Math.max(
        pauseUntil,
        Date.now() + (isRate ? BULK_PORTFOLIO_PAUSE_MS : 1200),
      );
    },
    relax() {
      gapMs = Math.max(BULK_PORTFOLIO_GAP_MS, Math.round(gapMs * 0.92));
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

export type BulkPortfolioAccountResult =
  | {
      ok: true;
      account: AccountMeta;
      index: number;
      result: ImportResult;
    }
  | {
      ok: false;
      account: AccountMeta;
      index: number;
      message: string;
    };

export type BulkPortfolioOptions = {
  accounts: AccountMeta[];
  /** Called when an account starts fetching (for row status). */
  onAccountStart?: (account: AccountMeta, index: number, total: number) => void;
  /** Called as soon as each account finishes. */
  onAccountComplete?: (
    row: BulkPortfolioAccountResult,
    completed: number,
    total: number,
  ) => void;
  /** Return false to stop scheduling new work (stale run / user cancelled). */
  shouldContinue?: () => boolean;
};

async function fetchOnePortfolio(
  account: AccountMeta,
  index: number,
  throttle: BulkThrottle,
): Promise<BulkPortfolioAccountResult> {
  if (isMockAccountId(account.id)) {
    await sleep(DEMO_ACCOUNT_GAP_MS);
    try {
      const result = await importPortfolioFromMeroshare(account);
      return { ok: true, account, index, result };
    } catch (e) {
      return {
        ok: false,
        account,
        index,
        message: e instanceof Error ? e.message : 'Could not fetch portfolio',
      };
    }
  }

  const run = async (): Promise<ImportResult> => {
    await throttle.acquire();
    const result = await importPortfolioFromMeroshare(account);
    throttle.relax();
    return result;
  };

  try {
    const result = await run();
    return { ok: true, account, index, result };
  } catch (e) {
    if (!isTransientMeroshareError(e)) {
      throttle.backoff(e);
      return {
        ok: false,
        account,
        index,
        message: e instanceof Error ? e.message : 'Could not fetch portfolio',
      };
    }
    try {
      throttle.backoff(e);
      await sleep(900);
      const result = await run();
      return { ok: true, account, index, result };
    } catch (e2) {
      throttle.backoff(e2);
      return {
        ok: false,
        account,
        index,
        message:
          e2 instanceof Error ? e2.message : 'Could not fetch portfolio',
      };
    }
  }
}

/**
 * Parallel bulk portfolio fetch across saved MeroShare accounts.
 * Uses limited concurrency + adaptive throttling to reduce rate-limit errors.
 */
export async function runBulkPortfolioCheck(
  opts: BulkPortfolioOptions,
): Promise<BulkPortfolioAccountResult[]> {
  const total = opts.accounts.length;
  const throttle = createBulkThrottle();
  let completed = 0;

  const slots = opts.accounts.map((_, i) => i);
  const rows = await mapPool(slots, BULK_PORTFOLIO_CONCURRENCY, async (i) => {
    if (opts.shouldContinue && !opts.shouldContinue()) {
      return {
        ok: false as const,
        account: opts.accounts[i],
        index: i,
        message: 'Cancelled',
      };
    }

    const account = opts.accounts[i];
    opts.onAccountStart?.(account, i, total);

    const row = await fetchOnePortfolio(account, i, throttle);
    completed += 1;
    opts.onAccountComplete?.(row, completed, total);
    return row;
  });

  return rows;
}
