import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Apply: undefined;
  Services: undefined;
  Check: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  AddCapital: undefined;
  BankDetail: undefined;
  CurrentIpoStatus: undefined;
};

export type DrawerParamList = {
  RootStack: NavigatorScreenParams<RootStackParamList> | undefined;
};
