import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthGateSheet, useAuthGate } from './AuthGateSheet';

export function ProtectedPersonalScreen({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
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

  if (dismissed) return <>{children}</>;

  return (
    <>
      <View style={styles.dimmed} pointerEvents="none">
        {children}
      </View>
      <AuthGateSheet
        visible
        title={title}
        subtitle={subtitle}
        onDismiss={() => setDismissed(true)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dimmed: { flex: 1, opacity: 0.35 },
});
