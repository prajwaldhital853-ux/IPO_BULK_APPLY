import { prefetchBrokerFlowIntel } from './brokerAnalytics';
import {
  loadForexRates,
  loadFuelPrices,
  loadGlobalIndices,
  loadGoldSilver,
  loadMarketIndicators,
} from './extraData';
import { loadNepseMarketSnapshot } from './market';
import { loadPremiumScreener } from './premiumScreeners';
import { loadStockFilter } from './premiumServices';
import { loadShareNewsProgressive } from './shareNews';
import {
  loadFloorsheet,
  loadMiniScreener,
  loadStockList,
} from './screener';

let started = false;

/**
 * Warm caches for Services screens after app open so tools open instantly.
 * Staggered waves avoid flooding the network on cold start.
 */
export function prefetchServicesData(): void {
  if (started) return;
  started = true;

  void (async () => {
    // Wave 1 — core market + Extra Information tools
    await Promise.allSettled([
      loadMiniScreener(),
      loadGlobalIndices(),
      loadMarketIndicators(),
      loadForexRates(),
      loadFuelPrices(),
      loadGoldSilver(),
      loadNepseMarketSnapshot({ allowCache: true }),
    ]);

    // Wave 2 — free lists + floorsheet + news
    await Promise.allSettled([
      loadStockList('trending'),
      loadStockList('large-caps'),
      loadStockList('commercial-leaders'),
      loadStockList('high-dividend'),
      loadFloorsheet(1, 50),
      loadShareNewsProgressive('merolagani', () => {}),
    ]);

    // Wave 3 — premium boards commonly opened from Services
    prefetchBrokerFlowIntel();
    await Promise.allSettled([
      loadStockFilter('gainers'),
      loadPremiumScreener('price-droppers'),
      loadPremiumScreener('rising-stocks'),
      loadPremiumScreener('small-caps'),
      loadPremiumScreener('value-pick'),
    ]);
  })();
}
