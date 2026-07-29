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
  defaultHomePromos,
  fetchPublicAppSettings,
  resolvePublicMediaUrl,
  type HomePromoPages,
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
  homePromos: HomePromoPages;
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
  const [homePromos, setHomePromos] = useState<HomePromoPages>(() =>
    defaultHomePromos(),
  );

  const refresh = useCallback(async () => {
    try {
      const settings = await fetchPublicAppSettings();
      setAppLogoUrl(resolvePublicMediaUrl(settings.appLogoUrl));
      setHomePromos(
        settings.homePromos ??
          defaultHomePromos(settings.homePromo ?? DEFAULT_HOME_PROMO),
      );
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

  const homePromo = homePromos.home;

  const value = useMemo(
    () => ({ appLogoUrl, plans, homePromo, homePromos, refresh }),
    [appLogoUrl, plans, homePromo, homePromos, refresh],
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
    const homePromos = defaultHomePromos();
    return {
      appLogoUrl: null,
      plans: [...PREMIUM_PLANS],
      homePromo: homePromos.home,
      homePromos,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
