import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const { isPremium, loading } = useSubscription();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();

  if (loading) return null;
  if (isPremium) return <>{children}</>;

  return (
    <Paywall
      colors={colors}
      title={title}
      subtitle={subtitle}
      onSubscribe={() => navigation.navigate('Subscription')}
    />
  );
}

function Paywall({
  colors,
  title,
  subtitle,
  onSubscribe,
}: {
  colors: ThemeColors;
  title: string;
  subtitle?: string;
  onSubscribe: () => void;
}) {
  const plan = PREMIUM_PLANS[0];
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderMuted }]}>
        <Ionicons name="diamond-outline" size={rs(44)} color={colors.tealHeader} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {subtitle ??
            'Premium unlocks institutional-grade NEPSE analytics built for serious investors.'}
        </Text>
        <View style={styles.perks}>
          {plan.perks.map((p) => (
            <Text key={p} style={[styles.perk, { color: colors.textSecondary }]}>
              ✓ {p}
            </Text>
          ))}
        </View>
        <Pressable style={[styles.btn, { backgroundColor: colors.fab }]} onPress={onSubscribe}>
          <Text style={styles.btnText}>View plans · from {plan.price}</Text>
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
