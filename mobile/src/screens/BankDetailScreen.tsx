import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
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

const BANKS = [
  'NIC ASIA BANK LTD.',
  'NABIL BANK LTD.',
  'GLOBAL IME BANK LTD.',
  'SANIMA BANK LTD.',
  'RASTRIYA BANIJYA BANK LTD.',
];

export function BankDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { draft, addAccount } = useAccounts();

  const [bank, setBank] = useState(BANKS[0]);
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');
  const [hideCrn, setHideCrn] = useState(true);
  const [hidePin, setHidePin] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => BANKS.filter((b) => b.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  const onSubmit = async () => {
    if (!draft) {
      Alert.alert('Missing capital detail', 'Please add capital detail first.');
      navigation.navigate('AddCapital');
      return;
    }
    if (!crn.trim() || pin.length !== 4) {
      Alert.alert('Incomplete', 'Enter CRN and 4-digit transaction PIN.');
      return;
    }
    await addAccount({
      name: draft.username.toUpperCase(),
      dpId: draft.dpId,
      dpName: draft.dpName,
      username: draft.username,
      password: draft.password,
      bankName: bank,
      crn: crn.trim(),
      pin,
      verified: true,
    });
    Alert.alert('Saved', 'Capital Detail Added. Data stays on this device only.', [
      { text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Apply' }) },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Bank Detail</Text>
      </View>

      <LocalDisclaimer />

      <FormField
        icon="business-outline"
        label="Select Bank"
        value={bank}
        dropdown
        onPressDropdown={() => setPickerOpen(true)}
      />
      <FormField
        icon="key-outline"
        label="CRN Number"
        value={crn}
        onChangeText={setCrn}
        placeholder="CRN Number"
        secure={hideCrn}
        showEye
        onToggleEye={() => setHideCrn((v) => !v)}
      />
      <FormField
        icon="ellipsis-horizontal"
        label="Pin Code"
        value={pin}
        onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
        placeholder="Transaction Pin"
        secure={hidePin}
        showEye
        onToggleEye={() => setHidePin((v) => !v)}
        keyboardType="number-pad"
        maxLength={4}
        counter={`${pin.length}/4`}
      />

      <Pressable style={styles.submitBtn} onPress={onSubmit}>
        <Text style={styles.submitText}>Submit</Text>
      </Pressable>

      <Pressable style={styles.viber}>
        <Text style={styles.viberIcon}>💬</Text>
        <Text style={styles.viberText}>Join Viber Community</Text>
      </Pressable>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + rs(12) }]}>
            <Text style={styles.modalTitle}>Select Bank</Text>
            <TextInput
              style={styles.search}
              placeholder="Search bank..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.dpRow}
                  onPress={() => {
                    setBank(item);
                    setPickerOpen(false);
                    setQuery('');
                  }}
                >
                  <Text style={styles.dpText}>{item}</Text>
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
  submitBtn: {
    alignSelf: 'center',
    marginTop: rs(28),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(24),
    paddingHorizontal: rs(36),
    paddingVertical: rs(10),
  },
  submitText: { color: colors.sage, fontWeight: '700', fontSize: rs(15) },
  viber: {
    marginTop: 'auto',
    marginBottom: rs(28),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
  },
  viberIcon: { fontSize: rs(18) },
  viberText: { color: colors.sage, fontWeight: '600', fontSize: rs(14) },
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
