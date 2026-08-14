import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { AccountLimitBlockedProvider } from './src/context/AccountLimitBlockedContext';
import { AuthProvider } from './src/context/AuthContext';
import { AppLockProvider } from './src/context/AppLockContext';
import { AccountsProvider } from './src/context/AccountsContext';
import { ActiveAccountsProvider } from './src/context/ActiveAccountsContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { AppBrandingProvider } from './src/context/AppBrandingContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AppWarmup } from './src/components/AppWarmup';
import { StartupNoticeModal } from './src/components/StartupNoticeModal';
import { RootNavigator } from './src/navigation/RootNavigator';
import { loadNotificationsEnabled } from './src/storage/appPreferencesStorage';
import { registerPushTokenOnServer } from './src/services/push/notifications';

function AppShell() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    void loadNotificationsEnabled().then((enabled) => {
      if (enabled) void registerPushTokenOnServer(true);
    });
  }, []);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaProvider>
        <AppBrandingProvider>
          <AccountLimitBlockedProvider>
            <AuthProvider>
              <AppLockProvider>
                <AccountsProvider>
                  <SubscriptionProvider>
                    <ActiveAccountsProvider>
                      <StatusBar style={isDark ? 'light' : 'dark'} />
                      <AppWarmup />
                      <RootNavigator />
                      <StartupNoticeModal />
                    </ActiveAccountsProvider>
                  </SubscriptionProvider>
                </AccountsProvider>
              </AppLockProvider>
            </AuthProvider>
          </AccountLimitBlockedProvider>
        </AppBrandingProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
