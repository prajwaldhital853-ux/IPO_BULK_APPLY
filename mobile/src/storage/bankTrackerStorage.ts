import AsyncStorage from '@react-native-async-storage/async-storage';
import { scopedAsyncKey } from './userScope';

const BANK_TRACKER_BASE = 'bank_tracker_v1';
const KEY = () => scopedAsyncKey(BANK_TRACKER_BASE);

/** How a transaction is grouped for the filter tabs. */
export type BankTxnGroup = 'hold' | 'refund' | 'casba' | 'manual';

export type BankTxn = {
  id: string;
  group: BankTxnGroup;
  label: string;
  /** Signed change to the available balance. */
  availableDelta: number;
  /** Signed change to the on-hold amount. */
  holdDelta: number;
  createdAt: string;
  note?: string;
};

export type BankTrackerAccount = {
  accountId: string;
  tracking: boolean;
  openingBalance: number;
  /** CASBA fee charged on each fresh IPO apply (Rs). */
  casbaFee: number;
  /** Auto-deduct a yearly mobile-banking service charge on renewal. */
  mobileBankingYearlyCharge: boolean;
  transactions: BankTxn[];
  startedAt: string | null;
};

type Store = Record<string, BankTrackerAccount>;

export const DEFAULT_CASBA_FEE = 5;

function emptyAccount(accountId: string): BankTrackerAccount {
  return {
    accountId,
    tracking: false,
    openingBalance: 0,
    casbaFee: DEFAULT_CASBA_FEE,
    mobileBankingYearlyCharge: false,
    transactions: [],
    startedAt: null,
  };
}

async function loadStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveStore(store: Store): Promise<void> {
  await AsyncStorage.setItem(KEY(), JSON.stringify(store));
}

export async function getTracker(
  accountId: string,
): Promise<BankTrackerAccount> {
  const store = await loadStore();
  return store[accountId] ?? emptyAccount(accountId);
}

export async function getAllTrackers(): Promise<Store> {
  return loadStore();
}

async function mutate(
  accountId: string,
  fn: (acc: BankTrackerAccount) => BankTrackerAccount,
): Promise<BankTrackerAccount> {
  const store = await loadStore();
  const current = store[accountId] ?? emptyAccount(accountId);
  const next = fn(current);
  store[accountId] = next;
  await saveStore(store);
  return next;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Derived balances for an account tracker. */
export type BankBalances = { available: number; hold: number; total: number };

export function computeBalances(acc: BankTrackerAccount): BankBalances {
  let available = acc.openingBalance;
  let hold = 0;
  for (const t of acc.transactions) {
    available += t.availableDelta;
    hold += t.holdDelta;
  }
  if (hold < 0) hold = 0;
  return { available, hold, total: available + hold };
}

export async function startTracking(
  accountId: string,
  openingBalance: number,
): Promise<BankTrackerAccount> {
  return mutate(accountId, (acc) => ({
    ...acc,
    tracking: true,
    openingBalance,
    transactions: [],
    startedAt: new Date().toISOString(),
  }));
}

export async function stopTracking(
  accountId: string,
): Promise<BankTrackerAccount> {
  return mutate(accountId, (acc) => ({
    ...emptyAccount(accountId),
    // keep the fee/charge preferences for next time
    casbaFee: acc.casbaFee,
    mobileBankingYearlyCharge: acc.mobileBankingYearlyCharge,
  }));
}

/** Fully remove bank-tracker data for a deleted MeroShare account. */
export async function removeTrackerForAccount(accountId: string): Promise<void> {
  await removeTrackersForAccounts([accountId]);
}

export async function removeTrackersForAccounts(
  accountIds: string[],
): Promise<void> {
  if (!accountIds.length) return;
  const store = await loadStore();
  let changed = false;
  for (const id of accountIds) {
    if (id in store) {
      delete store[id];
      changed = true;
    }
  }
  if (changed) await saveStore(store);
}

export async function setOpeningBalance(
  accountId: string,
  openingBalance: number,
): Promise<BankTrackerAccount> {
  return mutate(accountId, (acc) => ({ ...acc, openingBalance }));
}

export async function updateSettings(
  accountId: string,
  patch: { casbaFee?: number; mobileBankingYearlyCharge?: boolean },
): Promise<BankTrackerAccount> {
  return mutate(accountId, (acc) => ({
    ...acc,
    casbaFee:
      patch.casbaFee != null && Number.isFinite(patch.casbaFee)
        ? patch.casbaFee
        : acc.casbaFee,
    mobileBankingYearlyCharge:
      patch.mobileBankingYearlyCharge ?? acc.mobileBankingYearlyCharge,
  }));
}

export async function addTransaction(
  accountId: string,
  txn: Omit<BankTxn, 'id' | 'createdAt'> & { createdAt?: string },
): Promise<BankTrackerAccount> {
  const entry: BankTxn = {
    id: makeId(),
    createdAt: txn.createdAt ?? new Date().toISOString(),
    group: txn.group,
    label: txn.label,
    availableDelta: txn.availableDelta,
    holdDelta: txn.holdDelta,
    note: txn.note,
  };
  return mutate(accountId, (acc) => ({
    ...acc,
    transactions: [entry, ...acc.transactions],
  }));
}

export async function removeTransaction(
  accountId: string,
  txnId: string,
): Promise<BankTrackerAccount> {
  return mutate(accountId, (acc) => ({
    ...acc,
    transactions: acc.transactions.filter((t) => t.id !== txnId),
  }));
}

/** Clears all transactions and returns available balance to the opening value. */
export async function resetTransactions(
  accountId: string,
): Promise<BankTrackerAccount> {
  return mutate(accountId, (acc) => ({ ...acc, transactions: [] }));
}

// ---- Manual action helpers -------------------------------------------------

export async function deposit(
  accountId: string,
  amount: number,
  note?: string,
): Promise<BankTrackerAccount> {
  return addTransaction(accountId, {
    group: 'manual',
    label: 'Deposit',
    availableDelta: Math.abs(amount),
    holdDelta: 0,
    note,
  });
}

export async function withdraw(
  accountId: string,
  amount: number,
  note?: string,
): Promise<BankTrackerAccount> {
  return addTransaction(accountId, {
    group: 'manual',
    label: 'Withdraw',
    availableDelta: -Math.abs(amount),
    holdDelta: 0,
    note,
  });
}

/** Adjust the available balance to an exact target value. */
export async function adjustTo(
  accountId: string,
  target: number,
): Promise<BankTrackerAccount> {
  const acc = await getTracker(accountId);
  const { available } = computeBalances(acc);
  const delta = target - available;
  return addTransaction(accountId, {
    group: 'manual',
    label: 'Adjustment',
    availableDelta: delta,
    holdDelta: 0,
  });
}

/**
 * Auto-record an IPO application: blocks the applied amount (moves it to hold)
 * and charges the CASBA fee. Call this from the apply flow on a successful
 * application so the tracked balance stays accurate.
 */
export async function recordIpoApply(
  accountId: string,
  scrip: string,
  blockedAmount: number,
): Promise<BankTrackerAccount | null> {
  const acc = await getTracker(accountId);
  if (!acc.tracking) return null;
  await addTransaction(accountId, {
    group: 'hold',
    label: `IPO hold — ${scrip}`.trim(),
    availableDelta: -Math.abs(blockedAmount),
    holdDelta: Math.abs(blockedAmount),
  });
  if (acc.casbaFee > 0) {
    await addTransaction(accountId, {
      group: 'casba',
      label: `CASBA fee — ${scrip}`.trim(),
      availableDelta: -Math.abs(acc.casbaFee),
      holdDelta: 0,
    });
  }
  return getTracker(accountId);
}

/** Release a hold back to available (IPO refunded / not allotted). */
export async function recordIpoRefund(
  accountId: string,
  scrip: string,
  amount: number,
): Promise<BankTrackerAccount> {
  return addTransaction(accountId, {
    group: 'refund',
    label: `Refund — ${scrip}`.trim(),
    availableDelta: Math.abs(amount),
    holdDelta: -Math.abs(amount),
  });
}
