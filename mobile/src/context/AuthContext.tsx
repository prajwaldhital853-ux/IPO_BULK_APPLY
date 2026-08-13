import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert, Platform } from 'react-native';
import {
  AUTH_API_BASE,
  AUTH_ENABLED,
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
  loadRefreshToken,
  saveRefreshToken,
  setAccessToken,
} from '../services/auth/tokenStorage';
import { refreshSessionIfNeeded, fetchMe, deleteAccount as deleteAccountApi } from '../services/auth/http';
import { migrateLocalDataToUser, clearGuestNamespace } from '../storage/dataMigration';
import {
  clearLastSignedInUserId,
  loadLastSignedInUserId,
  saveLastSignedInUserId,
} from '../storage/sessionStorage';
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
      setAccessToken(session.accessToken, session.expiresIn);
      setSessionReady(true);
      await saveRefreshToken(session.refreshToken, session.user.id);
      await saveLastSignedInUserId(session.user.id);
      await migrateLocalDataToUser(session.user.id);
      await clearGuestNamespace();
      setUser(session.user);
      setPremium(session.premium);
      await cachePremiumFromServer(session.premium);
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    if (!AUTH_ENABLED) return null;
    const me = await fetchMe();
    if (me) {
      setActiveUserId(me.user.id);
      setUser(me.user);
      setPremium(me.premium);
      setSessionReady(true);
      await cachePremiumFromServer(me.premium);
    } else {
      const lastUserId = await loadLastSignedInUserId();
      await clearAllTokens(lastUserId ?? undefined);
      setActiveUserId(null);
      setUser(null);
      setPremium(defaultPremium);
      setSessionReady(false);
    }
    return me;
  }, []);

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
        const session = await refreshSessionIfNeeded();
        if (!mounted) return;
        if (session?.accessToken) {
          const me = await fetchMe();
          if (me && mounted) {
            setActiveUserId(me.user.id);
            await saveLastSignedInUserId(me.user.id);
            setUser(me.user);
            setPremium(me.premium);
            setSessionReady(true);
            await cachePremiumFromServer(me.premium);
          } else if (mounted) {
            await clearAllTokens(lastUserId ?? undefined);
            setActiveUserId(null);
            setUser(null);
            setPremium(defaultPremium);
            setSessionReady(false);
          }
        } else if (mounted) {
          setSessionReady(false);
        }
      } finally {
        if (mounted) {
          setSessionReady(Boolean(getAccessToken()));
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
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
          ? `${message}\n\nYou can still use the app as a guest without signing in.`
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
    await clearAllTokens(user?.id);
    await clearLastSignedInUserId();
    await clearPremiumCache();
    setActiveUserId(null);
    setUser(null);
    setPremium(defaultPremium);
    setSessionReady(false);
    clearAccessToken();
  }, [user?.id]);

  const deleteAccount = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    await deleteAccountApi();
    await clearAllUserLocalData(uid);
    await signOutGoogleNative();
    await clearAllTokens(uid);
    await clearPremiumCache();
    setActiveUserId(null);
    setUser(null);
    setPremium(defaultPremium);
    setSessionReady(false);
    clearAccessToken();
  }, [user?.id]);

  const value = useMemo(
    () => ({
      enabled: AUTH_ENABLED,
      user,
      premium,
      loading,
      isAuthenticated:
        AUTH_ENABLED
          ? sessionReady && Boolean(user) && Boolean(getAccessToken())
          : true,
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
