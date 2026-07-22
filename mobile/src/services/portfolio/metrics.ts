import type { Portfolio, PortfolioHolding } from '../../storage/portfolioStorage';
import type { MiniScreenerRow } from '../nepse/screener';

export type QuoteMap = Record<
  string,
  Pick<
    MiniScreenerRow,
    'ltp' | 'change' | 'changePercent' | 'sector' | 'iconUrl' | 'name' | 'previousClose'
  >
>;

export type HoldingMetrics = {
  symbol: string;
  name: string;
  qty: number;
  wacc: number;
  invested: number;
  ltp: number | null;
  current: number;
  overallPnl: number;
  overallPnlPct: number;
  todayPnl: number;
  todayPnlPct: number;
  change: number | null;
  changePercent: number | null;
  sector: string;
  iconUrl: string | null;
};

export type PortfolioMetrics = {
  units: number;
  invested: number;
  currentValue: number;
  todayPnl: number;
  overallPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  receivable: number;
  holdings: HoldingMetrics[];
};

export function fmtNpr(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NP', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 ? Math.min(digits, 2) : 0,
  });
}

export function fmtSigned(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  const abs = fmtNpr(Math.abs(n), digits);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

export function holdingMetrics(
  h: PortfolioHolding,
  quote?: QuoteMap[string],
): HoldingMetrics {
  const invested = h.qty * h.wacc;
  const ltp = quote?.ltp ?? null;
  const current = ltp != null && ltp > 0 ? h.qty * ltp : invested;
  const overallPnl = current - invested;
  const overallPnlPct = invested > 0 ? (overallPnl / invested) * 100 : 0;
  const change = quote?.change ?? null;
  const changePercent = quote?.changePercent ?? null;
  const todayPnl =
    change != null && Number.isFinite(change) ? h.qty * change : 0;
  const todayPnlPct = changePercent ?? 0;
  return {
    symbol: h.symbol,
    name: quote?.name?.trim() || h.name || h.symbol,
    qty: h.qty,
    wacc: h.wacc,
    invested,
    ltp,
    current,
    overallPnl,
    overallPnlPct,
    todayPnl,
    todayPnlPct,
    change,
    changePercent,
    sector: quote?.sector?.trim() || 'Other',
    iconUrl: quote?.iconUrl ?? null,
  };
}

export function portfolioMetrics(
  portfolio: Portfolio,
  quotes: QuoteMap,
): PortfolioMetrics {
  const holdings = portfolio.holdings.map((h) =>
    holdingMetrics(h, quotes[h.symbol.toUpperCase()]),
  );
  const units = holdings.reduce((s, h) => s + h.qty, 0);
  const invested = holdings.reduce((s, h) => s + h.invested, 0);
  const currentValue = holdings.reduce((s, h) => s + h.current, 0);
  const todayPnl = holdings.reduce((s, h) => s + h.todayPnl, 0);
  const overallPnl = currentValue - invested;
  return {
    units,
    invested,
    currentValue,
    todayPnl,
    overallPnl,
    realizedPnl: 0,
    unrealizedPnl: overallPnl,
    receivable: currentValue,
    holdings,
  };
}

export function aggregatePortfolios(
  portfolios: Portfolio[],
  quotes: QuoteMap,
): {
  portfolioCount: number;
  units: number;
  invested: number;
  currentValue: number;
  todayPnl: number;
  overallPnl: number;
  items: Array<{ portfolio: Portfolio; metrics: PortfolioMetrics }>;
} {
  const items = portfolios.map((p) => ({
    portfolio: p,
    metrics: portfolioMetrics(p, quotes),
  }));
  return {
    portfolioCount: items.length,
    units: items.reduce((s, i) => s + i.metrics.units, 0),
    invested: items.reduce((s, i) => s + i.metrics.invested, 0),
    currentValue: items.reduce((s, i) => s + i.metrics.currentValue, 0),
    todayPnl: items.reduce((s, i) => s + i.metrics.todayPnl, 0),
    overallPnl: items.reduce((s, i) => s + i.metrics.overallPnl, 0),
    items,
  };
}

export type DistMode = 'current' | 'investment' | 'profit' | 'loss';

export type SectorSlice = {
  sector: string;
  stocks: number;
  units: number;
  value: number;
  pct: number;
  color: string;
};

const SECTOR_COLORS = [
  '#E91E8E',
  '#2E9E5B',
  '#3B82F6',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
  '#64748B',
  '#EC4899',
  '#84CC16',
];

export function sectorDistribution(
  holdings: HoldingMetrics[],
  mode: DistMode,
): SectorSlice[] {
  const map = new Map<
    string,
    { stocks: Set<string>; units: number; value: number }
  >();

  for (const h of holdings) {
    let value = 0;
    if (mode === 'current') value = h.current;
    else if (mode === 'investment') value = h.invested;
    else if (mode === 'profit') value = Math.max(0, h.overallPnl);
    else value = Math.max(0, -h.overallPnl);
    if (value <= 0) continue;

    const cur = map.get(h.sector) ?? {
      stocks: new Set<string>(),
      units: 0,
      value: 0,
    };
    cur.stocks.add(h.symbol);
    cur.units += h.qty;
    cur.value += value;
    map.set(h.sector, cur);
  }

  const total = [...map.values()].reduce((s, v) => s + v.value, 0) || 1;
  return [...map.entries()]
    .map(([sector, v], i) => ({
      sector,
      stocks: v.stocks.size,
      units: v.units,
      value: v.value,
      pct: (v.value / total) * 100,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length]!,
    }))
    .sort((a, b) => b.value - a.value);
}
