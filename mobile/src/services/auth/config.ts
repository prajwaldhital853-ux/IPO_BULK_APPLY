export const AUTH_ENABLED =
  (process.env.EXPO_PUBLIC_AUTH_ENABLED ?? 'true').toLowerCase() !== 'false';

/**
 * Add MeroShare accounts without Google sign-in (local limits only, no cross-device sync).
 * Defaults to false — set EXPO_PUBLIC_GUEST_CAN_ADD_ACCOUNTS=true only for local dev.
 */
export const GUEST_CAN_ADD_ACCOUNTS =
  (process.env.EXPO_PUBLIC_GUEST_CAN_ADD_ACCOUNTS ?? 'false').toLowerCase() ===
  'true';

export const AUTH_API_BASE = (
  process.env.EXPO_PUBLIC_AUTH_API_URL ??
  'https://api.nepseghar.com'
).replace(/\/$/, '');

export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';

export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

export function googleClientIds(): string[] {
  return [GOOGLE_WEB_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID].filter(
    Boolean,
  );
}
