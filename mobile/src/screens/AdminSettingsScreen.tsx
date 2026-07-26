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
  deleteAdminPopupNotice,
  fetchAdminSettings,
  updateAdminSettings,
  uploadAdminPaymentQr,
  uploadAdminPopupNotice,
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

type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

type PlatformLinkDraft = {
  id: string;
  label: string;
  detail: string;
  url: string;
};

function emptyPlatformDraft(platform: string): PlatformLinkDraft {
  const title = platform.charAt(0).toUpperCase() + platform.slice(1);
  return {
    id: `link-${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: title,
    detail: '',
    url: '',
  };
}

function linksToPlatformMap(
  links: AdminSocialLink[],
): Record<string, PlatformLinkDraft> {
  const map: Record<string, PlatformLinkDraft> = {};
  for (const link of links) {
    const platform = (link.platform || 'custom').trim().toLowerCase() || 'custom';
    // Keep the first entry per platform so values never overwrite each other.
    if (map[platform]) continue;
    map[platform] = {
      id:
        link.id?.trim() ||
        `link-${platform}-${Math.random().toString(36).slice(2, 8)}`,
      label: link.label || platform,
      detail: link.detail ?? '',
      url: link.url ?? '',
    };
  }
  return map;
}

function platformMapToLinks(
  map: Record<string, PlatformLinkDraft>,
): AdminSocialLink[] {
  return SOCIAL_PLATFORMS.map((platform) => {
    const draft = map[platform];
    if (!draft) return null;
    const url = draft.url.trim();
    const label = draft.label.trim();
    const detail = draft.detail.trim();
    // Only persist platforms the admin actually filled in.
    if (!url && !detail && (!label || label.toLowerCase() === platform)) {
      return null;
    }
    if (!url && !label) return null;
    return {
      id: draft.id,
      platform,
      label: label || platform.charAt(0).toUpperCase() + platform.slice(1),
      detail,
      url,
    } satisfies AdminSocialLink;
  }).filter(Boolean) as AdminSocialLink[];
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
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [noticeImageUrl, setNoticeImageUrl] = useState<string | null>(null);

  const [qrText, setQrText] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentWhatsapp, setPaymentWhatsapp] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [socialByPlatform, setSocialByPlatform] = useState<
    Record<string, PlatformLinkDraft>
  >({});
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>('instagram');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const applySettings = useCallback((s: AdminSettings) => {
    setSettings(s);
    setQrText(s.payment.qrText);
    setQrImageUrl(resolveQrImageUrl(s.payment.qrImageUrl));
    setNoticeImageUrl(resolveQrImageUrl(s.popupNotice?.imageUrl));
    setBankName(s.payment.bankName);
    setAccountName(s.payment.accountName);
    setAccountNumber(s.payment.accountNumber);
    setPaymentWhatsapp(s.payment.whatsapp);
    setCompanyName(s.contact.companyName);
    setContactEmail(s.contact.email);
    setContactWhatsapp(s.contact.whatsapp);
    setWhatsappUrl(s.contact.whatsappUrl);
    const map = linksToPlatformMap(s.contact.socialLinks ?? []);
    setSocialByPlatform(map);
    const firstFilled = SOCIAL_PLATFORMS.find((p) => map[p]?.url?.trim());
    setActivePlatform(firstFilled ?? 'instagram');
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

  const onPickNoticeFromGallery = async () => {
    if (!token) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo access so you can upload a startup notice from your gallery.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    setNoticeBusy(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const updated = await uploadAdminPopupNotice(token, asset.uri, mime);
      applySettings(updated);
      Alert.alert(
        'Uploaded',
        'Startup notice updated. Users will see it when they open the app.',
      );
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setNoticeBusy(false);
    }
  };

  const onDeleteNotice = () => {
    if (!token) return;
    Alert.alert(
      'Remove startup notice?',
      'Users will no longer see a popup when they open the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setNoticeBusy(true);
            void deleteAdminPopupNotice(token)
              .then((updated) => {
                applySettings(updated);
                Alert.alert('Removed', 'Startup notice deleted.');
              })
              .catch((e: unknown) =>
                Alert.alert(
                  'Delete failed',
                  e instanceof Error ? e.message : 'Try again',
                ),
              )
              .finally(() => setNoticeBusy(false));
          },
        },
      ],
    );
  };

  const activeDraft =
    socialByPlatform[activePlatform] ?? emptyPlatformDraft(activePlatform);

  const selectPlatform = (platform: SocialPlatform) => {
    setActivePlatform(platform);
    setSocialByPlatform((prev) => {
      if (prev[platform]) return prev;
      return { ...prev, [platform]: emptyPlatformDraft(platform) };
    });
  };

  const patchActivePlatform = (patch: Partial<PlatformLinkDraft>) => {
    setSocialByPlatform((prev) => {
      const current = prev[activePlatform] ?? emptyPlatformDraft(activePlatform);
      return {
        ...prev,
        [activePlatform]: {
          id: current.id,
          label: patch.label ?? current.label,
          detail: patch.detail ?? current.detail,
          url: patch.url ?? current.url,
        },
      };
    });
  };

  const clearActivePlatform = () => {
    setSocialByPlatform((prev) => {
      const next = { ...prev };
      delete next[activePlatform];
      return next;
    });
  };

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const cleaned = platformMapToLinks(socialByPlatform);
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
      Alert.alert(
        'Saved',
        `${cleaned.length} social link(s) saved. Each platform keeps its own URL.`,
      );
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

          <Text style={styles.section}>Startup popup notice</Text>
          <Text style={styles.help}>
            Upload an image from your gallery. It appears as a centered popup when
            users open the app (they can close it with ×). Delete to show nothing.
          </Text>

          <View style={styles.qrPreview}>
            <Text style={styles.qrPreviewLabel}>
              {noticeImageUrl ? 'Current notice' : 'No notice set'}
            </Text>
            {noticeImageUrl ? (
              <Image
                source={{ uri: noticeImageUrl }}
                style={styles.noticeImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.noticeEmpty}>
                <Ionicons name="image-outline" size={rs(36)} color={colors.textMuted} />
                <Text style={styles.noticeEmptyText}>
                  Add a poster / notice image
                </Text>
              </View>
            )}
            <View style={styles.qrActions}>
              <Pressable
                style={[styles.qrBtn, noticeBusy && styles.btnDisabled]}
                disabled={noticeBusy}
                onPress={() => void onPickNoticeFromGallery()}
              >
                {noticeBusy ? (
                  <ActivityIndicator color={colors.fabIcon} />
                ) : (
                  <>
                    <Ionicons name="images-outline" size={rs(16)} color={colors.fabIcon} />
                    <Text style={styles.qrBtnText}>
                      {noticeImageUrl ? 'Replace from gallery' : 'Add from gallery'}
                    </Text>
                  </>
                )}
              </Pressable>
              {noticeImageUrl ? (
                <Pressable
                  style={[styles.qrBtnDanger, noticeBusy && styles.btnDisabled]}
                  disabled={noticeBusy}
                  onPress={onDeleteNotice}
                >
                  <Ionicons name="trash-outline" size={rs(16)} color="#fff" />
                  <Text style={styles.qrBtnText}>Delete notice</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

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
            Tap a platform (Instagram, Viber, …), then enter that platform’s own
            label and URL. Switching platforms does not copy data — each one is
            saved separately and shown one-by-one in Profile → Connect With Us.
          </Text>

          <Text style={styles.chipLabel}>Choose platform to edit</Text>
          <View style={styles.chipWrap}>
            {SOCIAL_PLATFORMS.map((p) => {
              const active = activePlatform === p;
              const hasData = Boolean(socialByPlatform[p]?.url?.trim());
              return (
                <Pressable
                  key={`plat-${p}`}
                  style={[styles.chip, active && styles.chipOn]}
                  onPress={() => selectPlatform(p)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextOn]}>
                    {hasData ? `● ${p}` : p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.socialCard}>
            <View style={styles.socialHead}>
              <Text style={styles.socialTitle}>
                Editing: {activePlatform}
              </Text>
              <Pressable onPress={clearActivePlatform} hitSlop={8}>
                <Ionicons name="trash-outline" size={rs(18)} color={colors.danger} />
              </Pressable>
            </View>
            <Field
              fieldKey={`${activePlatform}-label`}
              label="Display label"
              value={activeDraft.label}
              onChangeText={(t) => patchActivePlatform({ label: t })}
              colors={colors}
            />
            <Field
              fieldKey={`${activePlatform}-detail`}
              label="Subtitle (handle / phone)"
              value={activeDraft.detail}
              onChangeText={(t) => patchActivePlatform({ detail: t })}
              colors={colors}
            />
            <Field
              fieldKey={`${activePlatform}-url`}
              label="URL / deep link"
              value={activeDraft.url}
              onChangeText={(t) => patchActivePlatform({ url: t })}
              colors={colors}
              keyboardType="url"
            />
            <Text style={styles.filledHint}>
              Filled platforms:{' '}
              {SOCIAL_PLATFORMS.filter((p) => socialByPlatform[p]?.url?.trim())
                .join(', ') || 'none yet'}
            </Text>
          </View>

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
    noticeImage: {
      width: '100%',
      height: rs(220),
      borderRadius: rs(8),
      backgroundColor: '#fff',
    },
    noticeEmpty: {
      width: '100%',
      height: rs(140),
      borderRadius: rs(8),
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.borderMuted,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: c.surfaceAlt,
    },
    noticeEmptyText: { color: c.textMuted, fontSize: rs(12), fontWeight: '600' },
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
    filledHint: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(4),
      lineHeight: rs(16),
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
