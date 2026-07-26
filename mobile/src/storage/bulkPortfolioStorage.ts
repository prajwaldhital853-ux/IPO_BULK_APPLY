import AsyncStorage from '@react-native-async-storage/async-storage';
import { scopedAsyncKey } from './userScope';

const BASE = 'bulk_portfolio_snapshot_v1';
const KEY = () => scopedAsyncKey(BASE);

export type BulkHoldingSnap = {
  accountId: string;
  accountName: string;
  symbol: string;
  name?: string;
  qty: number;
  wacc: number;
  ltp: number | null;
  previousClosingPrice: number | null;
  value: number;
  dayChange: number;
};

export type BulkPortfolioSnapshot = {
  updatedAt: string;
  totalValue: number;
  dayChange: number;
  accounts: number;
  holdings: number;
  rows: BulkHoldingSnap[];
};

export async function loadBulkPortfolioSnapshot(): Promise<BulkPortfolioSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BulkPortfolioSnapshot;
    if (!parsed || typeof parsed.totalValue !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveBulkPortfolioSnapshot(
  snap: BulkPortfolioSnapshot,
): Promise<void> {
  await AsyncStorage.setItem(KEY(), JSON.stringify(snap));
}

export async function clearBulkPortfolioSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY());
}

/** Drop holdings for a deleted MeroShare account and recompute totals. */
export async function removeAccountFromBulkSnapshot(
  accountId: string,
): Promise<void> {
  const snap = await loadBulkPortfolioSnapshot();
  if (!snap?.rows?.length) return;
  const rows = snap.rows.filter((r) => r.accountId !== accountId);
  if (rows.length === snap.rows.length) return;
  if (!rows.length) {
    await clearBulkPortfolioSnapshot();
    return;
  }
  const totalValue = rows.reduce((sum, r) => sum + (r.value || 0), 0);
  const dayChange = rows.reduce((sum, r) => sum + (r.dayChange || 0), 0);
  const accounts = new Set(rows.map((r) => r.accountId)).size;
  await saveBulkPortfolioSnapshot({
    updatedAt: new Date().toISOString(),
    totalValue,
    dayChange,
    accounts,
    holdings: rows.length,
    rows,
  });
}
