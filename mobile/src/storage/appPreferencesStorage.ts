import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nepse_ghar_notifications_enabled';

export async function loadNotificationsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw == null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export async function saveNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? '1' : '0');
}
