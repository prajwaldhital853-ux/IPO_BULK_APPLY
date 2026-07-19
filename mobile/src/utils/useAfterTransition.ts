import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

/** Marks screen focused — defers heavy work by one frame only (no interaction queue wait). */
export function useAfterTransition(enabled = true): boolean {
  const [ready, setReady] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setReady(true);
        return;
      }
      setReady(true);
      return () => setReady(false);
    }, [enabled]),
  );

  return ready;
}
