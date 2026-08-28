import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser, PremiumInfo } from '../services/auth/api';

const KEY = '@nepse_ghar/session_profile';

export type CachedSessionProfile = {
  user: AuthUser;
  premium: PremiumInfo;
};

export async function saveSessionProfile(
  user: AuthUser,
  premium: PremiumInfo,
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ user, premium }));
}

export async function loadSessionProfile(): Promise<CachedSessionProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSessionProfile;
    if (!parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSessionProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
