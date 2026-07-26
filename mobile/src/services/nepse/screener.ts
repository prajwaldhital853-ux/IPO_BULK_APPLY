import AsyncStorage from '@react-native-async-storage/async-storage';
import { nepseFetchJson } from './http';

const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';
const LIVE_V2 = 'https://sharehubnepal.com/live/api/v2/nepselive';
const LIVE_V2_ROOT = 'https://sharehubnepal.com/live/api/v2';
const ICON_CDN = 'https://cdn.arthakendra.com/';

export type MiniScreenerRow = {
  id: number;
  symbol: string;
  name: string;
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  turnover: number | null;
  marketCap: number | null;
  peRatio: number | null;
  pricePerBookValue: number | null;
  oneYearYield: number | null;
  sector: string | null;
  iconUrl: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  eps: number | null;
  bookValue: number | null;
  transactions: number | null;
  listedShares: number | null;
  paidUpCapital: number | null;
  faceValue: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  companyId?: number;
  email?: string | null;
};

export type StockRankRow = {
  rank: number;
  symbol: string;
  name: string;
  ltp: number | null;
  pe: number | null;
  pb: number | null;
  mcap: number | null;
  yieldPct: number | null;
  changePct: number | null;
  iconUrl: string | null;
};

export type DemandRow = {
  symbol: string;
  name: string;
  ltp: number | null;
  change: number | null;
  changePct: number | null;
  quantity: number | null;
  orders: number | null;
  iconUrl: string | null;
};

export type DemandBoardResult = {
  demand: DemandRow[];
  supply: DemandRow[];
  /** Fresh from API while boards have rows; otherwise last saved session. */
  source: 'live' | 'cached';
  savedAt: string | null;
};

export type IndexHistoryRow = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
};

type ApiList<T> = T[] | { data?: T[] };

type TodayPriceLiveRow = {
  symbol?: string;
  securityName?: string;
  ltp?: number | null;
  change?: number | null;
  changePercent?: number | null;
  totalTradedQuantity?: number | null;
  totalTradedValue?: number | null;
  openPrice?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  previousDayClosePrice?: number | null;
  totalTrades?: number | null;
  lastUpdatedTime?: string | null;
};

const FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function withCacheBust(path: string, bust: boolean): string {
  if (!bust) return path;
  return `${path}${path.includes('?') ? '&' : '?'}_=${Date.now()}`;
}

function unwrapList<T>(json: ApiList<T> | null | undefined): T[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.data ?? [];
}

async function dataFetch<T>(path: string, bust = false): Promise<T | null> {
  try {
    const res = await fetch(`${DATA_BASE}${withCacheBust(path, bust)}`, {
      headers: FETCH_HEADERS,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function liveV2Fetch<T>(path: string, bust = false): Promise<T | null> {
  try {
    const res = await fetch(`${LIVE_V2}${withCacheBust(path, bust)}`, {
      headers: FETCH_HEADERS,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export function iconUri(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${ICON_CDN}${path.replace(/^\//, '')}`;
}

export function fmtMcap(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e11) return `${(n / 1e11).toFixed(2)} Kharab`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} Arab`;
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} Lakh`;
  return n.toLocaleString('en-NP', { maximumFractionDigits: 0 });
}

export function fmtRatio(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function toRankRow(row: MiniScreenerRow, rank: number): StockRankRow {
  return {
    rank,
    symbol: row.symbol,
    name: row.name,
    ltp: row.ltp,
    pe: row.peRatio,
    pb: row.pricePerBookValue,
    mcap: row.marketCap,
    yieldPct: row.oneYearYield,
    changePct: row.changePercent,
    iconUrl: iconUri(row.iconUrl),
  };
}

let screenerBaseCache: MiniScreenerRow[] | null = null;
let screenerBaseCacheAt = 0;
/** Fundamentals / sector from mini-screener — refresh less often. */
const BASE_CACHE_MS = 5 * 60_000;

export function invalidateScreenerCache(): void {
  screenerBaseCache = null;
  screenerBaseCacheAt = 0;
}

async function fetchTodaysPriceMap(): Promise<Map<string, TodayPriceLiveRow>> {
  const raw = await liveV2Fetch<ApiList<TodayPriceLiveRow>>('/todays-price', true);
  const rows = unwrapList(raw);
  const map = new Map<string, TodayPriceLiveRow>();
  for (const row of rows) {
    const sym = str(row.symbol).toUpperCase();
    if (sym) map.set(sym, row);
  }
  return map;
}

function applyLivePriceOverlay(
  rows: MiniScreenerRow[],
  live: Map<string, TodayPriceLiveRow>,
): MiniScreenerRow[] {
  if (!live.size) return rows;
  return rows.map((row) => {
    const patch = live.get(row.symbol.toUpperCase());
    if (!patch) return row;
    const ltp = num(patch.ltp) ?? row.ltp;
    const change = num(patch.change) ?? row.change;
    const changePercent = num(patch.changePercent) ?? row.changePercent;
    const volume = num(patch.totalTradedQuantity) ?? row.volume;
    const turnover = num(patch.totalTradedValue) ?? row.turnover;
    return {
      ...row,
      ltp,
      change,
      changePercent,
      volume,
      turnover,
      open: num(patch.openPrice) ?? row.open,
      high: num(patch.highPrice) ?? row.high,
      low: num(patch.lowPrice) ?? row.low,
      previousClose: num(patch.previousDayClosePrice) ?? row.previousClose,
      transactions: num(patch.totalTrades) ?? row.transactions,
    };
  });
}

export async function loadMiniScreener(
  force = false,
): Promise<MiniScreenerRow[]> {
  const needBase =
    force ||
    !screenerBaseCache ||
    Date.now() - screenerBaseCacheAt >= BASE_CACHE_MS;
  if (needBase) {
    const raw = await dataFetch<ApiList<MiniScreenerRow>>(
      '/security/mini-screener',
      force,
    );
    // Normalize icon paths to absolute CDN URLs so Image can load them.
    screenerBaseCache = unwrapList(raw).map((r) => ({
      ...r,
      symbol: str(r.symbol).toUpperCase(),
      iconUrl: iconUri(r.iconUrl),
    }));
    screenerBaseCacheAt = Date.now();
  }
  const live = await fetchTodaysPriceMap();
  return applyLivePriceOverlay(screenerBaseCache ?? [], live).map((r) => ({
    ...r,
    iconUrl: iconUri(r.iconUrl),
  }));
}

/** Live LTP for one symbol — uses todays-price overlay (ShareHub website parity). */
export async function loadLiveQuote(
  symbol: string,
): Promise<MiniScreenerRow | null> {
  const sym = symbol.toUpperCase();
  const rows = await loadMiniScreener(true);
  const row = rows.find((r) => r.symbol.toUpperCase() === sym) ?? null;
  if (!row) return null;
  const email = await loadCompanyEmail(sym);
  return email ? { ...row, email } : row;
}

/** Best-effort company email from ShareSansar company page. */
export async function loadCompanyEmail(symbol: string): Promise<string | null> {
  const sym = symbol.trim().toLowerCase();
  if (!sym) return null;
  try {
    const res = await fetch(`https://www.sharesansar.com/company/${sym}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 NEPSEGHAR',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const matches = html.match(
      /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    );
    if (!matches?.length) return null;
    const skip =
      /sharesansar|noreply|no-reply|example\.com|asteriskt|merolagani/i;
    const hit = matches.find((e) => !skip.test(e));
    return hit?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function loadLargeCaps(limit = 100): Promise<StockRankRow[]> {
  const rows = await loadMiniScreener();
  return rows
    .filter((r) => r.symbol && (r.marketCap ?? 0) > 0)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, limit)
    .map(toRankRow);
}

export async function loadCommercialLeaders(limit = 100): Promise<StockRankRow[]> {
  const rows = await loadMiniScreener();
  return rows
    .filter(
      (r) =>
        r.symbol &&
        (r.sector ?? '').toLowerCase().includes('commercial bank'),
    )
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, limit)
    .map(toRankRow);
}

export async function loadHighDividend(limit = 100): Promise<StockRankRow[]> {
  const rows = await loadMiniScreener();
  return rows
    .filter((r) => r.symbol && (r.oneYearYield ?? 0) > 0)
    .sort((a, b) => (b.oneYearYield ?? 0) - (a.oneYearYield ?? 0))
    .slice(0, limit)
    .map(toRankRow);
}

export async function loadTrendingStocks(limit = 100): Promise<StockRankRow[]> {
  const rows = await loadMiniScreener();
  return rows
    .filter((r) => r.symbol && (r.volume ?? 0) > 0)
    .sort((a, b) => {
      const scoreA = Math.abs(a.changePercent ?? 0) * (a.volume ?? 0);
      const scoreB = Math.abs(b.changePercent ?? 0) * (b.volume ?? 0);
      return scoreB - scoreA;
    })
    .slice(0, limit)
    .map(toRankRow);
}

type HomeDemandApi = {
  demand?: Array<Record<string, unknown>>;
  supply?: Array<Record<string, unknown>>;
};

const DEMAND_BOARD_CACHE_KEY = '@nepse/high_demand_supply_v1';

type DemandBoardDisk = {
  demand: DemandRow[];
  supply: DemandRow[];
  savedAt: string;
};

function parseDemand(row: Record<string, unknown>): DemandRow {
  const icon = str(row.icon ?? row.iconUrl);
  return {
    symbol: str(row.symbol),
    name: str(row.name ?? row.securityName),
    ltp: num(row.lastTradedPrice ?? row.ltp),
    change: num(row.change ?? row.pointChange),
    changePct: num(row.changePercent ?? row.percentageChange),
    quantity: num(row.quantity ?? row.totalQuantity),
    orders: num(row.orders ?? row.orderCount),
    iconUrl: iconUri(icon),
  };
}

function parseDemandList(
  list: Array<Record<string, unknown>> | undefined,
): DemandRow[] {
  return (list ?? [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => parseDemand(r))
    .filter((r) => r.symbol);
}

async function readDemandBoardCache(): Promise<DemandBoardDisk | null> {
  try {
    const raw = await AsyncStorage.getItem(DEMAND_BOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemandBoardDisk;
    if (!parsed || !Array.isArray(parsed.demand) || !Array.isArray(parsed.supply)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeDemandBoardCache(
  demand: DemandRow[],
  supply: DemandRow[],
): Promise<string> {
  const savedAt = new Date().toISOString();
  const payload: DemandBoardDisk = { demand, supply, savedAt };
  try {
    await AsyncStorage.setItem(DEMAND_BOARD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore disk errors — in-memory still works for this session
  }
  return savedAt;
}

let demandBoardInflight: Promise<DemandBoardResult> | null = null;

/**
 * Top demand / supply boards. Live API clears these when NEPSE is closed,
 * so we persist the last non-empty snapshot and fall back to it after hours.
 */
export async function loadHighDemandBoard(): Promise<DemandBoardResult> {
  if (demandBoardInflight) return demandBoardInflight;

  demandBoardInflight = (async (): Promise<DemandBoardResult> => {
    const raw = await liveV2Fetch<HomeDemandApi>('/home-page-data', true);
    const demand = parseDemandList(raw?.demand);
    const supply = parseDemandList(raw?.supply);

    if (demand.length > 0 || supply.length > 0) {
      const savedAt = await writeDemandBoardCache(demand, supply);
      return { demand, supply, source: 'live', savedAt };
    }

    const cached = await readDemandBoardCache();
    if (cached && (cached.demand.length > 0 || cached.supply.length > 0)) {
      return {
        demand: cached.demand,
        supply: cached.supply,
        source: 'cached',
        savedAt: cached.savedAt,
      };
    }

    return { demand: [], supply: [], source: 'live', savedAt: null };
  })().finally(() => {
    demandBoardInflight = null;
  });

  return demandBoardInflight;
}

export async function loadHighDemand(): Promise<DemandRow[]> {
  const board = await loadHighDemandBoard();
  return board.demand;
}

export async function loadHighSupply(): Promise<DemandRow[]> {
  const board = await loadHighDemandBoard();
  return board.supply;
}

function parseHistoryRow(row: Record<string, unknown>): IndexHistoryRow | null {
  const date = str(
    row.date ?? row.businessDate ?? row.business_date ?? row.tradedDate,
  ).slice(0, 10);
  if (!date) return null;
  const close = num(row.close ?? row.closingIndex ?? row.nepseIndex);
  const open = num(row.open ?? row.openIndex) ?? close;
  const high = num(row.high ?? row.highIndex) ?? close;
  const low = num(row.low ?? row.lowIndex) ?? close;
  if (close == null && open == null) return null;
  return { date, open, high, low, close };
}

type DateWiseApi = {
  data?: {
    content?: Array<Record<string, unknown>>;
  };
};

export async function loadNepseIndexHistory(
  pageSize = 120,
): Promise<IndexHistoryRow[]> {
  const res = await dataFetch<DateWiseApi>(
    `/index/date-wise-data?indexId=1&currentPage=1&pageSize=${pageSize}`,
  );
  const content = res?.data?.content ?? [];
  const rows = content
    .map(parseHistoryRow)
    .filter(Boolean) as IndexHistoryRow[];
  if (rows.length) {
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  const officialPaths = ['/index/history', '/index-history'];
  for (const path of officialPaths) {
    const hit = await nepseFetchJson(path);
    if (!hit) continue;
    const list = unwrapList(hit.json as ApiList<Record<string, unknown>>);
    const parsed = list
      .map((r) => parseHistoryRow(r as Record<string, unknown>))
      .filter(Boolean) as IndexHistoryRow[];
    if (parsed.length) {
      return parsed.sort((a, b) => b.date.localeCompare(a.date));
    }
  }

  return [];
}

export type StockListKind =
  | 'large-caps'
  | 'commercial-leaders'
  | 'trending'
  | 'high-dividend';

export async function loadStockList(kind: StockListKind): Promise<StockRankRow[]> {
  switch (kind) {
    case 'large-caps':
      return loadLargeCaps();
    case 'commercial-leaders':
      return loadCommercialLeaders();
    case 'trending':
      return loadTrendingStocks();
    case 'high-dividend':
      return loadHighDividend();
    default:
      return [];
  }
}

export function stockListTitle(kind: StockListKind): string {
  switch (kind) {
    case 'large-caps':
      return 'Large Caps';
    case 'commercial-leaders':
      return 'Commercial Leaders';
    case 'trending':
      return 'Trending Stocks';
    case 'high-dividend':
      return 'High Dividend';
    default:
      return 'Stocks';
  }
}

/* ------------------------------------------------------------------ */
/* Envelope helpers                                                    */
/* ------------------------------------------------------------------ */

type Envelope<T> = {
  success?: boolean;
  data?: T;
};

type Paged<T> = {
  content?: T[];
  hasNext?: boolean;
  totalItems?: number;
  pageIndex?: number;
  totalPages?: number;
};

async function absFetch<T>(url: string, bust = false): Promise<T | null> {
  try {
    const res = await fetch(withCacheBust(url, bust), {
      headers: {
        ...FETCH_HEADERS,
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Floor Sheet / Bulk Transactions                                     */
/* ------------------------------------------------------------------ */

export type FloorsheetRow = {
  contractId: number;
  symbol: string;
  name: string;
  buyerBroker: string;
  sellerBroker: string;
  /** Real broker firm name when the source provides it (e.g. Merolagani title). */
  buyerBrokerName?: string | null;
  sellerBrokerName?: string | null;
  rate: number | null;
  quantity: number | null;
  amount: number | null;
  tradeTime: string;
  iconUrl: string | null;
};

export type FloorsheetPage = {
  rows: FloorsheetRow[];
  hasNext: boolean;
  totalItems: number | null;
};

function parseFloorsheet(row: Record<string, unknown>): FloorsheetRow {
  return {
    contractId: Number(row.contractId ?? row.id ?? 0),
    symbol: str(row.symbol).toUpperCase(),
    name: str(row.name ?? row.securityName),
    buyerBroker: str(row.buyerBrokerName ?? row.buyerMemberId),
    sellerBroker: str(row.sellerBrokerName ?? row.sellerMemberId),
    rate: num(row.contractRate ?? row.rate),
    quantity: num(row.contractQuantity ?? row.quantity),
    amount: num(row.contractAmount ?? row.amount),
    tradeTime: str(row.tradeTime ?? row.businessDate),
    iconUrl: iconUri(str(row.iconUrl)),
  };
}

export async function loadFloorsheet(
  page = 1,
  size = 50,
  opts: {
    symbol?: string;
    buyerMemberId?: string;
    sellerMemberId?: string;
    businessDate?: string;
  } = {},
): Promise<FloorsheetPage> {
  const q = new URLSearchParams({
    page: String(page),
    size: String(size),
  });
  if (opts.symbol) q.set('symbol', opts.symbol.toUpperCase());
  if (opts.buyerMemberId) q.set('buyerMemberId', opts.buyerMemberId);
  if (opts.sellerMemberId) q.set('sellerMemberId', opts.sellerMemberId);
  if (opts.businessDate) q.set('businessDate', opts.businessDate);
  const raw = await absFetch<Envelope<Paged<Record<string, unknown>>>>(
    `${LIVE_V2_ROOT}/floorsheet?${q.toString()}`,
  );
  const content = raw?.data?.content ?? [];
  return {
    rows: content
      .map(parseFloorsheet)
      .filter((r) => r.symbol),
    hasNext: raw?.data?.hasNext ?? false,
    totalItems: raw?.data?.totalItems ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Proposed Dividend                                                   */
/* ------------------------------------------------------------------ */

export type DividendRow = {
  id: number;
  symbol: string;
  name: string;
  bonus: number | null;
  cash: number | null;
  total: number | null;
  bookClose: string | null;
  fiscalYear: string;
  status: string;
  iconUrl: string | null;
};

function parseDividend(row: Record<string, unknown>): DividendRow {
  const bookClose = str(row.bookClosureDate).slice(0, 10);
  return {
    id: Number(row.id ?? 0),
    symbol: str(row.symbol).toUpperCase(),
    name: str(row.name ?? row.securityName),
    bonus: num(row.bonus),
    cash: num(row.cash),
    total: num(row.total),
    bookClose: bookClose || null,
    fiscalYear: str(row.fiscalYear),
    status: str(row.status),
    iconUrl: iconUri(str(row.iconUrl)),
  };
}

export async function loadProposedDividends(
  page = 1,
  size = 100,
  symbol?: string,
): Promise<DividendRow[]> {
  const symQ = symbol ? `&symbol=${encodeURIComponent(symbol.toUpperCase())}` : '';
  const raw = await absFetch<Envelope<Paged<Record<string, unknown>>>>(
    `${DATA_BASE}/dividend?page=${page}&size=${size}${symQ}`,
  );
  const content = raw?.data?.content ?? [];
  return content.map(parseDividend).filter((r) => r.symbol);
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export type AnnouncementRow = {
  id: number;
  title: string;
  symbol: string;
  securityName: string;
  details: string;
  category: string;
  type: string;
  attachmentUrl: string | null;
  date: string;
  iconUrl: string | null;
};

function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    })
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseAnnouncement(row: Record<string, unknown>): AnnouncementRow {
  const rawDetails = str(
    row.details ?? row.content ?? row.description ?? row.body ?? '',
  );
  return {
    id: Number(row.id ?? 0),
    title: stripHtml(str(row.title ?? row.subTitle)),
    symbol: str(row.symbol).toUpperCase(),
    securityName: str(row.securityName ?? row.companyName),
    details: stripHtml(rawDetails),
    category: str(row.category),
    type: str(row.type),
    attachmentUrl: str(row.attachmentUrl) || null,
    date: str(row.announcementDate ?? row.date).slice(0, 10),
    iconUrl: iconUri(str(row.iconUrl)),
  };
}

export async function loadAnnouncements(
  page = 1,
  size = 60,
  symbol?: string,
): Promise<AnnouncementRow[]> {
  const symQ = symbol ? `&symbol=${encodeURIComponent(symbol.toUpperCase())}` : '';
  const raw = await absFetch<Envelope<Paged<Record<string, unknown>>>>(
    `${DATA_BASE}/announcement?page=${page}&size=${size}${symQ}`,
  );
  const content = raw?.data?.content ?? [];
  return content.map(parseAnnouncement).filter((r) => r.title);
}

/** NEPSE news & market alerts (ShareHub `NewsAndAlert` type). */
export async function loadFinancialNews(
  page = 1,
  size = 60,
): Promise<AnnouncementRow[]> {
  const raw = await absFetch<Envelope<Paged<Record<string, unknown>>>>(
    `${DATA_BASE}/announcement?page=${page}&size=${size}&type=NewsAndAlert`,
  );
  const content = raw?.data?.content ?? [];
  return content.map(parseAnnouncement).filter((r) => r.title);
}

/* ------------------------------------------------------------------ */
/* Candle / chart data                                                 */
/* ------------------------------------------------------------------ */

export type CandlePoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type ChartRange =
  | '1D'
  | '1W'
  | '1M'
  | '3M'
  | '6M'
  | '1Y'
  | '5Y'
  | 'ALL';

/** UI ranges on Stock Detail Price Chart. */
export type StockChartRange = '1D' | '1W' | '1M' | '6M' | '1Y';

function parseCandleList(
  list: Array<Record<string, unknown>>,
): CandlePoint[] {
  return list
    .map((r) => ({
      time: Number(r.time ?? 0),
      open: Number(r.open ?? 0),
      high: Number(r.high ?? 0),
      low: Number(r.low ?? 0),
      close: Number(r.close ?? 0),
      volume: num(r.volume),
    }))
    .filter((p) => p.time > 0 && p.close > 0)
    .sort((a, b) => a.time - b.time);
}

async function fetchCandlesRaw(
  symbol: string,
  time: string,
): Promise<CandlePoint[]> {
  const raw = await absFetch<Envelope<Array<Record<string, unknown>>>>(
    `${DATA_BASE}/price-history/graph/candle/${encodeURIComponent(
      symbol.toUpperCase(),
    )}?time=${time}`,
  );
  return parseCandleList(raw?.data ?? []);
}

function sliceCandlesForRange(
  points: CandlePoint[],
  range: '1D' | '1W',
): CandlePoint[] {
  if (points.length < 2) return points;
  const last = points[points.length - 1]!;
  const lastMs = last.time > 1e12 ? last.time : last.time * 1000;
  if (range === '1D') {
    const dayStart = new Date(lastMs);
    dayStart.setHours(0, 0, 0, 0);
    const startMs = dayStart.getTime();
    const sameDay = points.filter((p) => {
      const ms = p.time > 1e12 ? p.time : p.time * 1000;
      return ms >= startMs;
    });
    if (sameDay.length >= 2) return sameDay;
    return points.slice(-Math.min(24, points.length));
  }
  // 1W ≈ last 5–7 trading sessions
  return points.slice(-Math.min(7, points.length));
}

export async function loadCandles(
  symbol = 'NEPSE',
  range: ChartRange = '1Y',
): Promise<CandlePoint[]> {
  if (range === '1D' || range === '1W') {
    const direct = await fetchCandlesRaw(symbol, range);
    if (direct.length >= 2) return direct;
    const month = await fetchCandlesRaw(symbol, '1M');
    return sliceCandlesForRange(month, range);
  }
  return fetchCandlesRaw(symbol, range);
}

/* ------------------------------------------------------------------ */
/* Per-stock: security lookup, price history, fundamentals            */
/* ------------------------------------------------------------------ */

export async function loadSecurityBySymbol(
  symbol: string,
): Promise<MiniScreenerRow | null> {
  return loadLiveQuote(symbol);
}

export type PriceHistoryRow = {
  date: string;
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
};

function parsePriceHistory(row: Record<string, unknown>): PriceHistoryRow {
  return {
    date: str(row.date).slice(0, 10),
    ltp: num(row.close ?? row.ltp),
    change: num(row.change),
    changePercent: num(row.changePercent),
    volume: num(row.volume),
    high: num(row.high),
    low: num(row.low),
  };
}

export async function loadPriceHistory(
  symbol: string,
  page = 1,
  size = 50,
): Promise<PriceHistoryRow[]> {
  const raw = await absFetch<Envelope<Paged<Record<string, unknown>>>>(
    `${DATA_BASE}/price-history?symbol=${encodeURIComponent(
      symbol.toUpperCase(),
    )}&page=${page}&size=${size}`,
  );
  const content = raw?.data?.content ?? [];
  return content.map(parsePriceHistory).filter((r) => r.date);
}

export type FundamentalValue = {
  key: string;
  label: string;
  value: number | null;
  valueString: string | null;
};

export type Fundamentals = {
  symbol: string;
  fiscalYear: string;
  quarter: string;
  values: FundamentalValue[];
};

const FUND_LABELS: Record<string, string> = {
  eps: 'EPS',
  dps: 'DPS',
  pe: 'P/E Ratio',
  pe_ratio: 'P/E Ratio',
  book_value: 'Book Value',
  bvps: 'Book Value / Share',
  deposit: 'Deposit',
  loan: 'Loan / Advances',
  base_rate: 'Base Rate',
  cd_ratio: 'CD Ratio',
  npl: 'NPL',
  roe: 'ROE',
  roa: 'ROA',
  net_profit: 'Net Profit',
  distributable_profit: 'Distributable Profit',
  paid_up_capital: 'Paid-up Capital',
  reserve: 'Reserve',
  net_worth: 'Net Worth',
  net_worth_per_share: 'Net Worth / Share',
};

function labelFor(key: string): string {
  if (FUND_LABELS[key]) return FUND_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function loadFundamentals(
  symbol: string,
): Promise<Fundamentals | null> {
  const raw = await absFetch<Envelope<Array<Record<string, unknown>>>>(
    `${DATA_BASE}/fundamental/values/${encodeURIComponent(symbol.toUpperCase())}`,
  );
  const list = raw?.data ?? [];
  const row =
    list.find(
      (r) =>
        Array.isArray(r.values) &&
        (r.values as unknown[]).length > 0,
    ) ?? list[0];
  if (!row) return null;
  const rawValues = Array.isArray(row.values)
    ? (row.values as Array<Record<string, unknown>>)
    : [];
  return {
    symbol: str(row.symbol).toUpperCase() || symbol.toUpperCase(),
    fiscalYear: str(row.fiscalYear),
    quarter: str(row.quarter).toUpperCase(),
    values: rawValues.map((v) => ({
      key: str(v.key),
      label: labelFor(str(v.key)),
      value: num(v.value),
      valueString: v.valueString != null ? str(v.valueString) : null,
    })),
  };
}

export type FinancialReportRow = {
  id: number;
  title: string;
  date: string;
  attachmentUrl: string | null;
  details: string;
  securityName: string;
  fiscalYear: string | null;
  quarter: string | null;
};

function parseReportMeta(title: string): {
  fiscalYear: string | null;
  quarter: string | null;
} {
  const fy =
    title.match(/FY\s*([0-9]{4}\/?[0-9]{2,4})/i)?.[1] ??
    title.match(/\b(20\d{2}\/20\d{2})\b/)?.[1] ??
    title.match(/\b(20\d{2}\/\d{2})\b/)?.[1] ??
    null;
  const qRaw =
    title.match(/(\d)(?:st|nd|rd|th)\s*Quarter/i)?.[1] ??
    title.match(/\bQ([1-4])\b/i)?.[1] ??
    null;
  const quarter =
    qRaw == null
      ? null
      : qRaw === '1'
        ? '1st Quarter'
        : qRaw === '2'
          ? '2nd Quarter'
          : qRaw === '3'
            ? '3rd Quarter'
            : '4th Quarter';
  return { fiscalYear: fy, quarter };
}

/** Financial reports are published as NEPSE announcement PDFs for each symbol. */
export async function loadFinancialReports(
  symbol: string,
  page = 1,
  size = 40,
): Promise<FinancialReportRow[]> {
  const rows = await loadAnnouncements(page, size, symbol);
  return rows
    .filter((r) =>
      /report|quarter|annual|financial|statement|audited/i.test(r.title),
    )
    .map((r) => {
      const meta = parseReportMeta(r.title);
      return {
        id: r.id,
        title: r.title,
        date: r.date,
        attachmentUrl: r.attachmentUrl,
        details: r.details,
        securityName: r.securityName,
        fiscalYear: meta.fiscalYear,
        quarter: meta.quarter,
      };
    });
}

export function fmtAmtShort(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} Lkh`;
  return n.toLocaleString('en-NP', { maximumFractionDigits: 0 });
}

export function technicalChartUrl(symbol: string): string {
  return `https://sharehubnepal.com/technical-chart/${encodeURIComponent(
    symbol.toUpperCase(),
  )}`;
}
