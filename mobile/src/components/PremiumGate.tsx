import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import { useAppBranding } from '../context/AppBrandingContext';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { PREMIUM_ACCESS_BYPASS } from '../config/premiumAccess';
import { rs } from '../utils/responsive';

export function PremiumGate({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { isPremium, isPending, loading } = useSubscription();
  const auth = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();

  if (PREMIUM_ACCESS_BYPASS) return <>{children}</>;

  if (loading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (isPremium) return <>{children}</>;

  if (isPending) {
    return (
      <PendingWall
        colors={colors}
        title={title}
        onOpenSubscription={() => navigation.navigate('Subscription')}
      />
    );
  }

  const needsSignIn = auth.enabled && !auth.isAuthenticated;

  return (
    <Paywall
      colors={colors}
      title={title}
      subtitle={subtitle}
      ctaLabel={needsSignIn ? 'Sign in with Google to subscribe' : 'Subscribe with Google'}
      onSubscribe={() => navigation.navigate('Subscription')}
    />
  );
}

function PendingWall({
  colors,
  title,
  onOpenSubscription,
}: {
  colors: ThemeColors;
  title: string;
  onOpenSubscription: () => void;
}) {
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: '#F9A825' },
        ]}
      >
        <Ionicons name="time-outline" size={rs(44)} color="#F9A825" />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Your premium payment is pending verification. Admin will activate your
          account after checking your WhatsApp payment screenshot.
        </Text>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.fab }]}
          onPress={onOpenSubscription}
        >
          <Text style={styles.btnText}>View subscription status</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Paywall({
  colors,
  title,
  subtitle,
  ctaLabel,
  onSubscribe,
}: {
  colors: ThemeColors;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  onSubscribe: () => void;
}) {
  const { plans } = useAppBranding();
  const plan = plans[0];
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.borderMuted },
        ]}
      >
        <Ionicons name="diamond-outline" size={rs(44)} color={colors.tealHeader} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {subtitle ??
            'Premium unlocks institutional-grade NEPSE analytics built for serious investors.'}
        </Text>
        <View style={styles.perks}>
          {(plan?.perks ?? []).slice(0, 5).map((p) => (
            <Text key={p} style={[styles.perk, { color: colors.textSecondary }]}>
              ✓ {p}
            </Text>
          ))}
        </View>
        <Text style={[styles.perk, { color: colors.textMuted, textAlign: 'center' }]}>
          Sign in with Google, pay via QR, then wait for admin approval.
        </Text>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.fab }]}
          onPress={onSubscribe}
        >
          <Text style={styles.btnText}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: rs(20), justifyContent: 'center' },
  card: {
    borderRadius: rs(16),
    borderWidth: 1,
    padding: rs(24),
    alignItems: 'center',
    gap: rs(10),
  },
  title: { fontWeight: '800', fontSize: rs(18), textAlign: 'center' },
  sub: { fontSize: rs(13), lineHeight: rs(18), textAlign: 'center' },
  perks: { alignSelf: 'stretch', gap: rs(6), marginVertical: rs(8) },
  perk: { fontSize: rs(12), lineHeight: rs(17) },
  btn: {
    marginTop: rs(8),
    paddingHorizontal: rs(20),
    paddingVertical: rs(14),
    borderRadius: rs(12),
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
});
