import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  isPremiumActive,
  isPremiumCacheValid,
  loadPremiumCache,
  loadSubscription,
  subscriptionDaysLeft,
  type SubscriptionState,
} from '../storage/subscriptionStorage';
import { fetchMe } from '../services/auth/http';
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

  const applyServerStatus = useCallback((status: SubscriptionStatus) => {
    setServerStatus(status);
    if (status.active && status.expiresAt) {
      setState({
        plan: 'premium',
        expiresAt: status.expiresAt,
        activatedAt: new Date().toISOString(),
        productId: status.plan,
      });
    } else {
      setState({
        plan: 'free',
        expiresAt: null,
        activatedAt: null,
        productId: null,
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (auth.enabled && auth.isAuthenticated) {
        try {
          const status = await fetchSubscriptionStatus();
          if (status) {
            applyServerStatus(status);
            return;
          }
        } catch {
          // fall through
        }
        if (auth.premium.active || auth.premium.status === 'pending') {
          applyServerStatus({
            active: auth.premium.active,
            plan: auth.premium.plan,
            expiresAt: auth.premium.expiresAt,
            status: auth.premium.status,
            pendingRequest: auth.premium.pendingRequest,
          });
          return;
        }
        try {
          const me = await fetchMe();
          if (me) {
            applyServerStatus({
              active: me.premium.active,
              plan: me.premium.plan,
              expiresAt: me.premium.expiresAt,
              status: me.premium.status,
              pendingRequest: me.premium.pendingRequest,
            });
            return;
          }
        } catch {
          const cache = await loadPremiumCache();
          if (isPremiumCacheValid(cache)) {
            setState({
              plan: 'premium',
              expiresAt: cache!.expiresAt,
              activatedAt: cache!.cachedAt,
              productId: cache!.plan,
            });
            return;
          }
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
  }, [auth.enabled, auth.isAuthenticated, auth.premium, applyServerStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh, auth.user?.id]);

  const requestPlan = useCallback(
    async (planId: string, paymentNote?: string) => {
      const status = await submitSubscriptionRequest(planId, paymentNote);
      applyServerStatus(status);
      await auth.refreshProfile();
    },
    [applyServerStatus, auth],
  );

  const cancelPending = useCallback(async () => {
    const status = await cancelPendingSubscription();
    applyServerStatus(status);
    await auth.refreshProfile();
  }, [applyServerStatus, auth]);

  const isPremium = auth.enabled
    ? auth.premium.active || serverStatus?.active === true || isPremiumActive(state)
    : isPremiumActive(state);

  const isPending =
    auth.premium.status === 'pending' || serverStatus?.status === 'pending';

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
