import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  GUEST_USER_ID,
  HISTORY_BASE,
  LEGACY_HISTORY_KEY,
  LEGACY_META_KEY,
  LEGACY_PORTFOLIO_KEY,
  LEGACY_WATCHLIST_KEY,
  META_BASE,
  PORTFOLIO_BASE,
  WATCHLIST_BASE,
  scopedAsyncKey,
  scopedSecretKey,
} from './userScope';

async function adopt(from: string, to: string): Promise<void> {
  const raw = await AsyncStorage.getItem(from);
  if (!raw) return;
  const existing = await AsyncStorage.getItem(to);
  if (!existing) {
    await AsyncStorage.setItem(to, raw);
  }
  if (from !== to) {
    await AsyncStorage.removeItem(from);
  }
}

/** Auto-import guest + legacy keys into the signed-in user's namespace once. */
export async function migrateLocalDataToUser(userId: string): Promise<void> {
  const flag = scopedAsyncKey('migrated_v1', userId);
  if (await AsyncStorage.getItem(flag)) return;

  const targets = {
    meta: scopedAsyncKey(META_BASE, userId),
    history: scopedAsyncKey(HISTORY_BASE, userId),
    portfolio: scopedAsyncKey(PORTFOLIO_BASE, userId),
    watchlist: scopedAsyncKey(WATCHLIST_BASE, userId),
  };

  await adopt(LEGACY_META_KEY, targets.meta);
  await adopt(scopedAsyncKey(META_BASE, GUEST_USER_ID), targets.meta);
  await adopt(LEGACY_HISTORY_KEY, targets.history);
  await adopt(scopedAsyncKey(HISTORY_BASE, GUEST_USER_ID), targets.history);
  await adopt(LEGACY_PORTFOLIO_KEY, targets.portfolio);
  await adopt(scopedAsyncKey(PORTFOLIO_BASE, GUEST_USER_ID), targets.portfolio);
  await adopt(LEGACY_WATCHLIST_KEY, targets.watchlist);
  await adopt(scopedAsyncKey(WATCHLIST_BASE, GUEST_USER_ID), targets.watchlist);

  await AsyncStorage.setItem(flag, new Date().toISOString());
  await migrateGuestSecretsToUser(userId);
}

async function migrateGuestSecretsToUser(userId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(scopedAsyncKey(META_BASE, userId));
  if (!raw) return;
  const accounts = JSON.parse(raw) as { id: string }[];
  for (const acc of accounts) {
    const userKey = scopedSecretKey(acc.id, userId);
    const existing = await SecureStore.getItemAsync(userKey);
    if (existing) continue;
    const guestRaw = await SecureStore.getItemAsync(
      scopedSecretKey(acc.id, GUEST_USER_ID),
    );
    const legacyRaw =
      guestRaw ?? (await SecureStore.getItemAsync(`nepse_ghar_secret_${acc.id}`));
    if (!legacyRaw) continue;
    await SecureStore.setItemAsync(userKey, legacyRaw);
    await SecureStore.deleteItemAsync(scopedSecretKey(acc.id, GUEST_USER_ID));
  }
}

export async function clearGuestNamespace(): Promise<void> {
  await AsyncStorage.multiRemove([
    scopedAsyncKey(META_BASE, GUEST_USER_ID),
    scopedAsyncKey(HISTORY_BASE, GUEST_USER_ID),
    scopedAsyncKey(PORTFOLIO_BASE, GUEST_USER_ID),
    scopedAsyncKey(WATCHLIST_BASE, GUEST_USER_ID),
  ]);
}
