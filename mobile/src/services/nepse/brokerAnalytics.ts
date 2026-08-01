import {
  fmtMcap,
  fmtNum,
  iconUri,
  loadFloorsheet,
  loadHighDemand,
  loadHighSupply,
  loadMiniScreener,
  type FloorsheetPage,
  type FloorsheetRow,
  type MiniScreenerRow,
} from './screener';
import { formatRs } from './premiumAnalytics';
import {
  loadMerolaganiFloorsheetProgressive,
  loadMerolaganiFloorsheetForSymbol,
  MERO_FLOOR_FAST_PAGES,
  probeMerolaganiFloorSession,
  sessionDateFromRows,
} from './merolaganiFloorsheet';
import { loadTmsBrokers } from './resources';
import { sessionStatus } from './calendar';
import { isTradingDay, nepalTodayIso } from './holidays';
import {
  clearBrokerFlowDiskCache,
  loadBrokerFlowDiskCache,
  saveBrokerFlowDiskCache,
  type BrokerFlowDiskEntry,
  type BrokerFlowDiskStore,
  type BrokerFlowKind,
} from '../../storage/brokerFlowCache';

const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';
const LIVE_V2 = 'https://sharehubnepal.com/live/api/v2/nepselive';
const BROKER_CDN = 'https://cdn.arthakendra.com/';

const CACHE_MS = 120_000;
/** Acc/Dis day cache — floorsheet usually rolls once per session. */
const BROKER_FLOW_DAY_MS = 36 * 60 * 60_000;
/** Fewer / larger pages = much faster first paint. */
const FLOOR_PAGE_SIZE = 200;
const FLOOR_MAX_PAGES = 10;
/** Acc/Dis only needs a few Merolagani pages for solid rankings. */
const MERO_ACC_DIS_PAGES = MERO_FLOOR_FAST_PAGES;
/** Aggressive Holders needs a deep floorsheet so names like SAIL are not missed. */
const MERO_AGGRESSIVE_PAGES = 30;

export type BrokerInfo = { code: string; name: string; iconUrl: string | null };

export type IntelMetric = { label: string; value: string; tone?: 'up' | 'down' | 'neutral' };

export type PremiumIntelRow = {
  rank: number;
  symbol: string;
  name: string;
  brokerCode: string | null;
  brokerName: string | null;
  /** Company logo from mini-screener / floorsheet when available. */
  iconUrl: string | null;
  /** Buy or sell share of that broker's activity on the symbol (0–100). */
  sharePct: number | null;
  ltp: number | null;
  changePct: number | null;
  quantity: number | null;
  amount: number | null;
  avgRate: number | null;
  netQty: number | null;
  netAmount: number | null;
  turnover: number | null;
  volume: number | null;
  sector: string | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  pctFromHigh: number | null;
  pctFromLow: number | null;
  score: number;
  signal: string;
  tags: string[];
  metrics: IntelMetric[];
};

export type PremiumIntelSnapshot = {
  title: string;
  subtitle: string;
  sessionDate: string | null;
  /** Set when market is open but Merolagani still serves the prior sheet. */
  priorSessionReason?: string | null;
  tradesScanned: number;
  brokerBreakdown: boolean;
  summary: IntelMetric[];
  rows: PremiumIntelRow[];
};

type IntelCacheEntry = {
  at: number;
  sessionDate: string;
  maxContractId: number;
  snap: PremiumIntelSnapshot;
};

const intelSnapCache = new Map<BrokerFlowKind, IntelCacheEntry>();
let brokerFlowPrefetch: Promise<void> | null = null;
let diskHydrateP: Promise<void> | null = null;
let diskHydrated = false;

/** Day-cache key — floorsheet session rolls ~once/day when Merolagani updates. */
function floorFingerprint(sessionDate: string): string {
  return sessionDate.trim();
}

function maxContractIdFromRows(rows: FloorsheetRow[]): number {
  let max = 0;
  for (const r of rows) {
    if (r.contractId > max) max = r.contractId;
  }
  return max;
}

async function hydrateIntelCacheFromDisk(): Promise<void> {
  if (diskHydrated) return;
  if (diskHydrateP) return diskHydrateP;
  diskHydrateP = (async () => {
    try {
      const store = await loadBrokerFlowDiskCache();
      for (const kind of ['top-holders', 'top-releases'] as BrokerFlowKind[]) {
        const e = store[kind];
        if (!e?.snap || !e.sessionDate) continue;
        if (Date.now() - e.at > BROKER_FLOW_DAY_MS) continue;
        if (intelSnapCache.has(kind)) continue;
        intelSnapCache.set(kind, {
          at: e.at,
          sessionDate: e.sessionDate,
          maxContractId: e.maxContractId ?? 0,
          snap: e.snap as unknown as PremiumIntelSnapshot,
        });
      }
    } catch {
      // ignore
    } finally {
      diskHydrated = true;
    }
  })();
  return diskHydrateP;
}

function persistIntelCacheToDisk(): void {
  const store: BrokerFlowDiskStore = {};
  for (const kind of ['top-holders', 'top-releases'] as BrokerFlowKind[]) {
    const e = intelSnapCache.get(kind);
    if (!e) continue;
    store[kind] = {
      sessionDate: e.sessionDate,
      maxContractId: e.maxContractId,
      tradesScanned: e.snap.tradesScanned,
      at: e.at,
      snap: e.snap as unknown as Record<string, unknown>,
    } satisfies BrokerFlowDiskEntry;
  }
  void saveBrokerFlowDiskCache(store);
}

function rememberIntelSnap(
  kind: BrokerFlowKind,
  snap: PremiumIntelSnapshot,
  sessionDate: string | null,
  maxContractId: number,
): void {
  if (!sessionDate || !snap.rows.length) return;
  intelSnapCache.set(kind, {
    at: Date.now(),
    sessionDate,
    maxContractId,
    snap,
  });
  persistIntelCacheToDisk();
}

export function invalidateBrokerAnalyticsCache(): void {
  brokerCache = null;
  brokerCacheAt = 0;
  floorsheetCache = null;
  floorsheetCacheAt = 0;
  floorsheetMeta = { trades: 0, date: null };
  intelSnapCache.clear();
  brokerFlowPrefetch = null;
  diskHydrated = false;
  diskHydrateP = null;
  void clearBrokerFlowDiskCache();
}

export type FiftyTwoWeekRow = {
  rank: number;
  symbol: string;
  name: string;
  ltp: number | null;
  high52: number | null;
  low52: number | null;
  pctFromHigh: number | null;
  pctFromLow: number | null;
  changePct: number | null;
  volume: number | null;
  turnover: number | null;
  sector: string | null;
  signal: string;
  metrics: IntelMetric[];
};

export type PremiumIntelKind =
  | 'top-buyers'
  | 'top-sellers'
  | 'top-holders'
  | 'top-releases'
  | 'broker-favorites'
  | 'broker-top-buy-sell';

type AggKey = string;

type SideAgg = {
  symbol: string;
  name: string;
  broker: string;
  qty: number;
  amount: number;
  rateSum: number;
  trades: number;
};

type NetAgg = SideAgg & {
  buyQty: number;
  sellQty: number;
  buyAmt: number;
  sellAmt: number;
  iconUrl: string | null;
};

type BrokerNet = {
  broker: string;
  buyAmt: number;
  sellAmt: number;
  buyQty: number;
  sellQty: number;
  symbols: Set<string>;
};

let brokerCache: BrokerInfo[] | null = null;
let brokerCacheAt = 0;
let floorsheetCache: FloorsheetRow[] | null = null;
let floorsheetCacheAt = 0;
let floorsheetMeta: { trades: number; date: string | null } = { trades: 0, date: null };

async function fetchLiveMarketDate(): Promise<string | null> {
  try {
    const res = await fetch(
      `${LIVE_V2}/market-status?_=${Date.now()}`,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      },
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as { asOf?: string; isOpen?: string };
    const iso = raw?.asOf ? String(raw.asOf).slice(0, 10) : null;
    return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  } catch {
    return null;
  }
}

/** True when we should prefer today's session over a prior Merolagani sheet. */
function expectTodaySession(liveDate: string): boolean {
  const today = nepalTodayIso();
  if (!isTradingDay(today)) return false;
  // Only force "today" while the market is open. After close, keep Merolagani's
  // latest published sheet (often still labeled prior day until they roll over).
  if (sessionStatus() !== 'open') return false;
  return liveDate >= today;
}

function isDayCacheFresh(
  entry: IntelCacheEntry,
  liveDate: string | null,
): boolean {
  if (!entry.sessionDate || !entry.snap.rows.length) return false;
  if (Date.now() - entry.at > BROKER_FLOW_DAY_MS) return false;
  // New trading session published while market expects today → stale.
  if (
    liveDate &&
    expectTodaySession(liveDate) &&
    entry.sessionDate < liveDate
  ) {
    return false;
  }
  return true;
}

function isFloorsheetCacheFresh(_liveDate: string): boolean {
  if (!floorsheetCache?.length) return false;
  if (Date.now() - floorsheetCacheAt >= CACHE_MS) return false;
  if (!floorsheetMeta.date) return false;
  // Prior-day cache is fine during market open — UI shows priorSessionReason.
  return true;
}

function rememberFloorsheet(rows: FloorsheetRow[], asOf: string | null): void {
  if (!hasBrokerData(rows) || rows.length === 0) return;
  floorsheetCache = rows;
  floorsheetCacheAt = Date.now();
  floorsheetMeta = {
    trades: rows.length,
    date: sessionDateFromRows(rows, asOf),
  };
}

/** Explain why a prior broker floorsheet is shown while the market is open. */
export function priorSessionReason(
  publishedDate: string | null,
  liveDate: string,
): string | null {
  if (!publishedDate) return null;
  if (!expectTodaySession(liveDate)) return null;
  if (publishedDate >= liveDate) return null;
  return `Market is open today (${liveDate}), but today's broker floorsheet isn't published yet. Showing last published sheet (${publishedDate}). Pull to refresh.`;
}

async function resolveLiveMarketDate(): Promise<string> {
  return (await fetchLiveMarketDate()) ?? nepalTodayIso();
}

function brokerKey(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const m = t.match(/\d+/);
  return m ? m[0] : t;
}

/** Normalize "058" / "58" / "Broker 58" → "58" for reliable directory lookup. */
function normBrokerCode(raw: string): string {
  const digits = brokerKey(raw);
  if (!digits) return raw.trim();
  const n = Number(digits);
  return Number.isFinite(n) ? String(n) : digits;
}

function sideKey(symbol: string, broker: string): AggKey {
  return `${symbol.toUpperCase()}|${normBrokerCode(broker)}`;
}

function brokerLogoUrl(imagePath: string | null | undefined): string | null {
  const path = String(imagePath ?? '').trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BROKER_CDN}${path.replace(/^\//, '')}`;
}

async function loadBrokers(): Promise<BrokerInfo[]> {
  if (brokerCache && Date.now() - brokerCacheAt < CACHE_MS) return brokerCache;

  // Prefer TMS broker directory — same source that already shows logos in-app.
  try {
    const tms = await loadTmsBrokers();
    if (tms.length) {
      brokerCache = tms.map((b) => ({
        code: normBrokerCode(b.code) || b.code,
        name: b.name,
        iconUrl: brokerLogoUrl(b.iconUrl) ?? b.iconUrl,
      }));
      brokerCacheAt = Date.now();
      return brokerCache;
    }
  } catch {
    // fall through to paged ShareHub fetch
  }

  const rows: BrokerInfo[] = [];
  let page = 1;
  let totalPages = 1;
  try {
    while (page <= totalPages && page <= 20) {
      const res = await fetch(`${DATA_BASE}/broker?page=${page}&size=100`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) break;
      const json = (await res.json()) as {
        data?: {
          totalPages?: number;
          content?: Array<{
            code?: string;
            name?: string;
            imageUrl?: string;
          }>;
        };
      };
      totalPages = Number(json.data?.totalPages ?? 1);
      for (const b of json.data?.content ?? []) {
        const code = normBrokerCode(String(b.code ?? '').trim());
        if (!code) continue;
        rows.push({
          code,
          name: String(b.name ?? '').trim(),
          iconUrl: brokerLogoUrl(b.imageUrl),
        });
      }
      page += 1;
    }
    if (rows.length) {
      brokerCache = rows;
      brokerCacheAt = Date.now();
    }
    return brokerCache ?? rows;
  } catch {
    return brokerCache ?? [];
  }
}

function brokerIcon(
  code: string,
  directory: Map<string, BrokerInfo>,
): string | null {
  return directory.get(normBrokerCode(code))?.iconUrl ?? null;
}

function brokerDirectoryMap(brokers: BrokerInfo[]): Map<string, BrokerInfo> {
  const map = new Map<string, BrokerInfo>();
  for (const b of brokers) {
    const k = normBrokerCode(b.code);
    if (!k) continue;
    map.set(k, { ...b, code: k, iconUrl: brokerLogoUrl(b.iconUrl) ?? b.iconUrl });
  }
  return map;
}

function brokerLabel(code: string, directory: Map<string, string>): string {
  const k = normBrokerCode(code);
  return directory.get(k) ?? (k ? `Broker ${k}` : 'Market');
}

function nameDirectory(brokers: BrokerInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of brokers) {
    const k = normBrokerCode(b.code);
    if (k) map.set(k, b.name);
  }
  return map;
}

async function loadSessionFloorsheet(force = false): Promise<FloorsheetRow[]> {
  if (!force && floorsheetCache && Date.now() - floorsheetCacheAt < CACHE_MS) {
    return floorsheetCache;
  }

  try {
    const { rows, asOf } = await loadMerolaganiFloorsheetProgressive(
      () => undefined,
      MERO_ACC_DIS_PAGES,
    );
    if (hasBrokerData(rows) && rows.length > 0) {
      floorsheetCache = rows;
      floorsheetCacheAt = Date.now();
      floorsheetMeta = {
        trades: rows.length,
        date: asOf ?? rows[0]?.tradeTime?.slice(0, 10) ?? null,
      };
      return rows;
    }
  } catch {
    // ShareHub fallback below.
  }

  const all: FloorsheetRow[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= FLOOR_MAX_PAGES) {
    const res = await loadFloorsheet(page, FLOOR_PAGE_SIZE);
    all.push(...res.rows);
    hasNext = res.hasNext;
    page += 1;
    if (!res.rows.length) break;
  }
  floorsheetCache = all;
  floorsheetCacheAt = Date.now();
  floorsheetMeta = {
    trades: all.length,
    date: all[0]?.tradeTime?.slice(0, 10) ?? null,
  };
  return all;
}

/**
 * Stream floorsheet pages so UI can paint early.
 * Prefers Merolagani (real buyer/seller broker nos + names). ShareHub is fallback.
 */
async function loadSessionFloorsheetProgressive(
  onPartial: (rows: FloorsheetRow[], meta: { page: number; done: boolean }) => void,
  force = false,
): Promise<FloorsheetRow[]> {
  if (!force && floorsheetCache && Date.now() - floorsheetCacheAt < CACHE_MS) {
    onPartial(floorsheetCache, { page: 0, done: true });
    return floorsheetCache;
  }

  // 1) Merolagani — public HTML with real broker codes + firm names.
  try {
    const { rows, asOf } = await loadMerolaganiFloorsheetProgressive(
      (partial, meta) => {
        onPartial(partial, { page: meta.page, done: meta.done });
      },
      MERO_ACC_DIS_PAGES,
    );
    if (hasBrokerData(rows) && rows.length > 0) {
      floorsheetCache = rows;
      floorsheetCacheAt = Date.now();
      floorsheetMeta = {
        trades: rows.length,
        date: sessionDateFromRows(rows, asOf),
      };
      // Final done already emitted by progressive loader.
      return rows;
    }
  } catch {
    // Fall through to ShareHub.
  }

  // 2) ShareHub live floorsheet (often strips broker IDs on public feed).
  const all: FloorsheetRow[] = [];
  const first = await loadFloorsheet(1, FLOOR_PAGE_SIZE);
  all.push(...first.rows);
  onPartial(all.slice(), { page: 1, done: !first.hasNext || !first.rows.length });

  if (!first.hasNext || !first.rows.length) {
    floorsheetCache = all;
    floorsheetCacheAt = Date.now();
    floorsheetMeta = {
      trades: all.length,
      date: all[0]?.tradeTime?.slice(0, 10) ?? null,
    };
    onPartial(all, { page: 1, done: true });
    return all;
  }

  let page = 2;
  let hasNext = true;
  while (hasNext && page <= FLOOR_MAX_PAGES) {
    const batchPages = [page, page + 1, page + 2].filter(
      (p) => p <= FLOOR_MAX_PAGES,
    );
    const batch = await Promise.all(
      batchPages.map((p) => loadFloorsheet(p, FLOOR_PAGE_SIZE)),
    );
    for (const res of batch) {
      all.push(...res.rows);
      hasNext = res.hasNext;
      if (!res.rows.length) {
        hasNext = false;
        break;
      }
    }
    page += batchPages.length;
    onPartial(all.slice(), {
      page: page - 1,
      done: !hasNext || page > FLOOR_MAX_PAGES,
    });
    if (!hasNext) break;
  }

  floorsheetCache = all;
  floorsheetCacheAt = Date.now();
  floorsheetMeta = {
    trades: all.length,
    date: all[0]?.tradeTime?.slice(0, 10) ?? null,
  };
  onPartial(all, { page: page - 1, done: true });
  return all;
}

function looksLikeBrokerFirm(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (/securities|broker|capital\s*market|investment\s*banking/i.test(n)) {
    return true;
  }
  // Reject listed-company style names that sometimes leak from floorsheet HTML.
  if (
    /hydropower|hydro\s*power|development\s*bank|commercial\s*bank|life\s*insurance|non[\s-]*life|microfinance|mutual\s*fund|agritech|manufacturing|hotels?\s+and\s+tourism|power\s+limited|energy\s+ltd/i.test(
      n,
    )
  ) {
    return false;
  }
  return true;
}

function mergeBrokerNamesFromRows(
  directory: Map<string, string>,
  rows: FloorsheetRow[],
): void {
  for (const r of rows) {
    const buy = normBrokerCode(r.buyerBroker);
    const sell = normBrokerCode(r.sellerBroker);
    // Never overwrite a known directory name; only fill gaps with firm-like titles.
    if (buy && r.buyerBrokerName?.trim() && looksLikeBrokerFirm(r.buyerBrokerName)) {
      if (!directory.has(buy)) directory.set(buy, r.buyerBrokerName.trim());
    }
    if (
      sell &&
      r.sellerBrokerName?.trim() &&
      looksLikeBrokerFirm(r.sellerBrokerName)
    ) {
      if (!directory.has(sell)) directory.set(sell, r.sellerBrokerName.trim());
    }
  }
}

function hasBrokerData(rows: FloorsheetRow[]): boolean {
  return rows.some((r) => brokerKey(r.buyerBroker) || brokerKey(r.sellerBroker));
}

function enrichRow(
  base: Omit<PremiumIntelRow, 'rank' | 'metrics' | 'tags' | 'iconUrl' | 'sharePct'> & {
    iconUrl?: string | null;
    sharePct?: number | null;
  },
  screener: Map<string, MiniScreenerRow>,
  extraMetrics: IntelMetric[] = [],
  extraTags: string[] = [],
): Omit<PremiumIntelRow, 'rank'> {
  const s = screener.get(base.symbol.toUpperCase());
  const high = s?.fiftyTwoWeekHigh ?? base.fiftyTwoWeekHigh;
  const low = s?.fiftyTwoWeekLow ?? base.fiftyTwoWeekLow;
  const ltp = s?.ltp ?? base.ltp;
  const pctFromHigh =
    high && ltp ? ((ltp - high) / high) * 100 : base.pctFromHigh;
  const pctFromLow =
    low && ltp ? ((ltp - low) / low) * 100 : base.pctFromLow;

  const metrics: IntelMetric[] = [
    { label: 'Amount', value: base.amount != null ? formatRs(base.amount) : '—' },
    { label: 'Qty', value: base.quantity != null ? fmtNum(base.quantity, 0) : '—' },
    { label: 'Avg rate', value: base.avgRate != null ? fmtNum(base.avgRate) : '—' },
    { label: 'LTP', value: ltp != null ? fmtNum(ltp) : '—' },
    {
      label: 'Change',
      value:
        (s?.changePercent ?? base.changePct) != null
          ? `${(s?.changePercent ?? base.changePct)! >= 0 ? '+' : ''}${(s?.changePercent ?? base.changePct)!.toFixed(2)}%`
          : '—',
      tone:
        (s?.changePercent ?? base.changePct ?? 0) >= 0 ? 'up' : 'down',
    },
    ...extraMetrics,
  ];

  const tags: string[] = [...extraTags];
  if (s?.sector) tags.push(s.sector);
  if (pctFromHigh != null && pctFromHigh >= -3) tags.push('Near 52W high');
  if (pctFromLow != null && pctFromLow <= 5) tags.push('Near 52W low');
  if ((s?.turnover ?? 0) > 500_000) tags.push('High turnover');

  return {
    ...base,
    name: s?.name ?? base.name,
    iconUrl: iconUri(base.iconUrl ?? s?.iconUrl) ?? null,
    sharePct: base.sharePct ?? null,
    ltp,
    changePct: s?.changePercent ?? base.changePct,
    turnover: s?.turnover ?? base.turnover,
    volume: s?.volume ?? base.volume,
    sector: s?.sector ?? base.sector,
    fiftyTwoWeekHigh: high,
    fiftyTwoWeekLow: low,
    pctFromHigh,
    pctFromLow,
    metrics,
    tags,
  };
}

function rankRows(rows: Omit<PremiumIntelRow, 'rank'>[], limit: number): PremiumIntelRow[] {
  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function buildSideAgg(
  rows: FloorsheetRow[],
  side: 'buy' | 'sell',
): Map<AggKey, SideAgg> {
  const map = new Map<AggKey, SideAgg>();
  for (const r of rows) {
    const brokerRaw = side === 'buy' ? r.buyerBroker : r.sellerBroker;
    const broker = normBrokerCode(brokerRaw);
    if (!broker) continue;
    const qty = r.quantity ?? 0;
    const amt = r.amount ?? qty * (r.rate ?? 0);
    if (qty <= 0 && amt <= 0) continue;
    const key = sideKey(r.symbol, broker);
    const cur = map.get(key) ?? {
      symbol: r.symbol,
      name: r.name,
      broker,
      qty: 0,
      amount: 0,
      rateSum: 0,
      trades: 0,
    };
    cur.qty += qty;
    cur.amount += amt;
    cur.rateSum += r.rate ?? 0;
    cur.trades += 1;
    map.set(key, cur);
  }
  return map;
}

function buildNetAgg(rows: FloorsheetRow[]): Map<AggKey, NetAgg> {
  const map = new Map<AggKey, NetAgg>();
  for (const r of rows) {
    const qty = r.quantity ?? 0;
    const amt = r.amount ?? qty * (r.rate ?? 0);
    if (qty <= 0 && amt <= 0) continue;

    const apply = (brokerRaw: string, isBuy: boolean) => {
      const broker = normBrokerCode(brokerRaw);
      if (!broker) return;
      const key = sideKey(r.symbol, broker);
      const cur = map.get(key) ?? {
        symbol: r.symbol,
        name: r.name,
        broker,
        qty: 0,
        amount: 0,
        rateSum: 0,
        trades: 0,
        buyQty: 0,
        sellQty: 0,
        buyAmt: 0,
        sellAmt: 0,
        iconUrl: r.iconUrl ?? null,
      };
      if (!cur.iconUrl && r.iconUrl) cur.iconUrl = r.iconUrl;
      if (isBuy) {
        cur.buyQty += qty;
        cur.buyAmt += amt;
      } else {
        cur.sellQty += qty;
        cur.sellAmt += amt;
      }
      cur.qty = cur.buyQty - cur.sellQty;
      cur.amount = cur.buyAmt - cur.sellAmt;
      cur.trades += 1;
      cur.rateSum += r.rate ?? 0;
      map.set(key, cur);
    };
    apply(r.buyerBroker, true);
    apply(r.sellerBroker, false);
  }
  return map;
}

function symbolSessionAgg(rows: FloorsheetRow[]): Map<string, SideAgg> {
  const map = new Map<string, SideAgg>();
  for (const r of rows) {
    const qty = r.quantity ?? 0;
    const amt = r.amount ?? qty * (r.rate ?? 0);
    if (!r.symbol || (qty <= 0 && amt <= 0)) continue;
    const key = r.symbol.toUpperCase();
    const cur = map.get(key) ?? {
      symbol: r.symbol,
      name: r.name,
      broker: '',
      qty: 0,
      amount: 0,
      rateSum: 0,
      trades: 0,
    };
    cur.qty += qty;
    cur.amount += amt;
    cur.rateSum += r.rate ?? 0;
    cur.trades += 1;
    map.set(key, cur);
  }
  return map;
}

async function screenerMap(): Promise<Map<string, MiniScreenerRow>> {
  const rows = await loadMiniScreener();
  return new Map(rows.map((r) => [r.symbol.toUpperCase(), r]));
}

function sideToIntel(
  agg: SideAgg,
  screener: Map<string, MiniScreenerRow>,
  directory: Map<string, string>,
  signal: string,
  scoreFn: (a: SideAgg, s?: MiniScreenerRow) => number,
): Omit<PremiumIntelRow, 'rank'> {
  const s = screener.get(agg.symbol.toUpperCase());
  const avgRate = agg.trades > 0 ? agg.rateSum / agg.trades : null;
  return enrichRow(
    {
      symbol: agg.symbol,
      name: agg.name,
      brokerCode: agg.broker || null,
      brokerName: agg.broker ? brokerLabel(agg.broker, directory) : null,
      ltp: s?.ltp ?? null,
      changePct: s?.changePercent ?? null,
      quantity: agg.qty,
      amount: agg.amount,
      avgRate,
      netQty: null,
      netAmount: null,
      turnover: s?.turnover ?? null,
      volume: s?.volume ?? null,
      sector: s?.sector ?? null,
      fiftyTwoWeekHigh: s?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: s?.fiftyTwoWeekLow ?? null,
      pctFromHigh: null,
      pctFromLow: null,
      score: scoreFn(agg, s),
      signal,
    },
    screener,
    [{ label: 'Trades', value: String(agg.trades) }],
  );
}

async function loadFromFloorsheetSide(
  side: 'buy' | 'sell',
  limit: number,
): Promise<PremiumIntelSnapshot> {
  const [rows, screener, brokers] = await Promise.all([
    loadSessionFloorsheet(),
    screenerMap(),
    loadBrokers(),
  ]);
  const directory = new Map(brokers.map((b) => [b.code, b.name]));
  mergeBrokerNamesFromRows(directory, rows);
  const brokerMode = hasBrokerData(rows);
  const title = side === 'buy' ? 'Top Buyers' : 'Top Sellers';
  const subtitle = brokerMode
    ? `Session floorsheet · ranked by ${side === 'buy' ? 'buy' : 'sell'} value per broker & symbol`
    : 'Session buy pressure by symbol · broker IDs not in today\'s public feed';

  if (brokerMode) {
    const agg = buildSideAgg(rows, side);
    const intel = [...agg.values()].map((a) =>
      sideToIntel(
        a,
        screener,
        directory,
        side === 'buy' ? 'Active buyer on floorsheet' : 'Active seller on floorsheet',
        (x, s) =>
          x.amount * (1 + Math.max(0, (s?.changePercent ?? 0) / 20)) *
          Math.log10(Math.max(x.trades, 1) + 1),
      ),
    );
    return {
      title,
      subtitle,
      sessionDate: floorsheetMeta.date,
      tradesScanned: floorsheetMeta.trades,
      brokerBreakdown: true,
      summary: [
        { label: 'Trades scanned', value: String(floorsheetMeta.trades) },
        { label: 'Pairs ranked', value: String(intel.length) },
        { label: 'Source', value: 'Live floorsheet' },
      ],
      rows: rankRows(intel, limit),
    };
  }

  const symAgg = symbolSessionAgg(rows);
  const demand = await loadHighDemand();
  const demandSet = new Set(demand.map((d) => d.symbol.toUpperCase()));
  const intel = [...symAgg.values()]
    .map((a) => {
      const s = screener.get(a.symbol.toUpperCase());
      const ch = s?.changePercent ?? 0;
      if (side === 'buy' && ch < -0.5) return null;
      if (side === 'sell' && ch > 0.5) return null;
      const demandBoost = demandSet.has(a.symbol.toUpperCase()) ? 1.35 : 1;
      return sideToIntel(
        a,
        screener,
        directory,
        side === 'buy'
          ? 'Heavy session volume · buy-side bias'
          : 'Heavy session volume · sell-side bias',
        (x) =>
          x.amount *
          demandBoost *
          (side === 'buy' ? Math.max(0.5, 1 + ch / 15) : Math.max(0.5, 1 - ch / 15)),
      );
    })
    .filter(Boolean) as Omit<PremiumIntelRow, 'rank'>[];

  return {
    title,
    subtitle,
    sessionDate: floorsheetMeta.date,
    tradesScanned: floorsheetMeta.trades,
    brokerBreakdown: false,
    summary: [
      { label: 'Trades scanned', value: String(floorsheetMeta.trades) },
      { label: 'Symbols ranked', value: String(intel.length) },
      { label: 'Demand board', value: String(demand.length) },
    ],
    rows: rankRows(intel, limit),
  };
}

type BoardSets = { demand: Set<string>; supply: Set<string> };

async function loadBoardSets(): Promise<BoardSets> {
  const [demand, supply] = await Promise.all([
    loadHighDemand(),
    loadHighSupply(),
  ]);
  return {
    demand: new Set(demand.map((d) => d.symbol.toUpperCase())),
    supply: new Set(supply.map((d) => d.symbol.toUpperCase())),
  };
}

async function loadNetIntel(
  mode: 'holders' | 'releases',
  limit: number,
  preloadedRows?: FloorsheetRow[],
): Promise<PremiumIntelSnapshot> {
  const [rows, screener, brokers, boards] = await Promise.all([
    preloadedRows
      ? Promise.resolve(preloadedRows)
      : loadSessionFloorsheet(),
    screenerMap(),
    loadBrokers(),
    loadBoardSets(),
  ]);
  return buildNetIntelSnapshot(mode, limit, rows, screener, brokers, boards);
}

function buildNetIntelSnapshot(
  mode: 'holders' | 'releases',
  limit: number,
  rows: FloorsheetRow[],
  screener: Map<string, MiniScreenerRow>,
  brokers: BrokerInfo[],
  boards: BoardSets = { demand: new Set(), supply: new Set() },
): PremiumIntelSnapshot {
  const directory = new Map(brokers.map((b) => [b.code, b.name]));
  mergeBrokerNamesFromRows(directory, rows);
  const brokerMode = hasBrokerData(rows);
  const title = mode === 'holders' ? 'Top Holders' : 'Top Releases';
  const subtitle = brokerMode
    ? mode === 'holders'
      ? 'Net buyers still holding — buy qty minus sell qty on session floorsheet'
      : 'Net sellers releasing — sell qty minus buy qty on session floorsheet'
    : mode === 'holders'
      ? 'Symbol proxy · rising / demand board (broker IDs not in public feed)'
      : 'Symbol proxy · falling / supply board (broker IDs not in public feed)';

  if (brokerMode) {
    const net = buildNetAgg(rows);
    const filtered = [...net.values()].filter((n) =>
      mode === 'holders' ? n.qty > 0 : n.qty < 0,
    );
    const intel = filtered.map((n) => {
      const s = screener.get(n.symbol.toUpperCase());
      const avgRate = n.trades > 0 ? n.rateSum / n.trades : null;
      const netQty = Math.abs(n.qty);
      const netAmt = Math.abs(n.amount);
      const sideTotal = n.buyQty + n.sellQty;
      const sharePct =
        sideTotal > 0
          ? Math.round(
              ((mode === 'holders' ? n.buyQty : n.sellQty) / sideTotal) * 100,
            )
          : 100;
      return enrichRow(
        {
          symbol: n.symbol,
          name: n.name,
          brokerCode: brokerKey(n.broker) || n.broker,
          brokerName: brokerLabel(n.broker, directory),
          iconUrl: s?.iconUrl ?? n.iconUrl ?? null,
          sharePct,
          ltp: s?.ltp ?? null,
          changePct: s?.changePercent ?? null,
          quantity: netQty,
          amount: netAmt,
          avgRate,
          netQty: n.qty,
          netAmount: n.amount,
          turnover: s?.turnover ?? null,
          volume: s?.volume ?? null,
          sector: s?.sector ?? null,
          fiftyTwoWeekHigh: s?.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: s?.fiftyTwoWeekLow ?? null,
          pctFromHigh: null,
          pctFromLow: null,
          score: netAmt * Math.log10(netQty + 10),
          signal:
            mode === 'holders'
              ? 'Net accumulation on floorsheet'
              : 'Net distribution on floorsheet',
        },
        screener,
        [
          { label: 'Net qty', value: fmtNum(n.qty, 0) },
          { label: 'Buy', value: fmtNum(n.buyQty, 0) },
          { label: 'Sell', value: fmtNum(n.sellQty, 0) },
        ],
      );
    });
    return {
      title,
      subtitle,
      sessionDate: floorsheetMeta.date ?? rows[0]?.tradeTime?.slice(0, 10) ?? null,
      tradesScanned: rows.length,
      brokerBreakdown: true,
      summary: [
        { label: 'Net positions', value: String(intel.length) },
        { label: 'Trades scanned', value: String(rows.length) },
        { label: 'Mode', value: mode === 'holders' ? 'Accumulation' : 'Release' },
      ],
      rows: rankRows(intel, limit),
    };
  }

  // Symbol-level proxy when floorsheet has no broker IDs.
  // Hard-split Acc vs Dist so lists are not the same high-turnover names.
  const session = symbolSessionAgg(rows);
  const wantHolders = mode === 'holders';
  const candidates = [...screener.values()]
    .map((s) => {
      const sym = s.symbol.toUpperCase();
      const chg = s.changePercent ?? 0;
      const onDemand = boards.demand.has(sym);
      const onSupply = boards.supply.has(sym);

      if (wantHolders) {
        if (chg <= 0 && !onDemand) return null;
      } else if (chg >= 0 && !onSupply) {
        return null;
      }

      const sess = session.get(sym);
      const turn = sess?.amount || s.turnover || 0;
      const vol = sess?.qty || s.volume || 0;
      if (turn <= 0 && vol <= 0) return null;

      const boardBoost = wantHolders
        ? onDemand
          ? 1.55
          : 1
        : onSupply
          ? 1.55
          : 1;
      const score = wantHolders
        ? turn * (1 + Math.max(0, chg) / 8) * boardBoost
        : turn * (1 + Math.max(0, -chg) / 8) * boardBoost;

      return {
        s,
        sym,
        chg,
        onDemand,
        onSupply,
        turn,
        vol,
        score,
      };
    })
    .filter(Boolean) as Array<{
    s: MiniScreenerRow;
    sym: string;
    chg: number;
    onDemand: boolean;
    onSupply: boolean;
    turn: number;
    vol: number;
    score: number;
  }>;

  const totalTurn = candidates.reduce((sum, c) => sum + c.turn, 0) || 1;

  const intel = candidates.map((c) => {
    const sharePct = Math.round((c.turn / totalTurn) * 1000) / 10; // one decimal
    return enrichRow(
      {
        symbol: c.s.symbol,
        name: c.s.name,
        // Only real floorsheet member IDs — never invent broker numbers.
        brokerCode: null,
        brokerName: null,
        iconUrl: c.s.iconUrl,
        sharePct,
        ltp: c.s.ltp,
        changePct: c.s.changePercent,
        quantity: c.vol,
        amount: c.turn,
        avgRate: c.s.ltp,
        netQty: wantHolders ? c.vol : -c.vol,
        netAmount: wantHolders ? c.turn : -c.turn,
        turnover: c.turn,
        volume: c.vol,
        sector: c.s.sector,
        fiftyTwoWeekHigh: c.s.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: c.s.fiftyTwoWeekLow,
        pctFromHigh: null,
        pctFromLow: null,
        score: c.score,
        signal: wantHolders
          ? c.onDemand
            ? 'Live demand board + rising'
            : 'Live rising / session turnover'
          : c.onSupply
            ? 'Live supply board + falling'
            : 'Live falling / session turnover',
      },
      screener,
      [
        {
          label: 'Board',
          value: wantHolders
            ? c.onDemand
              ? 'Demand'
              : '—'
            : c.onSupply
              ? 'Supply'
              : '—',
        },
        {
          label: 'Wt %',
          value: `${sharePct.toFixed(1)}%`,
        },
      ],
    );
  });

  return {
    title,
    subtitle,
    sessionDate: floorsheetMeta.date ?? rows[0]?.tradeTime?.slice(0, 10) ?? null,
    tradesScanned: rows.length,
    brokerBreakdown: false,
    summary: [
      { label: 'Symbols', value: String(intel.length) },
      { label: 'Trades scanned', value: String(rows.length) },
      {
        label: 'Board',
        value: wantHolders
          ? `Demand ${boards.demand.size}`
          : `Supply ${boards.supply.size}`,
      },
    ],
    rows: rankRows(intel, limit),
  };
}

/** Load persisted Acc/Dis day-cache into memory (safe to call often). */
export function ensureBrokerFlowIntelHydrated(): Promise<void> {
  return hydrateIntelCacheFromDisk();
}

/** Instant read of a warm Acc/Dis board (day/session cache). */
export function peekBrokerFlowIntel(
  kind: 'top-holders' | 'top-releases',
): PremiumIntelSnapshot | null {
  const warm = intelSnapCache.get(kind);
  if (!warm || !isDayCacheFresh(warm, null)) return null;
  return warm.snap;
}

/**
 * Progressive broker accumulation / distribution.
 * Uses a day/session cache keyed to the floorsheet session date. When Merolagani
 * publishes a new sheet, cache clears and fresh data is loaded. Otherwise the
 * cached board is shown instantly.
 */
export async function streamPremiumIntel(
  kind: 'top-holders' | 'top-releases',
  onUpdate: (
    snap: PremiumIntelSnapshot,
    meta: { partial: boolean; page: number },
  ) => void,
  limit = 120,
): Promise<PremiumIntelSnapshot> {
  const mode = kind === 'top-holders' ? 'holders' : 'releases';
  const emptyBoards: BoardSets = { demand: new Set(), supply: new Set() };

  await hydrateIntelCacheFromDisk();

  // Instant paint from day cache (memory or disk).
  let cached = intelSnapCache.get(kind);
  if (cached && isDayCacheFresh(cached, null)) {
    onUpdate(cached.snap, { partial: true, page: 0 });
  } else {
    cached = undefined;
  }

  // Lightweight probe — detect floorsheet API update without full download.
  const [liveDate, probe] = await Promise.all([
    resolveLiveMarketDate().catch(() => null),
    probeMerolaganiFloorSession().catch(() => null),
  ]);

  let forceFloor = false;

  if (cached && isDayCacheFresh(cached, liveDate)) {
    const serveCached = () => {
      const served = {
        ...cached!.snap,
        priorSessionReason: priorSessionReason(
          cached!.sessionDate,
          liveDate ?? nepalTodayIso(),
        ),
      };
      onUpdate(served, { partial: false, page: 0 });
      return served;
    };

    if (!probe?.sessionDate) {
      // Probe failed (offline) — keep day cache.
      return serveCached();
    }

    const cachedFp = floorFingerprint(cached.sessionDate);
    const liveFp = floorFingerprint(probe.sessionDate);
    if (cachedFp && liveFp && cachedFp === liveFp) {
      // Same floorsheet session — serve day-cache as final.
      return serveCached();
    }

    // Floorsheet API published a new session — drop stale Acc/Dis boards.
    intelSnapCache.delete(kind);
    cached = undefined;
    forceFloor = true;
    // Also drop in-memory floorsheet so we don't rebuild from old trades.
    floorsheetCache = null;
    floorsheetCacheAt = 0;
    floorsheetMeta = { trades: 0, date: null };
  } else if (cached && !isDayCacheFresh(cached, liveDate)) {
    intelSnapCache.delete(kind);
    cached = undefined;
    forceFloor = true;
    floorsheetCache = null;
    floorsheetCacheAt = 0;
    floorsheetMeta = { trades: 0, date: null };
  }

  let screener = new Map<string, MiniScreenerRow>();
  let brokers: BrokerInfo[] = [];
  let latest: PremiumIntelSnapshot | null = null;
  let lastCount = 0;
  let floorsheetDone = false;
  let gateOpen = false;
  const buffer: Array<{
    rows: FloorsheetRow[];
    meta: { page: number; done: boolean };
  }> = [];

  const emit = (
    rows: FloorsheetRow[],
    meta: { page: number; done: boolean },
  ) => {
    const snap = buildNetIntelSnapshot(
      mode,
      limit,
      rows,
      screener,
      brokers,
      emptyBoards,
    );
    if (!meta.done && snap.rows.length < lastCount) return;
    lastCount = Math.max(lastCount, snap.rows.length);
    const sessionDate =
      floorsheetMeta.date ?? sessionDateFromRows(rows, null);
    latest = {
      ...snap,
      sessionDate,
      priorSessionReason: priorSessionReason(
        sessionDate,
        liveDate ?? nepalTodayIso(),
      ),
    };
    onUpdate(latest, {
      partial: !meta.done || !floorsheetDone,
      page: meta.page,
    });
  };

  const emitOrBuffer = (
    rows: FloorsheetRow[],
    meta: { page: number; done: boolean },
  ) => {
    if (meta.done) floorsheetDone = true;
    if (!gateOpen) {
      buffer.push({ rows, meta });
      return;
    }
    emit(rows, meta);
  };

  const flushBuffer = () => {
    gateOpen = true;
    for (const item of buffer) emit(item.rows, item.meta);
    buffer.length = 0;
  };

  // Floorsheet + screener in parallel. Hold first paint ≤400ms for logos.
  const floorP = loadSessionFloorsheetProgressive(emitOrBuffer, forceFloor);

  const screenerP = screenerMap()
    .catch(() => new Map<string, MiniScreenerRow>())
    .then((s) => {
      screener = s;
    });

  const brokersP = loadBrokers()
    .catch(() => [] as BrokerInfo[])
    .then((b) => {
      brokers = b;
    });

  await Promise.race([
    screenerP,
    new Promise<void>((r) => setTimeout(r, 400)),
  ]);
  flushBuffer();

  await Promise.all([floorP, screenerP, brokersP]);
  floorsheetDone = true;

  if (floorsheetCache?.length) {
    emit(floorsheetCache, { page: 99, done: true });
  } else if (!latest) {
    latest = await loadNetIntel(mode, limit);
    latest = {
      ...latest,
      priorSessionReason: priorSessionReason(
        latest.sessionDate,
        liveDate ?? nepalTodayIso(),
      ),
    };
    onUpdate(latest, { partial: false, page: 0 });
  } else {
    onUpdate(latest, { partial: false, page: 99 });
  }

  if (latest) {
    const sessionDate =
      latest.sessionDate ??
      probe?.sessionDate ??
      floorsheetMeta.date ??
      null;
    // Store page-1 probe id for diagnostics; invalidation uses sessionDate only.
    const maxId =
      probe?.maxContractId ??
      maxContractIdFromRows(floorsheetCache ?? []);
    rememberIntelSnap(kind, latest, sessionDate, maxId);
  }
  return latest!;
}

/**
 * Warm screener (logos) + floorsheet + Acc/Dis boards when Services opens.
 * Skips network when day-cache still matches the live floorsheet session.
 */
export function prefetchBrokerFlowIntel(): void {
  if (brokerFlowPrefetch) return;
  brokerFlowPrefetch = (async () => {
    try {
      await hydrateIntelCacheFromDisk();
      await screenerMap().catch(() => null);
      await streamPremiumIntel('top-holders', () => {}, 120);
      await streamPremiumIntel('top-releases', () => {}, 120);
    } catch {
      // Prefetch is best-effort.
    } finally {
      setTimeout(() => {
        brokerFlowPrefetch = null;
      }, 30_000);
    }
  })();
}

/**
 * Fetch net accumulation/distribution rows for one broker number
 * (used when search targets a broker not yet in the streamed list).
 */
export async function searchBrokerNetRows(
  kind: 'top-holders' | 'top-releases',
  brokerCode: string,
  limit = 40,
): Promise<PremiumIntelRow[]> {
  const code = brokerKey(brokerCode);
  if (!code) return [];

  const mode = kind === 'top-holders' ? 'holders' : 'releases';
  const [buy1, sell1, screener, brokers] = await Promise.all([
    loadFloorsheet(1, 100, { buyerMemberId: code }),
    loadFloorsheet(1, 100, { sellerMemberId: code }),
    screenerMap(),
    loadBrokers(),
  ]);

  const more: Promise<FloorsheetPage>[] = [];
  if (buy1.hasNext) more.push(loadFloorsheet(2, 100, { buyerMemberId: code }));
  if (sell1.hasNext) more.push(loadFloorsheet(2, 100, { sellerMemberId: code }));
  const extra = more.length ? await Promise.all(more) : [];

  const rows = [
    ...buy1.rows,
    ...sell1.rows,
    ...extra.flatMap((p) => p.rows),
  ];
  if (!rows.length) return [];

  // Filtered floorsheet by member ID still often returns null broker fields
  // on the public API — only keep real broker matches when present.
  if (!hasBrokerData(rows)) return [];
  const snap = buildNetIntelSnapshot(mode, limit, rows, screener, brokers);
  return snap.rows.filter((r) => brokerKey(r.brokerCode ?? '') === code);
}

async function loadBrokerFavorites(limit: number): Promise<PremiumIntelSnapshot> {
  const [screener, demand, mini] = await Promise.all([
    screenerMap(),
    loadHighDemand(),
    loadMiniScreener(),
  ]);
  const demandSet = new Set(demand.map((d) => d.symbol.toUpperCase()));
  const turnRes = await fetch(`${LIVE_V2}/top-turnover`, {
    headers: { Accept: 'application/json' },
  });
  const topTurn = turnRes.ok ? ((await turnRes.json()) as Array<{ symbol?: string; turnover?: number }>) : [];
  const turnSet = new Set(topTurn.map((t) => String(t.symbol ?? '').toUpperCase()));

  const intel = mini
    .map((s) => {
      const sym = s.symbol.toUpperCase();
      const ch = s.changePercent ?? 0;
      const turn = s.turnover ?? 0;
      const high = s.fiftyTwoWeekHigh;
      const ltp = s.ltp ?? 0;
      const nearHigh = high && ltp ? ltp / high >= 0.92 : false;
      let score = 0;
      if (demandSet.has(sym)) score += 40;
      if (turnSet.has(sym)) score += 35;
      if (ch > 1) score += ch * 3;
      if (nearHigh) score += 25;
      score += Math.log10(Math.max(turn, 1000));
      if (score < 50) return null;

      const tags = ['Convergence'];
      if (demandSet.has(sym)) tags.push('Demand');
      if (turnSet.has(sym)) tags.push('Top turnover');
      if (nearHigh) tags.push('52W zone');

      return enrichRow(
        {
          symbol: s.symbol,
          name: s.name,
          brokerCode: null,
          brokerName: null,
          ltp: s.ltp,
          changePct: s.changePercent,
          quantity: s.volume,
          amount: turn,
          avgRate: s.ltp,
          netQty: null,
          netAmount: null,
          turnover: turn,
          volume: s.volume,
          sector: s.sector,
          fiftyTwoWeekHigh: high,
          fiftyTwoWeekLow: s.fiftyTwoWeekLow,
          pctFromHigh: null,
          pctFromLow: null,
          score,
          signal: 'Multi-signal institutional interest · broker favorite candidate',
        },
        screener,
        [{ label: 'Score', value: score.toFixed(0) }],
        tags,
      );
    })
    .filter(Boolean) as Omit<PremiumIntelRow, 'rank'>[];

  return {
    title: 'Broker Favorites',
    subtitle:
      'Stocks where demand, turnover, momentum and 52-week strength converge — smart-money watchlist.',
    sessionDate: nepalTodayIso(),
    tradesScanned: 0,
    brokerBreakdown: false,
    summary: [
      { label: 'Demand board', value: String(demand.length) },
      { label: 'Top turnover', value: String(topTurn.length) },
      { label: 'Candidates', value: String(intel.length) },
      { label: 'Source', value: 'Live screener' },
    ],
    rows: rankRows(intel, limit),
  };
}

/** Broker directory for Favorites picker (code + name + logo). */
export async function loadBrokerDirectory(): Promise<BrokerInfo[]> {
  return loadBrokers();
}

/**
 * Stocks a specific broker is net-buying on the latest floorsheet.
 * Used when Favorites search mode is Broker # / name.
 */
export async function loadBrokerFavoriteBuys(
  brokerQuery: string,
  limit = 60,
): Promise<{ rows: PremiumIntelRow[]; broker: BrokerInfo | null; sessionDate: string | null }> {
  const q = brokerQuery.trim();
  if (!q) return { rows: [], broker: null, sessionDate: null };

  const [brokers, screener] = await Promise.all([loadBrokers(), screenerMap()]);
  const digits = q.replace(/\D/g, '');
  const ql = q.toLowerCase();
  const broker =
    brokers.find((b) => digits && normBrokerCode(b.code) === normBrokerCode(digits)) ??
    brokers.find((b) => b.name.toLowerCase().includes(ql)) ??
    brokers.find((b) => b.code.includes(digits)) ??
    null;
  if (!broker) return { rows: [], broker: null, sessionDate: floorsheetMeta.date };

  let rows = floorsheetCache ?? [];
  if (!hasBrokerData(rows)) {
    try {
      await loadMerolaganiFloorsheetProgressive((partial, meta) => {
        if (hasBrokerData(partial)) {
          rememberFloorsheet(partial, meta.asOf);
        }
      }, MERO_FLOOR_FAST_PAGES);
      rows = floorsheetCache ?? [];
    } catch {
      rows = await loadSessionFloorsheet(true);
    }
  }

  const code = normBrokerCode(broker.code);
  const buyRows = rows.filter(
    (r) => normBrokerCode(r.buyerBroker) === code,
  );
  const agg = buildSideAgg(buyRows, 'buy');
  const directory = nameDirectory(brokers);
  const intel = [...agg.values()]
    .filter((a) => a.qty > 0)
    .map((a) =>
      sideToIntel(
        a,
        screener,
        directory,
        `Broker ${code} buying · ${broker.name}`,
        (x) => x.amount * Math.log10(x.qty + 10),
      ),
    )
    .map((r) => ({
      ...r,
      brokerCode: code,
      brokerName: broker.name,
      iconUrl: r.iconUrl ?? screener.get(r.symbol.toUpperCase())?.iconUrl ?? null,
    }));

  return {
    rows: rankRows(intel, limit),
    broker,
    sessionDate: floorsheetMeta.date ?? sessionDateFromRows(rows, null),
  };
}

async function loadBrokerTopBuySell(limit: number): Promise<PremiumIntelSnapshot> {
  const [rows, brokers, screener] = await Promise.all([
    loadSessionFloorsheet(),
    loadBrokers(),
    screenerMap(),
  ]);
  const directory = new Map(brokers.map((b) => [b.code, b.name]));
  mergeBrokerNamesFromRows(directory, rows);

  if (hasBrokerData(rows)) {
    const netByBroker = new Map<string, BrokerNet>();
    for (const r of rows) {
      const qty = r.quantity ?? 0;
      const amt = r.amount ?? qty * (r.rate ?? 0);
      const apply = (raw: string, isBuy: boolean) => {
        const code = brokerKey(raw);
        if (!code) return;
        const cur = netByBroker.get(code) ?? {
          broker: code,
          buyAmt: 0,
          sellAmt: 0,
          buyQty: 0,
          sellQty: 0,
          symbols: new Set<string>(),
        };
        if (isBuy) {
          cur.buyAmt += amt;
          cur.buyQty += qty;
        } else {
          cur.sellAmt += amt;
          cur.sellQty += qty;
        }
        cur.symbols.add(r.symbol.toUpperCase());
        netByBroker.set(code, cur);
      };
      apply(r.buyerBroker, true);
      apply(r.sellerBroker, false);
    }

    const intel = [...netByBroker.values()].map((b) => {
      const net = b.buyAmt - b.sellAmt;
      const bias = net >= 0 ? 'Net buyer' : 'Net seller';
      return enrichRow(
        {
          symbol: `${b.symbols.size} stocks`,
          name: brokerLabel(b.broker, directory),
          brokerCode: b.broker,
          brokerName: brokerLabel(b.broker, directory),
          ltp: null,
          changePct: null,
          quantity: b.buyQty + b.sellQty,
          amount: b.buyAmt + b.sellAmt,
          avgRate: null,
          netQty: b.buyQty - b.sellQty,
          netAmount: net,
          turnover: null,
          volume: null,
          sector: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          pctFromHigh: null,
          pctFromLow: null,
          score: Math.abs(net) + b.buyAmt * 0.01,
          signal: `${bias} · ${b.symbols.size} symbols touched`,
        },
        screener,
        [
          { label: 'Buy', value: formatRs(b.buyAmt) },
          { label: 'Sell', value: formatRs(b.sellAmt) },
          { label: 'Net', value: formatRs(net), tone: net >= 0 ? 'up' : 'down' },
        ],
        [bias],
      );
    });

    return {
      title: 'Broker Top Buy / Sell',
      subtitle: 'Brokers ranked by session buy vs sell value across all floorsheet trades.',
      sessionDate: floorsheetMeta.date,
      tradesScanned: floorsheetMeta.trades,
      brokerBreakdown: true,
      summary: [
        { label: 'Brokers', value: String(intel.length) },
        { label: 'Trades', value: String(floorsheetMeta.trades) },
        { label: 'Source', value: 'Floorsheet' },
      ],
      rows: rankRows(intel, limit),
    };
  }

  const [demand, supply] = await Promise.all([loadHighDemand(), loadHighSupply()]);
  const buyVol = demand.reduce((s, d) => s + (d.quantity ?? 0), 0);
  const sellVol = supply.reduce((s, d) => s + (d.quantity ?? 0), 0);
  const mini = await loadMiniScreener();
  const up = mini.filter((s) => (s.changePercent ?? 0) > 0);
  const down = mini.filter((s) => (s.changePercent ?? 0) < 0);

  const intel: Omit<PremiumIntelRow, 'rank'>[] = [
    enrichRow(
      {
        symbol: 'MARKET',
        name: 'Buy-side pressure',
        brokerCode: null,
        brokerName: 'Session aggregate',
        ltp: null,
        changePct: null,
        quantity: buyVol,
        amount: up.reduce((s, r) => s + (r.turnover ?? 0), 0),
        avgRate: null,
        netQty: buyVol - sellVol,
        netAmount: null,
        turnover: null,
        volume: null,
        sector: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        pctFromHigh: null,
        pctFromLow: null,
        score: buyVol,
        signal: `${up.length} advancers · demand board ${fmtNum(buyVol, 0)} qty`,
      },
      screener,
      [{ label: 'Demand qty', value: fmtNum(buyVol, 0) }],
      ['Buy bias'],
    ),
    enrichRow(
      {
        symbol: 'MARKET',
        name: 'Sell-side pressure',
        brokerCode: null,
        brokerName: 'Session aggregate',
        ltp: null,
        changePct: null,
        quantity: sellVol,
        amount: down.reduce((s, r) => s + (r.turnover ?? 0), 0),
        avgRate: null,
        netQty: sellVol - buyVol,
        netAmount: null,
        turnover: null,
        volume: null,
        sector: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        pctFromHigh: null,
        pctFromLow: null,
        score: sellVol,
        signal: `${down.length} decliners · supply board ${fmtNum(sellVol, 0)} qty`,
      },
      screener,
      [{ label: 'Supply qty', value: fmtNum(sellVol, 0) }],
      ['Sell bias'],
    ),
  ];

  return {
    title: 'Broker Top Buy / Sell',
    subtitle:
      'Live buy vs sell pressure snapshot. Per-broker ranking activates when floorsheet broker IDs are published.',
    sessionDate: floorsheetMeta.date,
    tradesScanned: floorsheetMeta.trades,
    brokerBreakdown: false,
    summary: [
      { label: 'Demand', value: fmtNum(buyVol, 0) },
      { label: 'Supply', value: fmtNum(sellVol, 0) },
      { label: 'Brokers listed', value: String(brokers.length) },
    ],
    rows: rankRows(intel, limit),
  };
}

export type BrokerTopBuySellCard = {
  code: string;
  name: string;
  iconUrl: string | null;
  buySymbols: string[];
  sellSymbols: string[];
  buyAmt: number;
  sellAmt: number;
  score: number;
};

export type BrokerTopBuySellBoard = {
  brokers: BrokerTopBuySellCard[];
  sessionDate: string | null;
  /** Why a prior-day sheet is shown while market is open (if any). */
  priorSessionReason?: string | null;
  tradesScanned: number;
  brokerBreakdown: boolean;
};

type SymAmt = { qty: number; amt: number };

function topSymbols(
  map: Map<string, SymAmt>,
  take = 5,
): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1].amt - a[1].amt || b[1].qty - a[1].qty)
    .slice(0, take)
    .map(([sym]) => sym);
}

function buildBrokerTopBuySellBoard(
  rows: FloorsheetRow[],
  brokerDir: Map<string, BrokerInfo>,
  nameDir: Map<string, string>,
): BrokerTopBuySellBoard {
  const sessionDate =
    floorsheetMeta.date ?? sessionDateFromRows(rows, null);

  if (!hasBrokerData(rows)) {
    return {
      brokers: [],
      sessionDate,
      tradesScanned: rows.length,
      brokerBreakdown: false,
    };
  }

  type Bucket = {
    code: string;
    buy: Map<string, SymAmt>;
    sell: Map<string, SymAmt>;
    buyAmt: number;
    sellAmt: number;
  };

  const byBroker = new Map<string, Bucket>();

  const bump = (
    raw: string,
    symbol: string,
    qty: number,
    amt: number,
    isBuy: boolean,
  ) => {
    const code = normBrokerCode(raw);
    if (!code || !symbol) return;
    let b = byBroker.get(code);
    if (!b) {
      b = {
        code,
        buy: new Map(),
        sell: new Map(),
        buyAmt: 0,
        sellAmt: 0,
      };
      byBroker.set(code, b);
    }
    const side = isBuy ? b.buy : b.sell;
    const cur = side.get(symbol) ?? { qty: 0, amt: 0 };
    cur.qty += qty;
    cur.amt += amt;
    side.set(symbol, cur);
    if (isBuy) b.buyAmt += amt;
    else b.sellAmt += amt;
  };

  for (const r of rows) {
    const qty = r.quantity ?? 0;
    const amt = r.amount ?? qty * (r.rate ?? 0);
    if (qty <= 0 && amt <= 0) continue;
    const sym = r.symbol.toUpperCase();
    bump(r.buyerBroker, sym, qty, amt, true);
    bump(r.sellerBroker, sym, qty, amt, false);
  }

  const brokers: BrokerTopBuySellCard[] = [];
  for (const b of byBroker.values()) {
    const info = brokerDir.get(b.code);
    const floorName = nameDir.get(b.code) ?? '';
    const name =
      info?.name ||
      (looksLikeBrokerFirm(floorName) ? floorName : null) ||
      `Broker ${b.code}`;
    const buySymbols = topSymbols(b.buy, 5);
    const sellSymbols = topSymbols(b.sell, 5);
    if (!buySymbols.length && !sellSymbols.length) continue;
    brokers.push({
      code: b.code,
      name,
      iconUrl: info?.iconUrl ?? null,
      buySymbols,
      sellSymbols,
      buyAmt: b.buyAmt,
      sellAmt: b.sellAmt,
      score: b.buyAmt + b.sellAmt,
    });
  }

  brokers.sort((a, b) => b.score - a.score);

  return {
    brokers,
    sessionDate,
    tradesScanned: rows.length,
    brokerBreakdown: true,
  };
}

export async function loadBrokerTopBuySellBoard(): Promise<BrokerTopBuySellBoard> {
  const [rows, brokers] = await Promise.all([
    loadSessionFloorsheet(),
    loadBrokers(),
  ]);
  const brokerDir = brokerDirectoryMap(brokers);
  const nameDir = nameDirectory(brokers);
  mergeBrokerNamesFromRows(nameDir, rows);
  return buildBrokerTopBuySellBoard(rows, brokerDir, nameDir);
}

/**
 * Progressive board for Broker Top Buy/Sell.
 * Prefers today's Merolagani sheet when published; otherwise shows the last
 * published sheet and sets priorSessionReason while the market is open.
 */
export async function streamBrokerTopBuySellBoard(
  onUpdate: (board: BrokerTopBuySellBoard, meta: { partial: boolean }) => void,
): Promise<BrokerTopBuySellBoard> {
  const brokers = await loadBrokers();
  const brokerDir = brokerDirectoryMap(brokers);
  const nameDir = nameDirectory(brokers);
  const liveDate = await resolveLiveMarketDate();
  const wantToday = expectTodaySession(liveDate);

  let last: BrokerTopBuySellBoard = {
    brokers: [],
    sessionDate: null,
    priorSessionReason: null,
    tradesScanned: 0,
    brokerBreakdown: false,
  };

  const emit = (
    rows: FloorsheetRow[],
    partial: boolean,
    publishedDate: string | null,
  ) => {
    mergeBrokerNamesFromRows(nameDir, rows);
    const fresh = buildBrokerTopBuySellBoard(rows, brokerDir, nameDir);
    const sessionDate = publishedDate ?? fresh.sessionDate;
    const reason = priorSessionReason(sessionDate, liveDate);
    // Paint chips as soon as page 1 has broker data — refine as more pages arrive.
    last = {
      ...fresh,
      sessionDate,
      priorSessionReason: reason,
      brokerBreakdown: fresh.brokerBreakdown || last.brokerBreakdown,
    };
    onUpdate(last, { partial });
  };

  if (isFloorsheetCacheFresh(liveDate)) {
    emit(floorsheetCache!, false, floorsheetMeta.date);
  }

  const ingestDefault = (
    rows: FloorsheetRow[],
    meta: { done: boolean; asOf: string | null },
  ) => {
    const asOf = sessionDateFromRows(rows, meta.asOf);
    rememberFloorsheet(rows, asOf);
    emit(rows, !meta.done, asOf);
  };

  try {
    // Load the published Merolagani sheet immediately (usually prior day while
    // market is open). Skipping an empty "today" date-filter probe saves ~3–8s.
    await loadMerolaganiFloorsheetProgressive((rows, meta) => {
      ingestDefault(rows, meta);
    }, MERO_FLOOR_FAST_PAGES);

    // If default sheet already rolled to today, we're done.
    if (
      last.sessionDate &&
      last.sessionDate >= liveDate &&
      last.brokers.length
    ) {
      return last;
    }

    // Optional one-shot today probe only when market is open and we have no rows yet.
    if (wantToday && last.brokers.length === 0) {
      await loadMerolaganiFloorsheetProgressive(
        (rows, meta) => {
          const asOf = sessionDateFromRows(rows, meta.asOf ?? liveDate);
          if (asOf && asOf >= liveDate && hasBrokerData(rows)) {
            rememberFloorsheet(rows, asOf);
            emit(rows, !meta.done, asOf);
          }
        },
        MERO_FLOOR_FAST_PAGES,
        { dateIso: liveDate },
      );
    }
  } catch {
    const rows = await loadSessionFloorsheet(true);
    const asOf = sessionDateFromRows(rows, floorsheetMeta.date);
    emit(rows, false, asOf);
  }

  return last;
}

export type TopSideTradeRow = {
  id: string;
  symbol: string;
  brokerCode: string;
  qty: number;
  amount: number;
  avgRate: number | null;
  trades: number;
};

export type TopSideBoard = {
  rows: TopSideTradeRow[];
  sessionDate: string | null;
  priorSessionReason?: string | null;
  tradesScanned: number;
  side: 'buy' | 'sell';
};

function buildTopSideBoard(
  rows: FloorsheetRow[],
  side: 'buy' | 'sell',
): TopSideBoard {
  const sessionDate =
    floorsheetMeta.date ?? sessionDateFromRows(rows, null);
  const agg = buildSideAgg(rows, side);
  const list: TopSideTradeRow[] = [...agg.values()]
    .filter((a) => a.qty > 0)
    .map((a) => ({
      id: `${a.symbol}|${a.broker}`,
      symbol: a.symbol.toUpperCase(),
      brokerCode: a.broker,
      qty: a.qty,
      amount: a.amount,
      avgRate: a.trades > 0 ? a.rateSum / a.trades : null,
      trades: a.trades,
    }))
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount);

  return {
    rows: list,
    sessionDate,
    tradesScanned: rows.length,
    side,
  };
}

/**
 * Top Buyers / Top Sellers board. Publishes final ranked rows when stream ends
 * (warm cache first). Avoids mid-load rank reshuffles.
 */
export async function streamTopSideBoard(
  side: 'buy' | 'sell',
  onUpdate: (board: TopSideBoard, meta: { partial: boolean }) => void,
): Promise<TopSideBoard> {
  const liveDate = await resolveLiveMarketDate();

  let last: TopSideBoard = {
    rows: [],
    sessionDate: null,
    priorSessionReason: null,
    tradesScanned: 0,
    side,
  };

  const emit = (
    rows: FloorsheetRow[],
    partial: boolean,
    publishedDate: string | null,
  ) => {
    const sessionDate =
      publishedDate ??
      floorsheetMeta.date ??
      sessionDateFromRows(rows, null);
    const reason = priorSessionReason(sessionDate, liveDate);
    if (!hasBrokerData(rows)) {
      last = {
        rows: [],
        sessionDate,
        priorSessionReason: reason,
        tradesScanned: rows.length,
        side,
      };
      onUpdate(last, { partial });
      return;
    }
    const fresh = buildTopSideBoard(rows, side);
    // Publish ranked rows early so the table isn't blank until all pages finish.
    last = {
      ...fresh,
      sessionDate,
      priorSessionReason: reason,
    };
    onUpdate(last, { partial });
  };

  if (isFloorsheetCacheFresh(liveDate)) {
    emit(floorsheetCache!, false, floorsheetMeta.date);
  }

  const ingest = (
    rows: FloorsheetRow[],
    meta: { done: boolean; asOf: string | null },
  ) => {
    const asOf = sessionDateFromRows(rows, meta.asOf);
    rememberFloorsheet(rows, asOf);
    emit(rows, !meta.done, asOf);
  };

  try {
    await loadMerolaganiFloorsheetProgressive((rows, meta) => {
      ingest(rows, meta);
    }, MERO_FLOOR_FAST_PAGES);
  } catch {
    const rows = await loadSessionFloorsheet(true);
    emit(rows, false, sessionDateFromRows(rows, floorsheetMeta.date));
  }

  return last;
}

/** Priority fetch for symbol / broker search on Top Buyers / Sellers. */
export async function loadTopSideForQuery(
  side: 'buy' | 'sell',
  opts: { symbol?: string; broker?: string },
): Promise<TopSideTradeRow[]> {
  const sym = (opts.symbol ?? '').trim().toUpperCase();
  const brokerQ = (opts.broker ?? '').trim();
  if (!sym && !brokerQ) return [];

  let rows = floorsheetCache ?? [];
  if (sym) {
    try {
      const extra = await loadMerolaganiFloorsheetForSymbol(sym, 3);
      if (extra.rows.length) {
        const byId = new Map<string, FloorsheetRow>();
        for (const r of [...rows, ...extra.rows]) {
          const id = String(
            r.contractId ||
              `${r.symbol}-${r.buyerBroker}-${r.sellerBroker}-${r.quantity}`,
          );
          if (!byId.has(id)) byId.set(id, r);
        }
        rows = [...byId.values()];
      }
    } catch {
      // ignore
    }
  }

  if (brokerQ && rows.length < 40) {
    const code = normBrokerCode(brokerQ);
    if (code) {
      try {
        const page =
          side === 'buy'
            ? await loadFloorsheet(1, 100, { buyerMemberId: code })
            : await loadFloorsheet(1, 100, { sellerMemberId: code });
        const byId = new Map<string, FloorsheetRow>();
        for (const r of [...rows, ...page.rows]) {
          const id = String(
            r.contractId ||
              `${r.symbol}-${r.buyerBroker}-${r.sellerBroker}-${r.quantity}`,
          );
          if (!byId.has(id)) byId.set(id, r);
        }
        rows = [...byId.values()];
      } catch {
        // ignore
      }
    }
  }

  const board = buildTopSideBoard(rows, side);
  return board.rows.filter((r) => {
    if (sym && !r.symbol.includes(sym)) return false;
    if (brokerQ) {
      const q = brokerQ.toLowerCase();
      const digits = q.replace(/\D/g, '');
      if (digits && !r.brokerCode.includes(digits) && r.brokerCode !== normBrokerCode(q)) {
        return false;
      }
      if (!digits && !r.brokerCode.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export type NetSideMode = 'holders' | 'releases';

export type NetSideTradeRow = {
  id: string;
  symbol: string;
  /** Empty when aggregated by symbol (Top Holders default view). */
  brokerCode: string;
  qty: number;
  amount: number;
  avgRate: number | null;
  ltp: number | null;
  trades: number;
};

export type NetSideBoard = {
  rows: NetSideTradeRow[];
  sessionDate: string | null;
  tradesScanned: number;
  mode: NetSideMode;
  /** True when rows include broker codes. */
  brokerBreakdown: boolean;
};

/**
 * Top Holders → net buy qty > 0 (symbol aggregate by default).
 * Top Release → net sell qty (broker × symbol pairs).
 */
function buildNetSideBoard(
  rows: FloorsheetRow[],
  mode: NetSideMode,
  screener?: Map<string, MiniScreenerRow>,
): NetSideBoard {
  const sessionDate =
    floorsheetMeta.date ?? sessionDateFromRows(rows, null);

  if (!hasBrokerData(rows)) {
    return {
      rows: [],
      sessionDate,
      tradesScanned: rows.length,
      mode,
      brokerBreakdown: false,
    };
  }

  const net = buildNetAgg(rows);

  if (mode === 'holders') {
    // Screenshot: SYM · Qty · Amount (symbol-level net accumulation).
    type SymBucket = {
      symbol: string;
      qty: number;
      amount: number;
      rateSum: number;
      trades: number;
    };
    const bySym = new Map<string, SymBucket>();
    for (const n of net.values()) {
      if (n.qty <= 0) continue;
      const sym = n.symbol.toUpperCase();
      const cur = bySym.get(sym) ?? {
        symbol: sym,
        qty: 0,
        amount: 0,
        rateSum: 0,
        trades: 0,
      };
      cur.qty += n.qty;
      cur.amount += Math.abs(n.amount);
      cur.rateSum += n.rateSum;
      cur.trades += n.trades;
      bySym.set(sym, cur);
    }
    const list: NetSideTradeRow[] = [...bySym.values()]
      .map((a) => ({
        id: a.symbol,
        symbol: a.symbol,
        brokerCode: '',
        qty: a.qty,
        amount: a.amount,
        avgRate: a.trades > 0 ? a.rateSum / a.trades : null,
        ltp: screener?.get(a.symbol)?.ltp ?? null,
        trades: a.trades,
      }))
      .sort((a, b) => b.qty - a.qty || b.amount - a.amount);

    return {
      rows: list,
      sessionDate,
      tradesScanned: rows.length,
      mode,
      brokerBreakdown: false,
    };
  }

  // Top Release: SYM · Broker · Qty · Amount
  const list: NetSideTradeRow[] = [...net.values()]
    .filter((n) => n.qty < 0)
    .map((n) => {
      const sym = n.symbol.toUpperCase();
      return {
        id: `${sym}|${n.broker}`,
        symbol: sym,
        brokerCode: n.broker,
        qty: Math.abs(n.qty),
        amount: Math.abs(n.amount),
        avgRate: n.trades > 0 ? n.rateSum / n.trades : null,
        ltp: screener?.get(sym)?.ltp ?? null,
        trades: n.trades,
      };
    })
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount);

  return {
    rows: list,
    sessionDate,
    tradesScanned: rows.length,
    mode,
    brokerBreakdown: true,
  };
}

/** Holders / Release board from live floorsheet — publish when stream completes. */
export async function streamNetSideBoard(
  mode: NetSideMode,
  onUpdate: (board: NetSideBoard, meta: { partial: boolean }) => void,
): Promise<NetSideBoard> {
  let last: NetSideBoard = {
    rows: [],
    sessionDate: null,
    tradesScanned: 0,
    mode,
    brokerBreakdown: false,
  };
  let screener: Map<string, MiniScreenerRow> | undefined;
  void screenerMap()
    .then((m) => {
      screener = m;
    })
    .catch(() => undefined);

  const emit = (rows: FloorsheetRow[], partial: boolean) => {
    const fresh = buildNetSideBoard(rows, mode, screener);
    if (partial) {
      last = {
        rows: last.rows,
        sessionDate: fresh.sessionDate,
        tradesScanned: fresh.tradesScanned,
        mode,
        brokerBreakdown: last.brokerBreakdown || fresh.brokerBreakdown,
      };
      onUpdate(last, { partial: true });
      return;
    }
    last = fresh;
    onUpdate(last, { partial: false });
  };

  if (floorsheetCache?.length && Date.now() - floorsheetCacheAt < CACHE_MS) {
    emit(floorsheetCache, false);
  }

  try {
    await loadMerolaganiFloorsheetProgressive((rows, meta) => {
      if (hasBrokerData(rows) && rows.length > 0) {
        floorsheetCache = rows;
        floorsheetCacheAt = Date.now();
        floorsheetMeta = {
          trades: rows.length,
          date: meta.asOf ?? rows[0]?.tradeTime?.slice(0, 10) ?? null,
        };
      }
      emit(rows, !meta.done);
    }, MERO_FLOOR_FAST_PAGES);
  } catch {
    const rows = await loadSessionFloorsheet(true);
    emit(rows, false);
  }

  return last;
}

/** Priority search for Top Holders / Top Release. */
export async function loadNetSideForQuery(
  mode: NetSideMode,
  opts: { symbol?: string; broker?: string },
): Promise<NetSideTradeRow[]> {
  const sym = (opts.symbol ?? '').trim().toUpperCase();
  const brokerQ = (opts.broker ?? '').trim();
  if (!sym && !brokerQ) return [];

  let rows = floorsheetCache ?? [];
  if (sym) {
    try {
      const extra = await loadMerolaganiFloorsheetForSymbol(sym, 3);
      if (extra.rows.length) {
        const byId = new Map<string, FloorsheetRow>();
        for (const r of [...rows, ...extra.rows]) {
          const id = String(
            r.contractId ||
              `${r.symbol}-${r.buyerBroker}-${r.sellerBroker}-${r.quantity}`,
          );
          if (!byId.has(id)) byId.set(id, r);
        }
        rows = [...byId.values()];
      }
    } catch {
      // ignore
    }
  }

  if (brokerQ && rows.length < 40) {
    const code = normBrokerCode(brokerQ);
    if (code) {
      try {
        const [buy1, sell1] = await Promise.all([
          loadFloorsheet(1, 100, { buyerMemberId: code }),
          loadFloorsheet(1, 100, { sellerMemberId: code }),
        ]);
        const byId = new Map<string, FloorsheetRow>();
        for (const r of [...rows, ...buy1.rows, ...sell1.rows]) {
          const id = String(
            r.contractId ||
              `${r.symbol}-${r.buyerBroker}-${r.sellerBroker}-${r.quantity}`,
          );
          if (!byId.has(id)) byId.set(id, r);
        }
        rows = [...byId.values()];
      } catch {
        // ignore
      }
    }
  }

  // Buyer/Seller search on holders: show broker×symbol net rows for that party.
  if (mode === 'holders' && brokerQ) {
    const net = buildNetAgg(rows);
    const digits = brokerQ.replace(/\D/g, '');
    const code = normBrokerCode(brokerQ);
    return [...net.values()]
      .filter((n) => {
        if (n.qty <= 0) return false;
        if (sym && !n.symbol.toUpperCase().includes(sym)) return false;
        if (digits) return n.broker.includes(digits) || n.broker === code;
        return n.broker.toLowerCase().includes(brokerQ.toLowerCase());
      })
      .map((n) => ({
        id: `${n.symbol.toUpperCase()}|${n.broker}`,
        symbol: n.symbol.toUpperCase(),
        brokerCode: n.broker,
        qty: n.qty,
        amount: Math.abs(n.amount),
        avgRate: n.trades > 0 ? n.rateSum / n.trades : null,
        ltp: null,
        trades: n.trades,
      }))
      .sort((a, b) => b.qty - a.qty);
  }

  const board = buildNetSideBoard(rows, mode);
  return board.rows.filter((r) => {
    if (sym && !r.symbol.includes(sym)) return false;
    if (brokerQ && r.brokerCode) {
      const q = brokerQ.toLowerCase();
      const digits = q.replace(/\D/g, '');
      if (digits && !r.brokerCode.includes(digits) && r.brokerCode !== normBrokerCode(q)) {
        return false;
      }
      if (!digits && !r.brokerCode.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/** Priority fetch when user searches a broker code/name not loaded yet. */
export async function loadBrokerTopBuySellForQuery(
  query: string,
): Promise<BrokerTopBuySellCard[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  const brokers = await loadBrokers();
  const brokerDir = brokerDirectoryMap(brokers);
  const nameDir = nameDirectory(brokers);

  const matchedCodes = brokers
    .filter(
      (b) =>
        b.code.includes(q.replace(/\D/g, '')) ||
        b.name.toLowerCase().includes(q) ||
        normBrokerCode(b.code) === normBrokerCode(q),
    )
    .map((b) => normBrokerCode(b.code))
    .filter(Boolean)
    .slice(0, 5);

  if (!matchedCodes.length) {
    // Raw numeric code typed
    const code = normBrokerCode(q);
    if (code) matchedCodes.push(code);
  }
  if (!matchedCodes.length) return [];

  // Prefer session cache filtered by broker; else ShareHub member filter
  let rows = (floorsheetCache ?? []).filter((r) => {
    const buy = normBrokerCode(r.buyerBroker);
    const sell = normBrokerCode(r.sellerBroker);
    return matchedCodes.includes(buy) || matchedCodes.includes(sell);
  });

  if (rows.length < 30) {
    const extra: FloorsheetRow[] = [];
    for (const code of matchedCodes.slice(0, 3)) {
      try {
        const [buy1, sell1] = await Promise.all([
          loadFloorsheet(1, 100, { buyerMemberId: code }),
          loadFloorsheet(1, 100, { sellerMemberId: code }),
        ]);
        extra.push(...buy1.rows, ...sell1.rows);
      } catch {
        // ignore
      }
    }
    if (extra.length) {
      const byId = new Map<string, FloorsheetRow>();
      for (const r of [...rows, ...extra]) {
        const id = String(
          r.contractId ||
            `${r.symbol}-${r.buyerBroker}-${r.sellerBroker}-${r.quantity}`,
        );
        if (!byId.has(id)) byId.set(id, r);
      }
      rows = [...byId.values()];
    }
  }

  mergeBrokerNamesFromRows(nameDir, rows);
  const board = buildBrokerTopBuySellBoard(rows, brokerDir, nameDir);
  return board.brokers.filter((b) => matchedCodes.includes(b.code));
}

export async function loadPremiumIntel(
  kind: PremiumIntelKind,
  limit = 50,
): Promise<PremiumIntelSnapshot> {
  switch (kind) {
    case 'top-buyers':
      return loadFromFloorsheetSide('buy', limit);
    case 'top-sellers':
      return loadFromFloorsheetSide('sell', limit);
    case 'top-holders':
      return loadNetIntel('holders', limit);
    case 'top-releases':
      return loadNetIntel('releases', limit);
    case 'broker-favorites':
      return loadBrokerFavorites(limit);
    case 'broker-top-buy-sell':
      return loadBrokerTopBuySell(limit);
    default:
      return loadFromFloorsheetSide('buy', limit);
  }
}

export async function loadFiftyTwoWeekRows(
  mode: 'high' | 'low',
  limit = 60,
): Promise<{
  rows: FiftyTwoWeekRow[];
  summary: IntelMetric[];
  asOf: string;
  sourceNote: string;
}> {
  const asOf = await resolveLiveMarketDate();
  const mini = await loadMiniScreener(true);
  const rows = mini
    .map((s) => {
      const ltp = s.ltp;
      const high = s.fiftyTwoWeekHigh;
      const low = s.fiftyTwoWeekLow;
      if (!ltp || !high || !low) return null;
      const pctFromHigh = ((ltp - high) / high) * 100;
      const pctFromLow = ((ltp - low) / low) * 100;
      if (mode === 'high') {
        if (pctFromHigh < -25) return null;
      } else if (pctFromLow > 25) return null;

      const score =
        mode === 'high'
          ? 100 + pctFromHigh + (s.changePercent ?? 0)
          : 100 - pctFromLow - Math.abs(s.changePercent ?? 0);

      const signal =
        mode === 'high'
          ? pctFromHigh >= -1
            ? 'At or breaking 52-week high zone'
            : `Within ${Math.abs(pctFromHigh).toFixed(1)}% of 52W high`
          : pctFromLow <= 1
            ? 'At or breaking 52-week low zone'
            : `Within ${Math.abs(pctFromLow).toFixed(1)}% of 52W low`;

      return {
        rank: 0,
        symbol: s.symbol,
        name: s.name,
        ltp,
        high52: high,
        low52: low,
        pctFromHigh,
        pctFromLow,
        changePct: s.changePercent,
        volume: s.volume,
        turnover: s.turnover,
        sector: s.sector,
        signal,
        score,
        metrics: [
          { label: '52W high', value: fmtNum(high) },
          { label: '52W low', value: fmtNum(low) },
          { label: 'Range', value: `${fmtNum(low)} – ${fmtNum(high)}` },
          {
            label: mode === 'high' ? 'From high' : 'From low',
            value:
              mode === 'high'
                ? `${pctFromHigh >= 0 ? '+' : ''}${pctFromHigh.toFixed(2)}%`
                : `${pctFromLow >= 0 ? '+' : ''}${pctFromLow.toFixed(2)}%`,
            tone: mode === 'high' ? (pctFromHigh >= 0 ? 'up' : 'neutral') : (pctFromLow <= 0 ? 'down' : 'neutral'),
          },
          { label: 'Turnover', value: s.turnover != null ? formatRs(s.turnover) : '—' },
          { label: 'Mcap', value: fmtMcap(s.marketCap) },
        ],
      };
    })
    .filter(Boolean) as Array<FiftyTwoWeekRow & { score: number }>;

  const sorted = rows
    .sort((a, b) =>
      mode === 'high' ? b.pctFromHigh! - a.pctFromHigh! : a.pctFromLow! - b.pctFromLow!,
    )
    .slice(0, limit)
    .map((r, i) => {
      const { score: _s, ...rest } = r;
      return { ...rest, rank: i + 1 };
    });

  return {
    rows: sorted,
    summary: [
      { label: 'Universe', value: String(mini.length) },
      { label: 'Matched', value: String(sorted.length) },
      { label: 'Mode', value: mode === 'high' ? 'Near 52W high' : 'Near 52W low' },
      { label: 'As of', value: asOf },
    ],
    asOf,
    sourceNote:
      'Uses live mini-screener LTP (not broker floorsheet). Rankings update with today’s prices even when Merolagani floorsheet lags.',
  };
}

export { formatRs, fmtNum, fmtMcap };

export type AggressiveBrokerCard = {
  code: string;
  name: string;
  iconUrl: string | null;
  holdQty: number;
  holdPct: number;
  buyQty: number;
};

export type AggressiveHolderStock = {
  symbol: string;
  name: string;
  iconUrl: string | null;
  ltp: number | null;
  change: number | null;
  changePct: number | null;
  /** Approx. volume / listed shares (% of equity traded). */
  publicTradePct: number | null;
  brokersInvolved: number;
  top3HoldingPct: number;
  totalTradedQty: number;
  topBrokers: AggressiveBrokerCard[];
  score: number;
};

export type AggressiveHolderBoard = {
  stocks: AggressiveHolderStock[];
  sessionDate: string | null;
  priorSessionReason?: string | null;
  brokerBreakdown: boolean;
  tradesScanned: number;
};

function countBrokersOnSymbol(rows: FloorsheetRow[], symbol: string): number {
  const set = new Set<string>();
  const sym = symbol.toUpperCase();
  for (const r of rows) {
    if (r.symbol.toUpperCase() !== sym) continue;
    const buy = normBrokerCode(r.buyerBroker ?? '');
    const sell = normBrokerCode(r.sellerBroker ?? '');
    if (buy) set.add(buy);
    if (sell) set.add(sell);
  }
  return set.size;
}

/**
 * Stock-centric "Broker Aggressive Holders" board:
 * symbols where top brokers show concentrated net buying on the session floorsheet.
 */
function buildAggressiveBoard(
  rows: FloorsheetRow[],
  screener: Map<string, MiniScreenerRow>,
  brokerDir: Map<string, BrokerInfo>,
  nameDir: Map<string, string>,
  limit: number,
): AggressiveHolderBoard {
  const sessionDate =
    floorsheetMeta.date ?? sessionDateFromRows(rows, null);

  if (!hasBrokerData(rows)) {
    const stocks = [...screener.values()]
      .filter((s) => (s.changePercent ?? 0) > 1 && (s.volume ?? 0) > 0)
      .map((s) => {
        const vol = s.volume ?? 0;
        const listed = s.listedShares ?? 0;
        const publicTradePct =
          listed > 0 ? Math.round((vol / listed) * 10000) / 100 : null;
        const change =
          s.ltp != null && s.previousClose != null
            ? s.ltp - s.previousClose
            : s.change;
        return {
          symbol: s.symbol,
          name: s.name,
          iconUrl: s.iconUrl,
          ltp: s.ltp,
          change,
          changePct: s.changePercent,
          publicTradePct,
          brokersInvolved: 0,
          top3HoldingPct: 0,
          totalTradedQty: vol,
          topBrokers: [] as AggressiveBrokerCard[],
          score:
            Math.abs(s.changePercent ?? 0) *
            Math.log10((s.turnover ?? 0) + 10),
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      stocks: limit > 0 ? stocks.slice(0, limit) : stocks,
      sessionDate,
      brokerBreakdown: false,
      tradesScanned: rows.length,
    };
  }

  const net = buildNetAgg(rows);
  type SymBucket = {
    symbol: string;
    name: string;
    iconUrl: string | null;
    brokers: Array<{
      code: string;
      holdQty: number;
      buyQty: number;
    }>;
    totalHold: number;
    totalBuy: number;
  };

  const bySym = new Map<string, SymBucket>();
  for (const n of net.values()) {
    if (n.qty <= 0) continue;
    const sym = n.symbol.toUpperCase();
    const s = screener.get(sym);
    let bucket = bySym.get(sym);
    if (!bucket) {
      bucket = {
        symbol: n.symbol,
        name: s?.name ?? n.name,
        iconUrl: s?.iconUrl ?? n.iconUrl,
        brokers: [],
        totalHold: 0,
        totalBuy: 0,
      };
      bySym.set(sym, bucket);
    }
    const holdQty = Math.abs(n.qty);
    const code = normBrokerCode(n.broker);
    if (!code) continue;
    bucket.brokers.push({
      code,
      holdQty,
      buyQty: n.buyQty,
    });
    bucket.totalHold += holdQty;
    bucket.totalBuy += n.buyQty;
  }

  const stocks: AggressiveHolderStock[] = [];
  for (const bucket of bySym.values()) {
    if (bucket.totalHold <= 0) continue;
    const s = screener.get(bucket.symbol.toUpperCase());
    bucket.brokers.sort((a, b) => b.holdQty - a.holdQty);
    const top3 = bucket.brokers.slice(0, 3);
    const top3Hold = top3.reduce((sum, b) => sum + b.holdQty, 0);
    const top3HoldingPct =
      bucket.totalHold > 0
        ? Math.round((top3Hold / bucket.totalHold) * 10000) / 100
        : 0;

    const vol = s?.volume ?? bucket.totalBuy;
    const listed = s?.listedShares ?? 0;
    const publicTradePct =
      listed > 0 ? Math.round((vol / listed) * 10000) / 100 : null;
    const change =
      s?.ltp != null && s?.previousClose != null
        ? s.ltp - s.previousClose
        : s?.change ?? null;
    const changePct = s?.changePercent ?? null;

    const topBrokers: AggressiveBrokerCard[] = top3.map((b) => {
      const key = normBrokerCode(b.code);
      const info = brokerDir.get(key);
      const floorName = nameDir.get(key) ?? '';
      const name =
        info?.name ||
        (looksLikeBrokerFirm(floorName) ? floorName : null) ||
        `Broker ${key}`;
      return {
        code: key,
        name,
        iconUrl: info?.iconUrl ?? brokerIcon(key, brokerDir),
        holdQty: b.holdQty,
        holdPct:
          bucket.totalHold > 0
            ? Math.round((b.holdQty / bucket.totalHold) * 10000) / 100
            : 0,
        buyQty: b.buyQty,
      };
    });

    const brokersInvolved = countBrokersOnSymbol(rows, bucket.symbol);

    stocks.push({
      symbol: bucket.symbol,
      name: bucket.name,
      iconUrl: bucket.iconUrl,
      ltp: s?.ltp ?? null,
      change,
      changePct,
      publicTradePct,
      brokersInvolved: brokersInvolved || bucket.brokers.length,
      top3HoldingPct,
      totalTradedQty: vol,
      topBrokers,
      score:
        (top3HoldingPct || 1) *
        Math.log10(bucket.totalHold + 10) *
        (1 + Math.max(0, changePct ?? 0) / 10),
    });
  }

  stocks.sort((a, b) => b.score - a.score);

  return {
    stocks: limit > 0 ? stocks.slice(0, limit) : stocks,
    sessionDate,
    brokerBreakdown: true,
    tradesScanned: rows.length,
  };
}

export async function loadAggressiveHolderStocks(
  limit = 0,
): Promise<AggressiveHolderBoard> {
  const [rows, screener, brokers] = await Promise.all([
    loadSessionFloorsheet(),
    screenerMap(),
    loadBrokers(),
  ]);
  const brokerDir = brokerDirectoryMap(brokers);
  const directory = nameDirectory(brokers);
  mergeBrokerNamesFromRows(directory, rows);
  return buildAggressiveBoard(rows, screener, brokerDir, directory, limit);
}

/** Progressive load — paints the first stock cards as floorsheet pages arrive. */
export async function streamAggressiveHolderStocks(
  onUpdate: (
    board: AggressiveHolderBoard,
    meta: { partial: boolean },
  ) => void,
  limit = 0,
): Promise<AggressiveHolderBoard> {
  // Always reload broker directory so logos are present (TMS list with CDN urls).
  brokerCache = null;
  brokerCacheAt = 0;

  const liveDate = await resolveLiveMarketDate();

  const [screener, brokers] = await Promise.all([
    screenerMap(),
    loadBrokers(),
  ]);
  const brokerDir = brokerDirectoryMap(brokers);
  const directory = nameDirectory(brokers);

  let last: AggressiveHolderBoard = {
    stocks: [],
    sessionDate: null,
    priorSessionReason: null,
    brokerBreakdown: false,
    tradesScanned: 0,
  };

  const emit = (
    rows: FloorsheetRow[],
    partial: boolean,
    publishedDate: string | null,
  ) => {
    mergeBrokerNamesFromRows(directory, rows);
    const board = buildAggressiveBoard(
      rows,
      screener,
      brokerDir,
      directory,
      limit,
    );
    const sessionDate = publishedDate ?? board.sessionDate;
    last = {
      ...board,
      sessionDate,
      priorSessionReason: priorSessionReason(sessionDate, liveDate),
    };
    onUpdate(last, { partial });
  };

  const ingest = (
    rows: FloorsheetRow[],
    meta: { done: boolean; asOf: string | null },
  ) => {
    const asOf = sessionDateFromRows(rows, meta.asOf);
    rememberFloorsheet(rows, asOf);
    emit(rows, !meta.done, asOf);
  };

  // Deep floorsheet load — Acc/Dis thin cache (4 pages) often misses SAIL-like names.
  try {
    await loadMerolaganiFloorsheetProgressive((rows, meta) => {
      ingest(rows, meta);
    }, MERO_AGGRESSIVE_PAGES);
  } catch {
    const rows = await loadSessionFloorsheet(true);
    emit(rows, false, sessionDateFromRows(rows, floorsheetMeta.date));
  }

  return last;
}

/**
 * Priority fetch for a single searched symbol (e.g. SAIL) before the full
 * progressive board has reached it.
 */
export async function loadAggressiveHolderForSymbol(
  symbol: string,
): Promise<AggressiveHolderStock | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (sym.length < 2) return null;

  const [screener, brokers] = await Promise.all([
    screenerMap(),
    loadBrokers(),
  ]);
  const brokerDir = brokerDirectoryMap(brokers);
  const directory = nameDirectory(brokers);
  const s = screener.get(sym);

  // 1) Rows already downloaded in the progressive session cache
  let rows = (floorsheetCache ?? []).filter(
    (r) => r.symbol.toUpperCase() === sym,
  );

  // 2) Merolagani filtered by company (real broker codes) — highest priority source
  try {
    const { rows: mero, asOf } = await loadMerolaganiFloorsheetForSymbol(sym, 5);
    if (mero.length) {
      rows = mero;
      if (asOf && !floorsheetMeta.date) {
        floorsheetMeta = { ...floorsheetMeta, date: asOf };
      }
    }
  } catch {
    // continue with ShareHub / cache
  }

  // 3) ShareHub floorsheet by symbol as fallback / supplement
  if (rows.length < 10 || !hasBrokerData(rows)) {
    try {
      const extra: FloorsheetRow[] = [];
      for (let p = 1; p <= 4; p++) {
        const page = await loadFloorsheet(p, 200, { symbol: sym });
        extra.push(...page.rows);
        if (!page.hasNext) break;
      }
      if (extra.length) {
        const byId = new Map<string, FloorsheetRow>();
        for (const r of [...rows, ...extra]) {
          const id = String(r.contractId || `${r.symbol}-${r.quantity}-${r.rate}-${r.buyerBroker}`);
          if (!byId.has(id)) byId.set(id, r);
        }
        rows = [...byId.values()];
      }
    } catch {
      // ignore
    }
  }

  if (!rows.length) {
    if (!s) return null;
    return {
      symbol: s.symbol,
      name: s.name,
      iconUrl: s.iconUrl,
      ltp: s.ltp,
      change:
        s.ltp != null && s.previousClose != null
          ? s.ltp - s.previousClose
          : s.change,
      changePct: s.changePercent,
      publicTradePct:
        s.listedShares && s.volume
          ? Math.round((s.volume / s.listedShares) * 10000) / 100
          : null,
      brokersInvolved: 0,
      top3HoldingPct: 0,
      totalTradedQty: s.volume ?? 0,
      topBrokers: [],
      score: 0,
    };
  }

  mergeBrokerNamesFromRows(directory, rows);
  const board = buildAggressiveBoard(rows, screener, brokerDir, directory, 0);
  const hit =
    board.stocks.find((x) => x.symbol.toUpperCase() === sym) ?? null;
  if (hit) return hit;

  // buildAggressiveBoard may drop symbols with no net holders — synthesize from rows
  if (!s && !rows.length) return null;
  return {
    symbol: sym,
    name: s?.name ?? rows[0]?.name ?? sym,
    iconUrl: s?.iconUrl ?? rows[0]?.iconUrl ?? null,
    ltp: s?.ltp ?? null,
    change:
      s?.ltp != null && s?.previousClose != null
        ? s.ltp - s.previousClose
        : s?.change ?? null,
    changePct: s?.changePercent ?? null,
    publicTradePct:
      s?.listedShares && s?.volume
        ? Math.round((s.volume / s.listedShares) * 10000) / 100
        : null,
    brokersInvolved: countBrokersOnSymbol(rows, sym),
    top3HoldingPct: 0,
    totalTradedQty:
      s?.volume ?? rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0),
    topBrokers: [],
    score: 1,
  };
}

