import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert, AppState, Platform } from 'react-native';
import {
  AUTH_API_BASE,
  AUTH_ENABLED,
  GUEST_CAN_ADD_ACCOUNTS,
} from '../services/auth/config';
import {
  authGoogle,
  authLogout,
  type AuthUser,
  type PremiumInfo,
} from '../services/auth/api';
import {
  canUseNativeGoogleSignIn,
  ensureGoogleSignInConfigured,
  isExpoGo,
  signInWithGoogleNative,
  signOutGoogleNative,
} from '../services/auth/googleSignInNative';
import { signInWithGoogleExpoGo } from '../services/auth/googleSignInExpoGo';
import {
  clearAccessToken,
  clearAllTokens,
  getAccessToken,
  hasStoredRefreshToken,
  loadRefreshToken,
  saveRefreshToken,
  setAccessToken,
} from '../services/auth/tokenStorage';
import { refreshSessionIfNeeded, fetchMe, deleteAccount as deleteAccountApi } from '../services/auth/http';
import { isFatalAuthError } from '../services/auth/errors';
import { migrateLocalDataToUser, clearGuestNamespace } from '../storage/dataMigration';
import {
  clearLastSignedInUserId,
  loadLastSignedInUserId,
  saveLastSignedInUserId,
} from '../storage/sessionStorage';
import {
  clearSessionProfile,
  loadSessionProfile,
  saveSessionProfile,
} from '../storage/sessionProfileCache';
import { clearAllUserLocalData } from '../storage/userDataCleanup';
import { setActiveUserId } from '../storage/userScope';
import {
  cachePremiumFromServer,
  clearPremiumCache,
} from '../storage/subscriptionStorage';

type AuthContextValue = {
  enabled: boolean;
  user: AuthUser | null;
  premium: PremiumInfo;
  loading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<import('../services/auth/api').MeResponse | null>;
};

const defaultPremium: PremiumInfo = {
  active: false,
  plan: null,
  expiresAt: null,
  status: 'free',
  maxAccounts: 10,
  pendingRequest: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [premium, setPremium] = useState<PremiumInfo>(defaultPremium);
  const [loading, setLoading] = useState(AUTH_ENABLED);
  const [sessionReady, setSessionReady] = useState(!AUTH_ENABLED);

  useEffect(() => {
    if (canUseNativeGoogleSignIn()) {
      void ensureGoogleSignInConfigured();
    }
  }, []);

  const applySession = useCallback(
    async (session: Awaited<ReturnType<typeof authGoogle>>) => {
      setActiveUserId(session.user.id);
      await saveRefreshToken(session.refreshToken, session.user.id);
      setAccessToken(session.accessToken, session.expiresIn);
      setSessionReady(true);
      await saveLastSignedInUserId(session.user.id);
      await migrateLocalDataToUser(session.user.id);
      await clearGuestNamespace();
      setUser(session.user);
      setPremium(session.premium);
      await cachePremiumFromServer(session.premium);
      await saveSessionProfile(session.user, session.premium);
    },
    [],
  );

  const clearLocalSession = useCallback(async (userId?: string) => {
    await clearAllTokens(userId);
    await clearLastSignedInUserId();
    await clearSessionProfile();
    await clearPremiumCache();
    setActiveUserId(null);
    setUser(null);
    setPremium(defaultPremium);
    setSessionReady(false);
    clearAccessToken();
  }, []);

  const restoreCachedSession = useCallback(async (userId?: string) => {
    const cached = await loadSessionProfile();
    const hasRefresh = await hasStoredRefreshToken(userId);
    if (!cached || !hasRefresh) return false;
    setActiveUserId(cached.user.id);
    setUser(cached.user);
    setPremium(cached.premium);
    setSessionReady(true);
    await cachePremiumFromServer(cached.premium);
    return true;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!AUTH_ENABLED) return null;
    const lastUserId = await loadLastSignedInUserId();
    if (lastUserId) setActiveUserId(lastUserId);

    const me = await fetchMe();
    if (me) {
      setActiveUserId(me.user.id);
      setUser(me.user);
      setPremium(me.premium);
      setSessionReady(true);
      await saveLastSignedInUserId(me.user.id);
      await cachePremiumFromServer(me.premium);
      await saveSessionProfile(me.user, me.premium);
      return me;
    }

    const hasRefresh = await hasStoredRefreshToken(lastUserId ?? undefined);
    if (!hasRefresh) {
      await clearLocalSession(lastUserId ?? undefined);
      return null;
    }

    const session = await refreshSessionIfNeeded();
    if (session) {
      setActiveUserId(session.user.id);
      setUser(session.user);
      setPremium(session.premium);
      setSessionReady(true);
      await saveLastSignedInUserId(session.user.id);
      await cachePremiumFromServer(session.premium);
      await saveSessionProfile(session.user, session.premium);
      return { user: session.user, premium: session.premium };
    }

    await restoreCachedSession(lastUserId ?? undefined);
    return null;
  }, [clearLocalSession, restoreCachedSession]);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const lastUserId = await loadLastSignedInUserId();
        if (lastUserId) setActiveUserId(lastUserId);
        await restoreCachedSession(lastUserId ?? undefined);

        const session = await refreshSessionIfNeeded();
        if (!mounted) return;
        if (session) {
          setActiveUserId(session.user.id);
          await saveLastSignedInUserId(session.user.id);
          setUser(session.user);
          setPremium(session.premium);
          setSessionReady(true);
          await cachePremiumFromServer(session.premium);
          await saveSessionProfile(session.user, session.premium);
        } else {
          const stillHasRefresh = await hasStoredRefreshToken(
            lastUserId ?? undefined,
          );
          if (!stillHasRefresh) {
            if (mounted) {
              await clearLocalSession(lastUserId ?? undefined);
            }
          } else if (mounted) {
            await restoreCachedSession(lastUserId ?? undefined);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clearLocalSession, restoreCachedSession]);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void refreshSessionIfNeeded().then(async (session) => {
        if (!session) return;
        setActiveUserId(session.user.id);
        setUser(session.user);
        setPremium(session.premium);
        setSessionReady(true);
        await saveSessionProfile(session.user, session.premium);
        await cachePremiumFromServer(session.premium);
      });
    });
    return () => sub.remove();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!AUTH_ENABLED) return;
    if (Platform.OS === 'web') {
      throw new Error('Google sign-in on web is not configured yet.');
    }
    try {
      const idToken = isExpoGo()
        ? await signInWithGoogleExpoGo()
        : await signInWithGoogleNative();
      const session = await authGoogle(idToken, AUTH_API_BASE);
      await applySession(session);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not sign in with Google.';
      if (/sign-in cancelled|signin cancelled|cancelled/i.test(message)) {
        // User closed the Google sheet — no error dialog.
        return;
      }
      const blocked = /temporarily blocked/i.test(message);
      Alert.alert(
        blocked ? 'Temporarily blocked' : 'Sign in failed',
        blocked
          ? GUEST_CAN_ADD_ACCOUNTS
            ? `${message}\n\nYou can still browse market data without signing in.`
            : message
          : message,
      );
      throw e;
    }
  }, [applySession]);

  const signOut = useCallback(async () => {
    const access = getAccessToken();
    const rt = await loadRefreshToken(user?.id);
    if (access) {
      try {
        await authLogout(access, rt, AUTH_API_BASE);
      } catch {
        // ignore
      }
    }
    await signOutGoogleNative();
    await clearLocalSession(user?.id);
  }, [clearLocalSession, user?.id]);

  const deleteAccount = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    try {
      await deleteAccountApi();
    } catch (e) {
      if (!isFatalAuthError(e)) throw e;
    }
    await clearAllUserLocalData(uid);
    await signOutGoogleNative();
    await clearLocalSession(uid);
  }, [clearLocalSession, user?.id]);

  const value = useMemo(
    () => ({
      enabled: AUTH_ENABLED,
      user,
      premium,
      loading,
      isAuthenticated:
        AUTH_ENABLED ? sessionReady && Boolean(user) : true,
      signInWithGoogle,
      signOut,
      deleteAccount,
      refreshProfile,
    }),
    [user, premium, loading, sessionReady, signInWithGoogle, signOut, deleteAccount, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRequireAuth() {
  const auth = useAuth();
  return {
    ...auth,
    isAuthenticated: auth.enabled ? auth.isAuthenticated : true,
  };
}
