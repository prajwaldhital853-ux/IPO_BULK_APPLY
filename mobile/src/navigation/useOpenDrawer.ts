import { DrawerActions, useNavigation } from '@react-navigation/native';

/** Open parent drawer from any nested tab/stack screen */
export function useOpenDrawer() {
  const navigation = useNavigation();
  return () => navigation.dispatch(DrawerActions.openDrawer());
}
