import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGACY_WATCHLIST_KEY, WATCHLIST_BASE, scopedAsyncKey } from './userScope';

export type WatchItem = {
  symbol: string;
  name: string;
  addedAt: string;
};

const KEY = () => scopedAsyncKey(WATCHLIST_BASE);

export async function listWatchlist(): Promise<WatchItem[]> {
  try {
    let raw = await AsyncStorage.getItem(KEY());
    if (!raw) raw = await AsyncStorage.getItem(LEGACY_WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(list: WatchItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY(), JSON.stringify(list));
}

export async function isWatched(symbol: string): Promise<boolean> {
  const list = await listWatchlist();
  return list.some((w) => w.symbol.toUpperCase() === symbol.toUpperCase());
}

export async function addToWatchlist(
  symbol: string,
  name: string,
): Promise<WatchItem[]> {
  const list = await listWatchlist();
  const sym = symbol.toUpperCase();
  if (list.some((w) => w.symbol.toUpperCase() === sym)) return list;
  const next = [
    { symbol: sym, name: name || sym, addedAt: new Date().toISOString() },
    ...list,
  ];
  await saveAll(next);
  return next;
}

export async function removeFromWatchlist(
  symbol: string,
): Promise<WatchItem[]> {
  const list = await listWatchlist();
  const next = list.filter(
    (w) => w.symbol.toUpperCase() !== symbol.toUpperCase(),
  );
  await saveAll(next);
  return next;
}

export async function reorderWatchlist(symbols: string[]): Promise<WatchItem[]> {
  const list = await listWatchlist();
  const bySym = new Map(list.map((w) => [w.symbol.toUpperCase(), w]));
  const next: WatchItem[] = [];
  for (const s of symbols) {
    const row = bySym.get(s.toUpperCase());
    if (row) next.push(row);
  }
  for (const w of list) {
    if (!next.some((x) => x.symbol.toUpperCase() === w.symbol.toUpperCase())) {
      next.push(w);
    }
  }
  await saveAll(next);
  return next;
}

export async function toggleWatchlist(
  symbol: string,
  name: string,
): Promise<{ list: WatchItem[]; watched: boolean }> {
  const sym = symbol.toUpperCase();
  const list = await listWatchlist();
  if (list.some((w) => w.symbol.toUpperCase() === sym)) {
    return { list: await removeFromWatchlist(sym), watched: false };
  }
  return { list: await addToWatchlist(sym, name), watched: true };
}
