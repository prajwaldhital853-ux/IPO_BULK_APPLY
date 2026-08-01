import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { prefetchServicesData } from '../services/nepse/prefetchServices';

/** Prefetch Services / market data after first paint so screens open faster. */
export function AppWarmup() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!cancelled) prefetchServicesData();
      }, 600);
    });
    return () => {
      cancelled = true;
      handle.cancel();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
