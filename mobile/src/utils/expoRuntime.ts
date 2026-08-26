import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Expo Go (StoreClient) — dev shell, never a released build. */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Installed APK / dev-client build.
 *
 * EAS builds report executionEnvironment 'bare' (only the retired classic
 * build service reported 'standalone'), so detect by "native and not Expo Go".
 */
export function isStandaloneNativeApp(): boolean {
  return Platform.OS !== 'web' && !isExpoGo();
}
