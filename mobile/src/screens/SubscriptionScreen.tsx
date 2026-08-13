import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import { useAppBranding } from '../context/AppBrandingContext';
import { AUTH_API_BASE } from '../services/auth/config';
import { fetchPaymentInfo, type PaymentInfo } from '../services/auth/subscriptionApi';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

function generatedQrUrl(text: string): string {
  const data = text.trim() || 'NEPSE GHAR Premium Payment';
  return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(data)}`;
}

function resolvePaymentQrUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${AUTH_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function SubscriptionScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { plans: PREMIUM_PLANS, refresh: refreshBranding } = useAppBranding();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const auth = useAuth();
  const {
    isPremium,
    isPending,
    daysLeft,
    state,
    serverStatus,
    loading,
    requestPlan,
    cancelPending,
    refresh,
    maxAccounts,
  } = useSubscription();
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [paymentNote, setPaymentNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
  /** Plan id the user marked as paid — reveals WhatsApp CTA. */
  const [paidPlanId, setPaidPlanId] = useState<string | null>(null);

  const needsSignIn = auth.enabled && !auth.isAuthenticated;
  const showCheckout = !isPremium && !isPending;

  const qrUrl = useMemo(() => {
    const uploaded = resolvePaymentQrUrl(paymentInfo?.qrImageUrl);
    if (uploaded) return uploaded;
    return generatedQrUrl(paymentInfo?.qrText ?? '');
  }, [paymentInfo?.qrImageUrl, paymentInfo?.qrText]);

  useEffect(() => {
    void fetchPaymentInfo()
      .then(setPaymentInfo)
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshBranding();
    }, [refresh, refreshBranding]),
  );

  useEffect(() => {
    if (isPending || isPremium) setPaidPlanId(null);
  }, [isPending, isPremium]);

  const pending = serverStatus?.pendingRequest ?? auth.premium.pendingRequest;

  const onSignIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await auth.signInWithGoogle();
    } catch {
      // AuthContext already shows Alert (blocked / failed).
    } finally {
      setSigningIn(false);
    }
  }, [auth]);

  const showAuthActionError = useCallback(
    (title: string, e: unknown) => {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      const needsAuth =
        message.includes('Session expired') ||
        message.includes('sign in') ||
        message.includes('Sign in');
      Alert.alert(
        title,
        message,
        needsAuth
          ? [
              { text: 'OK', style: 'cancel' },
              { text: 'Sign in', onPress: () => void onSignIn() },
            ]
          : [{ text: 'OK' }],
      );
    },
    [onSignIn],
  );

  const submitPaidPlan = useCallback(
    async (planId: string, title: string, price: string) => {
      if (isPending) {
        Alert.alert(
          'Pending verification',
          'Your previous payment is still being verified. Please wait for admin approval.',
        );
        return;
      }
      if (isPremium) {
        Alert.alert('Premium active', 'Your subscription is already active.');
        return;
      }

      const me = await auth.refreshProfile();
      if (!me) {
        Alert.alert(
          'Session expired',
          'Please sign in with Google again to submit your subscription.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign in', onPress: () => void onSignIn() },
          ],
        );
        return;
      }

      setSubmitting(true);
      try {
        await requestPlan(planId, paymentNote.trim() || undefined);
        setPaidPlanId(planId);
        setPaymentNote('');
        Alert.alert(
          'Payment marked',
          `Thanks! Now send your ${price} payment screenshot on WhatsApp so admin can verify ${title}.`,
        );
      } catch (e: unknown) {
        showAuthActionError('Could not submit', e);
      } finally {
        setSubmitting(false);
      }
    },
    [
      isPending,
      isPremium,
      paymentNote,
      requestPlan,
      showAuthActionError,
      auth,
      onSignIn,
    ],
  );

  const formatPlanAmount = useCallback((plan: { price: string; amountNpr?: number }) => {
    if (plan.amountNpr != null && Number.isFinite(plan.amountNpr) && plan.amountNpr > 0) {
      return `Rs ${plan.amountNpr}`;
    }
    return plan.price;
  }, []);

  const onPlanPress = useCallback(
    (planId: string, title: string, price: string) => {
      if (needsSignIn) {
        Alert.alert(
          'Google sign-in required',
          'Sign in with Google to mark your payment and activate premium after admin verification.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign in with Google', onPress: () => void onSignIn() },
          ],
        );
        return;
      }
      Alert.alert(
        'Confirm payment',
        `Have you already paid ${price} for ${title}?`,
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: `I have paid ${price}`,
            onPress: () => void submitPaidPlan(planId, title, price),
          },
        ],
      );
    },
    [needsSignIn, onSignIn, submitPaidPlan],
  );

  const onCancelPending = useCallback(async () => {
    if (needsSignIn) {
      Alert.alert(
        'Login required',
        'Sign in with Google to cancel or manage your pending subscription.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => void onSignIn() },
        ],
      );
      return;
    }
    const me = await auth.refreshProfile();
    if (!me) {
      Alert.alert(
        'Session expired',
        'Please sign in with Google again to cancel your pending request.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => void onSignIn() },
        ],
      );
      return;
    }
    Alert.alert('Cancel request?', 'You can submit again after cancelling.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () =>
          void cancelPending().catch((e: unknown) =>
            showAuthActionError('Could not cancel', e),
          ),
      },
    ]);
  }, [needsSignIn, auth, onSignIn, cancelPending, showAuthActionError]);

  const openWhatsApp = useCallback(async () => {
    const url = paymentInfo?.whatsappUrl ?? 'https://wa.me/9779709133067';
    const paidPlan = paidPlanId
      ? PREMIUM_PLANS.find((p) => p.id === paidPlanId)
      : null;
    const paidAmount = paidPlan ? formatPlanAmount(paidPlan) : null;
    const msg = pending
      ? `Hi, I submitted premium payment for ${pending.planTitle} (Rs ${pending.amountNpr}). Please verify.`
      : paidPlan
        ? `Hi, I have paid ${paidAmount} for NEPSE GHAR Premium (${paidPlan.title}). I will send the payment screenshot.`
        : 'Hi, I want to subscribe to NEPSE GHAR Premium. I will send payment screenshot.';
    const full = `${url}?text=${encodeURIComponent(msg)}`;
    await Linking.openURL(full).catch(() => {
      Alert.alert('WhatsApp', 'Could not open WhatsApp.');
    });
  }, [paymentInfo?.whatsappUrl, pending, paidPlanId, PREMIUM_PLANS, formatPlanAmount]);

  const openMoreAccountsWhatsApp = useCallback(async () => {
    const url = paymentInfo?.whatsappUrl ?? 'https://wa.me/9779709133067';
    const email = auth.user?.email ?? '';
    const msg = [
      'Hi, I need more than 50 MeroShare accounts on NEPSE GHAR Premium.',
      email ? `My email: ${email}` : null,
      `Current limit: ${maxAccounts} accounts.`,
      'Please tell me the price for 100 / 200 accounts (or custom). I can pay offline.',
    ]
      .filter(Boolean)
      .join('\n');
    const full = `${url}?text=${encodeURIComponent(msg)}`;
    await Linking.openURL(full).catch(() => {
      Alert.alert('WhatsApp', 'Could not open WhatsApp.');
    });
  }, [paymentInfo?.whatsappUrl, auth.user?.email, maxAccounts]);

  const downloadQr = useCallback(async () => {
    if (!qrUrl || savingQr) return;
    setSavingQr(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo access so the payment QR can be saved to your gallery.',
        );
        return;
      }
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!dir) throw new Error('Storage not available on this device.');
      const fileUri = `${dir}nepse-ghar-payment-qr.png`;
      const result = await FileSystem.downloadAsync(qrUrl, fileUri);
      await MediaLibrary.saveToLibraryAsync(result.uri);
      Alert.alert('Saved', 'Payment QR saved to your gallery.');
    } catch (e: unknown) {
      Alert.alert(
        'Download failed',
        e instanceof Error ? e.message : 'Could not save the payment QR to gallery.',
      );
    } finally {
      setSavingQr(false);
    }
  }, [qrUrl, savingQr]);

  const heroSub = isPremium
    ? [
        daysLeft != null ? `${daysLeft} day(s) left` : 'Active',
        state.productId ?? 'premium',
        `up to ${maxAccounts} accounts`,
      ].join(' · ')
    : isPending && pending
      ? `${pending.planTitle} · Rs ${pending.amountNpr} · waiting for admin approval`
      : 'Free: 10 accounts · Premium: 50 accounts';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Premium</Text>
        <Pressable onPress={() => void refresh()} hitSlop={12}>
          <Ionicons name="refresh" size={rs(20)} color={colors.teal} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + rs(28) }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.teal} style={{ marginBottom: rs(12) }} />
        ) : null}

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="diamond" size={rs(22)} color={colors.tealHeader} />
          </View>
          <Text style={styles.heroTitle}>
            {isPremium
              ? 'Premium active'
              : isPending
                ? 'Pending verification'
                : 'Upgrade to Premium'}
          </Text>
          <Text style={styles.heroSub}>{heroSub}</Text>
        </View>

        {isPending && pending ? (
          <View style={[styles.card, styles.pendingBorder]}>
            <Text style={styles.cardTitle}>Waiting for approval</Text>
            <Text style={styles.cardBody}>
              Submitted {new Date(pending.createdAt).toLocaleDateString()}. Premium
              stays locked until admin activates your plan.
            </Text>
            <Pressable style={styles.waBtn} onPress={() => void openWhatsApp()}>
              <Ionicons name="logo-whatsapp" size={rs(18)} color="#fff" />
              <Text style={styles.waBtnText}>Send screenshot on WhatsApp</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => void onCancelPending()}>
              <Text style={styles.linkDanger}>Cancel pending request</Text>
            </Pressable>
          </View>
        ) : null}

        {showCheckout ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>How to subscribe</Text>
              <StepRow styles={styles} n={1} text="Pay with the QR or bank details below" />
              <StepRow
                styles={styles}
                n={2}
                text="Tap “I have paid …” on your plan"
              />
              <StepRow
                styles={styles}
                n={3}
                text="Send payment screenshot on WhatsApp"
              />
              <StepRow styles={styles} n={4} text="Wait for admin approval" />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment QR</Text>
              <View style={styles.qrWrap}>
                <Image source={{ uri: qrUrl }} style={styles.qr} />
              </View>
              <Pressable
                style={[styles.secondaryBtn, savingQr && styles.btnDisabled]}
                disabled={savingQr}
                onPress={() => void downloadQr()}
              >
                <Ionicons name="download-outline" size={rs(18)} color={colors.tealHeader} />
                <Text style={[styles.secondaryBtnText, { color: colors.tealHeader }]}>
                  {savingQr ? 'Saving…' : 'Save QR to gallery'}
                </Text>
              </Pressable>

              <View style={styles.bankBlock}>
                <BankLine
                  styles={styles}
                  label="Bank"
                  value={paymentInfo?.bankName ?? 'Kalash Financial Solution Pvt. Ltd.'}
                />
                <BankLine
                  styles={styles}
                  label="Account"
                  value={paymentInfo?.accountName ?? 'Kalash Financial Solution'}
                />
                <BankLine
                  styles={styles}
                  label="A/C No"
                  value={paymentInfo?.accountNumber ?? '0123456789'}
                />
              </View>

              <TextInput
                style={styles.noteInput}
                placeholder="Payment note (optional) — e.g. transaction ID"
                placeholderTextColor={colors.textMuted}
                value={paymentNote}
                onChangeText={setPaymentNote}
              />
            </View>

            <Text style={styles.sectionLabel}>Choose a plan</Text>
            <View style={styles.planCompare}>
              <View style={styles.planMini}>
                <Text style={styles.planMiniName}>Free</Text>
                <Text style={styles.planMiniPrice}>Rs 0</Text>
                <Text style={styles.planMiniMeta}>10 accounts</Text>
              </View>
              <View style={styles.planMiniDivider} />
              <View style={styles.planMini}>
                <Text style={styles.planMiniName}>Premium</Text>
                <Text style={styles.planMiniPrice}>
                  from {formatPlanAmount(PREMIUM_PLANS[0] ?? { price: 'Rs 300', amountNpr: 300 })}
                </Text>
                <Text style={styles.planMiniMeta}>
                  {PREMIUM_PLANS[0]?.maxAccounts ?? 50} accounts + tools
                </Text>
              </View>
            </View>

            {PREMIUM_PLANS.map((plan) => {
              const selected = paidPlanId === plan.id;
              const amountLabel = formatPlanAmount(plan);
              return (
                <Pressable
                  key={plan.id}
                  style={[styles.planCard, selected && styles.planCardPaid]}
                  disabled={submitting || signingIn}
                  onPress={() => {
                    if (needsSignIn) {
                      void onSignIn();
                      return;
                    }
                    if (!selected) onPlanPress(plan.id, plan.title, amountLabel);
                  }}
                >
                  <View style={styles.planHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planTitle}>{plan.title}</Text>
                      <Text style={styles.planPeriod}>
                        {plan.period} · up to {plan.maxAccounts} accounts
                      </Text>
                    </View>
                    <Text style={styles.planPrice}>{amountLabel}</Text>
                  </View>
                  {plan.perks.slice(0, 4).map((perk) => (
                    <Text key={perk} style={styles.perk}>
                      ✓ {perk}
                    </Text>
                  ))}

                  {needsSignIn ? (
                    <View style={[styles.primaryBtn, signingIn && styles.btnDisabled]}>
                      <Ionicons name="logo-google" size={rs(16)} color="#fff" />
                      <Text style={styles.primaryBtnText}>
                        {signingIn ? 'Signing in…' : 'Sign in with Google'}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.primaryBtn,
                        (submitting || selected) && styles.btnDisabled,
                      ]}
                    >
                      <Text style={styles.primaryBtnText}>
                        {submitting && !selected
                          ? 'Submitting…'
                          : selected
                            ? `Paid ${amountLabel}`
                            : `I have paid ${amountLabel}`}
                      </Text>
                    </View>
                  )}

                  {selected ? (
                    <Pressable
                      style={styles.waBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void openWhatsApp();
                      }}
                    >
                      <Ionicons name="logo-whatsapp" size={rs(18)} color="#fff" />
                      <Text style={styles.waBtnText}>Send screenshot on WhatsApp</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </>
        ) : null}

        {isPremium ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your plan</Text>
            <Text style={styles.cardBody}>
              You can add up to {maxAccounts} MeroShare accounts with this subscription.
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, styles.moreCard]}>
          <Text style={styles.cardTitle}>Need more than 50 accounts?</Text>
          <Text style={styles.cardBody}>
            Premium includes 50 accounts by default. For 60, 100, 200 or more, contact
            us on WhatsApp. Pay offline as agreed — admin then raises your limit in
            the app immediately.
          </Text>
          <Pressable
            style={styles.waBtn}
            onPress={() => void openMoreAccountsWhatsApp()}
          >
            <Ionicons name="logo-whatsapp" size={rs(18)} color="#fff" />
            <Text style={styles.waBtnText}>Contact us for more than 50 accounts</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function StepRow({
  styles,
  n,
  text,
}: {
  styles: ReturnType<typeof makeStyles>;
  n: number;
  text: string;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function BankLine({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.bankLine}>
      <Text style={styles.bankLabel}>{label}</Text>
      <Text style={styles.bankValue}>{value}</Text>
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
    scroll: { paddingHorizontal: rs(16), paddingTop: rs(4) },
    hero: {
      alignItems: 'center',
      marginBottom: rs(16),
      gap: rs(6),
    },
    heroIcon: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(22),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(2),
    },
    heroTitle: { color: c.text, fontWeight: '800', fontSize: rs(20) },
    heroSub: {
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: rs(13),
      lineHeight: rs(18),
      paddingHorizontal: rs(8),
    },
    card: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(16),
      marginBottom: rs(12),
      gap: rs(10),
    },
    pendingBorder: { borderColor: '#F9A825' },
    moreCard: { marginTop: rs(4), marginBottom: rs(8) },
    cardTitle: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    cardBody: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(19),
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(10),
    },
    stepNum: {
      width: rs(22),
      height: rs(22),
      borderRadius: rs(11),
      backgroundColor: c.tealHeader,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: rs(1),
    },
    stepNumText: { color: '#fff', fontWeight: '800', fontSize: rs(11) },
    stepText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(19),
    },
    qrWrap: {
      alignSelf: 'center',
      padding: rs(10),
      backgroundColor: '#fff',
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    qr: {
      width: rs(180),
      height: rs(180),
      backgroundColor: '#fff',
    },
    bankBlock: {
      alignSelf: 'stretch',
      gap: rs(8),
      paddingTop: rs(4),
    },
    bankLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: rs(12),
    },
    bankLabel: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '700',
      minWidth: rs(64),
    },
    bankValue: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      textAlign: 'right',
      fontWeight: '600',
    },
    primaryBtn: {
      marginTop: rs(8),
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(12),
      paddingHorizontal: rs(16),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
    secondaryBtn: {
      alignSelf: 'stretch',
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingVertical: rs(11),
      paddingHorizontal: rs(14),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: c.bg,
    },
    secondaryBtnText: { fontWeight: '800', fontSize: rs(13) },
    btnDisabled: { opacity: 0.6 },
    waBtn: {
      marginTop: rs(4),
      backgroundColor: '#25D366',
      borderRadius: rs(12),
      paddingVertical: rs(12),
      paddingHorizontal: rs(14),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      justifyContent: 'center',
    },
    waBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(13) },
    noteInput: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      padding: rs(12),
      color: c.text,
      fontSize: rs(13),
      backgroundColor: c.bg,
    },
    sectionLabel: {
      color: c.textMuted,
      fontWeight: '800',
      fontSize: rs(11),
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: rs(8),
      marginTop: rs(4),
    },
    planCompare: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      borderRadius: rs(14),
      marginBottom: rs(12),
      overflow: 'hidden',
    },
    planMini: {
      flex: 1,
      paddingVertical: rs(14),
      paddingHorizontal: rs(12),
      alignItems: 'center',
      gap: rs(2),
    },
    planMiniDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: c.borderMuted,
    },
    planMiniName: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    planMiniPrice: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    planMiniMeta: { color: c.textSecondary, fontSize: rs(11) },
    planCard: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(14),
      padding: rs(16),
      backgroundColor: c.surface,
      marginBottom: rs(12),
      gap: rs(4),
    },
    planCardPaid: {
      borderColor: '#25D366',
    },
    planHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: rs(12),
      marginBottom: rs(6),
    },
    planTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    planPrice: { color: c.tealHeader, fontWeight: '800', fontSize: rs(16) },
    planPeriod: { color: c.textMuted, fontSize: rs(12), marginTop: rs(2) },
    perk: { color: c.textSecondary, fontSize: rs(12), lineHeight: rs(18) },
    linkBtn: { paddingVertical: rs(4), alignItems: 'center' },
    linkDanger: { color: c.danger, fontSize: rs(12), fontWeight: '600' },
  });
}
