import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthGateSheet, useAuthGate } from './AuthGateSheet';

export function ProtectedPersonalScreen({
  children,
  title,
  subtitle,
  /** When true, user must sign in — no "Not now" dismiss. */
  requireSignIn = false,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  requireSignIn?: boolean;
}) {
  const { enabled, isAuthenticated, loading } = useAuthGate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isAuthenticated) setDismissed(false);
  }, [isAuthenticated]);

  if (!enabled || isAuthenticated) return <>{children}</>;
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!requireSignIn && dismissed) return <>{children}</>;

  return (
    <View style={styles.host}>
      <View style={[styles.content, styles.dimmed]} pointerEvents="none">
        {children}
      </View>
      <AuthGateSheet
        visible
        title={title}
        subtitle={subtitle}
        onDismiss={requireSignIn ? undefined : () => setDismissed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.35 },
});
