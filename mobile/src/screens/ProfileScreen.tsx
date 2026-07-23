import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { BrandLogo } from '../components/BrandLogo';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { useSubscription } from '../context/SubscriptionContext';
import { useAccounts } from '../context/AccountsContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { accountLimitForPlan } from '../storage/subscriptionStorage';
import {
  exportAccountsFile,
  parseImportedAccounts,
  pickAccountsFile,
  toLinkedDraft,
} from '../services/accounts/backup';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';
import {
  fetchPublicAppSettings,
  type ContactSettings,
  type PublicAppSettings,
} from '../services/app/publicSettingsApi';

type ContactItem = {
  label: string;
  detail: string;
  bg: string;
  iconColor: string;
  ion: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

const FALLBACK_CONTACT: ContactSettings = {
  companyName: 'Kalash Financial Solution Pvt. Ltd.',
  email: 'kalashfinancialsolution@gmail.com',
  whatsapp: '9709133067',
  whatsappUrl: 'https://wa.me/9779709133067',
  facebookUrl: null,
  tiktokUrl: 'https://www.tiktok.com/@unique_share_market',
  socialLinks: [
    {
      id: 'fallback-tiktok',
      platform: 'tiktok',
      label: 'TikTok',
      detail: '@unique_share_market',
      url: 'https://www.tiktok.com/@unique_share_market',
    },
  ],
};

function formatExpiresOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const SOCIAL_STYLE: Record<
  string,
  { bg: string; iconColor: string; ion: keyof typeof Ionicons.glyphMap }
> = {
  email: { bg: '#FFCDD2', iconColor: '#C62828', ion: 'mail-outline' },
  whatsapp: { bg: '#C8E6C9', iconColor: '#2E7D32', ion: 'logo-whatsapp' },
  viber: { bg: '#E1BEE7', iconColor: '#6A1B9A', ion: 'chatbubble-ellipses-outline' },
  youtube: { bg: '#FFCDD2', iconColor: '#C62828', ion: 'logo-youtube' },
  instagram: { bg: '#F8BBD0', iconColor: '#AD1457', ion: 'logo-instagram' },
  twitter: { bg: '#BBDEFB', iconColor: '#1565C0', ion: 'logo-twitter' },
  x: { bg: '#CFD8DC', iconColor: '#263238', ion: 'logo-twitter' },
  facebook: { bg: '#BBDEFB', iconColor: '#1565C0', ion: 'logo-facebook' },
  tiktok: { bg: '#E0E0E0', iconColor: '#212121', ion: 'logo-tiktok' },
  telegram: { bg: '#B3E5FC', iconColor: '#0277BD', ion: 'paper-plane-outline' },
  website: { bg: '#D7CCC8', iconColor: '#5D4037', ion: 'globe-outline' },
  custom: { bg: '#CFD8DC', iconColor: '#455A64', ion: 'link-outline' },
};

function socialStyle(platform: string) {
  return SOCIAL_STYLE[platform] ?? SOCIAL_STYLE.custom;
}

async function openExternal(url: string, failLabel: string): Promise<void> {
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert(failLabel, url);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert(failLabel, 'Could not open link on this device.');
  }
}

function buildContactItems(contact: ContactSettings): ContactItem[] {
  const items: ContactItem[] = [
    {
      label: 'Email',
      detail: contact.email,
      bg: '#FFCDD2',
      iconColor: '#C62828',
      ion: 'mail-outline',
      onPress: () => void openExternal(`mailto:${contact.email}`, 'Email'),
    },
    {
      label: 'WhatsApp',
      detail: contact.whatsapp,
      bg: '#C8E6C9',
      iconColor: '#2E7D32',
      ion: 'logo-whatsapp',
      onPress: () => void openExternal(contact.whatsappUrl, 'WhatsApp'),
    },
  ];

  for (const link of contact.socialLinks ?? []) {
    if (!link.url?.trim()) continue;
    const style = socialStyle(link.platform);
    items.push({
      label: link.label || link.platform,
      detail: link.detail || 'Open',
      bg: style.bg,
      iconColor: style.iconColor,
      ion: style.ion,
      onPress: () => void openExternal(link.url, link.label || link.platform),
    });
  }

  return items;
}

const GENERAL: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  iconColor: string;
  action: 'settings' | 'notifications' | 'share' | 'feedback' | 'feature';
}[] = [
  { label: 'Settings', icon: 'settings-outline', bg: '#CFD8DC', iconColor: '#455A64', action: 'settings' },
  { label: 'Notifications', icon: 'notifications-outline', bg: '#BBDEFB', iconColor: '#1565C0', action: 'notifications' },
  { label: 'Share this App', icon: 'share-social-outline', bg: '#C8E6C9', iconColor: '#2E7D32', action: 'share' },
  { label: 'Feedback', icon: 'mail-outline', bg: '#FFCDD2', iconColor: '#C62828', action: 'feedback' },
  { label: 'Feature Request', icon: 'play-forward-outline', bg: '#D1C4E9', iconColor: '#4527A0', action: 'feature' },
];

export function ProfileScreen() {
  const openDrawer = useOpenDrawer();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isPremium, daysLeft, isPending, maxAccounts, state } =
    useSubscription();
  const { accounts, addAccount } = useAccounts();
  const auth = useAuth();
  const { colors, isDark, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [publicSettings, setPublicSettings] = useState<PublicAppSettings | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchPublicAppSettings().then(setPublicSettings);
  }, []);

  const contact = publicSettings?.contact ?? FALLBACK_CONTACT;
  const contactItems = useMemo(() => buildContactItems(contact), [contact]);

  const displayName = auth.isAuthenticated
    ? auth.user?.name ?? auth.user?.email ?? 'Signed in'
    : 'Guest';
  const email = auth.isAuthenticated ? auth.user?.email ?? null : null;
  const expiresLabel = formatExpiresOn(
    state.expiresAt ?? auth.premium?.expiresAt ?? null,
  );
  const statusLabel = isPremium
    ? 'SUBSCRIBED'
    : isPending
      ? 'PENDING'
      : 'FREE';
  const statusColor = isPremium
    ? '#2E7D32'
    : isPending
      ? '#F9A825'
      : '#0277BD';

  const copyEmail = async () => {
    if (!email) return;
    await Clipboard.setStringAsync(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onGeneralPress = async (action: (typeof GENERAL)[number]['action']) => {
    if (action === 'settings' || action === 'notifications') {
      navigation.navigate('AppSettings');
      return;
    }
    if (action === 'share') {
      const message =
        `NEPSE GHAR — Bulk MeroShare IPO apply, live NEPSE data, portfolio tools & premium features.\n\n` +
        `${contact.companyName}\n${contact.email}`;
      try {
        await Share.share({ message, title: 'NEPSE GHAR' });
      } catch {
        Alert.alert('Share', message);
      }
      return;
    }
    if (action === 'feedback') {
      navigation.navigate('FeedbackForm', { kind: 'feedback' });
      return;
    }
    navigation.navigate('FeedbackForm', { kind: 'feature_request' });
  };

  const handleImport = async () => {
    setOptionsOpen(false);
    try {
      setBusy('Reading file…');
      const file = await pickAccountsFile();
      if (!file) {
        setBusy(null);
        return;
      }
      const parsed = parseImportedAccounts(file.content);
      if (!parsed.length) {
        Alert.alert(
          'Nothing to import',
          'No accounts were found in that file. Use columns: Name, DP, Username.',
        );
        setBusy(null);
        return;
      }

      const existing = new Set(
        accounts.map(
          (a) => `${(a.dpCode ?? a.dpId ?? '').trim()}:${a.username.trim().toLowerCase()}`,
        ),
      );
      const max = accountLimitForPlan(isPremium);
      let added = 0;
      let skippedDup = 0;
      let skippedLimit = 0;

      for (const acc of parsed) {
        const key = `${(acc.dpCode ?? acc.dpId).trim()}:${acc.username.trim().toLowerCase()}`;
        if (existing.has(key)) {
          skippedDup++;
          continue;
        }
        if (accounts.length + added >= max) {
          skippedLimit++;
          continue;
        }
        setBusy(`Importing ${acc.name}…`);
        await addAccount(toLinkedDraft(acc));
        existing.add(key);
        added++;
      }

      setBusy(null);
      const parts = [`${added} account${added === 1 ? '' : 's'} imported.`];
      if (skippedDup) parts.push(`${skippedDup} already existed.`);
      if (skippedLimit)
        parts.push(
          `${skippedLimit} skipped — plan limit of ${max} reached.`,
        );
      parts.push(
        '\nAdd the password, CRN and PIN for each account before applying.',
      );
      Alert.alert('Import complete', parts.join(' '));
    } catch (e) {
      setBusy(null);
      Alert.alert(
        'Import failed',
        e instanceof Error ? e.message : 'Could not import that file.',
      );
    }
  };

  const handleExport = async () => {
    setOptionsOpen(false);
    if (!accounts.length) {
      Alert.alert('Nothing to export', 'You have no saved accounts yet.');
      return;
    }
    try {
      setBusy('Preparing backup…');
      await exportAccountsFile(accounts, 'json');
    } catch (e) {
      Alert.alert(
        'Export failed',
        e instanceof Error ? e.message : 'Could not export accounts.',
      );
    } finally {
      setBusy(null);
    }
  };

  const optionItems: {
    label: string;
    hint: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    onPress: () => void;
  }[] = [
    {
      label: 'Import from Excel',
      hint: 'Add accounts from a .csv / Excel file',
      icon: 'grid-outline',
      color: '#2E7D32',
      onPress: () => void handleImport(),
    },
    {
      label: 'Import',
      hint: 'Restore accounts from a backup file',
      icon: 'download-outline',
      color: '#1565C0',
      onPress: () => void handleImport(),
    },
    {
      label: 'Export',
      hint: 'Save your accounts to a backup file',
      icon: 'share-outline',
      color: '#EF6C00',
      onPress: () => void handleExport(),
    },
  ];

  return (
    <View style={styles.root}>
      <AppHeader
        onMenuPress={openDrawer}
        title="NEPSE GHAR"
        showLogo={false}
        showActions={false}
        right={
          <View style={styles.headerRight}>
            <Pressable
              onPress={toggle}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityState={{ checked: isDark }}
              accessibilityLabel="Toggle theme"
              style={[
                styles.headerToggle,
                { backgroundColor: isDark ? colors.primary : '#B0BEC5' },
              ]}
            >
              <View
                style={[
                  styles.headerToggleThumb,
                  { alignSelf: isDark ? 'flex-end' : 'flex-start' },
                ]}
              />
            </Pressable>
            <Pressable
              onPress={() => setOptionsOpen(true)}
              hitSlop={8}
              style={styles.headerMore}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Ionicons
                name="ellipsis-vertical"
                size={rs(20)}
                color={colors.text}
              />
            </Pressable>
          </View>
        }
      />
      {isDark ? <PromoBanner /> : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.logoCircle}>
            <BrandLogo variant="mark" height={rs(58)} />
          </View>
          <Text style={styles.heroName}>{displayName}</Text>
          {email ? (
            <Pressable style={styles.emailRow} onPress={() => void copyEmail()}>
              <Text style={styles.heroEmail} numberOfLines={1}>
                {email}
              </Text>
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={rs(15)}
                color="#1565C0"
              />
            </Pressable>
          ) : (
            <Text style={styles.heroEmail}>Sign in to sync premium</Text>
          )}
          <Text style={[styles.heroStatus, { color: statusColor }]}>
            {statusLabel}
          </Text>
          {isPremium && expiresLabel ? (
            <Text style={styles.heroMeta}>Expires On {expiresLabel}</Text>
          ) : isPremium && daysLeft != null ? (
            <Text style={styles.heroMeta}>{daysLeft} days left</Text>
          ) : isPending ? (
            <Text style={styles.heroMeta}>Waiting for admin approval</Text>
          ) : (
            <Text style={styles.heroMeta}>Free plan</Text>
          )}
          <Text style={styles.heroMeta}>Account Limit: {maxAccounts}</Text>

          {auth.isAuthenticated ? (
            <Pressable
              style={styles.logoutPill}
              onPress={() => void auth.signOut()}
            >
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.logoutPill}
              onPress={() => void auth.signInWithGoogle().catch(() => undefined)}
            >
              <Text style={[styles.logoutText, { color: '#1565C0' }]}>
                Log In
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionOutside}>Account Settings</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Subscription')}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#FFE0B2' }]}>
              <Ionicons name="receipt-outline" size={rs(18)} color="#EF6C00" />
            </View>
            <Text style={styles.rowLabel}>Subscription</Text>
            <Ionicons name="refresh-circle" size={rs(22)} color={colors.teal} />
          </Pressable>
        </View>

        <Text style={styles.sectionOutside}>Admin</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('AdminLogin')}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#D1C4E9' }]}>
              <Ionicons name="shield-outline" size={rs(18)} color="#4527A0" />
            </View>
            <Text style={styles.rowLabel}>Admin Login</Text>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
          </Pressable>
        </View>

        <Text style={styles.sectionOutside}>General Options</Text>
        <View style={styles.card}>
          {GENERAL.map((item, index) => (
            <View key={item.label}>
              <Pressable
                style={styles.row}
                onPress={() => void onGeneralPress(item.action)}
              >
                <View style={[styles.rowIcon, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={rs(18)} color={item.iconColor} />
                </View>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
              </Pressable>
              {index < GENERAL.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
              ) : null}
            </View>
          ))}
        </View>

        <Text style={styles.sectionOutside}>About</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('AboutCompany')}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#B2DFDB' }]}>
              <Ionicons name="business-outline" size={rs(18)} color="#00695C" />
            </View>
            <Text style={styles.rowLabel}>About Company</Text>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('TeamMembers')}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#FFE0B2' }]}>
              <Ionicons name="people-outline" size={rs(18)} color="#EF6C00" />
            </View>
            <Text style={styles.rowLabel}>Team Member Profile</Text>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Legal', { kind: 'terms' })}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#C5CAE9' }]}>
              <Ionicons name="document-text-outline" size={rs(18)} color="#283593" />
            </View>
            <Text style={styles.rowLabel}>Terms & Conditions</Text>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Legal', { kind: 'privacy' })}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#B2EBF2' }]}>
              <Ionicons name="shield-checkmark-outline" size={rs(18)} color="#00838F" />
            </View>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
          </Pressable>
        </View>

        <Text style={styles.sectionOutside}>Connect With Us</Text>
        <Text style={styles.sectionHint}>{contact.companyName}</Text>
        <View style={styles.card}>
          {contactItems.map((item, index) => (
            <View key={item.label}>
              <Pressable style={styles.row} onPress={item.onPress}>
                <View style={[styles.rowIcon, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.ion} size={rs(18)} color={item.iconColor} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowDetail} numberOfLines={2}>
                    {item.detail}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={rs(16)} color={colors.textDim} />
              </Pressable>
              {index < contactItems.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
              ) : null}
            </View>
          ))}
        </View>

        {auth.isAuthenticated ? (
          <>
            <Text style={styles.sectionOutside}>Danger Zone</Text>
            <View style={styles.card}>
              <Pressable style={styles.row} onPress={() => setDeleteOpen(true)}>
                <View style={[styles.rowIcon, { backgroundColor: '#FFCDD2' }]}>
                  <Ionicons name="trash-outline" size={rs(18)} color="#C62828" />
                </View>
                <Text style={[styles.rowLabel, { color: colors.danger }]}>
                  Delete account
                </Text>
                <Ionicons name="chevron-forward" size={rs(16)} color={colors.danger} />
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={optionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setOptionsOpen(false)}
        >
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Accounts</Text>
            {optionItems.map((item, index) => (
              <View key={item.label}>
                <Pressable style={styles.menuRow} onPress={item.onPress}>
                  <View
                    style={[styles.rowIcon, { backgroundColor: `${item.color}22` }]}
                  >
                    <Ionicons name={item.icon} size={rs(18)} color={item.color} />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Text style={styles.rowDetail}>{item.hint}</Text>
                  </View>
                </Pressable>
                {index < optionItems.length - 1 ? (
                  <View
                    style={[styles.divider, { backgroundColor: colors.borderMuted }]}
                  />
                ) : null}
              </View>
            ))}
            <Text style={styles.menuNote}>
              Backups never include your password, CRN or PIN.
            </Text>
          </View>
        </Pressable>
      </Modal>

      {busy ? (
        <View style={styles.busyOverlay}>
          <View style={styles.busyCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.busyText}>{busy}</Text>
          </View>
        </View>
      ) : null}

      <DeleteAccountModal
        visible={deleteOpen}
        busy={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirmDelete={async () => {
          setDeleting(true);
          try {
            await auth.deleteAccount();
            setDeleteOpen(false);
            Alert.alert('Account deleted', 'Your profile and local data were removed.');
          } finally {
            setDeleting(false);
          }
        }}
      />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingRight: rs(4),
    },
    headerToggle: {
      width: rs(42),
      height: rs(24),
      borderRadius: rs(12),
      paddingHorizontal: rs(3),
      justifyContent: 'center',
    },
    headerToggleThumb: {
      width: rs(18),
      height: rs(18),
      borderRadius: rs(9),
      backgroundColor: '#FFFFFF',
    },
    headerMore: {
      width: rs(32),
      height: rs(32),
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: { paddingBottom: rs(40) },
    heroCard: {
      marginHorizontal: rs(12),
      marginTop: rs(10),
      marginBottom: rs(18),
      borderRadius: rs(18),
      backgroundColor: '#81D4FA',
      alignItems: 'center',
      paddingTop: rs(22),
      paddingBottom: rs(22),
      paddingHorizontal: rs(18),
      overflow: 'hidden',
    },
    heroGlow: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#B3E5FC',
      opacity: 0.65,
    },
    logoCircle: {
      width: rs(92),
      height: rs(92),
      borderRadius: rs(46),
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(14),
      zIndex: 1,
    },
    heroName: {
      color: '#0D47A1',
      fontSize: rs(20),
      fontWeight: '800',
      textAlign: 'center',
      zIndex: 1,
    },
    emailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginTop: rs(6),
      maxWidth: '100%',
      zIndex: 1,
    },
    heroEmail: {
      color: '#1565C0',
      fontSize: rs(12),
      fontWeight: '500',
      zIndex: 1,
    },
    heroStatus: {
      fontWeight: '800',
      fontSize: rs(15),
      letterSpacing: 0.8,
      marginTop: rs(12),
      zIndex: 1,
    },
    heroMeta: {
      color: '#1976D2',
      fontSize: rs(13),
      fontWeight: '600',
      marginTop: rs(4),
      zIndex: 1,
    },
    logoutPill: {
      marginTop: rs(18),
      backgroundColor: '#FFFFFF',
      borderRadius: rs(24),
      paddingHorizontal: rs(36),
      paddingVertical: rs(11),
      zIndex: 1,
    },
    logoutText: {
      color: '#C62828',
      fontWeight: '800',
      fontSize: rs(14),
    },
    sectionOutside: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '700',
      marginHorizontal: rs(20),
      marginBottom: rs(8),
      marginTop: rs(4),
    },
    sectionHint: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginHorizontal: rs(20),
      marginBottom: rs(8),
      marginTop: rs(-4),
    },
    card: {
      marginHorizontal: rs(16),
      marginBottom: rs(16),
      borderRadius: rs(22),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      paddingHorizontal: rs(14),
      paddingVertical: rs(6),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(13),
      gap: rs(14),
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: rs(50),
    },
    rowIcon: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: { color: c.text, fontSize: rs(14), fontWeight: '600' },
    rowTextWrap: { flex: 1 },
    rowDetail: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(2),
    },
    menuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: rs(64),
      paddingHorizontal: rs(12),
    },
    menuSheet: {
      width: rs(280),
      backgroundColor: c.surface,
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
    },
    menuTitle: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '800',
      letterSpacing: 0.6,
      marginBottom: rs(4),
      textTransform: 'uppercase',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      paddingVertical: rs(12),
    },
    menuNote: {
      color: c.textMuted,
      fontSize: rs(10),
      lineHeight: rs(14),
      marginTop: rs(8),
      marginBottom: rs(4),
    },
    busyOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    busyCard: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      paddingHorizontal: rs(24),
      paddingVertical: rs(20),
      alignItems: 'center',
      gap: rs(10),
      minWidth: rs(180),
    },
    busyText: { color: c.text, fontSize: rs(13), fontWeight: '600' },
  });
}
