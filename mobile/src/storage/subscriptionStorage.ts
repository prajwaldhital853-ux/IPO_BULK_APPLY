import AsyncStorage from '@react-native-async-storage/async-storage';

export type SubscriptionPlan = 'free' | 'premium';

export type SubscriptionState = {
  plan: SubscriptionPlan;
  /** ISO date when premium ends; null = no active premium */
  expiresAt: string | null;
  activatedAt: string | null;
  productId: string | null;
};

const KEY = 'nepse:subscription:v1';

const DEFAULT: SubscriptionState = {
  plan: 'free',
  expiresAt: null,
  activatedAt: null,
  productId: null,
};

export async function loadSubscription(): Promise<SubscriptionState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as SubscriptionState;
    return { ...DEFAULT, ...parsed };
  } catch {
    return { ...DEFAULT };
  }
}

async function save(state: SubscriptionState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export function isPremiumActive(state: SubscriptionState, now = new Date()): boolean {
  if (state.plan !== 'premium') return false;
  if (!state.expiresAt) return false;
  return new Date(state.expiresAt).getTime() > now.getTime();
}

export function subscriptionDaysLeft(
  state: SubscriptionState,
  now = new Date(),
): number | null {
  if (!isPremiumActive(state, now) || !state.expiresAt) return null;
  const ms = new Date(state.expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Demo / manual activation until Play Store billing is wired. */
export async function activatePremiumDays(
  days: number,
  productId = 'premium_monthly',
): Promise<SubscriptionState> {
  const now = new Date();
  const expires = new Date(now.getTime() + days * 86_400_000);
  const next: SubscriptionState = {
    plan: 'premium',
    activatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    productId,
  };
  await save(next);
  return next;
}

export async function clearSubscription(): Promise<SubscriptionState> {
  await save({ ...DEFAULT });
  return { ...DEFAULT };
}

const CACHE_KEY = 'nepse:subscription:cache:v1';
const CACHE_TTL_MS = 86_400_000;

export type PremiumCache = {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  cachedAt: string;
};

export async function cachePremiumFromServer(premium: {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
}): Promise<void> {
  const cache: PremiumCache = {
    ...premium,
    cachedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  if (premium.active && premium.expiresAt) {
    await save({
      plan: 'premium',
      expiresAt: premium.expiresAt,
      activatedAt: new Date().toISOString(),
      productId: premium.plan,
    });
  } else {
    await save({ ...DEFAULT });
  }
}

export async function loadPremiumCache(): Promise<PremiumCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PremiumCache;
  } catch {
    return null;
  }
}

export function isPremiumCacheValid(
  cache: PremiumCache | null,
  now = Date.now(),
): boolean {
  if (!cache?.active) return false;
  const cachedAt = new Date(cache.cachedAt).getTime();
  if (Number.isNaN(cachedAt) || now - cachedAt > CACHE_TTL_MS) return false;
  if (!cache.expiresAt) return false;
  return new Date(cache.expiresAt).getTime() > now;
}

export async function clearPremiumCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}

export const PREMIUM_PLANS = [
  {
    id: 'premium_monthly',
    title: 'Premium Monthly',
    price: 'Rs 299',
    period: '30 days',
    days: 30,
    perks: [
      'Investment Summary across portfolios',
      'Aggressive Holders & smart-money signals',
      'Live Market Pulse dashboard',
      'Accumulation / Distribution scanners',
      'Top Buyers, Sellers, Holders & Releases',
      'Broker Favorites & Top Buy/Sell intel',
      '52 Week High / Low advanced screener',
      'Small Caps, Rising Stocks & Price Droppers',
      'Value Pick, Unlock Period & sector leaders',
      'Hydropower, Microfinance, Dev & Finance leaders',
      'Strong Reserves, High Earners & Stock Filter',
      'Financial Reports, Floor Sheet & Market Depth',
      'Live 20s refresh on all premium screeners',
    ],
  },
  {
    id: 'premium_yearly',
    title: 'Premium Yearly',
    price: 'Rs 2,499',
    period: '365 days',
    days: 365,
    perks: [
      'Everything in Monthly',
      'Best value — save ~30%',
      'Priority data refresh',
    ],
  },
] as const;
