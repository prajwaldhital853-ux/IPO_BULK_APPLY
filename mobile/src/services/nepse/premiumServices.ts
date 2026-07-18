import {
  fmtMcap,
  fmtNum,
  iconUri,
  loadAnnouncements,
  loadFloorsheet,
  loadHighDemand,
  loadHighSupply,
  loadMiniScreener,
  type FloorsheetRow,
  type MiniScreenerRow,
} from './screener';
import type { PremiumScreenerRow } from './premiumScreeners';

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
  const screener = await loadMiniScreener(true);
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

export async function loadFinancialReportsFeed(
  limit = 80,
): Promise<{
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: FinancialReportFeedRow[];
}> {
  const announcements = await loadAnnouncements(1, 150);
  const rows = announcements
    .filter((r) =>
      /report|quarter|annual|financial|statement|audited|result|balance sheet/i.test(
        r.title,
      ),
    )
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      symbol: r.symbol,
      securityName: r.securityName,
      title: r.title,
      date: r.date,
      attachmentUrl: r.attachmentUrl,
      details: r.details,
      iconUrl: r.iconUrl,
    }));

  const symbols = new Set(rows.map((r) => r.symbol).filter(Boolean));
  return {
    asOf: new Date().toISOString(),
    summary: [
      { label: 'Reports', value: String(rows.length) },
      { label: 'Companies', value: String(symbols.size) },
      {
        label: 'With PDF',
        value: String(rows.filter((r) => r.attachmentUrl).length),
      },
    ],
    rows,
  };
}

export async function loadMarketDepthBoard(limit = 50): Promise<{
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: MarketDepthRow[];
}> {
  const [demand, supply, screener] = await Promise.all([
    loadHighDemand(),
    loadHighSupply(),
    loadMiniScreener(true),
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
  const all: FloorsheetRow[] = [];
  for (let p = 1; p <= pages; p += 1) {
    const res = await loadFloorsheet(p, pageSize);
    all.push(...res.rows);
    if (!res.hasNext) break;
  }

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
