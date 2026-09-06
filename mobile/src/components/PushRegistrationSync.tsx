import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AUTH_ENABLED } from '../services/auth/config';
import { isExpoGo } from '../utils/expoGo';
import { loadNotificationsEnabled } from '../storage/appPreferencesStorage';

/**
 * Links this phone's Expo push token to the signed-in Google account on the server.
 * Must run after auth — registering before login leaves user_id null and admin
 * subscription pushes never reach this device.
 */
export function PushRegistrationSync() {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (isExpoGo() || !AUTH_ENABLED || !isAuthenticated || !user?.id) return;

    let cancelled = false;
    const sync = async () => {
      const enabled = await loadNotificationsEnabled();
      if (cancelled || !enabled) return;
      const { registerPushTokenOnServer } = await import(
        '../services/push/notifications'
      );
      await registerPushTokenOnServer(true);
    };

    void sync();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [isAuthenticated, user?.id]);

  return null;
}
