/** Google OAuth redirect for native Android/iOS (not auth.expo.io). */
export function googleNativeRedirectUri(clientId: string): string {
  const trimmed = clientId.trim();
  const base = trimmed.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${base}:/oauthredirect`;
}
