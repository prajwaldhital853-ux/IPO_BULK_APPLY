import { nepseFetchJson } from './http';
import { sessionStatus } from './calendar';
import { nepalTodayIso } from './holidays';
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

let lastSnapshot: NepseMarketSnapshot | null = null;

export function invalidateNepseMarketCache(): void {
  lastSnapshot = null;
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

export async function loadNepseMarketSnapshot(
  opts: { allowCache?: boolean } = {},
): Promise<NepseMarketSnapshot> {
  const allowCache = opts.allowCache !== false;
  try {
    const [sharehub, officialSecurities] = await Promise.all([
      fetchSharehubSnapshot(),
      fetchOfficialSecurities(),
    ]);

    if (sharehub) {
      const securities = mergeSecurityLists(
        sharehub.securities,
        officialSecurities,
      );
      const snapshot = buildSnapshot(
        { ...sharehub, securities },
        'live',
      );
      lastSnapshot = snapshot;
      return snapshot;
    }

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
      lastSnapshot = snapshot;
      return snapshot;
    }

    const fallback = buildSnapshot(
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
    lastSnapshot = fallback;
    return fallback;
  } catch {
    if (allowCache && lastSnapshot) {
      return { ...lastSnapshot, source: 'cached' };
    }
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
}

export { sessionStatus, nepalTodayIso };
