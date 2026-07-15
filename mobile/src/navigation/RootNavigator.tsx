import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { ApplyScreen } from '../screens/ApplyScreen';
import { ServicesScreen } from '../screens/ServicesScreen';
import { CheckScreen } from '../screens/CheckScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AddCapitalScreen } from '../screens/AddCapitalScreen';
import { BankDetailScreen } from '../screens/BankDetailScreen';
import { CurrentIpoStatusScreen } from '../screens/CurrentIpoStatusScreen';
import { DrawerContent } from '../components/DrawerContent';
import { colors } from '../theme/colors';
import { rs, isTablet, wp } from '../utils/responsive';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => {
          const size = rs(22);
          const icon = (() => {
            switch (route.name) {
              case 'Home':
                return <Ionicons name="home" size={size} color={color} />;
              case 'Apply':
                return <MaterialCommunityIcons name="bank" size={size} color={color} />;
              case 'Services':
                return <Ionicons name="options" size={size} color={color} />;
              case 'Check':
                return (
                  <Ionicons name="checkmark-circle-outline" size={size} color={color} />
                );
              case 'Profile':
                return <Ionicons name="person" size={size} color={color} />;
              default:
                return null;
            }
          })();
          return (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              {icon}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Apply" component={ApplyScreen} />
      <Tab.Screen name="Services" component={ServicesScreen} />
      <Tab.Screen name="Check" component={CheckScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function RootStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AddCapital" component={AddCapitalScreen} />
      <Stack.Screen name="BankDetail" component={BankDetailScreen} />
      <Stack.Screen name="CurrentIpoStatus" component={CurrentIpoStatusScreen} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const drawerWidth = isTablet ? Math.min(wp(45), 400) : wp(82);

  return (
    <NavigationContainer theme={navTheme}>
      <Drawer.Navigator
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          drawerStyle: {
            width: drawerWidth,
            backgroundColor: colors.bg,
          },
          overlayColor: colors.overlay,
        }}
      >
        <Drawer.Screen name="RootStack" component={RootStack} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgElevated,
    borderTopColor: colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: rs(64),
    paddingBottom: rs(8),
    paddingTop: rs(6),
  },
  tabLabel: {
    fontSize: rs(11),
    fontWeight: '600',
  },
  iconWrap: {
    paddingHorizontal: rs(12),
    paddingVertical: rs(4),
    borderRadius: rs(16),
  },
  iconWrapActive: {
    backgroundColor: colors.tabActiveBg,
  },
});
