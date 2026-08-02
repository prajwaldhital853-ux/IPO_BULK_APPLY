import { AUTH_API_BASE } from '../auth/config';
import { fetchWithTimeout } from './fetchWithTimeout';
import type {
  AggressiveHolderBoard,
  BrokerTopBuySellBoard,
  FiftyTwoWeekRow,
  NetSideBoard,
  PremiumIntelSnapshot,
  TopSideBoard,
} from './brokerAnalytics';
import type { PremiumScreenerSnapshot } from './premiumScreeners';

export type BrokerFlowServerKind =
  | 'accumulation'
  | 'distribution'
  | 'top-buyers'
  | 'top-sellers'
  | 'net-holders'
  | 'net-releases'
  | 'aggressive-holders'
  | 'broker-top-buy-sell'
  | 'fifty-two-week-high'
  | 'fifty-two-week-low'
  | 'unlock-period'
  | 'broker-favorites';

const MOBILE_ACC_DIS: Record<
  'top-holders' | 'top-releases',
  'accumulation' | 'distribution'
> = {
  'top-holders': 'accumulation',
  'top-releases': 'distribution',
};

type ServerMeta = {
  maxContractId?: number;
  fetchedAt?: string | null;
  cacheSource?: string;
  kind?: string;
};

async function fetchBoardJson(
  serverKind: string,
  timeoutMs = 45_000,
): Promise<(Record<string, unknown> & ServerMeta) | null> {
  try {
    const res = await fetchWithTimeout(
      `${AUTH_API_BASE}/app/premium/broker-flow/${serverKind}`,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      },
      timeoutMs,
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown> & ServerMeta;
  } catch {
    return null;
  }
}

/**
 * Shared Acc/Dis board from api.nepseghar.com (Postgres cache for all users).
 * Returns null when empty / offline so the phone can fall back to Merolagani.
 */
export async function fetchBrokerFlowFromServer(
  kind: 'top-holders' | 'top-releases',
): Promise<(PremiumIntelSnapshot & { maxContractId?: number }) | null> {
  const serverKind = MOBILE_ACC_DIS[kind];
  const json = await fetchBoardJson(serverKind);
  if (!json?.rows || !Array.isArray(json.rows) || !json.rows.length) {
    return null;
  }
  return json as unknown as PremiumIntelSnapshot & { maxContractId?: number };
}

export async function fetchTopSideBoardFromServer(
  side: 'buy' | 'sell',
): Promise<(TopSideBoard & ServerMeta) | null> {
  const json = await fetchBoardJson(
    side === 'buy' ? 'top-buyers' : 'top-sellers',
  );
  if (!json?.rows || !Array.isArray(json.rows) || !json.rows.length) {
    return null;
  }
  return {
    ...(json as unknown as TopSideBoard),
    side,
    maxContractId: json.maxContractId,
  };
}

export async function fetchNetSideBoardFromServer(
  mode: 'holders' | 'releases',
): Promise<(NetSideBoard & ServerMeta) | null> {
  const json = await fetchBoardJson(
    mode === 'holders' ? 'net-holders' : 'net-releases',
  );
  if (!json?.rows || !Array.isArray(json.rows) || !json.rows.length) {
    return null;
  }
  return {
    ...(json as unknown as NetSideBoard),
    mode,
    maxContractId: json.maxContractId,
  };
}

export async function fetchBrokerTopBuySellFromServer(): Promise<
  (BrokerTopBuySellBoard & ServerMeta) | null
> {
  const json = await fetchBoardJson('broker-top-buy-sell');
  if (!json?.brokers || !Array.isArray(json.brokers) || !json.brokers.length) {
    return null;
  }
  return json as unknown as BrokerTopBuySellBoard & ServerMeta;
}

export async function fetchAggressiveHoldersFromServer(): Promise<
  (AggressiveHolderBoard & ServerMeta) | null
> {
  const json = await fetchBoardJson('aggressive-holders', 90_000);
  if (!json?.stocks || !Array.isArray(json.stocks) || !json.stocks.length) {
    return null;
  }
  return json as unknown as AggressiveHolderBoard & ServerMeta;
}

export type FinancialReportsServerPayload = {
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: Array<{
    id: number;
    symbol: string;
    securityName: string;
    title: string;
    date: string;
    attachmentUrl: string | null;
    details: string;
    iconUrl: string | null;
  }>;
};

/**
 * Shared financial reports feed from Postgres.
 * Longer timeout — cold warm fans out ShareHub fundamentals.
 */
export async function fetchFinancialReportsFromServer(): Promise<FinancialReportsServerPayload | null> {
  try {
    const res = await fetchWithTimeout(
      `${AUTH_API_BASE}/app/premium/financial-reports`,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      },
      120_000,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as FinancialReportsServerPayload;
    if (!json?.rows?.length) return null;
    return json;
  } catch {
    return null;
  }
}

export type FiftyTwoWeekServerPayload = {
  rows: FiftyTwoWeekRow[];
  summary: Array<{ label: string; value: string; tone?: string }>;
  asOf: string;
  sourceNote: string;
};

export async function fetchFiftyTwoWeekFromServer(
  mode: 'high' | 'low',
): Promise<FiftyTwoWeekServerPayload | null> {
  const json = await fetchBoardJson(
    mode === 'high' ? 'fifty-two-week-high' : 'fifty-two-week-low',
  );
  if (!json?.rows || !Array.isArray(json.rows) || !json.rows.length) {
    return null;
  }
  return json as unknown as FiftyTwoWeekServerPayload;
}

export async function fetchUnlockPeriodFromServer(): Promise<PremiumScreenerSnapshot | null> {
  const json = await fetchBoardJson('unlock-period');
  if (!json?.rows || !Array.isArray(json.rows) || !json.rows.length) {
    return null;
  }
  return json as unknown as PremiumScreenerSnapshot;
}

export async function fetchBrokerFavoritesFromServer(): Promise<PremiumIntelSnapshot | null> {
  const json = await fetchBoardJson('broker-favorites');
  if (!json?.rows || !Array.isArray(json.rows) || !json.rows.length) {
    return null;
  }
  return json as unknown as PremiumIntelSnapshot;
}

/** Prefetch helper — warm Phase 1 Merolagani + light boards (best-effort). */
export async function prefetchPhase1BoardsFromServer(): Promise<void> {
  const kinds: BrokerFlowServerKind[] = [
    'accumulation',
    'distribution',
    'top-buyers',
    'top-sellers',
    'net-holders',
    'net-releases',
    'broker-top-buy-sell',
    'aggressive-holders',
    'fifty-two-week-high',
    'fifty-two-week-low',
    'unlock-period',
    'broker-favorites',
  ];
  await Promise.allSettled(kinds.map((k) => fetchBoardJson(k)));
}
