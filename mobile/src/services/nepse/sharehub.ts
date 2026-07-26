import { iconUri } from './screener';
import type {
  ChartPoint,
  IndexQuote,
  MarketStatus,
  MarketSummary,
  MoverRow,
  SecurityQuote,
  TradedShareRow,
  TransactionRow,
  TurnoverRow,
} from './types';

const BASE = 'https://sharehubnepal.com/live/api/v1/nepselive';
const BASE_V2 = 'https://sharehubnepal.com/live/api/v2/nepselive';
const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';

async function shFetch<T>(
  path: string,
  base = BASE,
  bust = false,
): Promise<T | null> {
  try {
    const url = `${base}${path}${bust ? (path.includes('?') ? '&' : '?') + '_=' + Date.now() : ''}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type SummaryRow = { detail: string; value: number; date?: string };
type IndexRow = {
  index: string;
  currentValue: number;
  change: number;
  perChange: number;
  previousClose?: number;
  generatedTime?: string;
};
type MoverApi = {
  symbol: string;
  securityName: string;
  ltp: number;
  pointChange: number;
  percentageChange: number;
};
type TurnoverApi = {
  symbol: string;
  securityName: string;
  turnover: number;
  closingPrice: number;
};
type TransactionApi = {
  symbol: string;
  securityName: string;
  lastTradedPrice: number;
  totalTrades: number;
};
type StatusApi = { isOpen: string; asOf?: string };
type HomeMoverRow = {
  symbol: string;
  name: string;
  icon?: string;
  lastTradedPrice: number;
  change: number;
  changePercent: number;
};
type HomeTurnoverRow = {
  symbol: string;
  name: string;
  icon?: string;
  turnover: number;
  lastTradedPrice: number;
  change?: number;
  changePercent?: number;
};
type HomeTransactionRow = {
  symbol: string;
  name: string;
  icon?: string;
  transactions: number;
  lastTradedPrice: number;
  change?: number;
  changePercent?: number;
};
type HomeTradedShareRow = {
  symbol: string;
  name: string;
  icon?: string;
  sharesTraded: number;
  lastTradedPrice: number;
  change?: number;
  changePercent?: number;
};
type HomeIndexRow = {
  name: string;
  symbol: string;
  currentValue: number;
  change: number;
  changePercent: number;
  sector?: string | null;
};
type HomePageData = {
  marketStatus?: { status: string; time?: string };
  marketSummary?: { name: string; value: number }[];
  stockSummary?: {
    advanced: number;
    declined: number;
    unchanged: number;
  };
  indices?: HomeIndexRow[];
  subIndices?: HomeIndexRow[];
  topGainers?: HomeMoverRow[];
  topLosers?: HomeMoverRow[];
  topTurnover?: HomeTurnoverRow[];
  topTransactions?: HomeTransactionRow[];
  topTradedShares?: HomeTradedShareRow[];
};
type MiniScreenerRow = {
  symbol: string;
  name: string;
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  lastUpdatedTime?: string;
};
type TodayPriceRow = {
  symbol: string;
  securityName: string;
  ltp: number;
  change: number;
  changePercent: number;
  totalTradedQuantity: number;
  lastUpdatedTime?: string;
  businessDate?: string;
};
type TodayPriceApi = {
  success?: boolean;
  data?: TodayPriceRow[];
};
type ApiList<T> = T[] | { success?: boolean; data?: T[] };

function unwrapList<T>(json: ApiList<T> | null | undefined): T[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.data ?? [];
}

function parseSummaryRows(rows: SummaryRow[]): MarketSummary {
  const find = (needle: string) =>
    rows.find((r) => r.detail.toLowerCase().includes(needle.toLowerCase()))
      ?.value ?? null;
  return {
    businessDate: rows[0]?.date?.slice(0, 10) ?? null,
    index: null,
    indexChange: null,
    indexPct: null,
    turnover: find('turnover'),
    tradedShares: find('traded shares'),
    transactions: find('transactions'),
    scripsTraded: find('scripts traded') ?? find('scrips traded'),
    advanced: null,
    declined: null,
    unchanged: null,
  };
}

function parseIndex(rows: IndexRow[]): {
  summary: Partial<MarketSummary>;
  indices: IndexQuote[];
  asOf: string | null;
} {
  const indices: IndexQuote[] = rows.map((r) => ({
    name: r.index.replace(/\s+Index$/i, '').trim(),
    symbol: r.index.replace(/\s+Index$/i, '').trim().toUpperCase().replace(/\s+/g, ''),
    current: r.currentValue ?? null,
    change: r.change ?? null,
    pct: r.perChange ?? null,
  }));

  const nepse = rows.find((r) => /nepse index/i.test(r.index));
  const asOf = nepse?.generatedTime ?? rows[0]?.generatedTime ?? null;

  if (!nepse) {
    return { summary: {}, indices, asOf };
  }

  return {
    summary: {
      index: nepse.currentValue ?? null,
      indexChange: nepse.change ?? null,
      indexPct: nepse.perChange ?? null,
    },
    indices,
    asOf,
  };
}

function parseMovers(rows: MoverApi[]): MoverRow[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.securityName,
    ltp: r.ltp,
    change: r.pointChange,
    pct: r.percentageChange,
    iconUrl: null,
  }));
}

function parseHomeMovers(rows: HomeMoverRow[] | undefined): MoverRow[] {
  return (rows ?? []).map((r) => ({
    symbol: r.symbol,
    name: r.name,
    ltp: r.lastTradedPrice,
    change: r.change,
    pct: r.changePercent,
    iconUrl: iconUri(r.icon),
  }));
}

function parseTurnovers(rows: TurnoverApi[]): TurnoverRow[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.securityName,
    turnover: r.turnover,
    ltp: r.closingPrice,
    pct: null,
    iconUrl: null,
  }));
}

function parseHomeTurnovers(rows: HomeTurnoverRow[] | undefined): TurnoverRow[] {
  return (rows ?? []).map((r) => ({
    symbol: r.symbol,
    name: r.name,
    turnover: r.turnover,
    ltp: r.lastTradedPrice,
    pct: r.changePercent ?? null,
    iconUrl: iconUri(r.icon),
  }));
}

function parseTransactions(rows: TransactionApi[]): TransactionRow[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.securityName,
    ltp: r.lastTradedPrice,
    trades: r.totalTrades,
    pct: null,
    iconUrl: null,
  }));
}

function parseHomeTransactions(
  rows: HomeTransactionRow[] | undefined,
): TransactionRow[] {
  return (rows ?? []).map((r) => ({
    symbol: r.symbol,
    name: r.name,
    ltp: r.lastTradedPrice,
    trades: r.transactions,
    pct: r.changePercent ?? null,
    iconUrl: iconUri(r.icon),
  }));
}

function parseHomeTradedShares(
  rows: HomeTradedShareRow[] | undefined,
): TradedShareRow[] {
  return (rows ?? []).map((r) => ({
    symbol: r.symbol,
    name: r.name,
    ltp: r.lastTradedPrice,
    shares: r.sharesTraded,
    pct: r.changePercent ?? null,
    iconUrl: iconUri(r.icon),
  }));
}

function parseHomeIndices(rows: HomeIndexRow[] | undefined): IndexQuote[] {
  return (rows ?? []).map((r) => ({
    name: r.name,
    symbol: r.symbol,
    current: r.currentValue ?? null,
    change: r.change ?? null,
    pct: r.changePercent ?? null,
  }));
}

function parseHomeSummary(rows: { name: string; value: number }[]): MarketSummary {
  const find = (needle: string) =>
    rows.find((r) => r.name.toLowerCase().includes(needle.toLowerCase()))
      ?.value ?? null;
  return {
    businessDate: null,
    index: null,
    indexChange: null,
    indexPct: null,
    turnover: find('turnover'),
    tradedShares: find('traded shares'),
    transactions: find('transactions'),
    scripsTraded: find('scripts traded') ?? find('scrips traded'),
    advanced: null,
    declined: null,
    unchanged: null,
  };
}

async function fetchHomePageData(): Promise<HomePageData | null> {
  return shFetch<HomePageData>('/home-page-data', BASE_V2, true);
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseMiniScreener(rows: MiniScreenerRow[]): SecurityQuote[] {
  return rows
    .filter((r) => r.symbol)
    .map((r) => {
      const raw = r as unknown as Record<string, unknown>;
      // Non-traded scrips (bonds, promoter shares, MFs) come back with a null
      // LTP; fall back to their previous close / last traded price so the row
      // is not blank in the live list.
      const ltp =
        r.ltp ??
        pickNum(raw, [
          'previousClose',
          'previousDayClose',
          'prevClose',
          'lastTradedPrice',
          'closePrice',
          'closingPrice',
          'close',
          'openPrice',
        ]);
      return {
        symbol: r.symbol,
        name: r.name,
        ltp,
        change: r.change,
        pct: r.changePercent,
        qty: r.volume,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function parseTodayPrice(rows: TodayPriceRow[]): SecurityQuote[] {
  return rows
    .filter((r) => r.symbol)
    .map((r) => ({
      symbol: r.symbol,
      name: r.securityName,
      ltp: r.ltp,
      change: r.change,
      pct: r.changePercent,
      qty: r.totalTradedQuantity,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function countBreadth(securities: SecurityQuote[]): Pick<
  MarketSummary,
  'advanced' | 'declined' | 'unchanged'
> {
  let advanced = 0;
  let declined = 0;
  let unchanged = 0;
  for (const s of securities) {
    const ch = s.change ?? 0;
    if (ch > 0) advanced += 1;
    else if (ch < 0) declined += 1;
    else unchanged += 1;
  }
  return { advanced, declined, unchanged };
}

async function fetchAllSecurities(): Promise<SecurityQuote[]> {
  const [mini, today] = await Promise.all([
    shFetch<ApiList<MiniScreenerRow>>('/security/mini-screener', DATA_BASE),
    shFetch<TodayPriceApi>('/todays-price', BASE_V2, true),
  ]);
  const miniRows = unwrapList(mini);
  const todayRows = unwrapList(today as ApiList<TodayPriceRow>);
  const todayMap = new Map(
    todayRows.map((r) => [r.symbol.toUpperCase(), r]),
  );

  if (miniRows.length) {
    const merged = miniRows.map((r) => {
      const live = todayMap.get(r.symbol.toUpperCase());
      if (!live) return r;
      return {
        ...r,
        ltp: live.ltp ?? r.ltp,
        change: live.change ?? r.change,
        changePercent: live.changePercent ?? r.changePercent,
        volume: live.totalTradedQuantity ?? r.volume,
      };
    });
    return parseMiniScreener(merged);
  }

  if (todayRows.length) return parseTodayPrice(todayRows);

  return [];
}

function fmtClock(hour24: number, minute: number): string {
  const h12 = hour24 % 12 || 12;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

/** Synthetic NEPSE session curve (11:00 AM – 3:00 PM) when live ticks aren't available. */
function buildChartPoints(
  previousClose: number | null,
  current: number | null,
): ChartPoint[] {
  if (previousClose == null || current == null) return [];
  const start = previousClose;
  const end = current;
  const startMin = 11 * 60;
  const endMin = 15 * 60;
  const step = 5;
  const total = Math.floor((endMin - startMin) / step);
  const points: ChartPoint[] = [];
  for (let i = 0; i <= total; i += 1) {
    const mins = startMin + i * step;
    const t = i / total;
    const wave =
      Math.sin(t * Math.PI * 2.4) * Math.abs(end - start) * 0.12 +
      Math.sin(t * Math.PI * 5.1) * Math.abs(end - start) * 0.04;
    const value =
      i === total
        ? end
        : start + (end - start) * t + wave * (1 - Math.abs(t - 0.5) * 1.2);
    points.push({
      label: fmtClock(Math.floor(mins / 60), mins % 60),
      value,
    });
  }
  return points;
}

export async function fetchSharehubSnapshot(): Promise<{
  status: MarketStatus;
  asOf: string | null;
  summary: MarketSummary;
  indices: IndexQuote[];
  gainers: MoverRow[];
  losers: MoverRow[];
  turnovers: TurnoverRow[];
  transactions: TransactionRow[];
  tradedShares: TradedShareRow[];
  subIndices: IndexQuote[];
  securities: SecurityQuote[];
  chartPoints: ChartPoint[];
} | null> {
  const [
    statusRaw,
    summaryRaw,
    indexRaw,
    gainersRaw,
    losersRaw,
    turnoverRaw,
    transactionsRaw,
    homePage,
    securities,
  ] = await Promise.all([
    shFetch<StatusApi>('/market-status'),
    shFetch<SummaryRow[]>('/market-summary'),
    shFetch<IndexRow[]>('/index'),
    shFetch<MoverApi[]>('/top-gainers'),
    shFetch<MoverApi[]>('/top-losers'),
    shFetch<TurnoverApi[]>('/top-turnover'),
    shFetch<TransactionApi[]>('/top-transactions'),
    fetchHomePageData(),
    fetchAllSecurities(),
  ]);

  if (!summaryRaw?.length && !indexRaw?.length && !securities.length && !homePage) {
    return null;
  }

  const indexParsed = parseIndex(indexRaw ?? []);
  const homeSummary = homePage?.marketSummary?.length
    ? parseHomeSummary(homePage.marketSummary)
    : null;
  const stockBreadth = homePage?.stockSummary;
  const breadth =
    stockBreadth != null
      ? {
          advanced: stockBreadth.advanced,
          declined: stockBreadth.declined,
          unchanged: stockBreadth.unchanged,
        }
      : countBreadth(securities);
  const summary: MarketSummary = {
    ...parseSummaryRows(summaryRaw ?? []),
    ...(homeSummary ?? {}),
    ...indexParsed.summary,
    ...breadth,
  };

  const gainers = homePage?.topGainers?.length
    ? parseHomeMovers(homePage.topGainers)
    : parseMovers(gainersRaw ?? []);
  const losers = homePage?.topLosers?.length
    ? parseHomeMovers(homePage.topLosers)
    : parseMovers(losersRaw ?? []);
  const turnovers = homePage?.topTurnover?.length
    ? parseHomeTurnovers(homePage.topTurnover)
    : parseTurnovers(turnoverRaw ?? []);
  const transactions = homePage?.topTransactions?.length
    ? parseHomeTransactions(homePage.topTransactions)
    : parseTransactions(transactionsRaw ?? []);
  const tradedShares = parseHomeTradedShares(homePage?.topTradedShares);
  const subIndices = parseHomeIndices(homePage?.subIndices);

  const homeNepse = homePage?.indices?.find((r) => r.symbol === 'NEPSE');
  if (homeNepse && summary.index == null) {
    summary.index = homeNepse.currentValue;
    summary.indexChange = homeNepse.change;
    summary.indexPct = homeNepse.changePercent;
  }

  const nepseRow = (indexRaw ?? []).find((r) => /nepse index/i.test(r.index));
  const chartPoints = buildChartPoints(
    nepseRow?.previousClose ?? null,
    nepseRow?.currentValue ?? homeNepse?.currentValue ?? summary.index,
  );

  const homeOpen = homePage?.marketStatus?.status?.toUpperCase() === 'OPEN';
  const open =
    statusRaw?.isOpen?.toUpperCase() === 'OPEN' ||
    (statusRaw == null && homeOpen);
  const asOf =
    statusRaw?.asOf ??
    homePage?.marketStatus?.time ??
    indexParsed.asOf;

  return {
    status: open ? 'open' : 'closed',
    asOf,
    summary,
    indices: indexParsed.indices.length
      ? indexParsed.indices
      : parseHomeIndices(homePage?.indices),
    gainers,
    losers,
    turnovers,
    transactions,
    tradedShares,
    subIndices,
    securities,
    chartPoints,
  };
}
