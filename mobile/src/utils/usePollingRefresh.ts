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
  // Default OFF: wiping caches on every tick forced cold 4–5s reloads on
  // every polled screen. Loaders have their own TTLs (e.g. 20s todays-price)
  // so background refreshes still pick up fresh data without a cache wipe.
  const invalidate = opts.invalidate === true;

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
      // Skip the old 2s "soon" tick — it fought first scroll/press after open.
      // First interval fires after a full period of quiet focus.
      const id = setInterval(tick, intervalMs);
      return () => {
        active = false;
        clearInterval(id);
      };
    }, [intervalMs, enabled, invalidate]),
  );
}
