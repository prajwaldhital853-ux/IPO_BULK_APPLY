import AsyncStorage from '@react-native-async-storage/async-storage';

export type PriceAlertDirection = 'above' | 'below';

export type PriceAlert = {
  id: string;
  symbol: string;
  name: string;
  direction: PriceAlertDirection;
  targetPrice: number;
  enabled: boolean;
  createdAt: string;
};

const ALERTS_KEY = 'nepse:price-alerts:v2';
const NOTIFY_KEY = 'nepse:price-alerts-notify-bg:v1';

export async function listPriceAlerts(): Promise<PriceAlert[]> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PriceAlert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(list: PriceAlert[]): Promise<void> {
  await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

export async function getNotifyInBackground(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFY_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function setNotifyInBackground(on: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFY_KEY, on ? '1' : '0');
}

export async function addPriceAlert(input: {
  symbol: string;
  name: string;
  direction: PriceAlertDirection;
  targetPrice: number;
}): Promise<PriceAlert[]> {
  const list = await listPriceAlerts();
  const sym = input.symbol.toUpperCase();
  const next: PriceAlert = {
    id: `${sym}-${input.direction}-${Date.now()}`,
    symbol: sym,
    name: input.name || sym,
    direction: input.direction,
    targetPrice: input.targetPrice,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  const merged = [
    next,
    ...list.filter(
      (a) => !(a.symbol === sym && a.direction === input.direction),
    ),
  ];
  await saveAll(merged);
  return merged;
}

export async function togglePriceAlert(
  id: string,
  enabled: boolean,
): Promise<PriceAlert[]> {
  const list = await listPriceAlerts();
  const next = list.map((a) => (a.id === id ? { ...a, enabled } : a));
  await saveAll(next);
  return next;
}

export async function removePriceAlert(id: string): Promise<PriceAlert[]> {
  const list = await listPriceAlerts();
  const next = list.filter((a) => a.id !== id);
  await saveAll(next);
  return next;
}

export async function clearAllPriceAlerts(): Promise<void> {
  await AsyncStorage.removeItem(ALERTS_KEY);
}
