import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_HOME_PROMO,
  fetchPublicAppSettings,
  resolvePublicMediaUrl,
  type HomePromoSettings,
  type PublicSubscriptionPlan,
} from '../services/app/publicSettingsApi';
import {
  PREMIUM_PLANS,
  type PremiumPlan,
} from '../storage/subscriptionStorage';

type AppBrandingContextValue = {
  appLogoUrl: string | null;
  plans: PremiumPlan[];
  homePromo: HomePromoSettings;
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
    days: p.days,
    period: p.period,
    maxAccounts: p.maxAccounts,
    perks: p.perks.length ? p.perks : [`Add up to ${p.maxAccounts} MeroShare accounts`],
  };
}

export function AppBrandingProvider({ children }: { children: React.ReactNode }) {
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<PremiumPlan[]>([...PREMIUM_PLANS]);
  const [homePromo, setHomePromo] = useState<HomePromoSettings>({
    ...DEFAULT_HOME_PROMO,
  });

  const refresh = useCallback(async () => {
    try {
      const settings = await fetchPublicAppSettings();
      setAppLogoUrl(resolvePublicMediaUrl(settings.appLogoUrl));
      setHomePromo(settings.homePromo ?? { ...DEFAULT_HOME_PROMO });
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
    () => ({ appLogoUrl, plans, homePromo, refresh }),
    [appLogoUrl, plans, homePromo, refresh],
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
      homePromo: { ...DEFAULT_HOME_PROMO },
      refresh: async () => undefined,
    };
  }
  return ctx;
}
