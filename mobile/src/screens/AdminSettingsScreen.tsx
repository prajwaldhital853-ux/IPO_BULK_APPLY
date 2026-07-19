import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useTheme } from '../context/ThemeContext';
import {
  changeAdminPassword,
  fetchAdminSettings,
  updateAdminSettings,
  type AdminSettings,
} from '../services/admin/adminApi';
import { loadAdminToken } from '../services/admin/adminTokenStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

function Field({
  label,
  value,
  onChangeText,
  colors,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: ThemeColors;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url';
}) {
  const styles = useMemo(() => makeFieldStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
      />
    </View>
  );
}

export function AdminSettingsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  const [qrText, setQrText] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentWhatsapp, setPaymentWhatsapp] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const applySettings = useCallback((s: AdminSettings) => {
    setSettings(s);
    setQrText(s.payment.qrText);
    setBankName(s.payment.bankName);
    setAccountName(s.payment.accountName);
    setAccountNumber(s.payment.accountNumber);
    setPaymentWhatsapp(s.payment.whatsapp);
    setCompanyName(s.contact.companyName);
    setContactEmail(s.contact.email);
    setContactWhatsapp(s.contact.whatsapp);
    setWhatsappUrl(s.contact.whatsappUrl);
    setFacebookUrl(s.contact.facebookUrl ?? '');
    setTiktokUrl(s.contact.tiktokUrl ?? '');
  }, []);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const s = await fetchAdminSettings(t);
      applySettings(s);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not load settings');
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void loadAdminToken().then((t) => {
      if (!t) {
        navigation.replace('AdminLogin');
        return;
      }
      setToken(t);
      void load(t);
    });
  }, [load, navigation]);

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateAdminSettings(token, {
        payment: {
          qrText: qrText.trim(),
          bankName: bankName.trim(),
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
          whatsapp: paymentWhatsapp.trim(),
        },
        contact: {
          companyName: companyName.trim(),
          email: contactEmail.trim(),
          whatsapp: contactWhatsapp.trim(),
          whatsappUrl: whatsappUrl.trim(),
          facebookUrl: facebookUrl.trim() || null,
          tiktokUrl: tiktokUrl.trim() || null,
        },
      });
      applySettings(updated);
      Alert.alert('Saved', 'Payment and contact details updated.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const onChangePassword = async () => {
    if (!token) return;
    if (!currentPassword || newPassword.length < 8) {
      Alert.alert('Invalid', 'Enter current password and a new password (min 8 chars).');
      return;
    }
    setSaving(true);
    try {
      await changeAdminPassword(token, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Done', 'Admin password updated.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>App settings</Text>
        <View style={{ width: rs(22) }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {settings ? (
            <Text style={styles.hint}>Admin: {settings.adminEmail}</Text>
          ) : null}

          <Text style={styles.section}>Payment details</Text>
          <Field label="QR code text" value={qrText} onChangeText={setQrText} colors={colors} multiline />
          <Field label="Bank name" value={bankName} onChangeText={setBankName} colors={colors} />
          <Field label="Account name" value={accountName} onChangeText={setAccountName} colors={colors} />
          <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} colors={colors} />
          <Field
            label="WhatsApp (digits only, e.g. 9779709133067)"
            value={paymentWhatsapp}
            onChangeText={setPaymentWhatsapp}
            colors={colors}
            keyboardType="phone-pad"
          />

          <Text style={styles.section}>Contact & social</Text>
          <Field label="Company name" value={companyName} onChangeText={setCompanyName} colors={colors} />
          <Field
            label="Public email"
            value={contactEmail}
            onChangeText={setContactEmail}
            colors={colors}
            keyboardType="email-address"
          />
          <Field label="WhatsApp display number" value={contactWhatsapp} onChangeText={setContactWhatsapp} colors={colors} />
          <Field label="WhatsApp link" value={whatsappUrl} onChangeText={setWhatsappUrl} colors={colors} keyboardType="url" />
          <Field label="Facebook URL" value={facebookUrl} onChangeText={setFacebookUrl} colors={colors} keyboardType="url" />
          <Field label="TikTok URL" value={tiktokUrl} onChangeText={setTiktokUrl} colors={colors} keyboardType="url" />

          <Pressable style={styles.btn} onPress={() => void onSave()} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={colors.fabIcon} />
            ) : (
              <Text style={styles.btnText}>Save payment & contact</Text>
            )}
          </Pressable>

          <Text style={styles.section}>Change password</Text>
          <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} colors={colors} />
          <Field label="New password (min 8)" value={newPassword} onChangeText={setNewPassword} colors={colors} />
          <Pressable style={styles.btnSecondary} onPress={() => void onChangePassword()} disabled={saving}>
            <Text style={styles.btnSecondaryText}>Update password</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function makeFieldStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginBottom: rs(10) },
    label: { color: c.textSecondary, fontSize: rs(12), marginBottom: rs(4) },
    input: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      padding: rs(12),
      color: c.text,
      fontSize: rs(14),
      backgroundColor: c.surface,
    },
    multiline: { minHeight: rs(72), textAlignVertical: 'top' },
  });
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    scroll: { padding: rs(16), paddingBottom: rs(40) },
    hint: { color: c.textMuted, fontSize: rs(12), marginBottom: rs(12) },
    section: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginTop: rs(8),
      marginBottom: rs(10),
    },
    btn: {
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(14),
      alignItems: 'center',
      marginTop: rs(8),
      marginBottom: rs(20),
    },
    btnText: { color: c.fabIcon, fontWeight: '800', fontSize: rs(15) },
    btnSecondary: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      paddingVertical: rs(12),
      alignItems: 'center',
      marginBottom: rs(24),
    },
    btnSecondaryText: { color: c.text, fontWeight: '700', fontSize: rs(14) },
  });
}
