import { nepseFetchJson } from './http';
import { sessionStatus } from './calendar';
import { nepalTodayIso, setAdminClosedDays } from './holidays';
import { fetchMarketClosures } from './marketClosures';
import { iconUri } from './screener';
import { fetchSharehubSnapshot } from './sharehub';
import type {
  ChartPoint,
  IndexQuote,
  MarketStatus,
  MarketSummary,
  MoverRow,
  NepseMarketSnapshot,
  SecurityQuote,
  TransactionRow,
  TradedShareRow,
  TurnoverRow,
} from './types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISK_KEY = 'nepse.market.snapshot.v1';
let lastSnapshot: NepseMarketSnapshot | null = null;
let hydratePromise: Promise<NepseMarketSnapshot | null> | null = null;

export function invalidateNepseMarketCache(): void {
  lastSnapshot = null;
  void AsyncStorage.removeItem(DISK_KEY).catch(() => undefined);
}

/** Instant paint for Market tab — last good live snapshot (may be seconds old). */
export function peekNepseMarketSnapshot(): NepseMarketSnapshot | null {
  return lastSnapshot;
}

/** Cold-start warm paint from disk (call once when opening Market). */
export async function hydrateNepseMarketCache(): Promise<NepseMarketSnapshot | null> {
  if (lastSnapshot) return lastSnapshot;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(DISK_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as NepseMarketSnapshot;
        if (!parsed || typeof parsed !== 'object') return null;
        lastSnapshot = parsed;
        return parsed;
      } catch {
        return null;
      } finally {
        hydratePromise = null;
      }
    })();
  }
  return hydratePromise;
}

function persistSnapshot(snap: NepseMarketSnapshot): void {
  lastSnapshot = snap;
  void AsyncStorage.setItem(DISK_KEY, JSON.stringify(snap)).catch(() => undefined);
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] != null) return obj[k] as T;
  }
  return undefined;
}

function asArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    for (const k of ['data', 'content', 'result', 'items']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

function emptySummary(): MarketSummary {
  return {
    businessDate: null,
    index: null,
    indexChange: null,
    indexPct: null,
    turnover: null,
    tradedShares: null,
    transactions: null,
    scripsTraded: null,
    advanced: null,
    declined: null,
    unchanged: null,
  };
}

function parseSecurity(row: Record<string, unknown>): SecurityQuote {
  const iconRaw = pick(row, ['iconUrl', 'icon', 'logo', 'imageUrl']);
  return {
    symbol: str(pick(row, ['symbol', 'scrip', 'stockSymbol', 'securitySymbol'])),
    name: str(
      pick(row, ['securityName', 'companyName', 'name', 'security_name']),
    ),
    ltp: num(
      pick(row, ['ltp', 'lastTradedPrice', 'closingPrice', 'close']),
    ),
    change: num(pick(row, ['change', 'pointChange', 'point_change'])),
    pct: num(
      pick(row, [
        'percentageChange',
        'percentage_change',
        'perChange',
        'pct',
        'changePercent',
      ]),
    ),
    qty: num(
      pick(row, [
        'totalTradedQuantity',
        'total_traded_quantity',
        'quantity',
        'totalTradeQuantity',
        'qty',
      ]),
    ),
    iconUrl:
      typeof iconRaw === 'string' ? iconUri(iconRaw) : null,
  };
}

async function fetchOfficialSecurities(): Promise<SecurityQuote[]> {
  const hit = await nepseFetchJson('/security/today-price');
  if (!hit) return [];
  return asArray(hit.json)
    .filter((r) => r && typeof r === 'object')
    .map((r) => parseSecurity(r as Record<string, unknown>))
    .filter((r) => r.symbol);
}

function hasLiveData(summary: MarketSummary, securities: SecurityQuote[]): boolean {
  return (
    summary.index != null ||
    summary.turnover != null ||
    summary.tradedShares != null ||
    securities.length > 0
  );
}

function statusNote(status: MarketStatus, hasData: boolean): string {
  const session = sessionStatus();
  if (!hasData) {
    return 'Could not load live NEPSE numbers. Pull to refresh.';
  }
  if (status === 'open') return 'Market is open (live NEPSE)';
  if (status === 'closed') {
    if (session === 'closed') return 'Market closed (holiday / weekend)';
    if (session === 'before') return 'Pre-market — opens 11:00 AM NPT';
    if (session === 'after') return 'Session ended for today';
    return 'Market closed';
  }
  if (session === 'open') return 'Likely open (session hours)';
  if (session === 'before') return 'Pre-market — opens 11:00 AM NPT';
  if (session === 'after') return 'After hours';
  if (session === 'closed') return 'No trading today';
  return 'Status unavailable';
}

function mergeSecurityLists(
  primary: SecurityQuote[],
  official: SecurityQuote[],
): SecurityQuote[] {
  if (!official.length) return primary;
  const map = new Map<string, SecurityQuote>();
  for (const row of official) map.set(row.symbol, row);
  for (const row of primary) {
    const prev = map.get(row.symbol);
    if (!prev) {
      map.set(row.symbol, row);
      continue;
    }
    map.set(row.symbol, {
      symbol: row.symbol,
      name: row.name || prev.name,
      ltp: prev.ltp ?? row.ltp,
      change: prev.change ?? row.change,
      pct: prev.pct ?? row.pct,
      qty: prev.qty ?? row.qty,
      iconUrl: row.iconUrl ?? prev.iconUrl ?? null,
    });
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function buildSnapshot(
  partial: {
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
  },
  source: NepseMarketSnapshot['source'],
): NepseMarketSnapshot {
  const live = hasLiveData(partial.summary, partial.securities);
  return {
    status: partial.status,
    statusNote: statusNote(partial.status, live),
    asOf: partial.asOf,
    summary: {
      ...partial.summary,
      businessDate: partial.summary.businessDate ?? nepalTodayIso(),
    },
    indices: partial.indices,
    gainers: partial.gainers,
    losers: partial.losers,
    turnovers: partial.turnovers,
    transactions: partial.transactions,
    tradedShares: partial.tradedShares,
    subIndices: partial.subIndices,
    securities: partial.securities,
    chartPoints: partial.chartPoints,
    fetchedAt: new Date().toISOString(),
    source: live ? source : 'offline',
  };
}

function emptySnapshot(): NepseMarketSnapshot {
  return buildSnapshot(
    {
      status: 'unknown',
      asOf: null,
      summary: emptySummary(),
      indices: [],
      gainers: [],
      losers: [],
      turnovers: [],
      transactions: [],
      tradedShares: [],
      subIndices: [],
      securities: [],
      chartPoints: [],
    },
    'offline',
  );
}

/**
 * Live NEPSE market snapshot — prefers ShareHub (fast path), then enriches.
 * Callers should `peek` / `hydrate` for instant paint, then call this to revalidate.
 */
export async function loadNepseMarketSnapshot(
  opts: { allowCache?: boolean } = {},
): Promise<NepseMarketSnapshot> {
  const allowCache = opts.allowCache !== false;
  // Keep unexpected closed days in sync for session / trading-day checks.
  void fetchMarketClosures()
    .then((rows) =>
      setAdminClosedDays(
        rows.map((c) => ({
          date: c.date,
          title: c.title,
          notice: c.notice,
          color: c.color,
        })),
      ),
    )
    .catch(() => undefined);

  try {
    // Don't block the Market board on the slower official securities call.
    const sharehubPromise = fetchSharehubSnapshot();
    const officialPromise = fetchOfficialSecurities().catch(() => [] as SecurityQuote[]);

    const sharehub = await sharehubPromise;
    if (sharehub) {
      let officialSecurities: SecurityQuote[] = [];
      try {
        officialSecurities = await Promise.race([
          officialPromise,
          new Promise<SecurityQuote[]>((resolve) =>
            setTimeout(() => resolve([]), 350),
          ),
        ]);
      } catch {
        officialSecurities = [];
      }

      const securities = mergeSecurityLists(
        sharehub.securities,
        officialSecurities,
      );
      const snapshot = buildSnapshot({ ...sharehub, securities }, 'live');
      persistSnapshot(snapshot);

      // Finish merging icons/qty in the background if official was still loading.
      void officialPromise.then((full) => {
        if (!full.length) return;
        const merged = buildSnapshot(
          {
            ...sharehub,
            securities: mergeSecurityLists(sharehub.securities, full),
          },
          'live',
        );
        persistSnapshot(merged);
      });

      return snapshot;
    }

    const officialSecurities = await officialPromise;
    if (officialSecurities.length) {
      const session = sessionStatus();
      const status: MarketStatus = session === 'open' ? 'open' : 'closed';
      const snapshot = buildSnapshot(
        {
          status,
          asOf: new Date().toISOString(),
          summary: emptySummary(),
          indices: [],
          gainers: [],
          losers: [],
          turnovers: [],
          transactions: [],
          tradedShares: [],
          subIndices: [],
          securities: officialSecurities,
          chartPoints: [],
        },
        'live',
      );
      persistSnapshot(snapshot);
      return snapshot;
    }

    if (allowCache && lastSnapshot) {
      return { ...lastSnapshot, source: 'cached' };
    }
    const fallback = emptySnapshot();
    persistSnapshot(fallback);
    return fallback;
  } catch {
    if (allowCache && lastSnapshot) {
      return { ...lastSnapshot, source: 'cached' };
    }
    return emptySnapshot();
  }
}

export { sessionStatus, nepalTodayIso };
