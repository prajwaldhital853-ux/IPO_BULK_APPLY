import React, { useMemo, useState } from 'react';
import {
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
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const DPS = [
  { id: '13700', name: 'NIC ASIA BANK LIMITED (13700)' },
  { id: '12300', name: 'NABIL INVESTMENT BANKING LTD. (12300)' },
  { id: '11900', name: 'NIBL ACE CAPITAL LIMITED (11900)' },
  { id: '13200', name: 'GLOBAL IME CAPITAL LIMITED (13200)' },
  { id: '11700', name: 'CIVIL CAPITAL LTD. (11700)' },
];

export function AddCapitalScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { setDraft } = useAccounts();

  const [dp, setDp] = useState(DPS[0]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hidePass, setHidePass] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      DPS.filter((d) =>
        d.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query],
  );

  const onNext = () => {
    if (!username.trim() || !password.trim()) return;
    setDraft({
      dpId: dp.id,
      dpName: dp.name,
      username: username.trim(),
      password,
    });
    navigation.navigate('BankDetail');
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

      <FormField
        icon="business-outline"
        label="Depository Participants"
        value={dp.name}
        dropdown
        onPressDropdown={() => setPickerOpen(true)}
      />
      <FormField
        icon="person-outline"
        label="Username"
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
      />
      <FormField
        icon="lock-closed-outline"
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secure={hidePass}
        showEye
        onToggleEye={() => setHidePass((v) => !v)}
      />

      <Pressable
        style={[
          styles.nextBtn,
          (!username.trim() || !password.trim()) && styles.nextDisabled,
        ]}
        onPress={onNext}
      >
        <Text style={styles.nextText}>Next</Text>
      </Pressable>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + rs(12) }]}>
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
            <Pressable onPress={() => setPickerOpen(false)} style={styles.closeBtn}>
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
  nextBtn: {
    alignSelf: 'center',
    marginTop: rs(28),
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: rs(24),
    paddingHorizontal: rs(36),
    paddingVertical: rs(10),
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
