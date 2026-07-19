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
  clearRefreshToken,
} from './tokenStorage';
import { saveLastSignedInUserId, loadLastSignedInUserId } from '../../storage/sessionStorage';
import { setActiveUserId } from '../../storage/userScope';

export const SESSION_EXPIRED_MESSAGE =
  'Session expired. Please sign in with Google again.';

let refreshPromise: Promise<AuthSession | null> | null = null;

function unauthorizedResponse(detail = SESSION_EXPIRED_MESSAGE): Response {
  return new Response(JSON.stringify({ detail }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function refreshSessionIfNeeded(): Promise<AuthSession | null> {
  const lastUserId = await loadLastSignedInUserId();
  if (lastUserId) setActiveUserId(lastUserId);

  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const rt = await loadRefreshToken(lastUserId ?? undefined);
      if (!rt) {
        clearAccessToken();
        return null;
      }
      const session = await authRefresh(rt, AUTH_API_BASE);
      setActiveUserId(session.user.id);
      await saveLastSignedInUserId(session.user.id);
      setAccessToken(session.accessToken, session.expiresIn);
      await saveRefreshToken(session.refreshToken, session.user.id);
      return session;
    } catch {
      clearAccessToken();
      await clearRefreshToken(lastUserId ?? undefined);
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
  if (!token) return unauthorizedResponse();

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  let res = await fetch(`${AUTH_API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearAccessToken();
    const session = await refreshSessionIfNeeded();
    if (!session?.accessToken) return unauthorizedResponse();
    headers.set('Authorization', `Bearer ${session.accessToken}`);
    res = await fetch(`${AUTH_API_BASE}${path}`, { ...init, headers });
  }
  return res;
}

export async function fetchMe(): Promise<MeResponse | null> {
  let token = getAccessToken();
  if (!token) {
    const session = await refreshSessionIfNeeded();
    token = session?.accessToken ?? null;
  }
  if (!token) return null;
  try {
    return await authMe(token, AUTH_API_BASE);
  } catch {
    clearAccessToken();
    const session = await refreshSessionIfNeeded();
    if (!session?.accessToken) return null;
    try {
      return await authMe(session.accessToken, AUTH_API_BASE);
    } catch {
      clearAccessToken();
      return null;
    }
  }
}

export async function deleteAccount(): Promise<void> {
  const res = await authFetch('/auth/account', { method: 'DELETE' });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // ignore
    }
    if (res.status === 404 && detail === 'Not Found') {
      throw new Error(
        'Delete account is not available on the server yet. Please update the backend deployment.',
      );
    }
    throw new Error(detail);
  }
}
