import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { GOOGLE_WEB_CLIENT_ID } from './config';

WebBrowser.maybeCompleteAuthSession();

/**
 * Browser-based Google ID token for Expo Go (no native Google Sign-In module).
 * Works for local UI testing; production APK still uses native picker.
 */
export async function signInWithGoogleExpoGo(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in .env');
  }

  const redirectUri = AuthSession.makeRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.IdToken,
    usePKCE: false,
    extraParams: {
      nonce: `${Date.now()}${Math.random().toString(36).slice(2)}`,
      // Always show the Google account chooser (don't reuse last account silently).
      prompt: 'select_account',
    },
  });

  const result = await request.promptAsync({
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  });

  if (result.type === 'dismiss' || result.type === 'cancel') {
    throw new Error('Google sign-in cancelled');
  }
  if (result.type !== 'success') {
    throw new Error(
      `Google sign-in failed in Expo Go (redirect: ${redirectUri}). You can still browse the app as a guest.`,
    );
  }

  const idToken =
    result.params.id_token ??
    (result as { authentication?: { idToken?: string } }).authentication
      ?.idToken;
  if (!idToken) {
    throw new Error(
      'Google did not return an id_token. Add this redirect URI in Google Cloud Console:\n' +
        redirectUri,
    );
  }
  return idToken;
}
