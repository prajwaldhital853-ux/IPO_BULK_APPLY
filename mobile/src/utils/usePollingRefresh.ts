import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';
import { invalidateMarketCaches } from '../services/nepse/invalidateMarketCaches';

export const MARKET_POLL_MS = 20_000;

/**
 * Silently re-fetch while this screen is focused (every 20s by default).
 * Pass `silent=true` from the callback to skip loading spinners.
 */
export function usePollingRefresh(
  refresh: (silent?: boolean) => void | Promise<void>,
  intervalMs = MARKET_POLL_MS,
  enabled = true,
  opts: { invalidate?: boolean } = {},
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const invalidate = opts.invalidate !== false;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let active = true;
      const tick = () => {
        if (!active) return;
        // Clearing caches on every tick forces a cold 4–5s reload — opt out when
        // the screen already streams/updates from warm data.
        if (invalidate) invalidateMarketCaches();
        void refreshRef.current(true);
      };
      // Refresh soon after open, then every interval.
      const soon = setTimeout(tick, 2000);
      const id = setInterval(tick, intervalMs);
      return () => {
        active = false;
        clearTimeout(soon);
        clearInterval(id);
      };
    }, [intervalMs, enabled, invalidate]),
  );
}
