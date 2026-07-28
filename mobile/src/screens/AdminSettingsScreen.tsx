import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAppBranding } from '../context/AppBrandingContext';
import { PasswordRequirementsLive } from '../components/PasswordRequirementsLive';
import {
  changeAdminPassword,
  deleteAdminAppLogo,
  deleteAdminPaymentQr,
  deleteAdminPopupNotice,
  fetchAdminSettings,
  updateAdminSettings,
  uploadAdminAppLogo,
  uploadAdminPaymentQr,
  uploadAdminPopupNotice,
  addAdminTextPopupNotice,
  type AdminSettings,
  type AdminSocialLink,
  type AdminSubscriptionPlan,
} from '../services/admin/adminApi';
import {
  DEFAULT_LEGAL_PAGES,
  type LegalPages,
  type LegalSection,
} from '../content/legalDefaults';
import { loadAdminToken } from '../services/admin/adminTokenStorage';
import { AUTH_API_BASE } from '../services/auth/config';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { PREMIUM_PLANS } from '../storage/subscriptionStorage';
import {
  isPasswordStrong,
  passwordsMatch,
} from '../utils/passwordPolicy';
import { rs } from '../utils/responsive';
import * as ImagePicker from 'expo-image-picker';

function TapButton({
  style,
  disabled,
  onPress,
  children,
  danger,
}: {
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (to: number) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.65 : 1 }}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          if (!disabled) animateTo(0.94);
        }}
        onPressOut={() => animateTo(1)}
        android_ripple={{
          color: danger ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.35)',
          borderless: false,
        }}
        style={({ pressed }) => [
          style,
          pressed && !disabled && { opacity: 0.88 },
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

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

type SettingsTab =
  | 'notices'
  | 'home'
  | 'legal'
  | 'plans'
  | 'branding'
  | 'payment'
  | 'social'
  | 'password';

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'notices', label: 'Notices' },
  { id: 'home', label: 'Home card' },
  { id: 'legal', label: 'Legal' },
  { id: 'plans', label: 'Plans' },
  { id: 'branding', label: 'Logo' },
  { id: 'payment', label: 'Payment' },
  { id: 'social', label: 'Social' },
  { id: 'password', label: 'Password' },
];

const HOME_PROMO_ACTIONS: { id: string; label: string }[] = [
  { id: 'none', label: 'No redirect (not clickable)' },
  { id: 'AddCapital', label: 'Add MeroShare account' },
  { id: 'Subscription', label: 'Subscription / Premium' },
  { id: 'Apply', label: 'Apply tab' },
  { id: 'Services', label: 'Services tab' },
  { id: 'Profile', label: 'Profile tab' },
  { id: 'BulkPortfolio', label: 'Bulk Portfolio Check' },
  { id: 'PublicIpoResult', label: 'IPO Result' },
  { id: 'Portfolio', label: 'Share Portfolio' },
  { id: 'Watchlist', label: 'Watchlist' },
  { id: 'NepseData', label: 'Live NEPSE' },
  { id: 'IpoBulkStatus', label: 'Bulk IPO Status' },
  { id: 'CurrentIpoStatus', label: 'Current IPO Status' },
  { id: 'NepseCalendar', label: 'NEPSE Calendar' },
];

type PlanDraft = {
  id: string;
  title: string;
  priceLabel: string;
  amountNpr: string;
  period: string;
  days: string;
  maxAccounts: string;
  perksText: string;
};

function plansToDrafts(plans: AdminSubscriptionPlan[]): PlanDraft[] {
  const source =
    plans.length > 0
      ? plans
      : PREMIUM_PLANS.map((p) => ({
          id: p.id,
          title: p.title,
          priceLabel: p.price,
          amountNpr: Number(String(p.price).replace(/[^\d]/g, '')) || 300,
          period: p.period,
          days: p.days,
          maxAccounts: p.maxAccounts,
          perks: [...p.perks],
        }));
  return source.map((p) => ({
    id: p.id,
    title: p.title,
    priceLabel: p.priceLabel,
    amountNpr: String(p.amountNpr),
    period: p.period,
    days: String(p.days),
    maxAccounts: String(p.maxAccounts),
    perksText: (p.perks ?? []).join('\n'),
  }));
}

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
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: ThemeColors;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'number-pad' | 'numeric';
  fieldKey?: string;
  secureTextEntry?: boolean;
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
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

export function AdminSettingsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { refresh: refreshBranding } = useAppBranding();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<PlanDraft[]>([]);
  const [noticeItems, setNoticeItems] = useState<
    { id: string; kind: 'image' | 'text'; imageUrl: string | null; text: string | null }[]
  >([]);
  const [noticeTextDraft, setNoticeTextDraft] = useState('');
  const [previewNotice, setPreviewNotice] = useState<{
    id: string;
    kind: 'image' | 'text';
    imageUrl: string | null;
    text: string | null;
    rank: number;
  } | null>(null);

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('notices');
  const [homePromoVisible, setHomePromoVisible] = useState(true);
  const [homePromoText, setHomePromoText] = useState(
    'Add your MeroShare account to bulk apply for IPOs — tap here to get started',
  );
  const [homePromoAction, setHomePromoAction] = useState('AddCapital');
  const [legalDraft, setLegalDraft] = useState<LegalPages>(() => ({
    about: {
      ...DEFAULT_LEGAL_PAGES.about,
      offerings: [...DEFAULT_LEGAL_PAGES.about.offerings],
    },
    terms: {
      intro: DEFAULT_LEGAL_PAGES.terms.intro,
      sections: DEFAULT_LEGAL_PAGES.terms.sections.map((s) => ({ ...s })),
    },
    privacy: {
      intro: DEFAULT_LEGAL_PAGES.privacy.intro,
      sections: DEFAULT_LEGAL_PAGES.privacy.sections.map((s) => ({ ...s })),
    },
  }));
  const [legalSubTab, setLegalSubTab] = useState<'about' | 'terms' | 'privacy'>(
    'about',
  );

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const applySettings = useCallback((s: AdminSettings) => {
    setSettings(s);
    setQrText(s.payment.qrText);
    setQrImageUrl(resolveQrImageUrl(s.payment.qrImageUrl));
    setAppLogoUrl(resolveQrImageUrl(s.appLogoUrl));
    setPlanDrafts(plansToDrafts(s.subscriptionPlans ?? []));
    setHomePromoVisible(s.homePromo?.visible ?? true);
    setHomePromoText(
      s.homePromo?.text?.trim() ||
        'Add your MeroShare account to bulk apply for IPOs — tap here to get started',
    );
    setHomePromoAction(s.homePromo?.action?.trim() || 'AddCapital');
    if (s.legalPages) {
      setLegalDraft({
        about: {
          tagline: s.legalPages.about.tagline,
          whoWeAre: s.legalPages.about.whoWeAre,
          offerings: [...s.legalPages.about.offerings],
        },
        terms: {
          intro: s.legalPages.terms.intro,
          sections: s.legalPages.terms.sections.map((x) => ({ ...x })),
        },
        privacy: {
          intro: s.legalPages.privacy.intro,
          sections: s.legalPages.privacy.sections.map((x) => ({ ...x })),
        },
      });
    }
    setNoticeItems(
      (s.popupNotice?.items ?? []).map((item) => ({
        id: item.id,
        kind: item.kind,
        imageUrl:
          item.kind === 'image'
            ? resolveQrImageUrl(item.imageUrl) ?? item.imageUrl
            : null,
        text: item.text,
      })),
    );
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
    if (!token || qrBusy) return;
    setQrBusy(true);
    try {
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
    if (!token || noticeBusy) return;
    if (noticeItems.length >= 10) {
      Alert.alert('Limit reached', 'You can add up to 10 startup notices.');
      return;
    }
    setNoticeBusy(true);
    try {
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
      const mime = asset.mimeType ?? 'image/jpeg';
      const updated = await uploadAdminPopupNotice(token, asset.uri, mime);
      applySettings(updated);
      Alert.alert(
        'Added',
        `Notice ${updated.popupNotice.items.length} added. Users see notices in order when they open the app.`,
      );
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setNoticeBusy(false);
    }
  };

  const onAddTextNotice = () => {
    const text = noticeTextDraft.trim();
    if (!token) return;
    if (!text) {
      Alert.alert('Empty', 'Type the notice text first.');
      return;
    }
    setNoticeBusy(true);
    void addAdminTextPopupNotice(token, text)
      .then((updated) => {
        applySettings(updated);
        setNoticeTextDraft('');
        Alert.alert(
          'Added',
          `Notice ${updated.popupNotice.items.length} added. Users see notices in order when they open the app.`,
        );
      })
      .catch((e) => {
        Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
      })
      .finally(() => setNoticeBusy(false));
  };

  const onDeleteNotice = (noticeId: string) => {
    if (!token) return;
    Alert.alert(
      'Remove this notice?',
      'It will no longer appear in the startup popup sequence.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setNoticeBusy(true);
            void deleteAdminPopupNotice(token, noticeId)
              .then((updated) => {
                applySettings(updated);
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

  const onClearAllNotices = () => {
    if (!token || !noticeItems.length) return;
    Alert.alert(
      'Remove all notices?',
      'Users will no longer see any startup popup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            setNoticeBusy(true);
            void deleteAdminPopupNotice(token)
              .then((updated) => {
                applySettings(updated);
                Alert.alert('Removed', 'All startup notices deleted.');
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

  const updatePlanDraft = (index: number, patch: Partial<PlanDraft>) => {
    setPlanDrafts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  };

  const onSaveHomePromo = async () => {
    if (!token) return;
    const text = homePromoText.trim();
    if (!text) {
      Alert.alert('Empty text', 'Enter the home card message.');
      return;
    }
    if (text.length > 512) {
      Alert.alert('Too long', 'Home card text max is 512 characters.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAdminSettings(token, {
        homePromo: {
          visible: homePromoVisible,
          text,
          action: homePromoAction || 'none',
        },
      });
      applySettings(updated);
      await refreshBranding();
      Alert.alert('Saved', 'Home promo card settings updated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onSaveLegalPages = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateAdminSettings(token, {
        legalPages: legalDraft,
      });
      applySettings(updated);
      Alert.alert('Saved', 'About / Terms / Privacy pages updated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const updateLegalSection = (
    kind: 'terms' | 'privacy',
    index: number,
    patch: Partial<LegalSection>,
  ) => {
    setLegalDraft((prev) => {
      const sections = prev[kind].sections.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      );
      return { ...prev, [kind]: { ...prev[kind], sections } };
    });
  };

  const addLegalSection = (kind: 'terms' | 'privacy') => {
    setLegalDraft((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        sections: [
          ...prev[kind].sections,
          {
            heading: `${prev[kind].sections.length + 1}. New section`,
            body: '',
          },
        ],
      },
    }));
  };

  const removeLegalSection = (kind: 'terms' | 'privacy', index: number) => {
    setLegalDraft((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        sections: prev[kind].sections.filter((_, i) => i !== index),
      },
    }));
  };

  const onSavePlans = async () => {
    if (!token) return;
    const plans: AdminSubscriptionPlan[] = [];
    for (const draft of planDrafts) {
      const amountNpr = Math.floor(Number(draft.amountNpr));
      const days = Math.floor(Number(draft.days));
      const maxAccounts = Math.floor(Number(draft.maxAccounts));
      if (!draft.id.trim() || !draft.title.trim()) {
        Alert.alert('Invalid plan', 'Each plan needs an id and title.');
        return;
      }
      if (!Number.isFinite(amountNpr) || amountNpr < 1) {
        Alert.alert('Invalid price', `Enter a valid NPR amount for ${draft.title || draft.id}.`);
        return;
      }
      if (!Number.isFinite(days) || days < 1) {
        Alert.alert('Invalid days', `Enter valid duration days for ${draft.title || draft.id}.`);
        return;
      }
      if (!Number.isFinite(maxAccounts) || maxAccounts < 1) {
        Alert.alert('Invalid accounts', `Enter valid max accounts for ${draft.title || draft.id}.`);
        return;
      }
      plans.push({
        id: draft.id.trim(),
        title: draft.title.trim(),
        priceLabel: draft.priceLabel.trim() || `Rs ${amountNpr}`,
        amountNpr,
        period: draft.period.trim() || `${days} days`,
        days,
        maxAccounts,
        perks: draft.perksText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
    }
    if (!plans.length) {
      Alert.alert('Empty', 'At least one plan is required.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAdminSettings(token, { subscriptionPlans: plans });
      applySettings(updated);
      await refreshBranding();
      Alert.alert('Saved', 'Subscription plans updated for all users.');
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not save plans');
    } finally {
      setSaving(false);
    }
  };

  const onPickAppLogo = async () => {
    if (!token || logoBusy) return;
    setLogoBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo access so you can upload the company logo.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'image/png';
      const updated = await uploadAdminAppLogo(token, asset.uri, mime);
      applySettings(updated);
      await refreshBranding();
      Alert.alert('Uploaded', 'App logo updated everywhere in the app.');
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLogoBusy(false);
    }
  };

  const onDeleteAppLogo = () => {
    if (!token) return;
    Alert.alert(
      'Remove custom logo?',
      'The app will fall back to the default NEPSE GHAR logo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setLogoBusy(true);
            void deleteAdminAppLogo(token)
              .then(async (updated) => {
                applySettings(updated);
                await refreshBranding();
                Alert.alert('Removed', 'Custom logo deleted.');
              })
              .catch((e: unknown) =>
                Alert.alert(
                  'Delete failed',
                  e instanceof Error ? e.message : 'Try again',
                ),
              )
              .finally(() => setLogoBusy(false));
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
    if (!currentPassword) {
      Alert.alert('Invalid', 'Enter your current password.');
      return;
    }
    if (!isPasswordStrong(newPassword)) {
      Alert.alert(
        'Weak password',
        'New password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
      );
      return;
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      Alert.alert('Mismatch', 'New password and confirm password do not match.');
      return;
    }
    setSaving(true);
    try {
      await changeAdminPassword(token, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
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
        <>
          {settings ? (
            <Text style={styles.hint}>Admin: {settings.adminEmail}</Text>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
            style={styles.tabBar}
          >
            {SETTINGS_TABS.map((tab) => {
              const active = settingsTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                  onPress={() => setSettingsTab(tab.id)}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      active && styles.tabChipTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: rs(40) + (keyboardHeight > 0 ? keyboardHeight : 0) },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {settingsTab === 'notices' ? (
              <>
                <Text style={styles.section}>Startup popup notices</Text>
                <Text style={styles.help}>
                  Add notice images from gallery, or type plain text only. Users
                  see them one by one when the app opens (1 → 2 → 3…). Close with
                  × or by tapping beside the notice. Up to 10 notices.
                </Text>

                <View style={styles.qrPreview}>
                  <Text style={styles.qrPreviewLabel}>
                    {noticeItems.length
                      ? `${noticeItems.length} notice(s) — shown in this order`
                      : 'No notices set'}
                  </Text>
                  {noticeItems.length ? (
                    noticeItems.map((item, i) => (
                      <View key={item.id} style={styles.noticeRow}>
                        <Text style={styles.noticeRank}>#{i + 1}</Text>
                        <Pressable
                          style={styles.noticeThumbWrap}
                          onPress={() =>
                            setPreviewNotice({
                              id: item.id,
                              kind: item.kind,
                              imageUrl: item.imageUrl,
                              text: item.text,
                              rank: i + 1,
                            })
                          }
                        >
                          {item.kind === 'image' && item.imageUrl ? (
                            <Image
                              source={{ uri: item.imageUrl }}
                              style={styles.noticeThumb}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={[styles.noticeThumb, styles.noticeTextThumb]}>
                              <Ionicons
                                name="document-text-outline"
                                size={rs(22)}
                                color={colors.primary}
                              />
                              <Text style={styles.noticeTextPreview} numberOfLines={3}>
                                {item.text}
                              </Text>
                            </View>
                          )}
                          <View style={styles.noticeViewBadge}>
                            <Ionicons
                              name="eye-outline"
                              size={rs(14)}
                              color="#fff"
                            />
                            <Text style={styles.noticeViewText}>View</Text>
                          </View>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.noticeDeleteBtn,
                            noticeBusy && styles.btnDisabled,
                          ]}
                          disabled={noticeBusy}
                          onPress={() => onDeleteNotice(item.id)}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={rs(16)}
                            color="#fff"
                          />
                        </Pressable>
                      </View>
                    ))
                  ) : (
                    <View style={styles.noticeEmpty}>
                      <Ionicons
                        name="image-outline"
                        size={rs(36)}
                        color={colors.textMuted}
                      />
                      <Text style={styles.noticeEmptyText}>
                        Add a notice image or plain text
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.help, { marginTop: rs(12), marginBottom: rs(6) }]}>
                    Text-only notice
                  </Text>
                  <TextInput
                    style={styles.noticeTextInput}
                    value={noticeTextDraft}
                    onChangeText={setNoticeTextDraft}
                    placeholder="Type notice text shown on app open…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    editable={!noticeBusy}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 120);
                    }}
                  />
                  <View style={styles.qrActions}>
                    <TapButton
                      style={styles.qrBtn}
                      disabled={noticeBusy}
                      onPress={onAddTextNotice}
                    >
                      {noticeBusy ? (
                        <ActivityIndicator color={colors.fabIcon} />
                      ) : (
                        <>
                          <Ionicons
                            name="create-outline"
                            size={rs(16)}
                            color={colors.fabIcon}
                          />
                          <Text style={styles.qrBtnText}>Add text notice</Text>
                        </>
                      )}
                    </TapButton>
                    <TapButton
                      style={styles.qrBtn}
                      disabled={noticeBusy}
                      onPress={() => void onPickNoticeFromGallery()}
                    >
                      {noticeBusy ? (
                        <ActivityIndicator color={colors.fabIcon} />
                      ) : (
                        <>
                          <Ionicons
                            name="images-outline"
                            size={rs(16)}
                            color={colors.fabIcon}
                          />
                          <Text style={styles.qrBtnText}>Add from gallery</Text>
                        </>
                      )}
                    </TapButton>
                    {noticeItems.length ? (
                      <TapButton
                        style={styles.qrBtnDanger}
                        danger
                        disabled={noticeBusy}
                        onPress={onClearAllNotices}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={rs(16)}
                          color="#fff"
                        />
                        <Text style={styles.qrBtnText}>Delete all</Text>
                      </TapButton>
                    ) : null}
                  </View>
                </View>
              </>
            ) : null}

            {settingsTab === 'home' ? (
              <>
                <Text style={styles.section}>Home promo card</Text>
                <Text style={styles.help}>
                  Controls the green banner under the home header. Turn it off to
                  hide it, edit the text, and choose where a tap goes (or no
                  redirect).
                </Text>

                <Pressable
                  style={styles.toggleRow}
                  onPress={() => setHomePromoVisible((v) => !v)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>Show on home page</Text>
                    <Text style={styles.toggleHint}>
                      {homePromoVisible ? 'Visible' : 'Hidden'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.toggleTrack,
                      homePromoVisible && styles.toggleTrackOn,
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        homePromoVisible && styles.toggleThumbOn,
                      ]}
                    />
                  </View>
                </Pressable>

                <Field
                  label="Card text"
                  value={homePromoText}
                  onChangeText={setHomePromoText}
                  colors={colors}
                  multiline
                />

                <Text style={styles.fieldLabel}>Tap action / redirect</Text>
                <View style={styles.actionList}>
                  {HOME_PROMO_ACTIONS.map((opt) => {
                    const active = homePromoAction === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        style={[
                          styles.actionChip,
                          active && styles.actionChipActive,
                        ]}
                        onPress={() => setHomePromoAction(opt.id)}
                      >
                        <Text
                          style={[
                            styles.actionChipText,
                            active && styles.actionChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  style={[styles.btn, saving && styles.btnDisabled]}
                  disabled={saving}
                  onPress={() => void onSaveHomePromo()}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.fabIcon} />
                  ) : (
                    <Text style={styles.btnText}>Save home card</Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {settingsTab === 'legal' ? (
              <>
                <Text style={styles.section}>About / Terms / Privacy</Text>
                <Text style={styles.help}>
                  Edit the text shown in Profile → About Company, Terms &amp;
                  Conditions, and Privacy Policy.
                </Text>
                <View style={styles.legalSubRow}>
                  {(
                    [
                      { id: 'about', label: 'About' },
                      { id: 'terms', label: 'Terms' },
                      { id: 'privacy', label: 'Privacy' },
                    ] as const
                  ).map((tab) => {
                    const active = legalSubTab === tab.id;
                    return (
                      <Pressable
                        key={tab.id}
                        style={[
                          styles.actionChip,
                          active && styles.actionChipActive,
                        ]}
                        onPress={() => setLegalSubTab(tab.id)}
                      >
                        <Text
                          style={[
                            styles.actionChipText,
                            active && styles.actionChipTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {legalSubTab === 'about' ? (
                  <>
                    <Field
                      label="Tagline"
                      value={legalDraft.about.tagline}
                      onChangeText={(v) =>
                        setLegalDraft((p) => ({
                          ...p,
                          about: { ...p.about, tagline: v },
                        }))
                      }
                      colors={colors}
                    />
                    <Field
                      label="Who we are"
                      value={legalDraft.about.whoWeAre}
                      onChangeText={(v) =>
                        setLegalDraft((p) => ({
                          ...p,
                          about: { ...p.about, whoWeAre: v },
                        }))
                      }
                      colors={colors}
                      multiline
                    />
                    <Field
                      label="What we offer (one line per item)"
                      value={legalDraft.about.offerings.join('\n')}
                      onChangeText={(v) =>
                        setLegalDraft((p) => ({
                          ...p,
                          about: {
                            ...p.about,
                            offerings: v
                              .split('\n')
                              .map((x) => x.trim())
                              .filter(Boolean),
                          },
                        }))
                      }
                      colors={colors}
                      multiline
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label="Intro text"
                      value={legalDraft[legalSubTab].intro}
                      onChangeText={(v) =>
                        setLegalDraft((p) => ({
                          ...p,
                          [legalSubTab]: { ...p[legalSubTab], intro: v },
                        }))
                      }
                      colors={colors}
                      multiline
                    />
                    {legalDraft[legalSubTab].sections.map((sec, index) => (
                      <View key={`${legalSubTab}-${index}`} style={styles.planCard}>
                        <Text style={styles.planCardTitle}>
                          Section {index + 1}
                        </Text>
                        <Field
                          label="Heading"
                          value={sec.heading}
                          onChangeText={(v) =>
                            updateLegalSection(legalSubTab, index, {
                              heading: v,
                            })
                          }
                          colors={colors}
                        />
                        <Field
                          label="Body"
                          value={sec.body}
                          onChangeText={(v) =>
                            updateLegalSection(legalSubTab, index, { body: v })
                          }
                          colors={colors}
                          multiline
                        />
                        <Pressable
                          style={styles.qrBtnDanger}
                          onPress={() => removeLegalSection(legalSubTab, index)}
                        >
                          <Text style={styles.qrBtnDangerText}>
                            Remove section
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                    <Pressable
                      style={styles.qrBtn}
                      onPress={() => addLegalSection(legalSubTab)}
                    >
                      <Text style={styles.qrBtnText}>Add section</Text>
                    </Pressable>
                  </>
                )}

                <Pressable
                  style={[styles.btn, saving && styles.btnDisabled]}
                  disabled={saving}
                  onPress={() => void onSaveLegalPages()}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.fabIcon} />
                  ) : (
                    <Text style={styles.btnText}>Save legal pages</Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {settingsTab === 'plans' ? (
              <>
                <Text style={styles.section}>Subscription plans</Text>
                <Text style={styles.help}>
                  Edit plan prices, duration, account limits, and perk details shown
                  on the Premium screen. Keep plan IDs stable so existing requests
                  still match.
                </Text>
                {planDrafts.map((plan, index) => (
                  <View key={plan.id} style={styles.planCard}>
                    <Text style={styles.planCardTitle}>
                      Plan {index + 1} · {plan.id}
                    </Text>
                    <Field
                      label="Title"
                      value={plan.title}
                      onChangeText={(v) => updatePlanDraft(index, { title: v })}
                      colors={colors}
                    />
                    <Field
                      label="Amount NPR"
                      value={plan.amountNpr}
                      onChangeText={(v) => {
                        const digits = v.replace(/[^\d]/g, '');
                        const n = Number(digits);
                        updatePlanDraft(index, {
                          amountNpr: digits,
                          priceLabel:
                            Number.isFinite(n) && n > 0
                              ? `Rs ${n}`
                              : plan.priceLabel,
                        });
                      }}
                      colors={colors}
                      keyboardType="number-pad"
                    />
                    <Field
                      label="Price label (optional override)"
                      value={plan.priceLabel}
                      onChangeText={(v) => updatePlanDraft(index, { priceLabel: v })}
                      colors={colors}
                    />
                    <Field
                      label="Period label"
                      value={plan.period}
                      onChangeText={(v) => updatePlanDraft(index, { period: v })}
                      colors={colors}
                    />
                    <Field
                      label="Duration (days)"
                      value={plan.days}
                      onChangeText={(v) => updatePlanDraft(index, { days: v })}
                      colors={colors}
                      keyboardType="number-pad"
                    />
                    <Field
                      label="Max accounts"
                      value={plan.maxAccounts}
                      onChangeText={(v) => updatePlanDraft(index, { maxAccounts: v })}
                      colors={colors}
                      keyboardType="number-pad"
                    />
                    <Field
                      label="Plan details / perks (one per line)"
                      value={plan.perksText}
                      onChangeText={(v) => updatePlanDraft(index, { perksText: v })}
                      colors={colors}
                      multiline
                    />
                  </View>
                ))}
                <Pressable
                  style={[styles.btn, saving && styles.btnDisabled]}
                  disabled={saving}
                  onPress={() => void onSavePlans()}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.fabIcon} />
                  ) : (
                    <Text style={styles.btnText}>Save subscription plans</Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {settingsTab === 'branding' ? (
              <>
                <Text style={styles.section}>Company logo</Text>
                <Text style={styles.help}>
                  Upload a square logo. It replaces the NEPSE GHAR mark in the
                  header, drawer, profile, and about screens.
                </Text>
                <View style={styles.qrPreview}>
                  <Text style={styles.qrPreviewLabel}>
                    {appLogoUrl ? 'Current custom logo' : 'Default app logo'}
                  </Text>
                  <Image
                    source={
                      appLogoUrl
                        ? { uri: appLogoUrl }
                        : require('../../assets/nepse-ghar-logo.png')
                    }
                    style={styles.logoPreview}
                    resizeMode="contain"
                  />
                  <View style={styles.qrActions}>
                    <TapButton
                      style={styles.qrBtn}
                      disabled={logoBusy}
                      onPress={() => void onPickAppLogo()}
                    >
                      {logoBusy ? (
                        <ActivityIndicator color={colors.fabIcon} />
                      ) : (
                        <>
                          <Ionicons
                            name="images-outline"
                            size={rs(16)}
                            color={colors.fabIcon}
                          />
                          <Text style={styles.qrBtnText}>
                            {appLogoUrl ? 'Replace logo' : 'Upload logo'}
                          </Text>
                        </>
                      )}
                    </TapButton>
                    {appLogoUrl ? (
                      <TapButton
                        style={styles.qrBtnDanger}
                        danger
                        disabled={logoBusy}
                        onPress={onDeleteAppLogo}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={rs(16)}
                          color="#fff"
                        />
                        <Text style={styles.qrBtnText}>Remove</Text>
                      </TapButton>
                    ) : null}
                  </View>
                </View>
              </>
            ) : null}

            {settingsTab === 'payment' ? (
              <>
                <Text style={styles.section}>Payment QR & bank details</Text>
                <Text style={styles.help}>
                  Upload your eSewa / bank QR from gallery. This image is shown on
                  the Premium Subscription screen. You can also delete it anytime.
                </Text>

                <View style={styles.qrPreview}>
                  <Text style={styles.qrPreviewLabel}>
                    {qrImageUrl
                      ? 'Uploaded QR (from gallery)'
                      : 'Preview (from QR text)'}
                  </Text>
                  <Image
                    source={{
                      uri: qrImageUrl ?? qrPreviewUrl(qrText),
                    }}
                    style={styles.qrImage}
                  />
                  <View style={styles.qrActions}>
                    <TapButton
                      style={styles.qrBtn}
                      disabled={qrBusy}
                      onPress={() => void onPickQrFromGallery()}
                    >
                      {qrBusy ? (
                        <ActivityIndicator color={colors.fabIcon} />
                      ) : (
                        <>
                          <Ionicons
                            name="images-outline"
                            size={rs(16)}
                            color={colors.fabIcon}
                          />
                          <Text style={styles.qrBtnText}>
                            {qrImageUrl
                              ? 'Replace from gallery'
                              : 'Add from gallery'}
                          </Text>
                        </>
                      )}
                    </TapButton>
                    {qrImageUrl ? (
                      <TapButton
                        style={styles.qrBtnDanger}
                        danger
                        disabled={qrBusy}
                        onPress={onDeleteQrImage}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={rs(16)}
                          color="#fff"
                        />
                        <Text style={styles.qrBtnText}>Delete QR</Text>
                      </TapButton>
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
                <Field
                  label="Bank name"
                  value={bankName}
                  onChangeText={setBankName}
                  colors={colors}
                />
                <Field
                  label="Account name"
                  value={accountName}
                  onChangeText={setAccountName}
                  colors={colors}
                />
                <Field
                  label="Account number"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  colors={colors}
                />
                <Field
                  label="WhatsApp (digits only, e.g. 9779709133067)"
                  value={paymentWhatsapp}
                  onChangeText={setPaymentWhatsapp}
                  colors={colors}
                  keyboardType="phone-pad"
                />

                <Pressable
                  style={styles.btn}
                  onPress={() => void onSave()}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.fabIcon} />
                  ) : (
                    <Text style={styles.btnText}>Save payment</Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {settingsTab === 'social' ? (
              <>
                <Text style={styles.section}>Contact & social</Text>
                <Field
                  label="Company name"
                  value={companyName}
                  onChangeText={setCompanyName}
                  colors={colors}
                />
                <Field
                  label="Public email"
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  colors={colors}
                  keyboardType="email-address"
                />
                <Field
                  label="WhatsApp display number"
                  value={contactWhatsapp}
                  onChangeText={setContactWhatsapp}
                  colors={colors}
                />
                <Field
                  label="WhatsApp link"
                  value={whatsappUrl}
                  onChangeText={setWhatsappUrl}
                  colors={colors}
                  keyboardType="url"
                />

                <Text style={styles.section}>Social & extra contact links</Text>
                <Text style={styles.help}>
                  Tap a platform (Instagram, Viber, …), then enter that
                  platform’s own label and URL. Switching platforms does not copy
                  data — each one is saved separately and shown one-by-one in
                  Profile → Connect With Us.
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
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextOn,
                          ]}
                        >
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
                      <Ionicons
                        name="trash-outline"
                        size={rs(18)}
                        color={colors.danger}
                      />
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
                    {SOCIAL_PLATFORMS.filter((p) =>
                      socialByPlatform[p]?.url?.trim(),
                    ).join(', ') || 'none yet'}
                  </Text>
                </View>

                <Pressable
                  style={styles.btn}
                  onPress={() => void onSave()}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.fabIcon} />
                  ) : (
                    <Text style={styles.btnText}>Save contact & social</Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {settingsTab === 'password' ? (
              <>
                <Text style={styles.section}>Change password</Text>
                <Text style={styles.help}>
                  Use a strong password. Requirements update live as you type.
                </Text>
                <Field
                  label="Current password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  colors={colors}
                  secureTextEntry
                />
                <Field
                  label="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  colors={colors}
                  secureTextEntry
                />
                <Field
                  label="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  colors={colors}
                  secureTextEntry
                />
                <PasswordRequirementsLive
                  password={newPassword}
                  confirmPassword={confirmPassword}
                  colors={colors}
                />
                <Pressable
                  style={[
                    styles.btnSecondary,
                    (!isPasswordStrong(newPassword) ||
                      !passwordsMatch(newPassword, confirmPassword) ||
                      !currentPassword ||
                      saving) &&
                      styles.btnDisabled,
                  ]}
                  onPress={() => void onChangePassword()}
                  disabled={
                    saving ||
                    !currentPassword ||
                    !isPasswordStrong(newPassword) ||
                    !passwordsMatch(newPassword, confirmPassword)
                  }
                >
                  {saving ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.btnSecondaryText}>Update password</Text>
                  )}
                </Pressable>
              </>
            ) : null}
          </ScrollView>
          </KeyboardAvoidingView>
        </>
      )}

      <Modal
        visible={!!previewNotice}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewNotice(null)}
      >
        <View style={styles.previewBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPreviewNotice(null)}
          />
          <View style={styles.previewCard}>
            <View style={styles.previewHead}>
              <Text style={styles.previewTitle}>
                Notice #{previewNotice?.rank ?? ''}
              </Text>
              <Pressable
                onPress={() => setPreviewNotice(null)}
                hitSlop={12}
                style={styles.previewClose}
              >
                <Ionicons name="close" size={rs(22)} color={colors.text} />
              </Pressable>
            </View>
            {previewNotice ? (
              <ScrollView
                style={styles.previewScroll}
                contentContainerStyle={styles.previewScrollContent}
                showsVerticalScrollIndicator
              >
                {previewNotice.kind === 'image' && previewNotice.imageUrl ? (
                  <Image
                    source={{ uri: previewNotice.imageUrl }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.previewTextBody}>
                    {previewNotice.text}
                  </Text>
                )}
              </ScrollView>
            ) : null}
            <Text style={styles.previewHint}>Tap outside or × to close</Text>
          </View>
        </View>
      </Modal>
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
    hint: {
      color: c.textMuted,
      fontSize: rs(12),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    tabBar: { flexGrow: 0, marginBottom: rs(4) },
    tabRow: {
      gap: rs(8),
      paddingHorizontal: rs(16),
      paddingBottom: rs(10),
    },
    tabChip: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(18),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    tabChipActive: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    tabChipText: { color: c.textMuted, fontWeight: '700', fontSize: rs(12) },
    tabChipTextActive: { color: c.text },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      padding: rs(14),
      marginBottom: rs(14),
    },
    toggleTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
    },
    toggleHint: {
      color: c.textMuted,
      fontSize: rs(12),
      marginTop: rs(2),
      fontWeight: '600',
    },
    toggleTrack: {
      width: rs(48),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.borderMuted,
      padding: rs(3),
      justifyContent: 'center',
    },
    toggleTrackOn: {
      backgroundColor: c.accentGreen ?? '#2E7D32',
    },
    toggleThumb: {
      width: rs(22),
      height: rs(22),
      borderRadius: rs(11),
      backgroundColor: '#fff',
    },
    toggleThumbOn: {
      alignSelf: 'flex-end',
    },
    fieldLabel: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '700',
      marginBottom: rs(8),
    },
    actionList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(16),
    },
    legalSubRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(14),
    },
    qrBtnDangerText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: rs(13),
    },
    actionChip: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      borderRadius: rs(999),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
    },
    actionChipActive: {
      borderColor: c.accentGreen ?? '#2E7D32',
      backgroundColor: 'rgba(46,125,50,0.15)',
    },
    actionChipText: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '700',
    },
    actionChipTextActive: {
      color: c.text,
    },
    scroll: { padding: rs(16), paddingBottom: rs(40) },
    planCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(14),
    },
    planCardTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginBottom: rs(10),
    },
    logoPreview: {
      width: rs(120),
      height: rs(120),
      alignSelf: 'center',
      marginVertical: rs(12),
    },
    section: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginTop: rs(4),
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
    noticeRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(10),
    },
    noticeRank: {
      color: c.textMuted,
      fontWeight: '800',
      fontSize: rs(12),
      width: rs(28),
    },
    noticeThumbWrap: {
      flex: 1,
      height: rs(72),
      borderRadius: rs(8),
      overflow: 'hidden',
      backgroundColor: c.surfaceAlt,
    },
    noticeThumb: {
      width: '100%',
      height: '100%',
    },
    noticeTextThumb: {
      padding: rs(8),
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: rs(4),
    },
    noticeTextPreview: {
      color: c.textSecondary,
      fontSize: rs(10),
      lineHeight: rs(13),
    },
    noticeTextInput: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      padding: rs(12),
      color: c.text,
      fontSize: rs(14),
      backgroundColor: c.surface,
      minHeight: rs(88),
      marginBottom: rs(10),
    },
    previewTextBody: {
      color: c.text,
      fontSize: rs(15),
      lineHeight: rs(22),
      fontWeight: '600',
      padding: rs(8),
    },
    noticeViewBadge: {
      position: 'absolute',
      right: rs(6),
      bottom: rs(6),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: rs(8),
      paddingVertical: rs(4),
      borderRadius: rs(10),
    },
    noticeViewText: {
      color: '#fff',
      fontSize: rs(10),
      fontWeight: '700',
    },
    noticeDeleteBtn: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(10),
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(16),
    },
    previewCard: {
      width: '100%',
      maxWidth: rs(420),
      maxHeight: Dimensions.get('window').height * 0.82,
      backgroundColor: c.surface,
      borderRadius: rs(14),
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.borderMuted,
      zIndex: 2,
    },
    previewHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    previewTitle: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    previewClose: {
      width: rs(32),
      height: rs(32),
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewScroll: { maxHeight: Dimensions.get('window').height * 0.62 },
    previewScrollContent: { padding: rs(10), alignItems: 'center' },
    previewImage: {
      width: '100%',
      height: Dimensions.get('window').height * 0.55,
      backgroundColor: c.bg,
    },
    previewHint: {
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(11),
      paddingVertical: rs(10),
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
      overflow: 'hidden',
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
      overflow: 'hidden',
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
