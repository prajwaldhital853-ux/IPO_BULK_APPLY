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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import { AUTH_API_BASE } from '../services/auth/config';
import { fetchPaymentInfo, type PaymentInfo } from '../services/auth/subscriptionApi';
import type { ThemeColors } from '../theme/colors';
import { PREMIUM_PLANS } from '../storage/subscriptionStorage';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

function generatedQrUrl(text: string): string {
  const data = text.trim() || 'NEPSE GHAR Premium Payment';
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`;
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
  } = useSubscription();
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [paymentNote, setPaymentNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const needsSignIn = auth.enabled && !auth.isAuthenticated;

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
    }, [refresh]),
  );

  const pending = serverStatus?.pendingRequest ?? auth.premium.pendingRequest;

  const onSignIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await auth.signInWithGoogle();
    } catch (e: unknown) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Google.',
      );
    } finally {
      setSigningIn(false);
    }
  }, [auth]);

  const onSubmit = useCallback(
    async (planId: string, title: string, price: string) => {
      if (needsSignIn) {
        Alert.alert(
          'Login required',
          'Please sign in with Google before submitting payment.',
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
          'Please sign in with Google again to submit payment.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign in', onPress: () => void onSignIn() },
          ],
        );
        return;
      }
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
      Alert.alert(
        'Submit for verification',
        `Plan: ${title} (${price})\n\n1. Pay using QR/bank details below\n2. Send payment screenshot on WhatsApp\n3. Tap Submit — admin will activate your account`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit',
            onPress: () => {
              setSubmitting(true);
              void requestPlan(planId, paymentNote.trim() || undefined)
                .then(() => {
                  Alert.alert(
                    'Submitted',
                    'Your subscription is pending verification. You will get premium access after admin approval.',
                  );
                  setPaymentNote('');
                })
                .catch((e: unknown) => showAuthActionError('Could not submit', e))
                .finally(() => setSubmitting(false));
            },
          },
        ],
      );
    },
    [needsSignIn, isPending, isPremium, paymentNote, requestPlan, onSignIn, showAuthActionError],
  );

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
    const msg = pending
      ? `Hi, I submitted premium payment for ${pending.planTitle}. Please verify.`
      : 'Hi, I want to subscribe to NEPSE GHAR Premium. I will send payment screenshot.';
    const full = `${url}?text=${encodeURIComponent(msg)}`;
    await Linking.openURL(full).catch(() => {
      Alert.alert('WhatsApp', 'Could not open WhatsApp.');
    });
  }, [paymentInfo?.whatsappUrl, pending]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Premium Subscription</Text>
        <Pressable onPress={() => void refresh()} hitSlop={12}>
          <Ionicons name="refresh" size={rs(20)} color={colors.teal} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={colors.teal} style={{ marginVertical: rs(20) }} />
        ) : null}

        <View style={styles.hero}>
          <Ionicons name="diamond" size={rs(36)} color={colors.tealHeader} />
          <Text style={styles.heroTitle}>
            {isPremium
              ? 'Premium active'
              : isPending
                ? 'Pending verification'
                : 'Upgrade to Premium'}
          </Text>
          {isPremium ? (
            <Text style={styles.heroSub}>
              {daysLeft != null
                ? `${daysLeft} day(s) remaining · ${state.productId ?? 'premium'}`
                : 'Active subscription'}
            </Text>
          ) : isPending && pending ? (
            <Text style={styles.heroSub}>
              {pending.planTitle} · Rs {pending.amountNpr} submitted on{' '}
              {new Date(pending.createdAt).toLocaleDateString()}. Admin is verifying your
              payment. Premium features stay locked until approved.
            </Text>
          ) : (
            <Text style={styles.heroSub}>
              Pay via QR/bank transfer, send screenshot on WhatsApp, then submit here.
            </Text>
          )}
        </View>

        {needsSignIn ? (
          <View style={styles.signInCard}>
            <Ionicons name="logo-google" size={rs(24)} color={colors.text} />
            <Text style={styles.signInTitle}>Sign in required</Text>
            <Text style={styles.signInText}>
              {isPending
                ? 'Sign in with Google to manage or cancel your pending subscription.'
                : 'Sign in with Google to submit your payment for verification.'}
            </Text>
            <Pressable
              style={[styles.signInBtn, signingIn && styles.buyBtnDisabled]}
              disabled={signingIn}
              onPress={() => void onSignIn()}
            >
              <Text style={styles.signInBtnText}>
                {signingIn ? 'Signing in…' : 'Sign in with Google'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isPending && pending ? (
          <View style={styles.pendingCard}>
            <Ionicons name="time-outline" size={rs(28)} color="#F9A825" />
            <Text style={styles.pendingTitle}>Account pending verification</Text>
            <Text style={styles.pendingText}>
              You cannot buy another plan or use premium features until admin activates
              your subscription.
            </Text>
            <Pressable style={styles.waBtn} onPress={() => void openWhatsApp()}>
              <Ionicons name="logo-whatsapp" size={rs(18)} color="#fff" />
              <Text style={styles.waBtnText}>Send screenshot on WhatsApp</Text>
            </Pressable>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => void onCancelPending()}
            >
              <Text style={styles.cancelText}>Cancel pending request</Text>
            </Pressable>
          </View>
        ) : null}

        {!isPremium && !isPending ? (
          <View style={styles.paymentCard}>
            <Text style={styles.sectionTitle}>Payment details</Text>
            <Image source={{ uri: qrUrl }} style={styles.qr} />
            <Text style={styles.bankLine}>
              {paymentInfo?.bankName ?? 'Kalash Financial Solution Pvt. Ltd.'}
            </Text>
            <Text style={styles.bankLine}>
              Account: {paymentInfo?.accountName ?? 'Kalash Financial Solution'}
            </Text>
            <Text style={styles.bankLine}>
              A/C No: {paymentInfo?.accountNumber ?? '0123456789'}
            </Text>
            <Pressable style={styles.waBtn} onPress={() => void openWhatsApp()}>
              <Ionicons name="logo-whatsapp" size={rs(18)} color="#fff" />
              <Text style={styles.waBtnText}>WhatsApp payment screenshot</Text>
            </Pressable>
            <TextInput
              style={styles.noteInput}
              placeholder="Payment note (optional) — e.g. transaction ID"
              placeholderTextColor={colors.textMuted}
              value={paymentNote}
              onChangeText={setPaymentNote}
            />
          </View>
        ) : null}

        {!isPending
          ? PREMIUM_PLANS.map((plan) => (
              <View key={plan.id} style={styles.planCard}>
                <View style={styles.planHead}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                </View>
                <Text style={styles.planPeriod}>{plan.period} full access</Text>
                {plan.perks.slice(0, 4).map((p) => (
                  <Text key={p} style={styles.perk}>
                    ✓ {p}
                  </Text>
                ))}
                <Text style={styles.perk}>✓ …and more premium tools</Text>
                {!isPremium ? (
                  <Pressable
                    style={[
                      styles.buyBtn,
                      (submitting || needsSignIn) && styles.buyBtnDisabled,
                    ]}
                    disabled={submitting || isPending || needsSignIn}
                    onPress={() => onSubmit(plan.id, plan.title, plan.price)}
                  >
                    <Text style={styles.buyText}>
                      {needsSignIn
                        ? 'Sign in to submit'
                        : submitting
                          ? 'Submitting…'
                          : `Submit payment · ${plan.price}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          : null}
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
      marginBottom: rs(16),
      padding: rs(16),
    },
    heroTitle: { color: c.text, fontWeight: '800', fontSize: rs(20) },
    heroSub: {
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    signInCard: {
      borderWidth: 1,
      borderColor: c.teal,
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(16),
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(16),
    },
    signInTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    signInText: {
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: rs(12),
      lineHeight: rs(18),
    },
    signInBtn: {
      marginTop: rs(4),
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(12),
      paddingHorizontal: rs(20),
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    signInBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
    pendingCard: {
      borderWidth: 1,
      borderColor: '#F9A825',
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(16),
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(16),
    },
    pendingTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    pendingText: {
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: rs(12),
      lineHeight: rs(18),
    },
    paymentCard: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(14),
      padding: rs(16),
      backgroundColor: c.surface,
      marginBottom: rs(16),
      alignItems: 'center',
      gap: rs(6),
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      alignSelf: 'flex-start',
    },
    qr: {
      width: rs(180),
      height: rs(180),
      borderRadius: rs(12),
      marginVertical: rs(8),
      backgroundColor: '#fff',
    },
    bankLine: { color: c.textSecondary, fontSize: rs(13) },
    waBtn: {
      marginTop: rs(8),
      backgroundColor: '#25D366',
      borderRadius: rs(12),
      paddingVertical: rs(12),
      paddingHorizontal: rs(16),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      alignSelf: 'stretch',
      justifyContent: 'center',
    },
    waBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(13) },
    noteInput: {
      marginTop: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      padding: rs(12),
      color: c.text,
      alignSelf: 'stretch',
      fontSize: rs(13),
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
    buyBtnDisabled: { opacity: 0.6 },
    buyText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
    cancelBtn: { padding: rs(8) },
    cancelText: { color: c.danger, fontSize: rs(12), fontWeight: '600' },
  });
}
