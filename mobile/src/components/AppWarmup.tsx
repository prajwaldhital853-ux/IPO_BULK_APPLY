import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { loadMiniScreener } from '../services/nepse/screener';

/** Prefetch large NEPSE lists after first paint so later screens open faster. */
export function AppWarmup() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!cancelled) void loadMiniScreener();
      }, 800);
    });
    return () => {
      cancelled = true;
      handle.cancel();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
