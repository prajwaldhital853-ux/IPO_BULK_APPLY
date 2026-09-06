import type { AccountMeta } from '../../types/account';
import { isMockAccountId } from '../../data/mockAccounts';
import { getSecrets, patchAccountMeta } from '../../storage/accountsStorage';
import { looksLikeBoid, needsBankAccountFetch } from '../../utils/accountBank';
import { fetchMeroShareBankDetails } from './fetchBankDetails';
import { isTransientMeroshareMessage, MeroshareError } from './errors';

const BULK_BANK_CONCURRENCY = 2;
const BULK_BANK_GAP_MS = 450;
const BULK_BANK_GAP_MAX_MS = 3200;
const BULK_BANK_PAUSE_MS = 2800;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type BulkThrottle = {
  acquire: () => Promise<void>;
  backoff: (e: unknown) => void;
  relax: () => void;
};

function createBulkThrottle(): BulkThrottle {
  let gapMs = BULK_BANK_GAP_MS;
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
      const isRate = e instanceof MeroshareError && e.code === 'RATE';
      gapMs = Math.min(
        BULK_BANK_GAP_MAX_MS,
        Math.round(gapMs * (isRate ? 1.85 : 1.45)),
      );
      pauseUntil = Math.max(
        pauseUntil,
        Date.now() + (isRate ? BULK_BANK_PAUSE_MS : 1400),
      );
    },
    relax() {
      gapMs = Math.max(BULK_BANK_GAP_MS, Math.round(gapMs * 0.9));
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

export type BulkBankFetchProgress = {
  done: number;
  total: number;
  updated: number;
  failed: number;
  skipped: number;
  currentName?: string;
};

export type BulkBankFetchResult = {
  updated: number;
  failed: number;
  skipped: number;
  failures: Array<{ name: string; username: string; message: string }>;
};

async function fetchOneAccount(
  account: AccountMeta,
  throttle: BulkThrottle,
): Promise<{ status: 'updated' | 'failed' | 'skipped'; message?: string }> {
  if (isMockAccountId(account.id) || !needsBankAccountFetch(account)) {
    return { status: 'skipped' };
  }

  const secrets = await getSecrets(account.id);
  if (!secrets?.password?.trim()) {
    return { status: 'skipped', message: 'No password saved' };
  }

  const run = async () => {
    await throttle.acquire();
    return fetchMeroShareBankDetails({
      dpId: account.dpId,
      dpCode: account.dpCode ?? account.dpId,
      username: account.username,
      password: secrets.password,
      fallbackBankName: account.bankName,
    });
  };

  let result = await run();
  if (!result.ok && result.field === 'network') {
    throttle.backoff(new MeroshareError('RATE', result.message));
    await sleep(1200);
    result = await run();
  }

  if (!result.ok) {
    if (isTransientMeroshareMessage(result.message)) {
      throttle.backoff(new MeroshareError('RATE', result.message));
    }
    return { status: 'failed', message: result.message };
  }

  throttle.relax();

  const patch: Partial<Omit<AccountMeta, 'id'>> = {};
  const fetchedAcct = result.accountNumber?.trim() ?? '';
  // Replace BOID wrongly stored in Account No, or fill an empty field.
  if (fetchedAcct && !looksLikeBoid(fetchedAcct)) {
    patch.accountNumber = fetchedAcct;
  } else if (looksLikeBoid(account.accountNumber ?? '')) {
    patch.accountNumber = '';
  }
  if (result.bankName?.trim()) {
    patch.bankName = result.bankName.trim();
  }
  const demat = (result.demat ?? result.boid)?.trim();
  if (demat) {
    patch.demat = demat;
  }
  if (Object.keys(patch).length) {
    await patchAccountMeta(account.id, patch);
  }

  return fetchedAcct && !looksLikeBoid(fetchedAcct)
    ? { status: 'updated' }
    : { status: 'failed', message: 'No bank account number in response' };
}

/**
 * Bulk-fetch missing ASBA bank account numbers (throttled for MeroShare).
 */
export async function bulkFetchMissingBankDetails(
  accounts: AccountMeta[],
  onProgress?: (progress: BulkBankFetchProgress) => void,
): Promise<BulkBankFetchResult> {
  const targets = accounts.filter(
    (a) => !isMockAccountId(a.id) && needsBankAccountFetch(a),
  );
  const total = targets.length;
  let done = 0;
  let updated = 0;
  let failed = 0;
  let skipped = accounts.length - total;
  const failures: BulkBankFetchResult['failures'] = [];
  const throttle = createBulkThrottle();

  const report = (currentName?: string) => {
    onProgress?.({
      done,
      total,
      updated,
      failed,
      skipped,
      currentName,
    });
  };

  report();

  await mapPool(targets, BULK_BANK_CONCURRENCY, async (account) => {
    report(account.name || account.username);
    try {
      const out = await fetchOneAccount(account, throttle);
      if (out.status === 'updated') updated += 1;
      else if (out.status === 'failed') {
        failed += 1;
        failures.push({
          name: account.name || account.username,
          username: account.username,
          message: out.message ?? 'Could not fetch bank details',
        });
      } else {
        skipped += 1;
      }
    } catch (e) {
      failed += 1;
      failures.push({
        name: account.name || account.username,
        username: account.username,
        message: e instanceof Error ? e.message : 'Could not fetch bank details',
      });
      throttle.backoff(e);
    }

    done += 1;
    report();
    return null;
  });

  return { updated, failed, skipped, failures };
}
