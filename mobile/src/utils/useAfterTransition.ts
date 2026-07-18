import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { InteractionManager } from 'react-native';

/** Wait until navigation transition finishes before running heavy work. */
export function useAfterTransition(enabled = true): boolean {
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setReady(true);
        return;
      }
      setReady(false);
      const handle = InteractionManager.runAfterInteractions(() => {
        setReady(true);
      });
      return () => {
        handle.cancel();
        setReady(false);
      };
    }, [enabled]),
  );

  return ready;
}
