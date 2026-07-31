import { useCallback, useRef, useState } from 'react';

/**
 * Shared pull-to-refresh state for ScrollView / FlatList RefreshControl.
 * Ignores overlapping refresh calls while one is in flight.
 */
export function usePullToRefresh(
  reload: () => void | Promise<void>,
): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const onRefresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    void Promise.resolve(reload()).finally(() => {
      busy.current = false;
      setRefreshing(false);
    });
  }, [reload]);

  return { refreshing, onRefresh };
}
