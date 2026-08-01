import {
  loadForexRates,
  loadFuelPrices,
  loadGlobalIndices,
  loadGoldSilver,
  loadMarketIndicators,
} from './extraData';
import { loadNepseMarketSnapshot } from './market';
import { prefetchPremiumScreeners } from './premiumScreeners';
import {
  loadStockFilter,
  prefetchFinancialReportsFeed,
} from './premiumServices';
import {
  loadFloorsheet,
  loadMiniScreener,
  loadStockList,
} from './screener';
import {
  loadPremiumIntel,
  prefetchBrokerFlowIntel,
} from './brokerAnalytics';
import { loadMarketPulse } from './premiumAnalytics';

let started = false;
let hotPremiumStarted = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Warm caches for Services screens after app open so tools open instantly.
 *
 * Kept deliberately light at first, then warms the premium boards users open
 * most (screeners, financial reports, floorsheet) so data paints on first tap.
 */
export function prefetchServicesData(): void {
  if (started) return;
  started = true;

  void (async () => {
    // Wave 1 — core market snapshot + screener (Home Market + Services)
    await Promise.allSettled([
      loadMiniScreener(),
      loadNepseMarketSnapshot({ allowCache: true }),
    ]);
    // Keep refreshing market in the background so Home → Market is warm.
    void loadNepseMarketSnapshot({ allowCache: true }).catch(() => null);

    // Wave 2 — premium boards users open from Services (do not wait 20s)
    await sleep(2500);
    prefetchHotPremiumTools();

    // Wave 3 — extra info tools (cheap JSON endpoints)
    await sleep(6000);
    await Promise.allSettled([
      loadGlobalIndices(),
      loadMarketIndicators(),
      loadForexRates(),
      loadFuelPrices(),
      loadGoldSilver(),
    ]);

    // Wave 4 — free lists + first floorsheet page
    await sleep(8000);
    await Promise.allSettled([
      loadStockList('trending'),
      loadStockList('large-caps'),
      loadStockList('commercial-leaders'),
      loadStockList('high-dividend'),
      loadFloorsheet(1, 50),
      loadStockFilter('gainers'),
    ]);
  })();
}

/**
 * Called when Services is focused — warm unlock/sector/rising + reports + floor.
 * Safe to call often; internal guards prevent duplicate fan-out.
 */
export function prefetchHotPremiumTools(): void {
  if (hotPremiumStarted) {
    // Still refresh screener boards if a previous run finished.
    prefetchPremiumScreeners();
    return;
  }
  hotPremiumStarted = true;

  void (async () => {
    try {
      await loadMiniScreener().catch(() => null);
      prefetchPremiumScreeners();
      prefetchFinancialReportsFeed();
      // Merolagani session floorsheet (shared by Top Buy/Sell / Aggressive / etc.)
      prefetchBrokerFlowIntel();
      // Light boards — Live Market Pulse + Broker Favorites open warm.
      void loadNepseMarketSnapshot({ allowCache: true }).catch(() => null);
      void loadMarketPulse().catch(() => null);
      void loadPremiumIntel('broker-favorites').catch(() => null);
    } catch {
      // best-effort
    } finally {
      setTimeout(() => {
        hotPremiumStarted = false;
      }, 20_000);
    }
  })();
}
