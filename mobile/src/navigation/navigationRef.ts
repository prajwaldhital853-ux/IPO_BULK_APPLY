import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateFromNotification(
  name: keyof RootStackParamList,
  params?: RootStackParamList[keyof RootStackParamList],
): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate(name as never, params as never);
}
