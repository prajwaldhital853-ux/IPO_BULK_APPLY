/**
 * CDSC fallback backend config.
 * Set these in the app env (e.g. .env / eas.json) as:
 *   EXPO_PUBLIC_CDSC_BACKEND_URL=https://your-vps:8080
 *   EXPO_PUBLIC_CDSC_BACKEND_KEY=your-shared-secret (legacy fallback)
 * When unset, the CDSC fallback provider is simply not registered and the app
 * runs with the issue managers only.
 */
import { getAccessToken } from '../auth/tokenStorage';
import { refreshSessionIfNeeded } from '../auth/http';

export const CDSC_BACKEND_URL = (
  process.env.EXPO_PUBLIC_CDSC_BACKEND_URL ?? ''
).replace(/\/$/, '');

export const CDSC_BACKEND_KEY = process.env.EXPO_PUBLIC_CDSC_BACKEND_KEY ?? '';

export function isCdscBackendConfigured(): boolean {
  return Boolean(CDSC_BACKEND_URL);
}

export async function cdscBackendHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  let token = getAccessToken();
  if (!token) {
    const session = await refreshSessionIfNeeded();
    token = session?.accessToken ?? null;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (CDSC_BACKEND_KEY) {
    headers['X-API-Key'] = CDSC_BACKEND_KEY;
  }
  return headers;
}
