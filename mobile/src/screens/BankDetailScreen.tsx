import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { LocalDisclaimer } from '../components/LocalDisclaimer';
import { MinorDobFields } from '../components/MinorDobFields';
import { useAccounts } from '../context/AccountsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import {
  MeroshareClient,
  MeroshareError,
  isTransientMeroshareError,
  verifyAccountForSave,
  type VerifyField,
} from '../services/meroshare';
import type { ThemeColors } from '../theme/colors';
import { guardAddAccountAsync } from '../utils/accountLimits';
import {
  DuplicateAccountError,
  findDuplicateAccountAsync,
  showDuplicateAccountAlert,
} from '../utils/duplicateAccount';
import {
  buildMinorMetaFields,
  extractBankWithBranchFromProfile,
  extractDobFromOwnDetail,
  extractGuardianFromProfile,
  isMinorFromDob,
} from '../utils/minorAccount';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import type { DraftCapital } from '../types/account';

const BANK_LOAD_ATTEMPTS = 3;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadBankAndDobFromMeroshare(
  draft: DraftCapital,
  attempt: number,
): Promise<{
  bankName: string;
  bankFromProfile: boolean;
  dob: string | null;
  guardianName: string | null;
}> {
  const client = new MeroshareClient();
  try {
    await client.login(
      {
        clientId: draft.dpId,
        dpCode: draft.dpCode,
        dpName: draft.dpName,
        username: draft.username,
        password: draft.password,
      },
      { attempts: attempt === 0 ? 3 : 1 },
    );

    const profile = await client.fetchAccountProfileRaw();
    const dob = extractDobFromOwnDetail(profile);
    const guardianName = extractGuardianFromProfile(profile);
    const fromProfile = extractBankWithBranchFromProfile(profile);

    let bankName = fromProfile || '';
    if (!bankName) {
      try {
        const banks = await client.listBanksWithRetry();
        if (banks.length) {
          bankName = banks[0].name || `Bank #${banks[0].id}`;
        }
      } catch {
        // My Details is the source of truth; bank list is only a fallback.
      }
    }

    if (!bankName && !dob) {
      throw new MeroshareError(
        'NETWORK',
        'Unable to process request at the moment',
      );
    }

    return {
      bankName,
      bankFromProfile: Boolean(fromProfile),
      dob,
      guardianName,
    };
  } finally {
    client.clearSession();
  }
}

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
 * Bank + CRN + PIN are entered on the page (same layout as Add Capital).
 */
export function BankDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { draft, addAccount, accounts, loadSecrets } = useAccounts();
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
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [dobAutoFilled, setDobAutoFilled] = useState(false);
  const [detectingDob, setDetectingDob] = useState(false);
  const [hideCrn, setHideCrn] = useState(true);
  const [hidePin, setHidePin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorField, setErrorField] = useState<VerifyField | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const savingDoneRef = useRef(false);
  const submitLockRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dobTouchedRef = useRef(false);

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
      setDetectingDob(true);
      setDobAutoFilled(false);
      if (!dobTouchedRef.current) {
        setDateOfBirth('');
        setGuardianName('');
      }

      let lastError: unknown;
      let bestBank = '';
      let bestFromProfile = false;
      let bestDob: string | null = null;
      let bestGuardian: string | null = null;

      try {
        for (let attempt = 0; attempt < BANK_LOAD_ATTEMPTS; attempt++) {
          if (!mounted) return;
          try {
            const result = await loadBankAndDobFromMeroshare(draft, attempt);
            if (!mounted) return;

            if (result.bankName) {
              bestBank = result.bankName;
              bestFromProfile = result.bankFromProfile || bestFromProfile;
            }
            if (result.dob) {
              bestDob = result.dob;
              bestGuardian = result.guardianName;
            }

            if (bestFromProfile && bestDob) break;
          } catch (e) {
            lastError = e;
            if (
              e instanceof MeroshareError &&
              (e.code === 'AUTH' || e.code === 'CAPTCHA')
            ) {
              break;
            }
            if (!isTransientMeroshareError(e)) break;
          }
          if (
            attempt < BANK_LOAD_ATTEMPTS - 1 &&
            mounted &&
            !(bestFromProfile && bestDob)
          ) {
            await delay(1500 * (attempt + 1));
          }
        }

        if (!mounted) return;

        if (bestBank) {
          setLinkedBank(bestBank);
        } else {
          setLinkedBank(draft.dpName);
        }

        if (bestDob && !dobTouchedRef.current) {
          setDateOfBirth(bestDob);
          setDobAutoFilled(true);
          if (isMinorFromDob(bestDob) && bestGuardian) {
            setGuardianName((prev) => prev.trim() || bestGuardian!);
          }
        }

        if (bestBank || bestDob) {
          setBankError('');
        } else {
          const msg =
            lastError instanceof Error
              ? lastError.message
              : 'MeroShare login failed';
          setBankError(
            `Could not sign in to MeroShare (${msg}). You can still enter CRN/PIN and DOB, then save.`,
          );
        }
      } finally {
        if (mounted) {
          setLoadingBank(false);
          setDetectingDob(false);
        }
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
          fallbackBankName: linkedBank,
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

        const demat =
          verify.demat?.trim() ||
          (verify.boid && /^\d{16}$/.test(verify.boid.trim())
            ? verify.boid.trim()
            : capital.dpCode && capital.username
              ? `130${capital.dpCode}${capital.username.trim()}`
              : undefined);

        const duplicate = await findDuplicateAccountAsync({
          accounts,
          candidate: {
            username: capital.username,
            dpId: capital.dpId,
            dpCode: capital.dpCode,
            demat,
            boid: verify.boid,
            crn: crn.trim(),
          },
          loadCrn: async (id) => (await loadSecrets(id))?.crn,
        });
        if (duplicate) {
          setErrorField(
            duplicate.reason === 'crn'
              ? 'crn'
              : duplicate.reason === 'username'
                ? 'username'
                : null,
          );
          setErrorMsg(
            'This account is already saved. You cannot add it again.',
          );
          showDuplicateAccountAlert(duplicate);
          return;
        }

        if (
          !(await guardAddAccountAsync({
            currentCount: accounts.length,
            isPremium,
            maxAccounts,
            onUpgrade: () => navigation.navigate('Subscription'),
            candidate: {
              dpId: capital.dpId,
              dpCode: capital.dpCode,
              username: capital.username,
              demat:
                verify.demat?.trim() ||
                (verify.boid && /^\d{16}$/.test(verify.boid.trim())
                  ? verify.boid.trim()
                  : undefined),
            },
          }))
        ) {
          return;
        }

        savingDoneRef.current = true;

        try {
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
          demat,
          boidHint: (() => {
            const full =
              demat ||
              (verify.boid && /^\d{16}$/.test(verify.boid.trim())
                ? verify.boid.trim()
                : verify.boid);
            return full ? String(full).slice(-4) : undefined;
          })(),
          ...buildMinorMetaFields(dateOfBirth, guardianName),
        });
        } catch (e) {
          savingDoneRef.current = false;
          if (e instanceof DuplicateAccountError) {
            setErrorMsg(
              'This account is already saved. You cannot add it again.',
            );
            showDuplicateAccountAlert(e.hit);
            return;
          }
          throw e;
        }

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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Bank Detail</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <LocalDisclaimer />

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

          <FormField
            emphasized
            icon="business-outline"
            label="Select Bank"
            value={loadingBank ? 'Loading…' : linkedBank || '—'}
            dropdown
          />
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
              placeholder="CRN Number"
              secure={hideCrn}
              showEye
              onToggleEye={() => setHideCrn((v) => !v)}
            />
          </View>
          <View style={errStyle('pin')}>
            <FormField
              emphasized
              icon="ellipsis-horizontal"
              label="Pin Code"
              value={pin}
              onChangeText={(t) => {
                setPin(t.replace(/[^0-9]/g, '').slice(0, 4));
                if (errorField === 'pin') {
                  setErrorField(null);
                  setErrorMsg('');
                }
              }}
              placeholder="Transaction Pin"
              secure={hidePin}
              showEye
              onToggleEye={() => setHidePin((v) => !v)}
              keyboardType="number-pad"
              maxLength={4}
              counter={`${pin.length}/4`}
            />
          </View>

          {!detectingDob && !dobAutoFilled ? (
            <MinorDobFields
              compact
              dateOfBirth={dateOfBirth}
              onDateOfBirthChange={(t) => {
                dobTouchedRef.current = true;
                setDateOfBirth(t);
              }}
              guardianName={guardianName}
              onGuardianNameChange={setGuardianName}
            />
          ) : null}

          <Pressable style={styles.submitBtn} onPress={onSubmit}>
            {submitting ? (
              <View style={styles.submitRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.submitText}> Verifying…</Text>
              </View>
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <SensitiveActionModals action={sensitive} />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    scrollContent: {
      paddingBottom: Math.max(rs(40), 40),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(12),
      paddingVertical: rs(14),
      backgroundColor: colors.bgElevated,
    },
    back: { color: colors.text, fontSize: rs(24), width: rs(32) },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: rs(18),
      fontWeight: '700',
      textAlign: 'center',
    },
    headerSpacer: { width: rs(32) },
    bankWarn: {
      color: colors.textMuted,
      fontSize: rs(11),
      lineHeight: rs(15),
    },
    bankWarnBox: {
      marginHorizontal: rs(16),
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
    submitBtn: {
      alignSelf: 'center',
      marginTop: rs(28),
      borderRadius: rs(24),
      paddingHorizontal: rs(44),
      paddingVertical: rs(11),
      minWidth: rs(132),
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    submitRow: { flexDirection: 'row', alignItems: 'center' },
    submitText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(15),
    },
  });
}
