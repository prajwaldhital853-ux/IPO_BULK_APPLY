/**
 * Dev-only: open premium screens without subscription / admin approval.
 * TEMPORARILY defaulted ON for testing the performance fixes across premium
 * tools — set back to 'false' (or EXPO_PUBLIC_PREMIUM_BYPASS=false) before
 * shipping a production build.
 */
export const PREMIUM_ACCESS_BYPASS =
  (process.env.EXPO_PUBLIC_PREMIUM_BYPASS ?? 'true').toLowerCase() === 'true';
