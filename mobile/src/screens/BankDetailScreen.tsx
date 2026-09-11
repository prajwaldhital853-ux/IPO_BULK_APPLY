import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { AppPressable } from '../components/AppPressable';
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
  type VerifyField,
} from '../services/meroshare';
import type { ThemeColors } from '../theme/colors';
import { guardAddAccountAsync } from '../utils/accountLimits';
import {
  findDuplicateAccount,
  showDuplicateAccountAlert,
} from '../utils/duplicateAccount';
import { buildDematFromParts, isValidBoid } from '../utils/boid';
import {
  buildMinorMetaFields,
  extractBankAccountNumberFromProfile,
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

function pickAccountHolderName(
  profile: Record<string, unknown>,
): string | undefined {
  for (const key of [
    'name',
    'accountName',
    'clientName',
    'fullName',
    'accountHolderName',
    'customerName',
    'dematAccountName',
  ]) {
    const v = profile[key];
    if (typeof v === 'string' && v.trim().length >= 2) {
      return v.trim();
    }
  }
  return undefined;
}

async function loadBankAndDobFromMeroshare(
  draft: DraftCapital,
  attempt: number,
): Promise<{
  bankName: string;
  bankFromProfile: boolean;
  dob: string | null;
  guardianName: string | null;
  accountHolderName?: string;
  accountNumber?: string;
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
    let accountHolderName = pickAccountHolderName(profile);
    let accountNumber =
      extractBankAccountNumberFromProfile(profile) ?? undefined;

    if (!accountHolderName) {
      try {
        const me = await client.fetchOwnDetailRaw();
        accountHolderName = pickAccountHolderName(me);
      } catch {
        // optional
      }
    }

    let bankName = fromProfile || '';
    let bankId: number | undefined;
    try {
      const banks = await client.listBanksWithRetry();
      if (banks.length) {
        bankId = banks[0].id;
        if (!bankName) {
          bankName = banks[0].name || `Bank #${banks[0].id}`;
        }
      }
    } catch {
      // My Details is the source of truth; bank list is only a fallback.
    }

    if (!accountNumber && bankId != null) {
      try {
        const branch = await client.getBankBranchDetails(bankId);
        accountNumber = branch.accountNumber || accountNumber;
      } catch {
        // profile account number may still be enough
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
      accountHolderName,
      accountNumber,
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
  const holderNameRef = useRef<string | undefined>();
  const bankAccountNumberRef = useRef<string | undefined>();
  const dobTouchedRef = useRef(false);

  const releaseSubmitLock = useCallback(() => {
    if (!savingDoneRef.current) submitLockRef.current = false;
  }, []);

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
      let bestHolderName: string | undefined;
      let bestAccountNumber: string | undefined;

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
            if (result.accountHolderName) {
              bestHolderName = result.accountHolderName;
            }
            if (result.accountNumber) {
              bestAccountNumber = result.accountNumber;
            }

            if (bestFromProfile && bestDob && bestHolderName && bestAccountNumber) {
              break;
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

        holderNameRef.current = bestHolderName;
        bankAccountNumberRef.current = bestAccountNumber;

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
    const crnTrim = crn.trim();
    if (!crnTrim) {
      setErrorField('crn');
      setErrorMsg('Enter your CRN number.');
      return;
    }
    if (crnTrim.length < 4) {
      setErrorField('crn');
      setErrorMsg('CRN looks too short to be valid.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setErrorField('pin');
      setErrorMsg('Transaction PIN must be exactly 4 digits.');
      return;
    }

    const builtDemat =
      capital.dpCode && capital.username
        ? buildDematFromParts(capital.dpCode, capital.username)
        : '';
    const demat =
      (capital.demat && isValidBoid(capital.demat) ? capital.demat : undefined) ||
      (capital.boid && isValidBoid(capital.boid) ? capital.boid : undefined) ||
      (isValidBoid(builtDemat) ? builtDemat : undefined);

    const duplicate = findDuplicateAccount({
      accounts,
      candidate: {
        username: capital.username,
        dpId: capital.dpId,
        dpCode: capital.dpCode,
        demat,
        boid: capital.boid,
      },
    });
    if (duplicate) {
      setErrorField(duplicate.reason === 'username' ? 'username' : null);
      setErrorMsg('This account is already saved. You cannot add it again.');
      showDuplicateAccountAlert(duplicate);
      return;
    }

    void sensitive.requestSensitiveAction(async () => {
      submitLockRef.current = true;
      setSubmitting(true);
      setErrorField(null);
      setErrorMsg('');
      try {
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
              demat,
            },
          }))
        ) {
          return;
        }

        savingDoneRef.current = true;

        await addAccount(
          {
            name: (holderNameRef.current || capital.username)
              .trim()
              .toUpperCase(),
            dpId: capital.dpId,
            dpCode: capital.dpCode,
            dpName: capital.dpName,
            username: capital.username,
            password: capital.password,
            bankName: linkedBank || capital.dpName,
            accountNumber: bankAccountNumberRef.current,
            crn: crnTrim,
            pin,
            verified: true,
            crnPinVerified: false,
            demat,
            boidHint: demat ? demat.slice(-4) : undefined,
            ...buildMinorMetaFields(dateOfBirth, guardianName),
          },
          { skipDuplicateCheck: true },
        );

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
          'Saved',
          'CRN and PIN are saved on this device. MeroShare will verify them when you apply for an IPO.',
        );
      } catch (e) {
        savingDoneRef.current = false;
        const msg =
          e instanceof Error ? e.message : 'Could not save account.';
        setErrorField('unknown');
        setErrorMsg(msg);
        Alert.alert('Could not save account', msg);
      } finally {
        setSubmitting(false);
        releaseSubmitLock();
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

          <AppPressable
            style={styles.submitBtn}
            onPress={onSubmit}
            loading={submitting}
            pressVariant="pushDown"
            pushOffset={3}
          >
            {submitting ? (
              <View style={styles.submitRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.submitText}> Saving…</Text>
              </View>
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </AppPressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <SensitiveActionModals action={sensitive} onDismiss={releaseSubmitLock} />
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
