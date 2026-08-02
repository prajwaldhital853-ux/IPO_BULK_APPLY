import React, { useCallback, useMemo } from 'react';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { pausePrefetch } from '../services/nepse/prefetchGate';
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
import { EditAccountScreen } from '../screens/EditAccountScreen';
import { BankDetailScreen } from '../screens/BankDetailScreen';
import { CurrentIpoStatusScreen } from '../screens/CurrentIpoStatusScreen';
import { IpoBulkStatusScreen } from '../screens/IpoBulkStatusScreen';
import { AllIpoStatusScreen } from '../screens/AllIpoStatusScreen';
import { AllIpoStatisticsScreen } from '../screens/AllIpoStatisticsScreen';
import { CheckResultWebScreen } from '../screens/CheckResultWebScreen';
import { IpoStatusDetailScreen } from '../screens/IpoStatusDetailScreen';
import { PublicIpoResultScreen } from '../screens/PublicIpoResultScreen';
import { NepseDataScreen } from '../screens/NepseDataScreen';
import { NepseCalendarScreen } from '../screens/NepseCalendarScreen';
import { PortfolioScreen } from '../screens/PortfolioScreen';
import { UserPortfolioScreen } from '../screens/UserPortfolioScreen';
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
import { CalculateWaccScreen } from '../screens/CalculateWaccScreen';
import { TrackAccountExpiryScreen } from '../screens/TrackAccountExpiryScreen';
import { BankTrackerScreen } from '../screens/BankTrackerScreen';
import { BankTrackerDetailScreen } from '../screens/BankTrackerDetailScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { AboutCompanyScreen } from '../screens/AboutCompanyScreen';
import { TeamMembersScreen } from '../screens/TeamMembersScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { AdminLoginScreen } from '../screens/AdminLoginScreen';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { AdminSettingsScreen } from '../screens/AdminSettingsScreen';
import { AdminTeamScreen } from '../screens/AdminTeamScreen';
import { AdminMarketClosuresScreen } from '../screens/AdminMarketClosuresScreen';
import { AdminIpoIssuesScreen } from '../screens/AdminIpoIssuesScreen';
import { AdminForgotPasswordScreen } from '../screens/AdminForgotPasswordScreen';
import { AppSettingsScreen } from '../screens/AppSettingsScreen';
import { FeedbackFormScreen } from '../screens/FeedbackFormScreen';
import { InvestmentSummaryScreen } from '../screens/premium/InvestmentSummaryScreen';
import { LiveMarketPulseScreen } from '../screens/premium/LiveMarketPulseScreen';
import { AggressiveHoldersScreen } from '../screens/premium/AggressiveHoldersScreen';
import {
  AccumulationScreen,
  DistributionScreen,
} from '../screens/premium/BrokerFlowScreen';
import { BrokerFavoritesScreen } from '../screens/premium/BrokerFavoritesScreen';
import { BrokerTopBuySellScreen } from '../screens/premium/BrokerTopBuySellScreen';
import {
  TopBuyersScreen,
  TopSellersScreen,
} from '../screens/premium/TopBuySellTableScreen';
import {
  TopHoldersScreen,
  TopReleasesScreen,
} from '../screens/premium/TopHoldReleaseTableScreen';
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
import { isTablet, rs, wp } from '../utils/responsive';
import type { MainTabParamList, RootStackParamList } from './types';

enableScreens(true);

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <AppTabBar {...props} />}
      // Detach + freeze inactive tabs so Apply/Services/Check don't keep
      // burning JS while Home (or another tab) is in front.
      detachInactiveScreens={true}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        animation: 'none',
        // Mount each tab on first visit only — never keep all five warm.
        lazy: true,
        freezeOnBlur: true,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Apply" component={ApplyScreen} options={{ title: 'Apply' }} />
      <Tab.Screen name="Services" component={ServicesScreen} options={{ title: 'Services' }} />
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
      // Keep previous screen attached (instant back) but freeze its React tree
      // so Services/Home don't keep burning JS under a pushed premium page.
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        // Instant push + pop — slide animations stall when JS is busy and make
        // back feel delayed. Shell-first screens handle the open polish.
        animation: 'none',
        animationTypeForReplace: 'push',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        freezeOnBlur: true,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AddCapital" component={AddCapitalScreen} />
      <Stack.Screen name="EditAccount" component={EditAccountScreen} />
      <Stack.Screen name="BankDetail" component={BankDetailScreen} />
      <Stack.Screen name="CurrentIpoStatus" component={CurrentIpoStatusScreen} />
      <Stack.Screen name="IpoBulkStatus" component={IpoBulkStatusScreen} />
      <Stack.Screen name="AllIpoStatus" component={AllIpoStatusScreen} />
      <Stack.Screen name="AllIpoStatistics" component={AllIpoStatisticsScreen} />
      <Stack.Screen name="CheckResultWeb" component={CheckResultWebScreen} />
      <Stack.Screen name="IpoStatusDetail" component={IpoStatusDetailScreen} />
      <Stack.Screen name="PublicIpoResult" component={PublicIpoResultScreen} />
      <Stack.Screen name="NepseData" component={NepseDataScreen} />
      <Stack.Screen name="NepseCalendar" component={NepseCalendarScreen} />
      <Stack.Screen name="Portfolio" component={PortfolioScreen} />
      <Stack.Screen name="UserPortfolio" component={UserPortfolioScreen} />
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
      <Stack.Screen name="CalculateWacc" component={CalculateWaccScreen} />
      <Stack.Screen name="TrackAccountExpiry" component={TrackAccountExpiryScreen} />
      <Stack.Screen name="BankTracker" component={BankTrackerScreen} />
      <Stack.Screen name="BankTrackerDetail" component={BankTrackerDetailScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="AboutCompany" component={AboutCompanyScreen} />
      <Stack.Screen name="TeamMembers" component={TeamMembersScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} />
      <Stack.Screen name="AdminTeam" component={AdminTeamScreen} />
      <Stack.Screen
        name="AdminMarketClosures"
        component={AdminMarketClosuresScreen}
      />
      <Stack.Screen name="AdminIpoIssues" component={AdminIpoIssuesScreen} />
      <Stack.Screen name="AdminForgotPassword" component={AdminForgotPasswordScreen} />
      <Stack.Screen name="AppSettings" component={AppSettingsScreen} />
      <Stack.Screen name="FeedbackForm" component={FeedbackFormScreen} />
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
  const drawerWidth = isTablet ? Math.min(wp(42), 380) : wp(70);

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

  // Free the JS thread for transitions / presses — pause background warm-up.
  const onNavStateChange = useCallback(() => {
    pausePrefetch(3500);
  }, []);

  return (
    <NavigationContainer theme={navTheme} onStateChange={onNavStateChange}>
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
            borderTopRightRadius: rs(18),
            borderBottomRightRadius: rs(18),
            overflow: 'hidden',
          },
        }}
      >
        <Drawer.Screen name="RootStack" component={RootStack} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
