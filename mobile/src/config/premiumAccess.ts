/**
 * TEMP: open premium screens without subscription / admin approval.
 * Set default back to 'false' (or EXPO_PUBLIC_PREMIUM_BYPASS=false) before shipping.
 */
export const PREMIUM_ACCESS_BYPASS =
  (process.env.EXPO_PUBLIC_PREMIUM_BYPASS ?? 'true').toLowerCase() === 'true';
