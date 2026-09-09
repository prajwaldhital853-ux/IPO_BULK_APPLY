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
