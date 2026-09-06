import { useEffect, useState, type ComponentType } from 'react';
import { isExpoGo } from '../utils/expoGo';

type PushModules = {
  PushRegistrationSync: ComponentType;
  NotificationRouter: ComponentType;
};

/**
 * Loads push registration + notification routing only outside Expo Go.
 * Expo Go (SDK 53+) cannot use expo-notifications — loading that module crashes startup.
 */
export function ExpoPushBridge() {
  const [mods, setMods] = useState<PushModules | null>(null);

  useEffect(() => {
    if (isExpoGo()) return;

    void Promise.all([
      import('./PushRegistrationSync'),
      import('./NotificationRouter'),
    ]).then(([push, router]) => {
      setMods({
        PushRegistrationSync: push.PushRegistrationSync,
        NotificationRouter: router.NotificationRouter,
      });
    });
  }, []);

  if (!mods) return null;

  const { PushRegistrationSync, NotificationRouter } = mods;
  return (
    <>
      <PushRegistrationSync />
      <NotificationRouter />
    </>
  );
}
