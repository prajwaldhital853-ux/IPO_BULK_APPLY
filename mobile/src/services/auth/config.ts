export const AUTH_ENABLED =
  (process.env.EXPO_PUBLIC_AUTH_ENABLED ?? 'true').toLowerCase() !== 'false';

export const AUTH_API_BASE = (
  process.env.EXPO_PUBLIC_AUTH_API_URL ??
  'https://ipo-bulk-apply-vti5.onrender.com'
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
