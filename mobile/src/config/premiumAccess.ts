/**
 * Dev-only: open premium screens without subscription / admin approval.
 * Default off — only admin-approved premium users get access.
 * Set EXPO_PUBLIC_PREMIUM_BYPASS=true to re-enable for testing.
 */
export const PREMIUM_ACCESS_BYPASS =
  (process.env.EXPO_PUBLIC_PREMIUM_BYPASS ?? 'false').toLowerCase() === 'true';
