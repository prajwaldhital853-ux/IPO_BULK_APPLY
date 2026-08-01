import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Stays false until the current navigation transition (and other interactions)
 * finish. Use to keep first paint as a light shell, then start heavy work.
 */
export function useAfterInteractions(enabled = true): boolean {
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    setReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    return () => task.cancel();
  }, [enabled]);

  return ready;
}
