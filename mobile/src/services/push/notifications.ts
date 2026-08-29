import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AUTH_API_BASE } from '../auth/config';
import { getAccessToken } from '../auth/tokenStorage';
import type { PriceAlert } from '../../storage/priceAlertStorage';

/** Expo Go (SDK 53+) cannot register remote push tokens. */
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ANDROID_CHANNELS = [
  {
    id: 'market',
    name: 'Market open & close',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'ipo',
    name: 'IPO open & last day',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'bulk_trades',
    name: 'Bulk transactions',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'price_alerts',
    name: 'Price alerts',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'account',
    name: 'Account & subscription',
    importance: Notifications.AndroidImportance.HIGH,
  },
] as const;

let cachedToken: string | null = null;

export function getCachedExpoPushToken(): string | null {
  return cachedToken;
}

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (isExpoGo()) return;
  for (const ch of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      importance: ch.importance,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B5E20',
    });
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Remote push was removed from Expo Go in SDK 53 — skip quietly.
  if (isExpoGo()) {
    return null;
  }
  if (!Device.isDevice) {
    return null;
  }

  await ensureAndroidChannels();

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
