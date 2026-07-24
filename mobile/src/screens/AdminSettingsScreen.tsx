import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  deleteAdminPaymentQr,
  fetchAdminSettings,
  updateAdminSettings,
  uploadAdminPaymentQr,
  type AdminSettings,
  type AdminSocialLink,
} from '../services/admin/adminApi';
import { loadAdminToken } from '../services/admin/adminTokenStorage';
import { AUTH_API_BASE } from '../services/auth/config';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';
import * as ImagePicker from 'expo-image-picker';

function qrPreviewUrl(text: string): string {
  const data = text.trim() || 'NEPSE GHAR Premium Payment';
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
}

function resolveQrImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${AUTH_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

const SOCIAL_PLATFORMS = [
  'viber',
  'youtube',
  'instagram',
  'twitter',
  'facebook',
  'tiktok',
  'telegram',
  'website',
  'custom',
] as const;

function newSocialLink(): AdminSocialLink {
  return {
    id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    platform: 'viber',
    label: 'Viber',
    detail: '',
    url: '',
  };
}

function Field({
  label,
  value,
  onChangeText,
  colors,
  multiline,
  keyboardType,
  fieldKey,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: ThemeColors;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url';
  fieldKey?: string;
}) {
  const styles = useMemo(() => makeFieldStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        key={fieldKey}
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

function ensureUniqueSocialLinks(links: AdminSocialLink[]): AdminSocialLink[] {
  const seen = new Set<string>();
  return links.map((link, index) => {
    let id = (link.id || '').trim();
    if (!id || seen.has(id)) {
      id = `link-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    }
    seen.add(id);
    return {
      id,
      platform: (link.platform || 'custom').trim().toLowerCase() || 'custom',
      label: link.label || link.platform || `Link ${index + 1}`,
      detail: link.detail ?? '',
      url: link.url ?? '',
    };
  });
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
  const [qrBusy, setQrBusy] = useState(false);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);

  const [qrText, setQrText] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentWhatsapp, setPaymentWhatsapp] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [socialLinks, setSocialLinks] = useState<AdminSocialLink[]>([]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const applySettings = useCallback((s: AdminSettings) => {
    setSettings(s);
    setQrText(s.payment.qrText);
    setQrImageUrl(resolveQrImageUrl(s.payment.qrImageUrl));
    setBankName(s.payment.bankName);
    setAccountName(s.payment.accountName);
    setAccountNumber(s.payment.accountNumber);
    setPaymentWhatsapp(s.payment.whatsapp);
    setCompanyName(s.contact.companyName);
    setContactEmail(s.contact.email);
    setContactWhatsapp(s.contact.whatsapp);
    setWhatsappUrl(s.contact.whatsappUrl);
    setSocialLinks(ensureUniqueSocialLinks(s.contact.socialLinks ?? []));
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

  const onPickQrFromGallery = async () => {
    if (!token) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo access so you can upload the payment QR from your gallery.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    setQrBusy(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const name =
        asset.fileName ??
        (mime.includes('png') ? 'payment-qr.png' : 'payment-qr.jpg');
      const updated = await uploadAdminPaymentQr(token, asset.uri, mime, name);
      applySettings(updated);
      Alert.alert('Uploaded', 'Payment QR image updated. Users will see it on Premium.');
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setQrBusy(false);
    }
  };

  const onDeleteQrImage = () => {
    if (!token) return;
    Alert.alert(
      'Remove QR image?',
      'The app will fall back to generating a QR from the payment text (if set).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setQrBusy(true);
            void deleteAdminPaymentQr(token)
              .then((updated) => {
                applySettings(updated);
                Alert.alert('Removed', 'Custom QR image deleted.');
              })
              .catch((e: unknown) =>
                Alert.alert(
                  'Delete failed',
                  e instanceof Error ? e.message : 'Try again',
                ),
              )
              .finally(() => setQrBusy(false));
          },
        },
      ],
    );
  };

  const patchSocial = (id: string, patch: Partial<AdminSocialLink>) => {
    setSocialLinks((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next: AdminSocialLink = {
          id: row.id,
          platform: patch.platform ?? row.platform,
          label: patch.label ?? row.label,
          detail: patch.detail ?? row.detail,
          url: patch.url ?? row.url,
        };
        // Only auto-rename when platform changes and label was the old platform name.
        if (
          patch.platform &&
          patch.label === undefined &&
          (!row.label.trim() ||
            row.label.trim().toLowerCase() === row.platform.toLowerCase())
        ) {
          next.label =
            patch.platform.charAt(0).toUpperCase() + patch.platform.slice(1);
        }
        return next;
      }),
    );
  };

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const cleaned = ensureUniqueSocialLinks(socialLinks)
        .map((l) => ({
          id: l.id,
          platform: l.platform.trim().toLowerCase() || 'custom',
          label: l.label.trim() || l.platform || 'Link',
          detail: l.detail.trim(),
          url: l.url.trim(),
        }))
        .filter((l) => l.url || l.label);
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
          facebookUrl:
            cleaned.find((l) => l.platform === 'facebook')?.url ?? null,
          tiktokUrl: cleaned.find((l) => l.platform === 'tiktok')?.url ?? null,
          socialLinks: cleaned,
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

          <Text style={styles.section}>Payment QR & bank details</Text>
          <Text style={styles.help}>
            Upload your eSewa / bank QR from gallery. This image is shown on the Premium
            Subscription screen. You can also delete it anytime.
          </Text>

          <View style={styles.qrPreview}>
            <Text style={styles.qrPreviewLabel}>
              {qrImageUrl ? 'Uploaded QR (from gallery)' : 'Preview (from QR text)'}
            </Text>
            <Image
              source={{
                uri: qrImageUrl ?? qrPreviewUrl(qrText),
              }}
              style={styles.qrImage}
            />
            <View style={styles.qrActions}>
              <Pressable
                style={[styles.qrBtn, qrBusy && styles.btnDisabled]}
                disabled={qrBusy}
                onPress={() => void onPickQrFromGallery()}
              >
                {qrBusy ? (
                  <ActivityIndicator color={colors.fabIcon} />
                ) : (
                  <>
                    <Ionicons name="images-outline" size={rs(16)} color={colors.fabIcon} />
                    <Text style={styles.qrBtnText}>
                      {qrImageUrl ? 'Replace from gallery' : 'Add from gallery'}
                    </Text>
                  </>
                )}
              </Pressable>
              {qrImageUrl ? (
                <Pressable
                  style={[styles.qrBtnDanger, qrBusy && styles.btnDisabled]}
                  disabled={qrBusy}
                  onPress={onDeleteQrImage}
                >
                  <Ionicons name="trash-outline" size={rs(16)} color="#fff" />
                  <Text style={styles.qrBtnText}>Delete QR</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Field
            label="QR payment text (optional fallback if no image)"
            value={qrText}
            onChangeText={setQrText}
            colors={colors}
            multiline
          />
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

          <Text style={styles.section}>Social & extra contact links</Text>
          <Text style={styles.help}>
            Add Viber, YouTube, Instagram, Twitter/X, Facebook, TikTok, etc. Users see
            these under Profile → Contact us. You can add, edit, or remove anytime.
          </Text>

          {socialLinks.map((link, index) => (
            <View key={link.id} style={styles.socialCard}>
              <View style={styles.socialHead}>
                <Text style={styles.socialTitle}>
                  {link.label?.trim() || `Link #${index + 1}`}
                </Text>
                <Pressable
                  onPress={() =>
                    setSocialLinks((prev) => prev.filter((x) => x.id !== link.id))
                  }
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={rs(18)} color={colors.danger} />
                </Pressable>
              </View>
              <Text style={styles.chipLabel}>Platform</Text>
              <View style={styles.chipWrap}>
                {SOCIAL_PLATFORMS.map((p) => {
                  const active = link.platform === p;
                  return (
                    <Pressable
                      key={`${link.id}-plat-${p}`}
                      style={[styles.chip, active && styles.chipOn]}
                      onPress={() => patchSocial(link.id, { platform: p })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextOn]}>
                        {p}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                fieldKey={`${link.id}-label`}
                label="Display label"
                value={link.label}
                onChangeText={(t) => patchSocial(link.id, { label: t })}
                colors={colors}
              />
              <Field
                fieldKey={`${link.id}-detail`}
                label="Subtitle (handle / phone)"
                value={link.detail}
                onChangeText={(t) => patchSocial(link.id, { detail: t })}
                colors={colors}
              />
              <Field
                fieldKey={`${link.id}-url`}
                label="URL / deep link"
                value={link.url}
                onChangeText={(t) => patchSocial(link.id, { url: t })}
                colors={colors}
                keyboardType="url"
              />
            </View>
          ))}

          <Pressable
            style={styles.addSocialBtn}
            onPress={() =>
              setSocialLinks((prev) =>
                ensureUniqueSocialLinks([...prev, newSocialLink()]),
              )
            }
          >
            <Ionicons name="add-circle-outline" size={rs(18)} color={colors.primary} />
            <Text style={styles.addSocialText}>Add social / contact link</Text>
          </Pressable>

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
    help: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(18),
      marginBottom: rs(12),
    },
    qrPreview: {
      alignItems: 'center',
      marginBottom: rs(14),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    qrPreviewLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      marginBottom: rs(8),
      alignSelf: 'flex-start',
    },
    qrImage: {
      width: rs(160),
      height: rs(160),
      borderRadius: rs(8),
      backgroundColor: '#fff',
    },
    qrActions: {
      alignSelf: 'stretch',
      gap: rs(8),
      marginTop: rs(12),
    },
    qrBtn: {
      backgroundColor: c.fab,
      borderRadius: rs(10),
      paddingVertical: rs(12),
      paddingHorizontal: rs(14),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
    },
    qrBtnDanger: {
      backgroundColor: c.danger,
      borderRadius: rs(10),
      paddingVertical: rs(12),
      paddingHorizontal: rs(14),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
    },
    qrBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(13) },
    btnDisabled: { opacity: 0.65 },
    socialCard: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(12),
      backgroundColor: c.surface,
    },
    socialHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(8),
    },
    socialTitle: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    chipLabel: { color: c.textSecondary, fontSize: rs(12), marginBottom: rs(6) },
    chipRow: { gap: rs(8), paddingBottom: rs(8) },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(8),
    },
    chip: {
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.bg,
    },
    chipOn: { borderColor: c.primary, backgroundColor: c.primarySoft },
    chipText: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    chipTextOn: { color: c.text },
    addSocialBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingVertical: rs(12),
      marginBottom: rs(8),
    },
    addSocialText: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
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
