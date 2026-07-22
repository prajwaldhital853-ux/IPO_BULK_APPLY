import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { PREMIUM_PLANS } from '../storage/subscriptionStorage';
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
  const { isPremium, isPending, loading, unlockLocalPremium } = useSubscription();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [unlocking, setUnlocking] = React.useState(false);

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

  return (
    <Paywall
      colors={colors}
      title={title}
      subtitle={subtitle}
      unlocking={unlocking}
      onSubscribe={() => navigation.navigate('Subscription')}
      onUnlockLocal={() => {
        setUnlocking(true);
        void unlockLocalPremium(365, 'premium_local')
          .catch(() => undefined)
          .finally(() => setUnlocking(false));
      }}
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
          Your premium payment is pending verification. Admin will activate your account
          after checking your WhatsApp payment screenshot.
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
  unlocking,
  onSubscribe,
  onUnlockLocal,
}: {
  colors: ThemeColors;
  title: string;
  subtitle?: string;
  unlocking?: boolean;
  onSubscribe: () => void;
  onUnlockLocal: () => void;
}) {
  const plan = PREMIUM_PLANS[0];
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
          {plan.perks.slice(0, 5).map((p) => (
            <Text key={p} style={[styles.perk, { color: colors.textSecondary }]}>
              ✓ {p}
            </Text>
          ))}
        </View>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.fab }, unlocking && { opacity: 0.6 }]}
          disabled={unlocking}
          onPress={onUnlockLocal}
        >
          {unlocking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Unlock premium (no Google needed)</Text>
          )}
        </Pressable>
        <Pressable onPress={onSubscribe} hitSlop={8}>
          <Text style={[styles.perk, { color: colors.teal, textAlign: 'center' }]}>
            Or view plans / payment
          </Text>
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
