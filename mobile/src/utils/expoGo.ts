import Constants, { ExecutionEnvironment } from 'expo-constants';

/** True when running inside the Expo Go store client (not a dev/production build). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}
