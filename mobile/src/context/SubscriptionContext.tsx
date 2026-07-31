import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import {
  accountLimitForPlan,
  cachePremiumFromServer,
  clearSubscription,
  isPremiumActive,
  loadSubscription,
  subscriptionDaysLeft,
  type SubscriptionState,
} from '../storage/subscriptionStorage';
import {
  cancelPendingSubscription,
  fetchSubscriptionStatus,
  submitSubscriptionRequest,
  type SubscriptionStatus,
} from '../services/auth/subscriptionApi';

type SubscriptionContextValue = {
  state: SubscriptionState;
  serverStatus: SubscriptionStatus | null;
  loading: boolean;
  isPremium: boolean;
  isPending: boolean;
  daysLeft: number | null;
  /** Max MeroShare accounts allowed for current plan (10 free / 50 premium). */
  maxAccounts: number;
  refresh: () => Promise<void>;
  requestPlan: (planId: string, paymentNote?: string) => Promise<void>;
  cancelPending: () => Promise<void>;
};

const SubscriptionContext = React.createContext<SubscriptionContextValue | null>(
  null,
);

function premiumStillValid(
  active: boolean | undefined,
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!active || !expiresAt) return false;
  const exp = new Date(expiresAt).getTime();
  return !Number.isNaN(exp) && exp > now;
}

function applyStatusToState(status: SubscriptionStatus): SubscriptionState {
  if (premiumStillValid(status.active, status.expiresAt)) {
    return {
      plan: 'premium',
      expiresAt: status.expiresAt,
      activatedAt: new Date().toISOString(),
      productId: status.plan,
    };
  }
  return {
    plan: 'free',
    expiresAt: null,
    activatedAt: null,
    productId: null,
  };
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    plan: 'free',
    expiresAt: null,
    activatedAt: null,
    productId: null,
  });
  const [serverStatus, setServerStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // True once the very first status load has completed. After that, refreshes
  // run silently so returning to foreground never blanks premium screens
  // (PremiumGate only shows nothing while loading is true).
  const initializedRef = useRef(false);

  const applyServerStatus = useCallback(async (status: SubscriptionStatus) => {
    setServerStatus(status);
    setState(applyStatusToState(status));
    await cachePremiumFromServer({
      active: status.active,
      plan: status.plan,
      expiresAt: status.expiresAt,
    });
  }, []);

  const refresh = useCallback(async () => {
    // Only gate the UI on the initial load. Later refreshes (foreground,
    // expiry timer) stay silent so already-rendered screens don't blank if
    // the network is slow.
    if (!initializedRef.current) setLoading(true);
    try {
      if (auth.enabled && auth.isAuthenticated) {
        const me = await auth.refreshProfile();

        try {
          const status = await fetchSubscriptionStatus();
          if (status) {
            await applyServerStatus(status);
            return;
          }
        } catch {
          // fall through to /me premium
        }

        if (me?.premium) {
          await applyServerStatus({
            active: me.premium.active,
            plan: me.premium.plan,
            expiresAt: me.premium.expiresAt,
            status: me.premium.status,
            pendingRequest: me.premium.pendingRequest,
          });
          return;
        }

        // Signed in but no entitlement payload — never restore local unlock.
        await applyServerStatus({
          active: false,
          plan: null,
          expiresAt: null,
          status: 'free',
          pendingRequest: null,
        });
        return;
      }

      if (auth.enabled) {
        // Guests cannot keep leftover on-device unlocks — wipe local premium.
        setServerStatus(null);
        const cleared = await clearSubscription();
        setState(cleared);
        return;
      }

      // Auth disabled (dev-only): fall back to local cache.
      const local = await loadSubscription();
      if (!isPremiumActive(local)) {
        setState({ ...local, plan: 'free' });
      } else {
        setState(local);
      }
    } finally {
      initializedRef.current = true;
      setLoading(false);
    }
  }, [
    auth.enabled,
    auth.isAuthenticated,
    auth.refreshProfile,
    applyServerStatus,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh, auth.user?.id]);

  useEffect(() => {
    if (!auth.enabled || !auth.isAuthenticated) return;
    void applyServerStatus({
      active: auth.premium.active,
      plan: auth.premium.plan,
      expiresAt: auth.premium.expiresAt,
      status: auth.premium.status,
      pendingRequest: auth.premium.pendingRequest,
    });
  }, [
    auth.enabled,
    auth.isAuthenticated,
    auth.premium.active,
    auth.premium.plan,
    auth.premium.expiresAt,
    auth.premium.status,
    auth.premium.pendingRequest,
    applyServerStatus,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && auth.isAuthenticated) {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [auth.isAuthenticated, refresh]);

  // Silent poll so admin-approved subscriptions appear without a manual refresh.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refresh();
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [auth.isAuthenticated, refresh]);

  // Drop to free as soon as local expiry time passes (no wait for next API call).
  useEffect(() => {
    const candidates = [
      auth.premium.expiresAt,
      serverStatus?.expiresAt,
      state.expiresAt,
    ].filter((v): v is string => Boolean(v));
    if (!candidates.length) return;

    const nearest = Math.min(...candidates.map((v) => new Date(v).getTime()));
    if (Number.isNaN(nearest)) return;
    const delay = nearest - Date.now();
    if (delay <= 0) {
      void cachePremiumFromServer({
        active: false,
        plan: null,
        expiresAt: null,
      }).then(() => {
        setState({
          plan: 'free',
          expiresAt: null,
          activatedAt: null,
          productId: null,
        });
        setServerStatus((prev) =>
          prev
            ? {
                ...prev,
                active: false,
                plan: null,
                expiresAt: null,
                status: prev.status === 'pending' ? 'pending' : 'free',
              }
            : prev,
        );
        void auth.refreshProfile();
      });
      return;
    }
    const timer = setTimeout(() => {
      void refresh();
    }, Math.min(delay + 500, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [
    auth,
    auth.premium.expiresAt,
    serverStatus?.expiresAt,
    state.expiresAt,
    refresh,
  ]);

  const ensureSession = useCallback(async () => {
    if (!auth.enabled) {
      throw new Error('Subscriptions are not available.');
    }
    if (!auth.isAuthenticated) {
      throw new Error('Please sign in with Google first.');
    }
    const me = await auth.refreshProfile();
    if (!me) {
      throw new Error('Session expired. Please sign in with Google again.');
    }
    return me;
  }, [auth]);

  const requestPlan = useCallback(
    async (planId: string, paymentNote?: string) => {
      await ensureSession();
      const status = await submitSubscriptionRequest(planId, paymentNote);
      await applyServerStatus(status);
      await auth.refreshProfile();
    },
    [applyServerStatus, auth, ensureSession],
  );

  const cancelPending = useCallback(async () => {
    await ensureSession();
    const status = await cancelPendingSubscription();
    await applyServerStatus(status);
    await auth.refreshProfile();
  }, [applyServerStatus, auth, ensureSession]);

  // When auth is on, only server/Google entitlement counts — never local unlock.
  const isPremium = auth.enabled
    ? premiumStillValid(auth.premium.active, auth.premium.expiresAt) ||
      premiumStillValid(serverStatus?.active, serverStatus?.expiresAt)
    : isPremiumActive(state);

  const isPending =
    !isPremium &&
    auth.isAuthenticated &&
    (auth.premium.status === 'pending' || serverStatus?.status === 'pending');

  const maxAccounts = accountLimitForPlan(
    isPremium,
    serverStatus?.maxAccounts ?? auth.premium?.maxAccounts ?? null,
  );

  const value = useMemo(
    () => ({
      state,
      serverStatus,
      loading,
      isPremium,
      isPending,
      daysLeft: subscriptionDaysLeft(state),
      maxAccounts,
      refresh,
      requestPlan,
      cancelPending,
    }),
    [
      state,
      serverStatus,
      loading,
      isPremium,
      isPending,
      maxAccounts,
      refresh,
      requestPlan,
      cancelPending,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = React.useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return ctx;
}
