import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fetchPublicAppSettings,
  resolvePublicMediaUrl,
  type PublicSubscriptionPlan,
} from '../services/app/publicSettingsApi';
import {
  PREMIUM_PLANS,
  type PremiumPlan,
} from '../storage/subscriptionStorage';

type AppBrandingContextValue = {
  appLogoUrl: string | null;
  plans: PremiumPlan[];
  refresh: () => Promise<void>;
};

const AppBrandingContext = createContext<AppBrandingContextValue | null>(null);

function mapPublicPlan(p: PublicSubscriptionPlan): PremiumPlan {
  const amountNpr = Math.max(1, Math.floor(p.amountNpr) || 1);
  const price = (p.priceLabel || '').trim() || `Rs ${amountNpr}`;
  return {
    id: p.id,
    title: p.title,
    price,
    amountNpr,
    period: p.period,
    days: p.days,
    maxAccounts: p.maxAccounts,
    perks: p.perks.length ? p.perks : [`Add up to ${p.maxAccounts} MeroShare accounts`],
  };
}

export function AppBrandingProvider({ children }: { children: React.ReactNode }) {
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<PremiumPlan[]>([...PREMIUM_PLANS]);

  const refresh = useCallback(async () => {
    try {
      const settings = await fetchPublicAppSettings();
      setAppLogoUrl(resolvePublicMediaUrl(settings.appLogoUrl));
      if (settings.subscriptionPlans.length) {
        setPlans(settings.subscriptionPlans.map(mapPublicPlan));
      } else {
        setPlans([...PREMIUM_PLANS]);
      }
    } catch {
      // Keep last known / defaults
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ appLogoUrl, plans, refresh }),
    [appLogoUrl, plans, refresh],
  );

  return (
    <AppBrandingContext.Provider value={value}>
      {children}
    </AppBrandingContext.Provider>
  );
}

export function useAppBranding(): AppBrandingContextValue {
  const ctx = useContext(AppBrandingContext);
  if (!ctx) {
    return {
      appLogoUrl: null,
      plans: [...PREMIUM_PLANS],
      refresh: async () => undefined,
    };
  }
  return ctx;
}
