import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGACY_PORTFOLIO_KEY, PORTFOLIO_BASE, scopedAsyncKey } from './userScope';

export type PortfolioHolding = {
  symbol: string;
  name: string;
  qty: number;
  wacc: number;
};

export type Portfolio = {
  id: string;
  name: string;
  holdings: PortfolioHolding[];
  createdAt: string;
  /** MeroShare account id when imported — used to upsert on re-import. */
  sourceAccountId?: string;
};

const KEY = () => scopedAsyncKey(PORTFOLIO_BASE);

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function listPortfolios(): Promise<Portfolio[]> {
  try {
    let raw = await AsyncStorage.getItem(KEY());
    if (!raw) raw = await AsyncStorage.getItem(LEGACY_PORTFOLIO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Portfolio[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(list: Portfolio[]): Promise<void> {
  await AsyncStorage.setItem(KEY(), JSON.stringify(list));
}

export async function createPortfolio(name: string): Promise<Portfolio> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Portfolio name is required');
  const portfolio: Portfolio = {
    id: uid(),
    name: trimmed,
    holdings: [],
    createdAt: new Date().toISOString(),
  };
  const list = await listPortfolios();
  list.unshift(portfolio);
  await saveAll(list);
  return portfolio;
}

export async function deletePortfolio(id: string): Promise<void> {
  const list = await listPortfolios();
  await saveAll(list.filter((p) => p.id !== id));
}

/** Remove saved portfolios that were imported from a MeroShare account. */
export async function deletePortfoliosForAccount(
  accountId: string,
): Promise<number> {
  const list = await listPortfolios();
  const next = list.filter((p) => p.sourceAccountId !== accountId);
  const removed = list.length - next.length;
  if (removed > 0) await saveAll(next);
  return removed;
}

export async function renamePortfolio(
  id: string,
  name: string,
): Promise<Portfolio | null> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Portfolio name is required');
  const list = await listPortfolios();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx]!, name: trimmed };
  await saveAll(list);
  return list[idx]!;
}

/** Replace all portfolios (used by backup restore). */
export async function replaceAllPortfolios(
  portfolios: Portfolio[],
): Promise<void> {
  await saveAll(Array.isArray(portfolios) ? portfolios : []);
}

export async function addHolding(
  portfolioId: string,
  holding: Omit<PortfolioHolding, 'name'> & { name?: string },
): Promise<Portfolio | null> {
  const list = await listPortfolios();
  const idx = list.findIndex((p) => p.id === portfolioId);
  if (idx < 0) return null;
  const p = list[idx]!;
  const existing = p.holdings.findIndex(
    (h) => h.symbol.toUpperCase() === holding.symbol.toUpperCase(),
  );
  const row: PortfolioHolding = {
    symbol: holding.symbol.toUpperCase(),
    name: holding.name?.trim() || holding.symbol.toUpperCase(),
    qty: holding.qty,
    wacc: holding.wacc,
  };
  if (existing >= 0) p.holdings[existing] = row;
  else p.holdings.push(row);
  list[idx] = p;
  await saveAll(list);
  return p;
}

/**
 * Merge a batch of imported holdings into a portfolio.
 * Existing symbols are overwritten with the imported qty/wacc.
 * Returns the updated portfolio and how many rows were added vs updated.
 */
export async function importHoldings(
  portfolioId: string,
  holdings: Array<Omit<PortfolioHolding, 'name'> & { name?: string }>,
): Promise<{ portfolio: Portfolio; added: number; updated: number } | null> {
  const list = await listPortfolios();
  const idx = list.findIndex((p) => p.id === portfolioId);
  if (idx < 0) return null;
  const p = list[idx]!;
  let added = 0;
  let updated = 0;
  for (const h of holdings) {
    const symbol = h.symbol.toUpperCase();
    const row: PortfolioHolding = {
      symbol,
      name: h.name?.trim() || symbol,
      qty: h.qty,
      wacc: h.wacc,
    };
    const existing = p.holdings.findIndex(
      (x) => x.symbol.toUpperCase() === symbol,
    );
    if (existing >= 0) {
      p.holdings[existing] = row;
      updated += 1;
    } else {
      p.holdings.push(row);
      added += 1;
    }
  }
  list[idx] = p;
  await saveAll(list);
  return { portfolio: p, added, updated };
}

/** Create a new portfolio pre-filled with imported holdings. */
export async function createPortfolioWithHoldings(
  name: string,
  holdings: Array<Omit<PortfolioHolding, 'name'> & { name?: string }>,
  sourceAccountId?: string,
): Promise<Portfolio> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Portfolio name is required');
  const portfolio: Portfolio = {
    id: uid(),
    name: trimmed,
    holdings: [],
    createdAt: new Date().toISOString(),
    sourceAccountId,
  };
  const list = await listPortfolios();
  list.unshift(portfolio);
  await saveAll(list);
  await importHoldings(portfolio.id, holdings);
  return (await listPortfolios()).find((p) => p.id === portfolio.id) ?? portfolio;
}

/**
 * Import (or refresh) a portfolio tied to a MeroShare account.
 * Re-importing the same account updates holdings instead of duplicating.
 */
export async function upsertImportedPortfolio(
  accountId: string,
  name: string,
  holdings: Array<Omit<PortfolioHolding, 'name'> & { name?: string }>,
): Promise<{ portfolio: Portfolio; created: boolean; added: number; updated: number }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Portfolio name is required');
  const list = await listPortfolios();
  let idx = list.findIndex((p) => p.sourceAccountId === accountId);
  if (idx < 0) {
    // Legacy imports had no sourceAccountId — match by exact name.
    idx = list.findIndex((p) => p.name === trimmed);
  }

  if (idx >= 0) {
    const existing = list[idx]!;
    existing.name = trimmed;
    existing.sourceAccountId = accountId;
    list[idx] = existing;
    await saveAll(list);
    const merged = await importHoldings(existing.id, holdings);
    return {
      portfolio: merged?.portfolio ?? existing,
      created: false,
      added: merged?.added ?? 0,
      updated: merged?.updated ?? 0,
    };
  }

  const portfolio = await createPortfolioWithHoldings(
    trimmed,
    holdings,
    accountId,
  );
  return {
    portfolio,
    created: true,
    added: holdings.length,
    updated: 0,
  };
}

export async function removeHolding(
  portfolioId: string,
  symbol: string,
): Promise<void> {
  const list = await listPortfolios();
  const idx = list.findIndex((p) => p.id === portfolioId);
  if (idx < 0) return;
  const p = list[idx]!;
  p.holdings = p.holdings.filter(
    (h) => h.symbol.toUpperCase() !== symbol.toUpperCase(),
  );
  list[idx] = p;
  await saveAll(list);
}
