import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { PREMIUM_PLANS } from '../storage/subscriptionStorage';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function SubscriptionScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isPremium, daysLeft, state, purchasePlan, resetToFree } =
    useSubscription();

  const onBuy = (productId: string, days: number, title: string) => {
    Alert.alert(
      'Activate Premium',
      `Demo purchase: ${title}. Play Store billing can replace this later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: () =>
            void purchasePlan(productId, days).then(() => {
              Alert.alert('Premium active', 'All premium services are unlocked.');
            }),
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Premium Subscription</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Ionicons name="diamond" size={rs(36)} color={colors.tealHeader} />
          <Text style={styles.heroTitle}>
            {isPremium ? 'Premium active' : 'Upgrade to Premium'}
          </Text>
          {isPremium ? (
            <Text style={styles.heroSub}>
              {daysLeft != null
                ? `${daysLeft} day(s) remaining · ${state.productId ?? 'premium'}`
                : 'Active subscription'}
            </Text>
          ) : (
            <Text style={styles.heroSub}>
              Professional NEPSE analytics — worth more than the monthly fee for active traders.
            </Text>
          )}
        </View>

        {PREMIUM_PLANS.map((plan) => (
          <View key={plan.id} style={styles.planCard}>
            <View style={styles.planHead}>
              <Text style={styles.planTitle}>{plan.title}</Text>
              <Text style={styles.planPrice}>{plan.price}</Text>
            </View>
            <Text style={styles.planPeriod}>{plan.period} full access</Text>
            {plan.perks.map((p) => (
              <Text key={p} style={styles.perk}>
                ✓ {p}
              </Text>
            ))}
            <Pressable
              style={styles.buyBtn}
              onPress={() => onBuy(plan.id, plan.days, plan.title)}
            >
              <Text style={styles.buyText}>
                {isPremium ? 'Extend' : 'Subscribe'} · {plan.price}
              </Text>
            </Pressable>
          </View>
        ))}

        {isPremium ? (
          <Pressable style={styles.resetBtn} onPress={() => void resetToFree()}>
            <Text style={styles.resetText}>Reset to Free (dev)</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    scroll: { padding: rs(16), paddingBottom: rs(32) },
    hero: {
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(20),
      padding: rs(16),
    },
    heroTitle: { color: c.text, fontWeight: '800', fontSize: rs(20) },
    heroSub: {
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    planCard: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(14),
      padding: rs(16),
      backgroundColor: c.surface,
      marginBottom: rs(14),
    },
    planHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    planTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    planPrice: { color: c.tealHeader, fontWeight: '800', fontSize: rs(16) },
    planPeriod: { color: c.textMuted, fontSize: rs(12), marginVertical: rs(6) },
    perk: { color: c.textSecondary, fontSize: rs(12), lineHeight: rs(18) },
    buyBtn: {
      marginTop: rs(14),
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(12),
      alignItems: 'center',
    },
    buyText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
    resetBtn: { alignItems: 'center', padding: rs(16) },
    resetText: { color: c.danger, fontSize: rs(12) },
  });
}
