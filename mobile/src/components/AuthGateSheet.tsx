import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { rs } from '../utils/responsive';

export function useAuthGate() {
  const auth = useAuth();
  return {
    enabled: auth.enabled,
    loading: auth.loading,
    isAuthenticated: auth.enabled ? auth.isAuthenticated : true,
    signIn: auth.signInWithGoogle,
    user: auth.user,
  };
}

export function AuthGateSheet({
  visible,
  title = 'Sign in to continue',
  subtitle = 'Sign in with Google for premium, bulk apply, and IPO result checks across devices. You can still add MeroShare accounts on this phone without signing in. Market data stays free.',
  onDismiss,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onDismiss?: () => void;
}) {
  const { signIn } = useAuthGate();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!visible) return null;

  const onSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      {onDismiss ? (
        <Pressable
          style={styles.backdropTap}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sign in"
        />
      ) : (
        <View style={styles.backdropTap} />
      )}
      <View
        style={[styles.sheet, { backgroundColor: colors.surface }]}
        accessibilityRole="menu"
      >
        <View style={[styles.handle, { backgroundColor: colors.borderMuted }]} />
        <Ionicons name="shield-checkmark-outline" size={rs(40)} color={colors.tealHeader} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{subtitle}</Text>
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
        <Pressable
          style={[styles.googleBtn, busy && styles.disabled]}
          onPress={() => void onSignIn()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={rs(18)} color="#fff" />
              <Text style={styles.googleText}>Sign in with Google</Text>
            </>
          )}
        </Pressable>
        {onDismiss ? (
          <Pressable onPress={onDismiss} style={styles.dismissBtn} hitSlop={8}>
            <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
              Not now
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 50,
    elevation: 50,
  },
  backdropTap: {
    flex: 1,
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    paddingHorizontal: rs(24),
    paddingTop: rs(12),
    paddingBottom: rs(32),
    alignItems: 'center',
    gap: rs(10),
    width: '100%',
    zIndex: 51,
    elevation: 51,
  },
  handle: {
    width: rs(40),
    height: rs(4),
    borderRadius: rs(2),
    marginBottom: rs(8),
  },
  title: { fontWeight: '800', fontSize: rs(18), textAlign: 'center' },
  sub: { fontSize: rs(13), lineHeight: rs(18), textAlign: 'center' },
  error: { fontSize: rs(12), textAlign: 'center' },
  googleBtn: {
    marginTop: rs(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    backgroundColor: '#4285F4',
    paddingHorizontal: rs(20),
    paddingVertical: rs(14),
    borderRadius: rs(12),
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  googleText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
  disabled: { opacity: 0.7 },
  dismissBtn: { paddingVertical: rs(10) },
  dismissText: { fontSize: rs(13) },
});
