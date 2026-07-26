import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { AppLockProvider } from './src/context/AppLockContext';
import { AccountsProvider } from './src/context/AccountsContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { AppBrandingProvider } from './src/context/AppBrandingContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AppWarmup } from './src/components/AppWarmup';
import { StartupNoticeModal } from './src/components/StartupNoticeModal';
import { RootNavigator } from './src/navigation/RootNavigator';

function AppShell() {
  const { colors, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaProvider>
        <AppBrandingProvider>
          <AuthProvider>
            <AppLockProvider>
              <AccountsProvider>
                <SubscriptionProvider>
                  <StatusBar style={isDark ? 'light' : 'dark'} />
                  <AppWarmup />
                  <RootNavigator />
                  <StartupNoticeModal />
                </SubscriptionProvider>
              </AccountsProvider>
            </AppLockProvider>
          </AuthProvider>
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
