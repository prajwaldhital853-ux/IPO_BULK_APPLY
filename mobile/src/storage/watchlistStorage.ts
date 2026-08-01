import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGACY_WATCHLIST_KEY, WATCHLIST_BASE, scopedAsyncKey } from './userScope';

export type WatchSection = {
  id: string;
  name: string;
};

export type WatchItem = {
  symbol: string;
  name: string;
  addedAt: string;
  sectionId: string;
};

type WatchlistStoreV2 = {
  version: 2;
  sections: WatchSection[];
  items: WatchItem[];
};

const DEFAULT_SECTION_ID = 'default';
const DEFAULT_SECTION_NAME = 'My Watchlist';

const KEY = () => scopedAsyncKey(WATCHLIST_BASE);

function defaultStore(): WatchlistStoreV2 {
  return {
    version: 2,
    sections: [{ id: DEFAULT_SECTION_ID, name: DEFAULT_SECTION_NAME }],
    items: [],
  };
}

function normalizeStore(raw: unknown): WatchlistStoreV2 {
  if (!raw) return defaultStore();

  if (Array.isArray(raw)) {
    return {
      version: 2,
      sections: [{ id: DEFAULT_SECTION_ID, name: DEFAULT_SECTION_NAME }],
      items: raw.map((w) => {
        const row = w as Partial<WatchItem>;
        return {
          symbol: String(row.symbol ?? '').toUpperCase(),
          name: String(row.name ?? row.symbol ?? ''),
          addedAt: String(row.addedAt ?? new Date().toISOString()),
          sectionId: row.sectionId ?? DEFAULT_SECTION_ID,
        };
      }),
    };
  }

  const parsed = raw as Partial<WatchlistStoreV2>;
  if (parsed.version === 2 && Array.isArray(parsed.sections) && Array.isArray(parsed.items)) {
    const sections =
      parsed.sections.length > 0
        ? parsed.sections.map((s) => ({
            id: String(s.id),
            name: String(s.name || 'Section'),
          }))
        : defaultStore().sections;

    const sectionIds = new Set(sections.map((s) => s.id));
    const fallbackSectionId = sections[0]!.id;

    return {
      version: 2,
      sections,
      items: parsed.items.map((w) => {
        const sectionId = w.sectionId && sectionIds.has(w.sectionId)
          ? w.sectionId
          : fallbackSectionId;
        return {
          symbol: String(w.symbol ?? '').toUpperCase(),
          name: String(w.name ?? w.symbol ?? ''),
          addedAt: String(w.addedAt ?? new Date().toISOString()),
          sectionId,
        };
      }),
    };
  }

  return defaultStore();
}

async function loadStore(): Promise<WatchlistStoreV2> {
  try {
    let raw = await AsyncStorage.getItem(KEY());
    if (!raw) raw = await AsyncStorage.getItem(LEGACY_WATCHLIST_KEY);
    if (!raw) return defaultStore();
    return normalizeStore(JSON.parse(raw));
  } catch {
    return defaultStore();
  }
}

async function saveStore(store: WatchlistStoreV2): Promise<void> {
  await AsyncStorage.setItem(KEY(), JSON.stringify(store));
}

export async function listWatchlistSections(): Promise<WatchSection[]> {
  const store = await loadStore();
  return store.sections;
}

export async function listWatchlist(): Promise<WatchItem[]> {
  const store = await loadStore();
  const order = store.sections.map((s) => s.id);
  const grouped = new Map<string, WatchItem[]>();
  for (const item of store.items) {
    const list = grouped.get(item.sectionId) ?? [];
    list.push(item);
    grouped.set(item.sectionId, list);
  }
  const out: WatchItem[] = [];
  for (const sectionId of order) {
    const list = grouped.get(sectionId) ?? [];
    out.push(...list);
  }
  for (const [sectionId, list] of grouped) {
    if (!order.includes(sectionId)) out.push(...list);
  }
  return out;
}

export async function saveWatchlistLayout(
  sections: WatchSection[],
  items: WatchItem[],
): Promise<WatchItem[]> {
  const store = await loadStore();
  const nextSections =
    sections.length > 0 ? sections : store.sections.length > 0 ? store.sections : defaultStore().sections;

  const sectionIds = new Set(nextSections.map((s) => s.id));
  const fallbackSectionId = nextSections[0]!.id;

  const nextItems = items.map((item) => ({
    symbol: item.symbol.toUpperCase(),
    name: item.name || item.symbol,
    addedAt: item.addedAt,
    sectionId: sectionIds.has(item.sectionId) ? item.sectionId : fallbackSectionId,
  }));

  await saveStore({
    version: 2,
    sections: nextSections,
    items: nextItems,
  });
  return nextItems;
}

export async function isWatched(symbol: string): Promise<boolean> {
  const list = await listWatchlist();
  return list.some((w) => w.symbol.toUpperCase() === symbol.toUpperCase());
}

export async function addWatchSection(name: string): Promise<WatchSection> {
  const store = await loadStore();
  const section: WatchSection = {
    id: `sec_${Date.now()}`,
    name: name.trim() || 'New Section',
  };
  store.sections.push(section);
  await saveStore(store);
  return section;
}

export async function addToWatchlist(
  symbol: string,
  name: string,
  sectionId?: string,
): Promise<WatchItem[]> {
  const store = await loadStore();
  const sym = symbol.toUpperCase();
  if (store.items.some((w) => w.symbol.toUpperCase() === sym)) {
    return listWatchlist();
  }

  const targetSectionId =
    sectionId && store.sections.some((s) => s.id === sectionId)
      ? sectionId
      : store.sections[0]?.id ?? DEFAULT_SECTION_ID;

  store.items.push({
    symbol: sym,
    name: name || sym,
    addedAt: new Date().toISOString(),
    sectionId: targetSectionId,
  });
  await saveStore(store);
  return listWatchlist();
}

export async function removeFromWatchlist(
  symbol: string,
): Promise<WatchItem[]> {
  const store = await loadStore();
  const sym = symbol.toUpperCase();
  store.items = store.items.filter((w) => w.symbol.toUpperCase() !== sym);
  await saveStore(store);
  return listWatchlist();
}

/** @deprecated Use saveWatchlistLayout — kept for compatibility */
export async function reorderWatchlist(symbols: string[]): Promise<WatchItem[]> {
  const store = await loadStore();
  const bySym = new Map(store.items.map((w) => [w.symbol.toUpperCase(), w]));
  const next: WatchItem[] = [];
  for (const s of symbols) {
    const row = bySym.get(s.toUpperCase());
    if (row) next.push(row);
  }
  for (const w of store.items) {
    if (!next.some((x) => x.symbol.toUpperCase() === w.symbol.toUpperCase())) {
      next.push(w);
    }
  }
  return saveWatchlistLayout(store.sections, next);
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
