/**
 * Premium screens require an admin-approved subscription unless explicitly
 * overridden with EXPO_PUBLIC_PREMIUM_BYPASS=true (dev only).
 */
export const PREMIUM_ACCESS_BYPASS =
  (process.env.EXPO_PUBLIC_PREMIUM_BYPASS ?? 'false').toLowerCase() === 'true';
