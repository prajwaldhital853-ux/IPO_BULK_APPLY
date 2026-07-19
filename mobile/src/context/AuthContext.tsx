import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
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
  signInWithGoogleNative,
  signOutGoogleNative,
} from '../services/auth/googleSignInNative';
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
  pendingRequest: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [premium, setPremium] = useState<PremiumInfo>(defaultPremium);
  const [loading, setLoading] = useState(AUTH_ENABLED);

  useEffect(() => {
    if (canUseNativeGoogleSignIn()) {
      void ensureGoogleSignInConfigured();
    }
  }, []);

  const applySession = useCallback(
    async (session: Awaited<ReturnType<typeof authGoogle>>) => {
      setActiveUserId(session.user.id);
      setAccessToken(session.accessToken, session.expiresIn);
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
      await cachePremiumFromServer(me.premium);
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
        if (session?.accessToken && getAccessToken()) {
          const me = await fetchMe();
          if (me && mounted) {
            setActiveUserId(me.user.id);
            await saveLastSignedInUserId(me.user.id);
            setUser(me.user);
            setPremium(me.premium);
            await cachePremiumFromServer(me.premium);
          }
        }
      } finally {
        if (mounted) setLoading(false);
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
    const idToken = await signInWithGoogleNative();
    const session = await authGoogle(idToken, AUTH_API_BASE);
    await applySession(session);
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
    clearAccessToken();
  }, [user?.id]);

  const value = useMemo(
    () => ({
      enabled: AUTH_ENABLED,
      user,
      premium,
      loading,
      isAuthenticated: Boolean(user),
      signInWithGoogle,
      signOut,
      deleteAccount,
      refreshProfile,
    }),
    [user, premium, loading, signInWithGoogle, signOut, deleteAccount, refreshProfile],
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
