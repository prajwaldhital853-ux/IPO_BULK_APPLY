import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { MeroshareClient } from '../services/meroshare/client';
import { updateAccountSecrets } from '../storage/accountsStorage';
import { showLockedAccountAlert } from '../utils/lockedAccountAlert';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const RULES = [
  'At Least 3 Number of lowercase letters in password',
  'Password Maximum Length is 15',
  'Password Minimum Length is 4',
  'Password must be changed on every 360 days',
];

function validatePassword(pw: string): string | null {
  if (pw.length < 4) return 'Password Minimum Length is 4';
  if (pw.length > 15) return 'Password Maximum Length is 15';
  const lower = (pw.match(/[a-z]/g) ?? []).length;
  if (lower < 3) return 'At Least 3 Number of lowercase letters in password';
  return null;
}

export function ChangePasswordScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { loadSecrets } = useAccounts();
  const { usableAccounts: accounts, isAccountActive } = useActiveAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [accountId, setAccountId] = useState<string | null>(
    accounts[0]?.id ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  const onSubmit = async () => {
    if (!selected) {
      Alert.alert('Select Account', 'Please select a MeroShare account first.');
      return;
    }
    if (!isAccountActive(selected.id)) {
      showLockedAccountAlert(() => navigation.navigate('Subscription'));
      return;
    }
    if (!oldPw || !newPw || !confirmPw) {
      Alert.alert('Missing fields', 'Fill old, new and confirm password.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Mismatch', 'New Password and Confirm Password must match.');
      return;
    }
    const ruleErr = validatePassword(newPw);
    if (ruleErr) {
      Alert.alert('Invalid password', ruleErr);
      return;
    }

    setBusy(true);
    try {
      const secrets = await loadSecrets(selected.id);
      if (!secrets?.password) {
        throw new Error('Saved password missing — re-add this account.');
      }
      // Prefer typed old password; fall back to saved if user left blank intent
      const client = new MeroshareClient();
      await client.login({
        clientId: selected.dpId,
        username: selected.username,
        password: oldPw,
        dpCode: selected.dpCode,
        dpName: selected.dpName,
      });
      await client.changePassword({
        oldPassword: oldPw,
        newPassword: newPw,
        confirmPassword: confirmPw,
      });
      await updateAccountSecrets(selected.id, { password: newPw });
      Alert.alert('Success', 'Password changed successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      Alert.alert(
        'Change failed',
        e instanceof Error ? e.message : 'Could not change password',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Change Password</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={colors.primary}
            style={{ marginTop: rs(2) }}
          />
          <View style={styles.infoTextCol}>
            {RULES.map((r) => (
              <Text key={r} style={styles.infoLine}>
                - {r}
              </Text>
            ))}
          </View>
        </View>

        <Pressable style={styles.select} onPress={() => setPickerOpen(true)}>
          <Text
            style={[
              styles.selectText,
              selected ? styles.selectTextOn : null,
            ]}
            numberOfLines={1}
          >
            {selected
              ? `${selected.name.toUpperCase()} (${selected.username})`
              : 'Select Account'}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <Field
          label="Old Password"
          icon="person-outline"
          value={oldPw}
          onChange={setOldPw}
          show={showOld}
          onToggleShow={() => setShowOld((v) => !v)}
          placeholder="Old Password"
          styles={styles}
          colors={colors}
        />
        <Field
          label="New Password"
          icon="lock-closed-outline"
          value={newPw}
          onChange={setNewPw}
          show={showNew}
          onToggleShow={() => setShowNew((v) => !v)}
          placeholder="New Password"
          styles={styles}
          colors={colors}
        />
        <Field
          label="Confirm Password"
          icon="lock-closed-outline"
          value={confirmPw}
          onChange={setConfirmPw}
          show={showConfirm}
          onToggleShow={() => setShowConfirm((v) => !v)}
          placeholder="Confirm Password"
          styles={styles}
          colors={colors}
        />

        <Pressable
          style={[styles.submit, busy && { opacity: 0.6 }]}
          onPress={() => void onSubmit()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.submitText}>Change Password</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade">
        <Pressable
          style={styles.modalBg}
          onPress={() => setPickerOpen(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Account</Text>
            {accounts.map((a) => (
              <Pressable
                key={a.id}
                style={styles.modalRow}
                onPress={() => {
                  setAccountId(a.id);
                  setPickerOpen(false);
                }}
              >
                <Ionicons name="person" size={rs(16)} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalName}>{a.name.toUpperCase()}</Text>
                  <Text style={styles.modalMeta}>
                    {a.dpName} · {a.username}
                  </Text>
                </View>
                {accountId === a.id ? (
                  <Ionicons name="checkmark" size={rs(18)} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}
            {!accounts.length ? (
              <Text style={styles.modalEmpty}>No accounts saved.</Text>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Field({
  label,
  icon,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  styles,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Ionicons name={icon} size={rs(14)} color={colors.textMuted} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={onToggleShow} hitSlop={8}>
          <Ionicons
            name={show ? 'eye-off-outline' : 'eye-outline'}
            size={rs(20)}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      backgroundColor: c.bgElevated,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '700',
      fontSize: rs(16),
    },
    body: { padding: rs(16), paddingBottom: rs(40) },
    infoBox: {
      flexDirection: 'row',
      gap: rs(10),
      backgroundColor: `${c.primary}1A`,
      borderColor: `${c.primary}55`,
      borderWidth: 1,
      borderRadius: rs(10),
      padding: rs(14),
      marginBottom: rs(18),
    },
    infoTextCol: { flex: 1, gap: rs(4) },
    infoLine: { color: c.text, fontSize: rs(12), lineHeight: rs(17) },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      marginBottom: rs(18),
      backgroundColor: c.surface,
    },
    selectText: { flex: 1, color: c.textMuted, fontSize: rs(13) },
    selectTextOn: { color: c.text, fontWeight: '600' },
    field: { marginBottom: rs(16) },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(8),
    },
    fieldLabel: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      backgroundColor: c.surface,
    },
    input: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(12),
    },
    submit: {
      marginTop: rs(10),
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(28),
      paddingVertical: rs(14),
      alignItems: 'center',
    },
    submitText: { color: c.primary, fontWeight: '700', fontSize: rs(14) },
    modalBg: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      padding: rs(24),
    },
    modalCard: {
      backgroundColor: c.bgElevated,
      borderRadius: rs(14),
      padding: rs(14),
      maxHeight: '70%',
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginBottom: rs(10),
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    modalName: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    modalMeta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    modalEmpty: { color: c.textMuted, textAlign: 'center', paddingVertical: rs(20) },
  });
}
