import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../components/FormField';
import { KeyboardSheetModal } from '../components/KeyboardSheetModal';
import { LocalDisclaimer } from '../components/LocalDisclaimer';
import { useAccounts } from '../context/AccountsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import {
  MeroshareClient,
  verifyAccountForSave,
  type VerifyField,
} from '../services/meroshare';
import type { ThemeColors } from '../theme/colors';
import { guardAddAccount } from '../utils/accountLimits';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

function fieldLabel(field: VerifyField | null): string {
  switch (field) {
    case 'dp':
      return 'Depository Participant';
    case 'username':
      return 'Username';
    case 'password':
      return 'Password';
    case 'crn':
      return 'CRN Number';
    case 'pin':
      return 'Transaction PIN';
    case 'bank':
      return 'Bank linkage';
    case 'network':
      return 'Network';
    default:
      return 'Credentials';
  }
}

/**
 * Same keypad-docking sheet used by Bank Tracker "Start tracking".
 * Footer (Verify & Save) stays flush above the keypad.
 */
function CredentialsSheet({
  visible,
  styles,
  insets,
  children,
  footer,
}: {
  visible: boolean;
  styles: ReturnType<typeof makeStyles>;
  insets: { bottom: number };
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <KeyboardSheetModal
      visible={visible}
      onClose={() => Keyboard.dismiss()}
      title="CRN & Transaction PIN"
      subtitle="Enter details from your bank / ASBA, then verify."
      footer={footer}
      bottomInset={insets.bottom}
      sheetStyle={styles.sheet}
      backdropStyle={styles.sheetBackdrop}
      handleStyle={styles.sheetHandle}
      titleStyle={styles.sheetTitle}
      subtitleStyle={styles.sheetSubtitle}
      footerStyle={styles.sheetFooter}
    >
      {children}
    </KeyboardSheetModal>
  );
}

export function BankDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { draft, addAccount, accounts } = useAccounts();
  const { isPremium, maxAccounts } = useSubscription();
  const sensitive = useSensitiveAction();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [linkedBank, setLinkedBank] = useState('');
  const [loadingBank, setLoadingBank] = useState(true);
  const [bankError, setBankError] = useState('');
  const [bankRetryKey, setBankRetryKey] = useState(0);
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');
  const [hideCrn, setHideCrn] = useState(true);
  const [hidePin, setHidePin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorField, setErrorField] = useState<VerifyField | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Credentials sheet stays open (same UX as Bank Tracker Start sheet).
  const sheetOpen = true;
  const savingDoneRef = useRef(false);
  const submitLockRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Unlock Verify button if PIN/setup modal was cancelled.
  useEffect(() => {
    if (
      !sensitive.promptVisible &&
      !sensitive.setupVisible &&
      !submitting &&
      !savingDoneRef.current
    ) {
      submitLockRef.current = false;
    }
  }, [sensitive.promptVisible, sensitive.setupVisible, submitting]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // After a successful save, draft is cleared on purpose — don't flash errors.
      if (savingDoneRef.current) return;
      if (!draft) {
        if (mounted) {
          setLoadingBank(false);
          setLinkedBank('');
          setBankError(
            'Missing capital detail — go back and add DP / username / password first.',
          );
        }
        return;
      }
      setLoadingBank(true);
      setBankError('');
      const client = new MeroshareClient();
      try {
        await client.login({
          clientId: draft.dpId,
          dpCode: draft.dpCode,
          dpName: draft.dpName,
          username: draft.username,
          password: draft.password,
        });
        const banks = await client.listBanksWithRetry();
        if (!mounted) return;
        if (banks.length) {
          setLinkedBank(banks[0].name || `Bank #${banks[0].id}`);
        } else {
          setLinkedBank(draft.dpName);
          setBankError(
            'No ASBA bank found on MeroShare. You can still enter CRN/PIN if your DP is correct.',
          );
        }
      } catch (e) {
        if (!mounted) return;
        setLinkedBank(draft.dpName);
        const msg = e instanceof Error ? e.message : 'MeroShare bank list failed';
        setBankError(
          /unable to process/i.test(msg)
            ? 'MeroShare bank list is busy right now. Showing your DP name instead — you can still enter CRN/PIN and tap Verify & Save.'
            : `Could not load linked bank (${msg}). You can still enter CRN/PIN and save.`,
        );
      } finally {
        client.clearSession();
        if (mounted) setLoadingBank(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [draft, bankRetryKey]);

  const onSubmit = async () => {
    if (submitting || savingDoneRef.current || submitLockRef.current) return;

    // Snapshot before addAccount clears draft — avoids false "Missing capital detail".
    const capital = draftRef.current;
    if (!capital) {
      Alert.alert('Missing capital detail', 'Please add capital detail first.', [
        { text: 'OK', onPress: () => navigation.navigate('AddCapital') },
      ]);
      return;
    }
    if (!crn.trim() || pin.length !== 4) {
      setErrorField(!crn.trim() ? 'crn' : 'pin');
      setErrorMsg(
        !crn.trim()
          ? 'Enter your CRN number.'
          : 'Transaction PIN must be 4 digits.',
      );
      return;
    }

    submitLockRef.current = true;
    void sensitive.requestSensitiveAction(async () => {
      setSubmitting(true);
      setErrorField(null);
      setErrorMsg('');
      try {
        const verify = await verifyAccountForSave({
          dpId: capital.dpId,
          dpCode: capital.dpCode,
          username: capital.username,
          password: capital.password,
          crn: crn.trim(),
          pin,
        });

        if (!verify.ok) {
          setErrorField(verify.field);
          setErrorMsg(verify.message);
          Alert.alert(
            verify.field === 'unknown' || !verify.field
              ? 'Could not verify'
              : `${fieldLabel(verify.field)} incorrect`,
            `${verify.message}\n\nAccount was NOT saved. Fix the highlighted field and try again.`,
            verify.field === 'dp' ||
              verify.field === 'username' ||
              verify.field === 'password'
              ? [
                  {
                    text: 'Edit Capital',
                    onPress: () => navigation.navigate('AddCapital'),
                  },
                  { text: 'OK' },
                ]
              : [{ text: 'OK' }],
          );
          return;
        }

        if (
          !guardAddAccount({
            currentCount: accounts.length,
            isPremium,
            maxAccounts,
            onUpgrade: () => navigation.navigate('Subscription'),
          })
        ) {
          return;
        }

        savingDoneRef.current = true;

        await addAccount({
          name: (verify.accountHolderName || capital.username)
            .trim()
            .toUpperCase(),
          dpId: capital.dpId,
          dpCode: capital.dpCode,
          dpName: capital.dpName,
          username: capital.username,
          password: capital.password,
          bankName: verify.bankName || linkedBank || capital.dpName,
          accountNumber: verify.accountNumber,
          crn: crn.trim(),
          pin,
          verified: true,
          crnPinVerified: !verify.crnPinDeferred,
          demat: (() => {
            const raw =
              verify.demat?.trim() ||
              (verify.boid && /^\d{16}$/.test(verify.boid.trim())
                ? verify.boid.trim()
                : undefined);
            if (raw) return raw;
            if (capital.dpCode && capital.username) {
              return `130${capital.dpCode}${capital.username.trim()}`;
            }
            return undefined;
          })(),
          boidHint: (() => {
            const full =
              verify.demat?.trim() ||
              (verify.boid && /^\d{16}$/.test(verify.boid.trim())
                ? verify.boid.trim()
                : verify.boid);
            return full ? String(full).slice(-4) : undefined;
          })(),
        });

        // Go straight to Bulk IPO Apply — do not bounce to Add Capital.
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'MainTabs',
              params: { screen: 'Apply' },
            },
          ],
        });

        Alert.alert(
          'Verified & saved',
          verify.crnPinDeferred
            ? `${verify.message}\n\nImportant: No IPO is open, so CRN/PIN were not confirmed yet.\nWhen a real IPO opens and you tap Live Apply, MeroShare will check CRN + PIN.`
            : `${verify.message}\n\nData stays on this device only. You can bulk-apply from this screen.`,
        );
      } finally {
        setSubmitting(false);
        if (!savingDoneRef.current) submitLockRef.current = false;
      }
    });
  };

  const errStyle = (field: VerifyField) =>
    errorField === field ? styles.fieldErrorWrap : null;

  const submitButton = (
    <Pressable
      style={[
        styles.submitBtn,
        (submitting || loadingBank) && { opacity: 0.6 },
      ]}
      onPress={onSubmit}
      disabled={submitting || loadingBank}
    >
      {submitting ? (
        <View style={styles.submitRow}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.submitTextOnPrimary}> Verifying…</Text>
        </View>
      ) : (
        <Text style={styles.submitTextOnPrimary}>Verify & Save</Text>
      )}
    </Pressable>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Bank Detail</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LocalDisclaimer />

        <Text style={styles.verifyHint}>
          Your DP was already chosen. ASBA bank is taken from your MeroShare
          account automatically — only enter CRN and transaction PIN.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Depository Participant</Text>
          <Text style={styles.infoValue}>{draft?.dpName ?? '—'}</Text>
          <Text style={[styles.infoLabel, { marginTop: rs(12) }]}>
            Linked bank (from MeroShare)
          </Text>
          {loadingBank ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: rs(8), alignSelf: 'flex-start' }}
            />
          ) : (
            <Text style={styles.infoValue}>{linkedBank || '—'}</Text>
          )}
          {bankError ? (
            <View style={styles.bankWarnBox}>
              <Text style={styles.bankWarn}>{bankError}</Text>
              <Pressable
                onPress={() => setBankRetryKey((k) => k + 1)}
                hitSlop={8}
                style={styles.retryBtn}
              >
                <Text style={styles.retryText}>Retry bank load</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <CredentialsSheet
        visible={sheetOpen}
        styles={styles}
        insets={insets}
        footer={submitButton}
      >
        {errorMsg ? (
          <View style={styles.sheetError}>
            <Text style={styles.errorBannerTitle}>
              {errorField === 'unknown' || !errorField
                ? 'Verification issue'
                : `${fieldLabel(errorField)} does not match`}
            </Text>
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={errStyle('crn')}>
          <FormField
            emphasized
            icon="key-outline"
            label="CRN Number"
            value={crn}
            onChangeText={(t) => {
              setCrn(t);
              if (errorField === 'crn') {
                setErrorField(null);
                setErrorMsg('');
              }
            }}
            placeholder="CRN from your bank / ASBA"
            secure={hideCrn}
            showEye
            onToggleEye={() => setHideCrn((v) => !v)}
          />
        </View>
        <View style={errStyle('pin')}>
          <FormField
            emphasized
            icon="ellipsis-horizontal"
            label="Transaction PIN"
            value={pin}
            onChangeText={(t) => {
              setPin(t.replace(/[^0-9]/g, '').slice(0, 4));
              if (errorField === 'pin') {
                setErrorField(null);
                setErrorMsg('');
              }
            }}
            placeholder="4-digit MeroShare PIN"
            secure={hidePin}
            showEye
            onToggleEye={() => setHidePin((v) => !v)}
            keyboardType="number-pad"
            maxLength={4}
            counter={`${pin.length}/4`}
          />
        </View>
      </CredentialsSheet>

      <SensitiveActionModals action={sensitive} />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    scrollContent: { paddingBottom: rs(40) },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      gap: rs(8),
      backgroundColor: colors.bgElevated,
    },
    back: { color: colors.text, fontSize: rs(22), width: rs(32) },
    title: { color: colors.text, fontSize: rs(17), fontWeight: '600' },
    verifyHint: {
      marginHorizontal: rs(16),
      marginBottom: rs(10),
      color: colors.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    infoCard: {
      marginHorizontal: rs(16),
      marginBottom: rs(12),
      padding: rs(14),
      borderRadius: rs(12),
      borderWidth: 1.5,
      borderColor: colors.textDim,
      backgroundColor: colors.surface,
    },
    infoLabel: {
      color: colors.textSecondary,
      fontSize: rs(12),
      fontWeight: '600',
    },
    infoValue: {
      color: colors.text,
      fontSize: rs(14),
      fontWeight: '700',
      marginTop: rs(4),
    },
    bankWarn: {
      color: colors.textMuted,
      fontSize: rs(11),
      lineHeight: rs(15),
    },
    bankWarnBox: {
      marginTop: rs(8),
      gap: rs(6),
    },
    retryBtn: {
      alignSelf: 'flex-start',
      paddingVertical: rs(4),
    },
    retryText: {
      color: colors.sage,
      fontSize: rs(12),
      fontWeight: '700',
    },
    errorBanner: {
      marginHorizontal: rs(16),
      marginBottom: rs(12),
      padding: rs(12),
      borderRadius: rs(10),
      backgroundColor: 'rgba(198,40,40,0.12)',
      borderWidth: 1,
      borderColor: colors.danger,
    },
    sheetError: {
      marginHorizontal: rs(16),
      marginTop: rs(8),
      marginBottom: rs(4),
      padding: rs(12),
      borderRadius: rs(10),
      backgroundColor: 'rgba(198,40,40,0.12)',
      borderWidth: 1,
      borderColor: colors.danger,
    },
    errorBannerTitle: {
      color: colors.danger,
      fontWeight: '800',
      fontSize: rs(13),
      marginBottom: rs(4),
    },
    errorBannerText: {
      color: colors.text,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    fieldErrorWrap: {
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
      marginLeft: rs(8),
    },
    // Sheet — same structure as Bank Tracker Start tracking
    sheetRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: rs(20),
      borderTopRightRadius: rs(20),
      paddingHorizontal: rs(18),
      paddingTop: rs(10),
      width: '100%',
    },
    sheetScrollView: {
      flexGrow: 0,
      flexShrink: 1,
    },
    sheetScroll: {
      paddingBottom: rs(4),
      flexGrow: 0,
    },
    sheetFooter: {
      paddingTop: rs(8),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderMuted,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: rs(40),
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: colors.border,
      marginBottom: rs(14),
    },
    sheetTitle: { color: colors.text, fontWeight: '800', fontSize: rs(18) },
    sheetSubtitle: {
      color: colors.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
      marginBottom: rs(6),
    },
    submitBtn: {
      alignSelf: 'stretch',
      borderRadius: rs(24),
      paddingHorizontal: rs(36),
      paddingVertical: rs(14),
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    submitRow: { flexDirection: 'row', alignItems: 'center' },
    submitTextOnPrimary: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(15),
    },
  });
}
