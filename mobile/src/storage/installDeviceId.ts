import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'nepse:install-device-id:v1';

function randomId(): string {
  const bytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256),
  );
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable per-install id (survives restarts; new if app is uninstalled). */
export async function getInstallDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {
    /* fall through */
  }
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {
    /* fall through */
  }
  const next = `ng-${randomId()}`;
  try {
    await SecureStore.setItemAsync(KEY, next);
  } catch {
    /* ignore */
  }
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}
