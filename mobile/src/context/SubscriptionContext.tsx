import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import {
  cachePremiumFromServer,
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
  refresh: () => Promise<void>;
  requestPlan: (planId: string, paymentNote?: string) => Promise<void>;
  cancelPending: () => Promise<void>;
};

const SubscriptionContext = React.createContext<SubscriptionContextValue | null>(
  null,
);

function applyStatusToState(status: SubscriptionStatus): SubscriptionState {
  if (status.active && status.expiresAt) {
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
    setLoading(true);
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
          // fall through
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
      }

      const local = await loadSubscription();
      if (!isPremiumActive(local)) {
        setState({ ...local, plan: 'free' });
      } else {
        setState(local);
      }
    } finally {
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

  const requestPlan = useCallback(
    async (planId: string, paymentNote?: string) => {
      if (!auth.enabled) {
        throw new Error('Subscriptions are not available.');
      }
      if (!auth.isAuthenticated) {
        throw new Error('Please sign in with Google before subscribing.');
      }
      const me = await auth.refreshProfile();
      if (!me) {
        throw new Error('Session expired. Please sign in with Google again.');
      }
      const status = await submitSubscriptionRequest(planId, paymentNote);
      await applyServerStatus(status);
      await auth.refreshProfile();
    },
    [applyServerStatus, auth],
  );

  const cancelPending = useCallback(async () => {
    const status = await cancelPendingSubscription();
    await applyServerStatus(status);
    await auth.refreshProfile();
  }, [applyServerStatus, auth]);

  const isPremium = auth.enabled
    ? auth.premium.active ||
      serverStatus?.active === true ||
      isPremiumActive(state)
    : isPremiumActive(state);

  const isPending =
    !isPremium &&
    (auth.premium.status === 'pending' || serverStatus?.status === 'pending');

  const value = useMemo(
    () => ({
      state,
      serverStatus,
      loading,
      isPremium,
      isPending,
      daysLeft: subscriptionDaysLeft(state),
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
