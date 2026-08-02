import { AUTH_API_BASE } from '../auth/config';
import { fetchWithTimeout } from './fetchWithTimeout';
import type { PremiumIntelSnapshot } from './brokerAnalytics';

export type BrokerFlowServerKind = 'accumulation' | 'distribution';

const MOBILE_TO_SERVER: Record<
  'top-holders' | 'top-releases',
  BrokerFlowServerKind
> = {
  'top-holders': 'accumulation',
  'top-releases': 'distribution',
};

/**
 * Shared Acc/Dis board from api.nepseghar.com (Postgres cache for all users).
 * Returns null when empty / offline so the phone can fall back to Merolagani.
 */
export async function fetchBrokerFlowFromServer(
  kind: 'top-holders' | 'top-releases',
): Promise<(PremiumIntelSnapshot & { maxContractId?: number }) | null> {
  const serverKind = MOBILE_TO_SERVER[kind];
  try {
    // Allow longer wait on cold cache — server scrapes Merolagani once for
    // everyone; warm responses still return in ~1s.
    const res = await fetchWithTimeout(
      `${AUTH_API_BASE}/app/premium/broker-flow/${serverKind}`,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      },
      45_000,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as PremiumIntelSnapshot & {
      maxContractId?: number;
      rows?: PremiumIntelSnapshot['rows'];
    };
    if (!json?.rows?.length) return null;
    return json;
  } catch {
    return null;
  }
}
