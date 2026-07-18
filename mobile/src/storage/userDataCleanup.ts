import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { clearAllAccounts } from './accountsStorage';
import { clearPin } from './pinStorage';
import { clearPremiumCache } from './subscriptionStorage';
import {
  getActiveUserId,
  HISTORY_BASE,
  META_BASE,
  PORTFOLIO_BASE,
  scopedAsyncKey,
  scopedRefreshTokenKey,
  setActiveUserId,
  WATCHLIST_BASE,
} from './userScope';
import { clearLastSignedInUserId } from './sessionStorage';

/** Remove all on-device data for the signed-in Google user. */
export async function clearAllUserLocalData(userId?: string): Promise<void> {
  const uid = userId ?? getActiveUserId();
  if (!uid || uid === 'guest') return;

  setActiveUserId(uid);
  await clearAllAccounts();
  await clearPin(uid);

  const keys = [
    scopedAsyncKey(META_BASE, uid),
    scopedAsyncKey(HISTORY_BASE, uid),
    scopedAsyncKey(PORTFOLIO_BASE, uid),
    scopedAsyncKey(WATCHLIST_BASE, uid),
    scopedAsyncKey('migrated_v1', uid),
    scopedRefreshTokenKey(uid),
  ];

  await AsyncStorage.multiRemove(keys);

  for (const key of keys) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  }

  await clearPremiumCache();
  await clearLastSignedInUserId();
}
