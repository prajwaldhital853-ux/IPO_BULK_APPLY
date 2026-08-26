import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Expo Go (StoreClient) — dev shell, slower JS/WebView than release APK. */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Installed preview/production APK (not Expo Go). */
export function isStandaloneNativeApp(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.Standalone;
}
