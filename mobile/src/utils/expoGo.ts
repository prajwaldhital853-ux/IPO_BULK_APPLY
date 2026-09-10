import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GUEST_CAN_ADD_ACCOUNTS } from '../services/auth/config';

/** True when running inside the Expo Go store client (not a dev/production build). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Local dev: skip Google sign-in gates (Expo Go or EXPO_PUBLIC_GUEST_CAN_ADD_ACCOUNTS). */
export function allowsLocalGuestAccess(): boolean {
  return GUEST_CAN_ADD_ACCOUNTS || isExpoGo();
}

/**
 * Expo Go without Google sign-in — high local cap for dev/load testing.
 * Standalone APK / dev builds keep normal free/premium limits.
 */
export const EXPO_GO_DEV_ACCOUNT_LIMIT = 99_999;

export function expoGoDevAccountLimitActive(isAuthenticated: boolean): boolean {
  return isExpoGo() && !isAuthenticated;
}
