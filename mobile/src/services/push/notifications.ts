import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AUTH_API_BASE } from '../auth/config';
import { getAccessToken } from '../auth/tokenStorage';
import { isExpoGo } from '../../utils/expoGo';
import type { PriceAlert } from '../../storage/priceAlertStorage';

export { isExpoGo } from '../../utils/expoGo';

type NotificationsModule = typeof import('expo-notifications');

/** Android NotificationManager.IMPORTANCE_HIGH — avoid static expo-notifications import. */
const ANDROID_IMPORTANCE_HIGH = 6;

const ANDROID_CHANNELS = [
  { id: 'market_v2', name: 'Market open & close' },
  { id: 'ipo', name: 'IPO open & last day' },
  { id: 'bulk_trades', name: 'Bulk transactions' },
  { id: 'price_alerts', name: 'Price alerts' },
  { id: 'account', name: 'Account & subscription' },
] as const;

let notificationsModule: NotificationsModule | null = null;
let handlerConfigured = false;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (isExpoGo()) return null;
  if (!notificationsModule) {
    notificationsModule = await import('expo-notifications');
  }
  if (!handlerConfigured) {
    handlerConfigured = true;
    try {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch {
      // Missing native module in some dev setups.
    }
  }
  return notificationsModule;
}

let cachedToken: string | null = null;

export function getCachedExpoPushToken(): string | null {
  return cachedToken;
}

async function ensureAndroidChannels(
  Notifications: NotificationsModule,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const ch of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      importance: ANDROID_IMPORTANCE_HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B5E20',
    });
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (isExpoGo() || !Device.isDevice) {
    return null;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  await ensureAndroidChannels(Notifications);

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    return null;
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  cachedToken = tokenResult.data;
  return cachedToken;
}

async function pushFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  const access = getAccessToken();
  if (access) headers.set('Authorization', `Bearer ${access}`);
  return fetch(`${AUTH_API_BASE}${path}`, { ...init, headers });
}

export async function registerPushTokenOnServer(
  enabled: boolean,
): Promise<boolean> {
  if (isExpoGo()) return false;
  try {
    const token = enabled
      ? await registerForPushNotificationsAsync()
      : cachedToken ?? (await registerForPushNotificationsAsync());
    if (!token) return false;
    const res = await pushFetch('/app/push/register', {
      method: 'POST',
      body: JSON.stringify({
        expoPushToken: token,
        platform: Platform.OS,
        enabled,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncPriceAlertsToServer(
  alerts: PriceAlert[],
): Promise<boolean> {
  if (isExpoGo()) return false;
  try {
    const token =
      cachedToken ?? (await registerForPushNotificationsAsync());
    if (!token) return false;
    const res = await pushFetch('/app/push/alerts/sync', {
      method: 'POST',
      body: JSON.stringify({
        expoPushToken: token,
        alerts: alerts.map((a) => ({
          id: a.id,
          symbol: a.symbol,
          name: a.name,
          direction: a.direction,
          targetPrice: a.targetPrice,
          enabled: a.enabled,
        })),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
