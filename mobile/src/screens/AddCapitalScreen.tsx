import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../components/FormField';
import { LocalDisclaimer } from '../components/LocalDisclaimer';
import { useAccounts } from '../context/AccountsContext';
import {
  fetchCapitalList,
  verifyMeroshareLogin,
  type CapitalDp,
} from '../services/meroshare';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type DpOption = { id: string; code: string; name: string };

const FALLBACK_DPS: DpOption[] = [
  { id: '13700', code: '13700', name: 'NIC ASIA BANK LIMITED (13700)' },
  { id: '12300', code: '12300', name: 'NABIL INVESTMENT BANKING LTD. (12300)' },
  { id: '11900', code: '11900', name: 'NIBL ACE CAPITAL LIMITED (11900)' },
  { id: '13200', code: '13200', name: 'GLOBAL IME CAPITAL LIMITED (13200)' },
  { id: '11700', code: '11700', name: 'CIVIL CAPITAL LTD. (11700)' },
];

function toOption(d: CapitalDp): DpOption {
  return {
    id: String(d.id),
    code: d.code,
    name: `${d.name} (${d.code})`,
  };
}

export function AddCapitalScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { setDraft } = useAccounts();

  const [dps, setDps] = useState<DpOption[]>(FALLBACK_DPS);
  const [loadingDps, setLoadingDps] = useState(true);
  const [dp, setDp] = useState<DpOption>(FALLBACK_DPS[0]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hidePass, setHidePass] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchCapitalList();
        if (!mounted || !list.length) return;
        const mapped = list
          .map(toOption)
          .sort((a, b) => a.name.localeCompare(b.name));
        setDps(mapped);
        setDp((prev) => mapped.find((d) => d.code === prev.code) ?? mapped[0]);
      } catch {
        // keep fallback
      } finally {
        if (mounted) setLoadingDps(false);
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

  const onNext = async () => {
    if (!username.trim() || !password.trim() || checkingLogin) return;
    setCheckingLogin(true);
    setLoginError('');
    try {
      const verify = await verifyMeroshareLogin({
        dpId: dp.id,
        dpCode: dp.code,
        dpName: dp.name,
        username: username.trim(),
        password,
        simulate: false,
      });
      if (!verify.ok) {
        setLoginError(verify.message);
        const isCred =
          /password|username|credential|unauthorized|invalid user/i.test(
            verify.message,
          );
        Alert.alert(
          isCred ? 'Login details incorrect' : 'Could not verify login',
          `${verify.message}\n\n${
            isCred
              ? 'Fix Depository Participant, username, or password. Nothing was saved.'
              : 'This looks like a network / server response issue, not necessarily wrong password. Retry on mobile data or Wi‑Fi.'
          }`,
        );
        return;
      }
      setDraft({
        dpId: dp.id,
        dpCode: dp.code,
        dpName: dp.name,
        username: username.trim(),
        password,
      });
      navigation.navigate('BankDetail');
    } finally {
      setCheckingLogin(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Add Capital Detail</Text>
      </View>

      <LocalDisclaimer />

      {loginError ? (
        <Text style={styles.loginError}>{loginError}</Text>
      ) : (
        <Text style={styles.hint}>
          Next live-checks DP + username + password with MeroShare.
        </Text>
      )}

      <FormField
        icon="business-outline"
        label="Depository Participants"
        value={loadingDps ? 'Loading DPs…' : dp.name}
        dropdown
        onPressDropdown={() => !loadingDps && setPickerOpen(true)}
      />
      <FormField
        icon="person-outline"
        label="Username"
        value={username}
        onChangeText={(t) => {
          setUsername(t);
          setLoginError('');
        }}
        placeholder="Username"
      />
      <FormField
        icon="lock-closed-outline"
        label="Password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setLoginError('');
        }}
        placeholder="Password"
        secure={hidePass}
        showEye
        onToggleEye={() => setHidePass((v) => !v)}
      />

      <Pressable
        style={[
          styles.nextBtn,
          (!username.trim() ||
            !password.trim() ||
            loadingDps ||
            checkingLogin) &&
            styles.nextDisabled,
        ]}
        onPress={() => void onNext()}
        disabled={loadingDps || checkingLogin}
      >
        {loadingDps || checkingLogin ? (
          <ActivityIndicator color={colors.sage} />
        ) : (
          <Text style={styles.nextText}>Next</Text>
        )}
      </Pressable>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
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
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.dpRow}
                  onPress={() => {
                    setDp(item);
                    setPickerOpen(false);
                    setQuery('');
                  }}
                >
                  <Text style={styles.dpText}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Pressable
              onPress={() => setPickerOpen(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: rs(8),
    color: colors.textSecondary,
    fontSize: rs(12),
  },
  loginError: {
    marginHorizontal: rs(16),
    marginBottom: rs(8),
    color: colors.danger,
    fontSize: rs(12),
    fontWeight: '600',
  },
  nextBtn: {
    alignSelf: 'center',
    marginTop: rs(28),
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: rs(24),
    paddingHorizontal: rs(36),
    paddingVertical: rs(10),
    minWidth: rs(120),
    alignItems: 'center',
  },
  nextDisabled: { opacity: 0.4 },
  nextText: { color: colors.sage, fontWeight: '700', fontSize: rs(15) },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: rs(16),
    borderTopRightRadius: rs(16),
    padding: rs(16),
  },
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
  closeBtn: { alignItems: 'center', paddingTop: rs(12) },
  closeText: { color: colors.sage, fontWeight: '700' },
});
