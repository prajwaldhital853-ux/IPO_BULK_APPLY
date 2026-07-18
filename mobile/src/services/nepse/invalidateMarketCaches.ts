import { invalidateBrokerAnalyticsCache } from './brokerAnalytics';
import { invalidateNepseMarketCache } from './market';
import { invalidatePublicOfferingCache } from './publicOffering';
import { invalidateScreenerCache } from './screener';

/** Bust in-memory market caches so the next fetch pulls fresh data. */
export function invalidateMarketCaches(): void {
  invalidateScreenerCache();
  invalidateBrokerAnalyticsCache();
  invalidatePublicOfferingCache();
  invalidateNepseMarketCache();
}
