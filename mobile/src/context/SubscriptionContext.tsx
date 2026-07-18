import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  activatePremiumDays,
  clearSubscription,
  isPremiumActive,
  isPremiumCacheValid,
  loadPremiumCache,
  loadSubscription,
  subscriptionDaysLeft,
  type SubscriptionState,
} from '../storage/subscriptionStorage';
import { fetchMe } from '../services/auth/http';

type SubscriptionContextValue = {
  state: SubscriptionState;
  loading: boolean;
  isPremium: boolean;
  daysLeft: number | null;
  refresh: () => Promise<void>;
  purchasePlan: (productId: string, days: number) => Promise<void>;
  resetToFree: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (auth.enabled && auth.isAuthenticated) {
      if (auth.premium.active) {
        setState({
          plan: 'premium',
          expiresAt: auth.premium.expiresAt,
          activatedAt: new Date().toISOString(),
          productId: auth.premium.plan,
        });
        setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (me?.premium.active) {
          setState({
            plan: 'premium',
            expiresAt: me.premium.expiresAt,
            activatedAt: new Date().toISOString(),
            productId: me.premium.plan,
          });
          setLoading(false);
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
          setLoading(false);
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
    setLoading(false);
  }, [auth.enabled, auth.isAuthenticated, auth.premium]);

  useEffect(() => {
    void refresh();
  }, [refresh, auth.user?.id]);

  const purchasePlan = useCallback(async (productId: string, days: number) => {
    const next = await activatePremiumDays(days, productId);
    setState(next);
  }, []);

  const resetToFree = useCallback(async () => {
    const next = await clearSubscription();
    setState(next);
  }, []);

  const value = useMemo(
    () => ({
      state,
      loading,
      isPremium: auth.enabled
        ? auth.premium.active || isPremiumActive(state)
        : isPremiumActive(state),
      daysLeft: subscriptionDaysLeft(state),
      refresh,
      purchasePlan,
      resetToFree,
    }),
    [state, loading, auth.enabled, auth.premium.active, refresh, purchasePlan, resetToFree],
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
