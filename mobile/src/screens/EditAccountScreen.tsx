import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountToggleRow } from '../components/AccountToggleRow';
import { FormField } from '../components/FormField';
import { LocalDisclaimer } from '../components/LocalDisclaimer';
import { MinorDobFields } from '../components/MinorDobFields';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import {
  MeroshareClient,
  MeroshareError,
  fetchCapitalList,
  isTransientMeroshareError,
  verifyAccountForSave,
  type CapitalDp,
  type VerifyField,
} from '../services/meroshare';
import type { ThemeColors } from '../theme/colors';
import type { DraftCapital } from '../types/account';
import {
  buildMinorMetaFields,
  extractBankWithBranchFromProfile,
  extractDobFromOwnDetail,
  extractGuardianFromProfile,
  isMinorFromDob,
} from '../utils/minorAccount';
import {
  DuplicateAccountError,
  findDuplicateAccountAsync,
  showDuplicateAccountAlert,
} from '../utils/duplicateAccount';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type DpOption = { id: string; code: string; name: string };
type Step = 1 | 2;

const BANK_LOAD_ATTEMPTS = 3;

function toOption(d: CapitalDp): DpOption {
  return { id: String(d.id), code: d.code, name: `${d.name} (${d.code})` };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadBankAndDobFromMeroshare(
  capital: DraftCapital,
  attempt: number,
): Promise<{
  bankName: string;
  dob: string | null;
  guardianName: string | null;
}> {
  const client = new MeroshareClient();
  try {
    await client.login(
      {
        clientId: capital.dpId,
        dpCode: capital.dpCode,
        dpName: capital.dpName,
        username: capital.username,
        password: capital.password,
      },
      { attempts: attempt === 0 ? 3 : 1 },
    );

    const profile = await client.fetchAccountProfileRaw();
    const dob = extractDobFromOwnDetail(profile);
    const guardianName = extractGuardianFromProfile(profile);
    let bankName = extractBankWithBranchFromProfile(profile) || '';

    if (!bankName) {
      try {
        const banks = await client.listBanksWithRetry();
        if (banks.length) {
          bankName = banks[0].name || `Bank #${banks[0].id}`;
        }
      } catch {
        // profile is preferred
      }
    }

    return { bankName, dob, guardianName };
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
    default:
      return 'Credentials';
  }
}

export function EditAccountScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'EditAccount'>>();
  const insets = useSafeAreaInsets();
  const sensitive = useSensitiveAction();
  const { accounts, loadSecrets, updateAccount, updateAccountMeta, reorderAccounts } =
    useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const account = useMemo(
    () => accounts.find((a) => a.id === route.params.accountId) ?? null,
    [accounts, route.params.accountId],
  );

  const [step, setStep] = useState<Step>(1);
  const [dps, setDps] = useState<DpOption[]>([]);
  const [dp, setDp] = useState<DpOption | null>(
    account
      ? {
          id: account.dpId,
          code: account.dpCode ?? account.dpId,
          name: account.dpName,
        }
      : null,
  );
  const [username, setUsername] = useState(account?.username ?? '');
  const [password, setPassword] = useState('');
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(account?.dateOfBirth ?? '');
  const [guardianName, setGuardianName] = useState(account?.guardianName ?? '');
  const [makePrimary, setMakePrimary] = useState(
    account?.isPrimary ?? accounts[0]?.id === account?.id,
  );
  const [makeInactive, setMakeInactive] = useState(account?.inactive ?? false);
  const [linkedBank, setLinkedBank] = useState(account?.bankName ?? '');
  const [loadingBank, setLoadingBank] = useState(false);
  const [bankError, setBankError] = useState('');
  const [bankRetryKey, setBankRetryKey] = useState(0);
  const [dobAutoFilled, setDobAutoFilled] = useState(Boolean(account?.dateOfBirth));
  const [detectingDob, setDetectingDob] = useState(false);
  const [hidePass, setHidePass] = useState(true);
  const [hideCrn, setHideCrn] = useState(true);
  const [hidePin, setHidePin] = useState(true);
  const [loadingSecrets, setLoadingSecrets] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorField, setErrorField] = useState<VerifyField | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dobTouchedRef = useRef(false);
  const initialSnapshot = useRef('');

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!account) {
        setLoadingSecrets(false);
        return;
      }
      const secrets = await loadSecrets(account.id);
      if (!mounted) return;
      const pass = secrets?.password ?? '';
      const crnVal = secrets?.crn ?? '';
      const pinVal = secrets?.pin ?? '';
      setPassword(pass);
      setCrn(crnVal);
      setPin(pinVal);
      initialSnapshot.current = JSON.stringify({
        dpId: account.dpId,
        username: account.username,
        password: pass,
        crn: crnVal,
        pin: pinVal,
        makePrimary: account.isPrimary ?? accounts[0]?.id === account.id,
        makeInactive: account.inactive ?? false,
        dateOfBirth: account.dateOfBirth ?? '',
        guardianName: account.guardianName ?? '',
      });
      setLoadingSecrets(false);
    })();
    return () => {
      mounted = false;
    };
  }, [account, accounts, loadSecrets]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const list = await fetchCapitalList();
        if (!mounted || !list.length) return;
        const mapped = list
          .map(toOption)
          .sort((a, b) => a.name.localeCompare(b.name));
        setDps(mapped);
        setDp((prev) => {
          if (!prev) return mapped[0];
          return (
            mapped.find((d) => d.code === prev.code || d.id === prev.id) ?? prev
          );
        });
      } catch {
        // keep stored DP
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 2 || !dp || !username.trim() || !password.trim()) return;

    let mounted = true;
    const capital: DraftCapital = {
      dpId: dp.id,
      dpCode: dp.code,
      dpName: dp.name,
      username: username.trim(),
      password,
    };

    void (async () => {
      setLoadingBank(true);
      setBankError('');
      setDetectingDob(true);

      let lastError: unknown;
      let bestBank = account?.bankName ?? '';
      let bestDob: string | null = account?.dateOfBirth ?? null;
      let bestGuardian: string | null = account?.guardianName ?? null;

      try {
        for (let attempt = 0; attempt < BANK_LOAD_ATTEMPTS; attempt++) {
          if (!mounted) return;
          try {
            const result = await loadBankAndDobFromMeroshare(capital, attempt);
            if (!mounted) return;
            if (result.bankName) bestBank = result.bankName;
            if (result.dob) {
              bestDob = result.dob;
              bestGuardian = result.guardianName;
            }
            if (bestBank && bestDob) break;
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
          if (attempt < BANK_LOAD_ATTEMPTS - 1 && mounted && !bestDob) {
            await delay(1500 * (attempt + 1));
          }
        }

        if (!mounted) return;

        setLinkedBank(bestBank || dp.name);

        if (bestDob && !dobTouchedRef.current) {
          setDateOfBirth(bestDob);
          setDobAutoFilled(true);
          if (isMinorFromDob(bestDob) && bestGuardian) {
            setGuardianName((prev) => prev.trim() || bestGuardian!);
          }
        } else if (!bestDob) {
          setDobAutoFilled(false);
        }

        if (!bestBank && !bestDob) {
          const msg =
            lastError instanceof Error
              ? lastError.message
              : 'MeroShare login failed';
          setBankError(
            `Could not refresh bank details (${msg}). Saved bank name is shown.`,
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
  }, [step, dp, username, password, account, bankRetryKey]);

  const filtered = useMemo(
    () =>
      dps.filter((d) =>
        d.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [dps, query],
  );

  const isDirty = useMemo(() => {
    if (!account || loadingSecrets) return false;
    const current = JSON.stringify({
      dpId: dp?.id,
      username: username.trim(),
      password,
      crn: crn.trim(),
      pin,
      makePrimary,
      makeInactive,
      dateOfBirth,
      guardianName,
    });
    return current !== initialSnapshot.current;
  }, [
    account,
    crn,
    dateOfBirth,
    dp?.id,
    guardianName,
    loadingSecrets,
    makeInactive,
    makePrimary,
    password,
    pin,
    username,
  ]);

  const clearFieldError = (field: VerifyField) => {
    if (errorField === field) {
      setErrorField(null);
      setErrorMsg('');
    }
  };

  const discardEdit = () => {
    if (!isDirty) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Discard changes?',
      'Your edits on this screen will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ],
    );
  };

  const onBack = () => {
    if (step === 2) {
      setStep(1);
      setErrorField(null);
      setErrorMsg('');
      return;
    }
    discardEdit();
  };

  const onNext = () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing details', 'Enter username and password first.');
      return;
    }
    setStep(2);
    setErrorField(null);
    setErrorMsg('');
  };

  const applyPrimaryAndInactive = async (accountId: string) => {
    if (makePrimary) {
      await Promise.all(
        accounts
          .filter((a) => a.id !== accountId && a.isPrimary)
          .map((a) => updateAccountMeta(a.id, { isPrimary: false })),
      );
      const ids = accounts.map((a) => a.id);
      await reorderAccounts([accountId, ...ids.filter((id) => id !== accountId)]);
    } else if (account?.isPrimary) {
      await updateAccountMeta(accountId, { isPrimary: false });
    }
  };

  const onUpdate = async () => {
    if (!account || !dp) return;
    if (!crn.trim() || pin.length !== 4) {
      const field: VerifyField = !crn.trim() ? 'crn' : 'pin';
      setErrorField(field);
      setErrorMsg(
        field === 'pin'
          ? 'Transaction PIN must be 4 digits.'
          : 'Enter the CRN Number.',
      );
      return;
    }
    if (saving) return;

    void sensitive.requestSensitiveAction(async () => {
      setSaving(true);
      setErrorField(null);
      setErrorMsg('');
      try {
        const verify = await verifyAccountForSave({
          dpId: dp.id,
          dpCode: dp.code,
          username: username.trim(),
          password,
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
            `${verify.message}\n\nChanges were NOT saved. Fix the highlighted field and try again.`,
          );
          return;
        }

        const demat =
          verify.demat?.trim() ||
          (verify.boid && /^\d{16}$/.test(verify.boid.trim())
            ? verify.boid.trim()
            : dp.code && username.trim()
              ? `130${dp.code}${username.trim()}`
              : account.demat);

        const duplicate = await findDuplicateAccountAsync({
          accounts,
          excludeId: account.id,
          candidate: {
            username: username.trim(),
            dpId: dp.id,
            dpCode: dp.code,
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
                : 'dp',
          );
          setErrorMsg('This account is already saved. You cannot add it again.');
          showDuplicateAccountAlert(duplicate);
          return;
        }

        try {
          await updateAccount(
            account.id,
            {
              name: (verify.accountHolderName || account.name || username)
                .trim()
                .toUpperCase(),
              dpId: dp.id,
              dpCode: dp.code,
              dpName: dp.name,
              username: username.trim(),
              bankName: verify.bankName || linkedBank || account.bankName || dp.name,
              accountNumber: verify.accountNumber || account.accountNumber,
              verified: true,
              crnPinVerified: !verify.crnPinDeferred,
              demat: demat || undefined,
              boidHint: demat ? String(demat).slice(-4) : account.boidHint,
              isPrimary: makePrimary && !makeInactive,
              inactive: makeInactive,
              ...buildMinorMetaFields(dateOfBirth, guardianName),
            },
            { password, crn: crn.trim(), pin },
          );

          await applyPrimaryAndInactive(account.id);

          Alert.alert(
            'Account updated',
            verify.crnPinDeferred
              ? `${verify.message}\n\nNo IPO is open, so CRN/PIN were not confirmed yet. They will be checked on your next Live Apply.`
              : `${verify.message}\n\nChanges stay on this device only.`,
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
        } catch (e) {
          if (e instanceof DuplicateAccountError) {
            setErrorMsg('This account is already saved. You cannot add it again.');
            showDuplicateAccountAlert(e.hit);
            return;
          }
          throw e;
        }
      } finally {
        setSaving(false);
      }
    });
  };

  const errStyle = (field: VerifyField) =>
    errorField === field ? styles.fieldErrorWrap : null;

  const keyboardPad =
    keyboardHeight > 0
      ? Platform.OS === 'ios'
        ? Math.max(0, keyboardHeight - insets.bottom) + rs(24)
        : rs(24)
      : rs(40);

  if (!account) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.title}>Edit Capital Detail</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.hint}>This account no longer exists.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>
          {step === 1 ? 'Edit Capital Detail' : 'Bank Detail'}
        </Text>
        {step === 1 ? (
          <Pressable onPress={discardEdit} hitSlop={12} style={styles.trashBtn}>
            <Ionicons name="trash-outline" size={rs(20)} color={colors.danger} />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: keyboardPad }}
          showsVerticalScrollIndicator={false}
        >
          <LocalDisclaimer />

          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>
                {errorField === 'unknown' || !errorField
                  ? 'Verification issue'
                  : `${fieldLabel(errorField)} does not match`}
              </Text>
              <Text style={styles.errorBannerText}>{errorMsg}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              <FormField
                emphasized
                icon="business-outline"
                label="Depository Participants"
                value={dp?.name ?? 'Loading DPs…'}
                dropdown
                onPressDropdown={() => setPickerOpen(true)}
              />
              <View style={errStyle('username')}>
                <FormField
                  emphasized
                  icon="person-outline"
                  label="Username"
                  value={username}
                  onChangeText={(t) => {
                    setUsername(t);
                    clearFieldError('username');
                  }}
                  placeholder="Username"
                />
              </View>
              <View style={errStyle('password')}>
                <FormField
                  emphasized
                  icon="lock-closed-outline"
                  label="Password"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    clearFieldError('password');
                  }}
                  placeholder={loadingSecrets ? 'Loading…' : 'Password'}
                  secure={hidePass}
                  showEye
                  onToggleEye={() => setHidePass((v) => !v)}
                />
              </View>

              <AccountToggleRow
                icon="ribbon-outline"
                label="Make Account Primary"
                note="Note: If you make your account primary here, all opening IPOs are shown from this account"
                value={makePrimary}
                onValueChange={(on) => {
                  setMakePrimary(on);
                  if (on) setMakeInactive(false);
                }}
              />
              <AccountToggleRow
                icon="ban-outline"
                label="Make Account Inactive"
                note="Note: If you make your account inactive here, this account won't be available to apply for IPOs through the Bulk Apply option."
                value={makeInactive}
                onValueChange={(on) => {
                  setMakeInactive(on);
                  if (on) setMakePrimary(false);
                }}
              />

              <Pressable
                style={[styles.outlineBtn, loadingSecrets && { opacity: 0.6 }]}
                onPress={onNext}
                disabled={loadingSecrets}
              >
                <Text style={styles.outlineBtnText}>Next</Text>
              </Pressable>
            </>
          ) : (
            <>
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
                    clearFieldError('crn');
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
                    clearFieldError('pin');
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

              <Pressable
                style={[styles.outlineBtn, (saving || loadingSecrets) && { opacity: 0.6 }]}
                onPress={() => void onUpdate()}
                disabled={saving || loadingSecrets}
              >
                {saving ? (
                  <View style={styles.saveRow}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.outlineBtnText}> Verifying…</Text>
                  </View>
                ) : (
                  <Text style={styles.outlineBtnText}>Update</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              Keyboard.dismiss();
              setPickerOpen(false);
            }}
          />
          <View
            style={[styles.modalSheet, { paddingBottom: insets.bottom + rs(12) }]}
          >
            <Text style={styles.modalTitle}>Select DP</Text>
            <TextInput
              style={styles.search}
              placeholder="Search DP..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            <FlatList
              data={filtered}
              style={styles.dpList}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator
              ListEmptyComponent={
                <Text style={styles.dpEmpty}>No matching DP found.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.dpRow}
                  onPress={() => {
                    setDp(item);
                    setPickerOpen(false);
                    setQuery('');
                    Keyboard.dismiss();
                  }}
                >
                  <Text style={styles.dpText}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setPickerOpen(false);
              }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SensitiveActionModals action={sensitive} />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
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
    trashBtn: {
      width: rs(32),
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    hint: {
      marginHorizontal: rs(16),
      marginTop: rs(10),
      color: colors.textSecondary,
      fontSize: rs(12),
    },
    errorBanner: {
      marginHorizontal: rs(16),
      marginTop: rs(10),
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
    errorBannerText: { color: colors.text, fontSize: rs(12), lineHeight: rs(17) },
    fieldErrorWrap: {
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
      marginLeft: rs(8),
    },
    bankWarnBox: {
      marginHorizontal: rs(16),
      marginTop: rs(8),
      gap: rs(6),
    },
    bankWarn: {
      color: colors.textMuted,
      fontSize: rs(11),
      lineHeight: rs(15),
    },
    retryText: {
      color: colors.sage,
      fontSize: rs(12),
      fontWeight: '700',
    },
    outlineBtn: {
      alignSelf: 'center',
      marginTop: rs(28),
      borderRadius: rs(24),
      paddingHorizontal: rs(44),
      paddingVertical: rs(11),
      minWidth: rs(132),
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.bg,
    },
    outlineBtnText: {
      color: colors.primary,
      fontWeight: '800',
      fontSize: rs(15),
    },
    saveRow: { flexDirection: 'row', alignItems: 'center' },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      height: '75%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: rs(16),
      borderTopRightRadius: rs(16),
      padding: rs(16),
    },
    dpList: { flex: 1 },
    modalTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: rs(16),
      marginBottom: rs(10),
    },
    search: {
      borderWidth: 1.5,
      borderColor: colors.textDim,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      color: colors.text,
      marginBottom: rs(8),
      backgroundColor: colors.bg,
    },
    dpRow: {
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    dpText: { color: colors.text, fontSize: rs(14) },
    dpEmpty: {
      color: colors.textMuted,
      fontSize: rs(13),
      textAlign: 'center',
      paddingVertical: rs(20),
    },
    closeBtn: { alignItems: 'center', paddingTop: rs(12) },
    closeText: { color: colors.primary, fontWeight: '700' },
  });
}
