import React, { useMemo } from 'react';
import { Easing } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { enableScreens } from 'react-native-screens';
import { HomeScreen } from '../screens/HomeScreen';
import { ApplyScreen } from '../screens/ApplyScreen';
import { ServicesScreen } from '../screens/ServicesScreen';
import { CheckScreen } from '../screens/CheckScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AddCapitalScreen } from '../screens/AddCapitalScreen';
import { BankDetailScreen } from '../screens/BankDetailScreen';
import { CurrentIpoStatusScreen } from '../screens/CurrentIpoStatusScreen';
import { PublicIpoResultScreen } from '../screens/PublicIpoResultScreen';
import { NepseDataScreen } from '../screens/NepseDataScreen';
import { NepseCalendarScreen } from '../screens/NepseCalendarScreen';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { PortfolioDetailScreen } from '../screens/PortfolioDetailScreen';
import { StockListScreen } from '../screens/StockListScreen';
import { HighDemandScreen } from '../screens/HighDemandScreen';
import { NepseHistoryScreen } from '../screens/NepseHistoryScreen';
import { BulkTransactionsScreen } from '../screens/BulkTransactionsScreen';
import { ProposedDividendScreen } from '../screens/ProposedDividendScreen';
import { AnnouncementsScreen } from '../screens/AnnouncementsScreen';
import { ChartsScreen } from '../screens/ChartsScreen';
import { WatchlistScreen } from '../screens/WatchlistScreen';
import { StockDetailScreen } from '../screens/StockDetailScreen';
import { PriceAlertScreen } from '../screens/PriceAlertScreen';
import { BulkPortfolioScreen } from '../screens/BulkPortfolioScreen';
import { IpoIssuesScreen } from '../screens/IpoIssuesScreen';
import { MeroshareWebScreen } from '../screens/MeroshareWebScreen';
import { AccountExpiryScreen } from '../screens/AccountExpiryScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { InvestmentSummaryScreen } from '../screens/premium/InvestmentSummaryScreen';
import { LiveMarketPulseScreen } from '../screens/premium/LiveMarketPulseScreen';
import {
  AccumulationScreen,
  AggressiveHoldersScreen,
  DistributionScreen,
} from '../screens/premium/PremiumScannerScreen';
import {
  BrokerFavoritesScreen,
  BrokerTopBuySellScreen,
  TopBuyersScreen,
  TopHoldersScreen,
  TopReleasesScreen,
  TopSellersScreen,
} from '../screens/premium/PremiumIntelScreen';
import {
  FiftyTwoWeekHighScreen,
  FiftyTwoWeekLowScreen,
} from '../screens/premium/FiftyTwoWeekScreen';
import { PremiumScreenerScreen } from '../screens/premium/PremiumScreenerScreen';
import { PremiumToolScreen } from '../screens/premium/PremiumToolScreen';
import { ExtraToolScreen } from '../screens/extra/ExtraToolScreen';
import { CalculatorScreen } from '../screens/extra/CalculatorScreen';
import { FinancialNewsScreen } from '../screens/FinancialNewsScreen';
import { TmsBrokersScreen } from '../screens/TmsBrokersScreen';
import { DrawerContent } from '../components/DrawerContent';
import { AppTabBar } from '../components/AppTabBar';
import { useTheme } from '../context/ThemeContext';
import { isTablet, wp } from '../utils/responsive';
import type { MainTabParamList, RootStackParamList } from './types';

enableScreens(true);

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator();

const tabTransitionSpec = {
  animation: 'timing' as const,
  config: {
    duration: 180,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <AppTabBar {...props} />}
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        animation: 'fade',
        transitionSpec: tabTransitionSpec,
        lazy: true,
        freezeOnBlur: true,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Apply" component={ApplyScreen} options={{ title: 'Apply' }} />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{ title: 'Services' }}
      />
      <Tab.Screen name="Check" component={CheckScreen} options={{ title: 'Check' }} />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

function RootStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 220,
        animationTypeForReplace: 'push',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AddCapital" component={AddCapitalScreen} />
      <Stack.Screen name="BankDetail" component={BankDetailScreen} />
      <Stack.Screen name="CurrentIpoStatus" component={CurrentIpoStatusScreen} />
      <Stack.Screen name="PublicIpoResult" component={PublicIpoResultScreen} />
      <Stack.Screen name="NepseData" component={NepseDataScreen} />
      <Stack.Screen name="NepseCalendar" component={NepseCalendarScreen} />
      <Stack.Screen name="Portfolio" component={PortfolioScreen} />
      <Stack.Screen name="PortfolioDetail" component={PortfolioDetailScreen} />
      <Stack.Screen name="StockList" component={StockListScreen} />
      <Stack.Screen name="HighDemand" component={HighDemandScreen} />
      <Stack.Screen name="NepseHistory" component={NepseHistoryScreen} />
      <Stack.Screen name="BulkTransactions" component={BulkTransactionsScreen} />
      <Stack.Screen name="ProposedDividend" component={ProposedDividendScreen} />
      <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
      <Stack.Screen name="Charts" component={ChartsScreen} />
      <Stack.Screen name="Watchlist" component={WatchlistScreen} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} />
      <Stack.Screen name="PriceAlert" component={PriceAlertScreen} />
      <Stack.Screen name="BulkPortfolio" component={BulkPortfolioScreen} />
      <Stack.Screen name="IpoIssues" component={IpoIssuesScreen} />
      <Stack.Screen name="MeroshareWeb" component={MeroshareWebScreen} />
      <Stack.Screen name="AccountExpiry" component={AccountExpiryScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="InvestmentSummary" component={InvestmentSummaryScreen} />
      <Stack.Screen name="AggressiveHolders" component={AggressiveHoldersScreen} />
      <Stack.Screen name="LiveMarketPulse" component={LiveMarketPulseScreen} />
      <Stack.Screen name="Accumulation" component={AccumulationScreen} />
      <Stack.Screen name="Distribution" component={DistributionScreen} />
      <Stack.Screen name="TopBuyers" component={TopBuyersScreen} />
      <Stack.Screen name="TopSellers" component={TopSellersScreen} />
      <Stack.Screen name="TopHolders" component={TopHoldersScreen} />
      <Stack.Screen name="TopReleases" component={TopReleasesScreen} />
      <Stack.Screen name="BrokerFavorites" component={BrokerFavoritesScreen} />
      <Stack.Screen name="BrokerTopBuySell" component={BrokerTopBuySellScreen} />
      <Stack.Screen name="FiftyTwoWeekHigh" component={FiftyTwoWeekHighScreen} />
      <Stack.Screen name="FiftyTwoWeekLow" component={FiftyTwoWeekLowScreen} />
      <Stack.Screen name="PremiumScreener" component={PremiumScreenerScreen} />
      <Stack.Screen name="PremiumTool" component={PremiumToolScreen} />
      <Stack.Screen name="ExtraTool" component={ExtraToolScreen} />
      <Stack.Screen name="Calculator" component={CalculatorScreen} />
      <Stack.Screen name="FinancialNews" component={FinancialNewsScreen} />
      <Stack.Screen name="TmsBrokers" component={TmsBrokersScreen} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  const drawerWidth = isTablet ? Math.min(wp(45), 400) : wp(82);

  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        background: colors.bg,
        card: colors.bgElevated,
        text: colors.text,
        border: colors.border,
        primary: colors.primary,
      },
    }),
    [colors, isDark],
  );

  return (
    <NavigationContainer theme={navTheme}>
      <Drawer.Navigator
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          overlayColor: colors.overlay,
          swipeEnabled: true,
          drawerStyle: {
            width: drawerWidth,
            backgroundColor: colors.bg,
          },
        }}
      >
        <Drawer.Screen name="RootStack" component={RootStack} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
