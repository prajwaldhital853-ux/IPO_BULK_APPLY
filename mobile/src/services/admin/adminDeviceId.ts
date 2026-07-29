import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'nepse:admin:device-id:v1';

function randomId(): string {
  const bytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256),
  );
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stable per-install id used for admin login lockouts (not the user account).
 * Must NOT change between login attempts, or the server always sees attempt #1.
 */
export async function getAdminDeviceId(): Promise<string> {
  // 1) Prefer SecureStore
  try {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {
    // fall through
  }

  // 2) Stable AsyncStorage fallback (never use Date.now() per call)
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {
    // fall through
  }

  const next = `ng-${randomId()}`;

  try {
    await SecureStore.setItemAsync(KEY, next);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    // ignore
  }
  return next;
}
