/**
 * Temporary dev flag: open premium service screens without subscription or sign-in.
 * Set EXPO_PUBLIC_PREMIUM_BYPASS=false to restore paywall.
 */
export const PREMIUM_ACCESS_BYPASS =
  (process.env.EXPO_PUBLIC_PREMIUM_BYPASS ?? 'true').toLowerCase() !== 'false';
