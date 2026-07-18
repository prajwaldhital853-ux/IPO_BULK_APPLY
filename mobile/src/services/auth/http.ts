import { AUTH_API_BASE } from './config';
import {
  authMe,
  authRefresh,
  type AuthSession,
  type MeResponse,
} from './api';
import {
  clearAccessToken,
  getAccessToken,
  loadRefreshToken,
  saveRefreshToken,
  setAccessToken,
} from './tokenStorage';

let refreshPromise: Promise<AuthSession | null> | null = null;

export async function refreshSessionIfNeeded(): Promise<AuthSession | null> {
  const existing = getAccessToken();
  if (existing) {
    const rt = await loadRefreshToken();
    if (rt) {
      return {
        accessToken: existing,
        refreshToken: rt,
        expiresIn: 900,
        user: { id: '', email: '', name: '', avatarUrl: null },
        premium: { active: false, plan: null, expiresAt: null },
      };
    }
  }
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const rt = await loadRefreshToken();
      if (!rt) return null;
      const session = await authRefresh(rt, AUTH_API_BASE);
      setAccessToken(session.accessToken, session.expiresIn);
      await saveRefreshToken(session.refreshToken, session.user.id);
      return session;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let token = getAccessToken();
  if (!token) {
    const session = await refreshSessionIfNeeded();
    token = session?.accessToken ?? null;
  }
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  let res = await fetch(`${AUTH_API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearAccessToken();
    const session = await refreshSessionIfNeeded();
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
      res = await fetch(`${AUTH_API_BASE}${path}`, { ...init, headers });
    }
  }
  return res;
}

export async function fetchMe(): Promise<MeResponse | null> {
  const token = getAccessToken();
  if (!token) {
    const session = await refreshSessionIfNeeded();
    if (!session?.accessToken) return null;
    return authMe(session.accessToken, AUTH_API_BASE);
  }
  try {
    return await authMe(token, AUTH_API_BASE);
  } catch {
    const session = await refreshSessionIfNeeded();
    if (!session?.accessToken) return null;
    return authMe(session.accessToken, AUTH_API_BASE);
  }
}
