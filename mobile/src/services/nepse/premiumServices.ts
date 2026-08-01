import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fmtAmtShort,
  fmtMcap,
  fmtNum,
  formatFiscalQuarter,
  iconUri,
  loadFloorsheet,
  loadHighDemand,
  loadHighSupply,
  loadMiniScreener,
  type FloorsheetRow,
  type MiniScreenerRow,
} from './screener';
import type { PremiumScreenerRow } from './premiumScreeners';

const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';
/** In-memory freshness — after this, a background refresh is triggered on next open. */
const FEED_CACHE_TTL_MS = 15 * 60 * 1000;
/** Disk snapshot stays usable across app restarts so a cold open still paints instantly. */
const FEED_DISK_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const FEED_DISK_KEY = '@nepse/financial_reports_feed_v1';

export type PremiumToolKind =
  | 'stock-filter'
  | 'financial-reports'
  | 'floor-sheet'
  | 'market-depth';

export type StockFilterPreset =
  | 'gainers'
  | 'losers'
  | 'high-volume'
  | 'low-pe'
  | 'high-yield'
  | 'banking'
  | 'hydropower'
  | 'under-200'
  | 'above-1000';

export const STOCK_FILTER_PRESETS: {
  id: StockFilterPreset;
  label: string;
  hint: string;
}[] = [
  { id: 'gainers', label: 'Gainers', hint: 'Positive change today' },
  { id: 'losers', label: 'Losers', hint: 'Negative change today' },
  { id: 'high-volume', label: 'High Volume', hint: 'Most traded by quantity' },
  { id: 'low-pe', label: 'Low P/E', hint: 'P/E under 20' },
  { id: 'high-yield', label: 'High Yield', hint: 'Dividend yield leaders' },
  { id: 'banking', label: 'Banking', hint: 'Commercial & dev banks' },
  { id: 'hydropower', label: 'Hydropower', hint: 'Power sector' },
  { id: 'under-200', label: 'Under Rs 200', hint: 'Lower priced stocks' },
  { id: 'above-1000', label: 'Above Rs 1000', hint: 'Higher priced stocks' },
];

export type FinancialReportFeedRow = {
  id: number;
  symbol: string;
  securityName: string;
  title: string;
  date: string;
  attachmentUrl: string | null;
  details: string;
  iconUrl: string | null;
};

type FeedCache = {
  at: number;
  payload: {
    asOf: string;
    summary: Array<{ label: string; value: string }>;
    rows: FinancialReportFeedRow[];
  };
};

let financialReportsFeedCache: FeedCache | null = null;
let feedDiskHydrateAttempted = false;
let feedRefreshInFlight: Promise<FeedCache['payload']> | null = null;

async function hydrateFeedFromDisk(): Promise<void> {
  if (feedDiskHydrateAttempted || financialReportsFeedCache) return;
  feedDiskHydrateAttempted = true;
  try {
    const raw = await AsyncStorage.getItem(FEED_DISK_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as FeedCache;
    if (
      parsed?.payload?.rows?.length &&
      Date.now() - parsed.at < FEED_DISK_MAX_AGE_MS
    ) {
      financialReportsFeedCache = parsed;
    }
  } catch {
    // ignore — network fetch below still works
  }
}

async function persistFeedToDisk(cache: FeedCache): Promise<void> {
  try {
    await AsyncStorage.setItem(FEED_DISK_KEY, JSON.stringify(cache));
  } catch {
    // ignore disk errors
  }
}

export type MarketDepthRow = {
  symbol: string;
  name: string;
  ltp: number | null;
  changePct: number | null;
  bidQty: number | null;
  bidOrders: number | null;
  askQty: number | null;
  askOrders: number | null;
  imbalancePct: number | null;
  iconUrl: string | null;
};

export type PremiumFloorsheetSnapshot = {
  asOf: string;
  totalTrades: number;
  totalVolume: number;
  totalValue: number;
  bulkCount: number;
  topSymbols: Array<{
    symbol: string;
    name: string;
    trades: number;
    volume: number;
    value: number;
  }>;
  bulkTrades: FloorsheetRow[];
  rows: FloorsheetRow[];
};

export type StockFilterSnapshot = {
  preset: StockFilterPreset;
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: PremiumScreenerRow[];
};

function toFilterRow(row: MiniScreenerRow, rank: number, insight: string): PremiumScreenerRow {
  return {
    rank,
    symbol: row.symbol,
    name: row.name,
    ltp: row.ltp,
    changePct: row.changePercent,
    volume: row.volume,
    turnover: row.turnover,
    mcap: row.marketCap,
    pe: row.peRatio,
    pb: row.pricePerBookValue,
    sector: row.sector,
    score: row.changePercent ?? 0,
    insight,
    iconUrl: iconUri(row.iconUrl),
    tags: row.sector ? [row.sector] : [],
  };
}

function applyFilterPreset(
  rows: MiniScreenerRow[],
  preset: StockFilterPreset,
): MiniScreenerRow[] {
  switch (preset) {
    case 'gainers':
      return rows
        .filter((r) => (r.changePercent ?? 0) > 0)
        .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
    case 'losers':
      return rows
        .filter((r) => (r.changePercent ?? 0) < 0)
        .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
    case 'high-volume':
      return [...rows].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    case 'low-pe':
      return rows
        .filter((r) => {
          const pe = r.peRatio;
          return pe != null && pe > 0 && pe <= 20;
        })
        .sort((a, b) => (a.peRatio ?? 99) - (b.peRatio ?? 99));
    case 'high-yield':
      return rows
        .filter((r) => (r.oneYearYield ?? 0) > 0)
        .sort((a, b) => (b.oneYearYield ?? 0) - (a.oneYearYield ?? 0));
    case 'banking':
      return rows
        .filter((r) => /bank/i.test(r.sector ?? ''))
        .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    case 'hydropower':
      return rows
        .filter((r) => /hydro/i.test(r.sector ?? ''))
        .sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0));
    case 'under-200':
      return rows
        .filter((r) => (r.ltp ?? 0) > 0 && (r.ltp ?? 0) < 200)
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    case 'above-1000':
      return rows
        .filter((r) => (r.ltp ?? 0) >= 1000)
        .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    default:
      return rows;
  }
}

export async function loadStockFilter(
  preset: StockFilterPreset,
  limit = 60,
): Promise<StockFilterSnapshot> {
  const screener = await loadMiniScreener();
  const filtered = applyFilterPreset(screener, preset).slice(0, limit);
  const meta = STOCK_FILTER_PRESETS.find((p) => p.id === preset)!;
  const mapped = filtered.map((r, i) =>
    toFilterRow(
      r,
      i + 1,
      `${meta.hint} · Vol ${fmtNum(r.volume, 0)}`,
    ),
  );
  const adv = mapped.filter((r) => (r.changePct ?? 0) > 0).length;
  return {
    preset,
    asOf: new Date().toISOString(),
    summary: [
      { label: 'Matches', value: String(mapped.length) },
      { label: 'Advancing', value: String(adv) },
      {
        label: 'Avg chg',
        value:
          mapped.length > 0
            ? `${(
                mapped.reduce((s, r) => s + (r.changePct ?? 0), 0) / mapped.length
              ).toFixed(2)}%`
            : '—',
      },
    ],
    rows: mapped,
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

function fundNum(
  values: Array<{ key?: string; value?: unknown }>,
  key: string,
): number | null {
  const hit = values.find((v) => v.key === key);
  const n = hit?.value != null ? Number(hit.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Market-wide financial reports from ShareHub fundamental/values.
 * Previous announcement-title filter only matched a handful of recent notices.
 */
async function fetchFinancialReportsFeed(
  symbolLimit: number,
): Promise<FeedCache['payload']> {
  const screener = await loadMiniScreener();
  const symbols = [...screener]
    .filter((r) => r.symbol && !r.symbol.includes(' '))
    .sort(
      (a, b) =>
        (b.marketCap ?? 0) - (a.marketCap ?? 0) ||
        (b.turnover ?? 0) - (a.turnover ?? 0),
    )
    .slice(0, symbolLimit);

  const nameBySym = new Map(
    symbols.map((r) => [r.symbol.toUpperCase(), r] as const),
  );

  const batches = await mapPool(symbols, 12, async (row) => {
    try {
      const res = await fetch(
        `${DATA_BASE}/fundamental/values/${encodeURIComponent(row.symbol)}`,
        {
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
        },
      );
      if (!res.ok) return [] as FinancialReportFeedRow[];
      const json = (await res.json()) as {
        data?: Array<{
          id?: number;
          symbol?: string;
          iconUrl?: string;
          fiscalYear?: string;
          quarter?: string;
          values?: Array<{ key?: string; value?: unknown }>;
        }>;
      };
      const list = json.data ?? [];
      const out: FinancialReportFeedRow[] = [];
      for (const item of list) {
        const values = Array.isArray(item.values) ? item.values : [];
        if (!values.length) continue;
        const fy = item.fiscalYear ?? null;
        const q = item.quarter ?? null;
        const meta = formatFiscalQuarter(fy, q);
        const eps = fundNum(values, 'eps') ?? fundNum(values, 'eps_a');
        const netProfit = fundNum(values, 'net_profit');
        const roe = fundNum(values, 'roe');
        const sym = (item.symbol || row.symbol).toUpperCase();
        const quote = nameBySym.get(sym);
        out.push({
          id: Number(item.id ?? 0) || out.length + 1,
          symbol: sym,
          securityName: quote?.name || sym,
          title: meta.title,
          date: fy ? `FY ${fy}` : meta.quarterLabel || '',
          attachmentUrl: null,
          details: [
            eps != null ? `EPS ${eps.toFixed(2)}` : null,
            netProfit != null ? `NP ${fmtAmtShort(netProfit)}` : null,
            roe != null ? `ROE ${roe.toFixed(2)}%` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          iconUrl: iconUri(item.iconUrl ?? quote?.iconUrl),
        });
      }
      return out;
    } catch {
      return [] as FinancialReportFeedRow[];
    }
  });

  const qn = (dateOrTitle: string) => {
    const m = dateOrTitle.toLowerCase().match(/q([1-4])|([1-4])(?:st|nd|rd|th)/);
    return m ? Number(m[1] || m[2]) : 0;
  };

  const rows = batches
    .flat()
    .sort((a, b) => {
      const fy = (b.date || '').localeCompare(a.date || '');
      if (fy !== 0) return fy;
      return qn(b.title) - qn(a.title);
    });

  // Deduplicate by id when present, else symbol+title
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = r.id ? `id:${r.id}` : `${r.symbol}:${r.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const symbolsWithReports = new Set(unique.map((r) => r.symbol).filter(Boolean));
  const payload = {
    asOf: new Date().toISOString(),
    summary: [
      { label: 'Reports', value: String(unique.length) },
      { label: 'Companies', value: String(symbolsWithReports.size) },
      {
        label: 'Latest FY',
        value: unique[0]?.date?.replace(/^FY\s*/, '') || '—',
      },
    ],
    rows: unique,
  };

  return payload;
}

function refreshFinancialReportsInBackground(
  symbolLimit: number,
): Promise<FeedCache['payload']> {
  if (feedRefreshInFlight) return feedRefreshInFlight;
  feedRefreshInFlight = (async () => {
    const payload = await fetchFinancialReportsFeed(symbolLimit);
    const cache: FeedCache = { at: Date.now(), payload };
    financialReportsFeedCache = cache;
    void persistFeedToDisk(cache);
    return payload;
  })().finally(() => {
    feedRefreshInFlight = null;
  });
  return feedRefreshInFlight;
}

/**
 * Stale-while-revalidate: serves the last known feed (memory, then disk)
 * instantly, and refreshes it in the background unless there's nothing to
 * show yet or `force` is explicitly requested (e.g. pull-to-refresh).
 */
/** Sync peek of warm financial-reports feed (memory only). */
export function peekFinancialReportsFeed(limit = 400): {
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: FinancialReportFeedRow[];
} | null {
  if (!financialReportsFeedCache?.payload?.rows?.length) return null;
  return {
    ...financialReportsFeedCache.payload,
    rows: financialReportsFeedCache.payload.rows.slice(0, limit),
  };
}

/** Kick disk hydrate + background refresh so Financial Reports opens warm. */
export function prefetchFinancialReportsFeed(): void {
  void (async () => {
    try {
      await hydrateFeedFromDisk();
      if (
        !financialReportsFeedCache ||
        Date.now() - financialReportsFeedCache.at >= FEED_CACHE_TTL_MS
      ) {
        await loadFinancialReportsFeed(400);
      }
    } catch {
      // best-effort
    }
  })();
}

export async function loadFinancialReportsFeed(
  limit = 400,
  opts?: { force?: boolean; symbolLimit?: number },
): Promise<{
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: FinancialReportFeedRow[];
}> {
  const symbolLimit = opts?.symbolLimit ?? 160;
  await hydrateFeedFromDisk();

  const isFresh =
    !!financialReportsFeedCache &&
    Date.now() - financialReportsFeedCache.at < FEED_CACHE_TTL_MS;

  if (!opts?.force && financialReportsFeedCache) {
    if (!isFresh) {
      void refreshFinancialReportsInBackground(symbolLimit);
    }
    return {
      ...financialReportsFeedCache.payload,
      rows: financialReportsFeedCache.payload.rows.slice(0, limit),
    };
  }

  const payload = await refreshFinancialReportsInBackground(symbolLimit);
  return { ...payload, rows: payload.rows.slice(0, limit) };
}

export async function loadMarketDepthBoard(limit = 50): Promise<{
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: MarketDepthRow[];
}> {
  const [demand, supply, screener] = await Promise.all([
    loadHighDemand(),
    loadHighSupply(),
    loadMiniScreener(),
  ]);
  const quoteMap = new Map(
    screener.map((r) => [r.symbol.toUpperCase(), r]),
  );
  const symbols = new Set<string>();
  for (const d of demand) symbols.add(d.symbol.toUpperCase());
  for (const s of supply) symbols.add(s.symbol.toUpperCase());

  const demandMap = new Map(
    demand.map((d) => [d.symbol.toUpperCase(), d]),
  );
  const supplyMap = new Map(
    supply.map((d) => [d.symbol.toUpperCase(), d]),
  );

  const rows: MarketDepthRow[] = [...symbols]
    .map((sym) => {
      const bid = demandMap.get(sym);
      const ask = supplyMap.get(sym);
      const q = quoteMap.get(sym);
      const bidQty = bid?.quantity ?? 0;
      const askQty = ask?.quantity ?? 0;
      const total = bidQty + askQty;
      const imbalancePct =
        total > 0 ? ((bidQty - askQty) / total) * 100 : null;
      return {
        symbol: sym,
        name: q?.name ?? bid?.name ?? ask?.name ?? sym,
        ltp: q?.ltp ?? bid?.ltp ?? ask?.ltp ?? null,
        changePct: q?.changePercent ?? bid?.changePct ?? ask?.changePct ?? null,
        bidQty: bid?.quantity ?? null,
        bidOrders: bid?.orders ?? null,
        askQty: ask?.quantity ?? null,
        askOrders: ask?.orders ?? null,
        imbalancePct,
        iconUrl: iconUri(q?.iconUrl ?? bid?.iconUrl ?? ask?.iconUrl),
      };
    })
    .sort(
      (a, b) =>
        (b.bidQty ?? 0) + (b.askQty ?? 0) - ((a.bidQty ?? 0) + (a.askQty ?? 0)),
    )
    .slice(0, limit);

  const totalBid = rows.reduce((s, r) => s + (r.bidQty ?? 0), 0);
  const totalAsk = rows.reduce((s, r) => s + (r.askQty ?? 0), 0);

  return {
    asOf: new Date().toISOString(),
    summary: [
      { label: 'Symbols', value: String(rows.length) },
      { label: 'Bid qty', value: fmtNum(totalBid, 0) },
      { label: 'Ask qty', value: fmtNum(totalAsk, 0) },
      {
        label: 'Imbalance',
        value:
          totalBid + totalAsk > 0
            ? `${(((totalBid - totalAsk) / (totalBid + totalAsk)) * 100).toFixed(1)}%`
            : '—',
      },
    ],
    rows,
  };
}

const BULK_AMOUNT = 5_000_000;

export async function loadPremiumFloorsheet(
  pageSize = 50,
  pages = 2,
): Promise<PremiumFloorsheetSnapshot> {
  // Pages are independent — fetch them together instead of one-await-at-a-time.
  const pageNums = Array.from({ length: pages }, (_, i) => i + 1);
  const results = await Promise.all(
    pageNums.map((p) => loadFloorsheet(p, pageSize)),
  );
  const all: FloorsheetRow[] = results.flatMap((res) => res.rows);

  const symAgg = new Map<
    string,
    { name: string; trades: number; volume: number; value: number }
  >();
  let totalVolume = 0;
  let totalValue = 0;

  for (const t of all) {
    totalVolume += t.quantity ?? 0;
    totalValue += t.amount ?? 0;
    const prev = symAgg.get(t.symbol) ?? {
      name: t.name,
      trades: 0,
      volume: 0,
      value: 0,
    };
    symAgg.set(t.symbol, {
      name: t.name || prev.name,
      trades: prev.trades + 1,
      volume: prev.volume + (t.quantity ?? 0),
      value: prev.value + (t.amount ?? 0),
    });
  }

  const topSymbols = [...symAgg.entries()]
    .map(([symbol, v]) => ({ symbol, ...v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const bulkTrades = all
    .filter((t) => (t.amount ?? 0) >= BULK_AMOUNT)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, 15);

  return {
    asOf: new Date().toISOString(),
    totalTrades: all.length,
    totalVolume,
    totalValue,
    bulkCount: bulkTrades.length,
    topSymbols,
    bulkTrades,
    rows: all,
  };
}
