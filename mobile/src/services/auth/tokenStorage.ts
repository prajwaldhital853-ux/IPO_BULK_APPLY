import * as SecureStore from 'expo-secure-store';
import {
  getActiveUserId,
  scopedRefreshTokenKey,
  setActiveUserId,
} from '../../storage/userScope';

let accessToken: string | null = null;
let accessExpiresAt = 0;

export function getAccessToken(): string | null {
  if (accessExpiresAt > 0 && Date.now() >= accessExpiresAt - 5000) {
    return null;
  }
  return accessToken;
}

export function setAccessToken(token: string, expiresInSeconds: number): void {
  accessToken = token;
  accessExpiresAt = Date.now() + expiresInSeconds * 1000;
}

export function clearAccessToken(): void {
  accessToken = null;
  accessExpiresAt = 0;
}

export async function saveRefreshToken(token: string, userId?: string): Promise<void> {
  await SecureStore.setItemAsync(scopedRefreshTokenKey(userId ?? getActiveUserId()), token);
}

export async function loadRefreshToken(userId?: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(
      scopedRefreshTokenKey(userId ?? getActiveUserId()),
    );
  } catch {
    return null;
  }
}

export async function clearRefreshToken(userId?: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(
      scopedRefreshTokenKey(userId ?? getActiveUserId()),
    );
  } catch {
    // ignore
  }
}

export async function hasStoredRefreshToken(userId?: string): Promise<boolean> {
  return Boolean(await loadRefreshToken(userId));
}

export async function clearAllTokens(userId?: string): Promise<void> {
  clearAccessToken();
  await clearRefreshToken(userId);
  setActiveUserId(null);
}
