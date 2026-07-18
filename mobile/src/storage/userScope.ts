/** Unauthenticated local namespace — cleared after auto-import on first login. */
export const GUEST_USER_ID = 'guest';

let activeUserId: string = GUEST_USER_ID;

export function getActiveUserId(): string {
  return activeUserId;
}

export function setActiveUserId(userId: string | null): void {
  activeUserId = userId ?? GUEST_USER_ID;
}

export function scopedAsyncKey(base: string, userId = activeUserId): string {
  return `@nepse_ghar/${userId}/${base}`;
}

export function scopedSecretKey(accountId: string, userId = activeUserId): string {
  return `nepse_ghar_${userId}_secret_${accountId}`;
}

export function scopedRefreshTokenKey(userId = activeUserId): string {
  return `nepse_ghar_${userId}_refresh_token`;
}

export function scopedPinKey(userId = activeUserId): string {
  return `nepse_ghar_${userId}_pin_hash`;
}

export function scopedPinLockKey(userId = activeUserId): string {
  return `nepse_ghar_${userId}_pin_lock`;
}

export const LEGACY_META_KEY = '@nepse_ghar/accounts_v2';
export const LEGACY_HISTORY_KEY = '@nepse_ghar/apply_history_v1';
export const LEGACY_PORTFOLIO_KEY = 'nepse:portfolios:v1';
export const LEGACY_WATCHLIST_KEY = 'nepse:watchlist:v1';

export const META_BASE = 'accounts_v2';
export const HISTORY_BASE = 'apply_history_v1';
export const PORTFOLIO_BASE = 'portfolios_v1';
export const WATCHLIST_BASE = 'watchlist_v1';
