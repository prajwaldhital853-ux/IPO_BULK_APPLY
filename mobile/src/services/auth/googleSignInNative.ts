import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { GOOGLE_WEB_CLIENT_ID } from './config';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

let googleModule: GoogleSignInModule | null = null;
let configured = false;

export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function canUseNativeGoogleSignIn(): boolean {
  return Platform.OS !== 'web' && !isExpoGo() && Boolean(GOOGLE_WEB_CLIENT_ID);
}

async function loadGoogleSignIn(): Promise<GoogleSignInModule> {
  if (googleModule) return googleModule;
  if (isExpoGo()) {
    throw new Error(
      'Native Google sign-in needs a preview APK. In Expo Go the browser sign-in path is used instead — run: npm run start:go',
    );
  }
  googleModule = await import('@react-native-google-signin/google-signin');
  return googleModule;
}

export async function ensureGoogleSignInConfigured(): Promise<void> {
  if (configured || !GOOGLE_WEB_CLIENT_ID || isExpoGo()) return;
  const { GoogleSignin } = await loadGoogleSignIn();
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/** Native Google account picker — no Chrome redirect. Requires dev/EAS build. */
export async function signInWithGoogleNative(): Promise<string> {
  if (isExpoGo()) {
    throw new Error(
      'Native Google sign-in needs a preview APK. In Expo Go the browser sign-in path is used instead — run: npm run start:go',
    );
  }
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set.');
  }
  await ensureGoogleSignInConfigured();
  const { GoogleSignin, isCancelledResponse, isSuccessResponse } =
    await loadGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (isCancelledResponse(response)) {
    throw new Error('Google sign-in cancelled');
  }
  if (!isSuccessResponse(response)) {
    throw new Error('Google sign-in failed');
  }
  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error('Google did not return an id_token. Check Web client ID in Google Console.');
  }
  return idToken;
}

export async function signOutGoogleNative(): Promise<void> {
  if (!canUseNativeGoogleSignIn()) return;
  try {
    await ensureGoogleSignInConfigured();
    const { GoogleSignin } = await loadGoogleSignIn();
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}
