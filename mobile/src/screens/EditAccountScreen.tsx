import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../components/FormField';
import { LocalDisclaimer } from '../components/LocalDisclaimer';
import { MinorDobFields } from '../components/MinorDobFields';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import {
  fetchCapitalList,
  verifyAccountForSave,
  type CapitalDp,
  type VerifyField,
} from '../services/meroshare';
import type { ThemeColors } from '../theme/colors';
import { buildMinorMetaFields } from '../utils/minorAccount';
import {
  DuplicateAccountError,
  findDuplicateAccountAsync,
  showDuplicateAccountAlert,
} from '../utils/duplicateAccount';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type DpOption = { id: string; code: string; name: string };

function toOption(d: CapitalDp): DpOption {
  return { id: String(d.id), code: d.code, name: `${d.name} (${d.code})` };
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
  const { accounts, loadSecrets, updateAccount } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const account = useMemo(
    () => accounts.find((a) => a.id === route.params.accountId) ?? null,
    [accounts, route.params.accountId],
  );

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
  const [name, setName] = useState(account?.name ?? '');
  const [username, setUsername] = useState(account?.username ?? '');
  const [password, setPassword] = useState('');
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(
    account?.dateOfBirth ?? '',
  );
  const [guardianName, setGuardianName] = useState(
    account?.guardianName ?? '',
  );
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
  const pinAnchorY = useRef(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      const fromScreen = e.endCoordinates.screenY;
      const winH = Dimensions.get('window').height;
      const overlap =
        fromScreen > 0 && fromScreen < winH
          ? Math.max(0, winH - fromScreen)
          : e.endCoordinates.height;
      setKeyboardHeight(overlap);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const scrollPinAboveKeyboard = () => {
    setTimeout(() => {
      if (pinAnchorY.current > 0) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, pinAnchorY.current - rs(16)),
          animated: true,
        });
      } else {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    }, 100);
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!account) {
        setLoadingSecrets(false);
        return;
      }
      const secrets = await loadSecrets(account.id);
      if (!mounted) return;
      setPassword(secrets?.password ?? '');
      setCrn(secrets?.crn ?? '');
      setPin(secrets?.pin ?? '');
      setLoadingSecrets(false);
    })();
    return () => {
      mounted = false;
    };
  }, [account, loadSecrets]);

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
        // keep the account's stored DP
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(
    () =>
      dps.filter((d) =>
        d.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [dps, query],
  );

  const clearFieldError = (field: VerifyField) => {
    if (errorField === field) {
      setErrorField(null);
      setErrorMsg('');
    }
  };

  const onSave = async () => {
    if (!account || !dp) return;
    if (!username.trim() || !password.trim() || !crn.trim() || pin.length !== 4) {
      const field: VerifyField = !username.trim()
        ? 'username'
        : !password.trim()
          ? 'password'
          : !crn.trim()
            ? 'crn'
            : 'pin';
      setErrorField(field);
      setErrorMsg(
        field === 'pin'
          ? 'Transaction PIN must be 4 digits.'
          : `Enter the ${fieldLabel(field)}.`,
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
          setErrorMsg(
            'This account is already saved. You cannot add it again.',
          );
          showDuplicateAccountAlert(duplicate);
          return;
        }

        try {
          await updateAccount(
          account.id,
          {
            name: (name.trim() || verify.accountHolderName || username)
              .trim()
              .toUpperCase(),
            dpId: dp.id,
            dpCode: dp.code,
            dpName: dp.name,
            username: username.trim(),
            bankName: verify.bankName || account.bankName || dp.name,
            accountNumber: verify.accountNumber || account.accountNumber,
            verified: true,
            crnPinVerified: !verify.crnPinDeferred,
            demat: demat || undefined,
            boidHint: demat ? String(demat).slice(-4) : account.boidHint,
            ...buildMinorMetaFields(dateOfBirth, guardianName),
          },
          { password, crn: crn.trim(), pin },
        );

        Alert.alert(
          'Account updated',
          verify.crnPinDeferred
            ? `${verify.message}\n\nNo IPO is open, so CRN/PIN were not confirmed yet. They will be checked on your next Live Apply.`
            : `${verify.message}\n\nChanges stay on this device only.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        } catch (e) {
          if (e instanceof DuplicateAccountError) {
            setErrorMsg(
              'This account is already saved. You cannot add it again.',
            );
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

  if (!account) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.title}>Edit Account</Text>
        </View>
        <Text style={styles.hint}>This account no longer exists.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Edit Account</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scrollContent}
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
        ) : (
          <Text style={styles.hint}>
            Save re-checks DP + username + password + CRN + PIN with MeroShare.
            Apply history for this account is kept.
          </Text>
        )}

        <FormField
          emphasized
          icon="pricetag-outline"
          label="Account name"
          value={name}
          onChangeText={setName}
          placeholder="Display name"
        />
        <MinorDobFields
          dateOfBirth={dateOfBirth}
          onDateOfBirthChange={setDateOfBirth}
          guardianName={guardianName}
          onGuardianNameChange={setGuardianName}
        />
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
            placeholder="CRN from your bank / ASBA"
            secure={hideCrn}
            showEye
            onToggleEye={() => setHideCrn((v) => !v)}
            onFocus={() => scrollPinAboveKeyboard()}
          />
        </View>
        <View
          style={errStyle('pin')}
          onLayout={(e) => {
            pinAnchorY.current = e.nativeEvent.layout.y;
          }}
        >
          <FormField
            emphasized
            icon="ellipsis-horizontal"
            label="Transaction PIN"
            value={pin}
            onChangeText={(t) => {
              setPin(t.replace(/[^0-9]/g, '').slice(0, 4));
              clearFieldError('pin');
            }}
            placeholder="4-digit MeroShare PIN"
            secure={hidePin}
            showEye
            onToggleEye={() => setHidePin((v) => !v)}
            keyboardType="number-pad"
            maxLength={4}
            counter={`${pin.length}/4`}
            onFocus={() => scrollPinAboveKeyboard()}
          />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom:
              keyboardHeight > 0 ? rs(10) : Math.max(insets.bottom, rs(16)),
            bottom: keyboardHeight > 0 ? keyboardHeight : 0,
          },
        ]}
      >
        <Pressable
          style={[styles.saveBtn, (saving || loadingSecrets) && { opacity: 0.6 }]}
          onPress={() => void onSave()}
          disabled={saving || loadingSecrets}
        >
          {saving ? (
            <View style={styles.saveRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.saveText}> Verifying live…</Text>
            </View>
          ) : (
            <Text style={styles.saveText}>Verify & Save changes</Text>
          )}
        </Pressable>
      </View>

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
  scrollContent: { paddingBottom: rs(100) },
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
  hint: {
    marginHorizontal: rs(16),
    marginTop: rs(10),
    marginBottom: rs(8),
    color: colors.textSecondary,
    fontSize: rs(12),
    lineHeight: rs(17),
  },
  errorBanner: {
    marginHorizontal: rs(16),
    marginTop: rs(10),
    marginBottom: rs(8),
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
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingTop: rs(12),
    paddingHorizontal: rs(16),
    alignItems: 'center',
  },
  saveBtn: {
    alignSelf: 'stretch',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: rs(24),
    paddingHorizontal: rs(36),
    paddingVertical: rs(12),
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
  },
  saveRow: { flexDirection: 'row', alignItems: 'center' },
  saveText: { color: colors.primary, fontWeight: '700', fontSize: rs(15) },
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    color: colors.text,
    marginBottom: rs(8),
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
