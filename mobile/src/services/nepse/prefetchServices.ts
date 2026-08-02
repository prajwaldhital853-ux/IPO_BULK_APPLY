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
import {
  isPrefetchPaused,
  waitIfPrefetchPaused,
} from './prefetchGate';

let started = false;
let hotPremiumStarted = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function yieldToUi(): Promise<void> {
  await waitIfPrefetchPaused(10_000);
  // Extra beat so scroll/press handlers run before the next network/CPU chunk.
  await sleep(40);
}

/**
 * Warm caches for Services screens after app open so tools open instantly.
 * Yields whenever the user navigates so taps/transitions stay snappy.
 */
export function prefetchServicesData(): void {
  if (started) return;
  started = true;

  void (async () => {
    await yieldToUi();
    // Wave 1 — core market snapshot + screener (Home Market + Services)
    await Promise.allSettled([
      loadMiniScreener(),
      loadNepseMarketSnapshot({ allowCache: true }),
    ]);

    await sleep(4000);
    await yieldToUi();
    // Wave 2 — light Acc/Dis + favorites only (heavy Phase-1 fan-out later)
    if (!isPrefetchPaused()) {
      prefetchBrokerFlowIntel();
      void loadPremiumIntel('broker-favorites').catch(() => null);
    }

    await sleep(8000);
    await yieldToUi();
    // Wave 3 — extra info tools (cheap JSON endpoints)
    await Promise.allSettled([
      loadGlobalIndices(),
      loadMarketIndicators(),
      loadForexRates(),
      loadFuelPrices(),
      loadGoldSilver(),
    ]);

    await sleep(10_000);
    await yieldToUi();
    // Wave 4 — free lists + first floorsheet page
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
 * Called when Services is focused — warm a few hot boards after the tab settles.
 * Never runs while a stack push is in progress (prefetch gate).
 */
export function prefetchHotPremiumTools(): void {
  if (hotPremiumStarted) return;
  if (isPrefetchPaused()) {
    setTimeout(() => {
      if (!isPrefetchPaused()) prefetchHotPremiumTools();
    }, 2000);
    return;
  }
  hotPremiumStarted = true;

  void (async () => {
    try {
      await yieldToUi();
      await loadMiniScreener().catch(() => null);
      await yieldToUi();
      // Staggered / light screener warm — not all 10 kinds at once.
      prefetchPremiumScreeners();
      await yieldToUi();
      prefetchFinancialReportsFeed();
      await yieldToUi();
      prefetchBrokerFlowIntel();
      await yieldToUi();
      void loadNepseMarketSnapshot({ allowCache: true }).catch(() => null);
      void loadMarketPulse().catch(() => null);
      void loadPremiumIntel('broker-favorites').catch(() => null);
    } catch {
      // best-effort
    } finally {
      setTimeout(() => {
        hotPremiumStarted = false;
      }, 45_000);
    }
  })();
}
