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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../components/FormField';
import { LocalDisclaimer } from '../components/LocalDisclaimer';
import { useAccounts } from '../context/AccountsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import {
  fetchCapitalList,
  verifyMeroshareLogin,
  type CapitalDp,
} from '../services/meroshare';
import type { ThemeColors } from '../theme/colors';
import { guardAddAccount } from '../utils/accountLimits';
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
  const { setDraft, accounts } = useAccounts();
  const { isPremium, maxAccounts } = useSubscription();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  const keyboardPad =
    keyboardHeight > 0
      ? Platform.OS === 'ios'
        ? Math.max(0, keyboardHeight - insets.bottom) + rs(24)
        : rs(24)
      : rs(40);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Add Capital Detail</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: keyboardPad }}
          showsVerticalScrollIndicator={false}
        >
          <LocalDisclaimer />

          <View style={styles.formCard}>
            {loginError ? (
              <Text style={styles.loginError}>{loginError}</Text>
            ) : (
              <Text style={styles.hint}>
                Next live-checks DP + username + password with MeroShare.
              </Text>
            )}

            <FormField
              emphasized
              icon="business-outline"
              label="Depository Participants"
              value={loadingDps ? 'Loading DPs…' : dp.name}
              dropdown
              onPressDropdown={() => !loadingDps && setPickerOpen(true)}
            />
            <FormField
              emphasized
              icon="person-outline"
              label="Username"
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setLoginError('');
              }}
              placeholder="Username"
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
              }}
            />
            <FormField
              emphasized
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
              onFocus={() => {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
              }}
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
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.nextText}>Next</Text>
              )}
            </Pressable>
          </View>
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
    paddingVertical: rs(12),
    gap: rs(8),
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.text, fontSize: rs(22), width: rs(32) },
  title: {
    color: colors.text,
    fontSize: rs(18),
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  formCard: {
    marginHorizontal: rs(12),
    marginTop: rs(4),
    marginBottom: rs(8),
    paddingVertical: rs(12),
    paddingBottom: rs(20),
    borderRadius: rs(14),
    borderWidth: 1.5,
    borderColor: colors.textDim,
    backgroundColor: colors.surface,
  },
  hint: {
    marginHorizontal: rs(16),
    marginBottom: rs(4),
    color: colors.text,
    fontSize: rs(13),
    fontWeight: '600',
    lineHeight: rs(18),
  },
  loginError: {
    marginHorizontal: rs(16),
    marginBottom: rs(8),
    color: colors.danger,
    fontSize: rs(12),
    fontWeight: '700',
  },
  nextBtn: {
    alignSelf: 'center',
    marginTop: rs(28),
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: rs(24),
    paddingHorizontal: rs(36),
    paddingVertical: rs(10),
    minWidth: rs(120),
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
  },
  nextDisabled: { opacity: 0.4 },
  nextText: { color: colors.primary, fontWeight: '800', fontSize: rs(15) },
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
