import React, { useEffect, useMemo, useState } from 'react';
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../components/FormField';
import { LocalDisclaimer } from '../components/LocalDisclaimer';
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
  const [hidePass, setHidePass] = useState(true);
  const [hideCrn, setHideCrn] = useState(true);
  const [hidePin, setHidePin] = useState(true);
  const [loadingSecrets, setLoadingSecrets] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorField, setErrorField] = useState<VerifyField | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

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

      <ScrollView contentContainerStyle={{ paddingBottom: rs(48) }}>
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
          icon="pricetag-outline"
          label="Account name"
          value={name}
          onChangeText={setName}
          placeholder="Display name"
        />
        <FormField
          icon="business-outline"
          label="Depository Participants"
          value={dp?.name ?? 'Loading DPs…'}
          dropdown
          onPressDropdown={() => setPickerOpen(true)}
        />
        <View style={errStyle('username')}>
          <FormField
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
          />
        </View>
        <View style={errStyle('pin')}>
          <FormField
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
          />
        </View>

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
      </ScrollView>

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
  saveBtn: {
    alignSelf: 'center',
    marginTop: rs(28),
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: rs(24),
    paddingHorizontal: rs(36),
    paddingVertical: rs(10),
    minWidth: rs(180),
    alignItems: 'center',
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
