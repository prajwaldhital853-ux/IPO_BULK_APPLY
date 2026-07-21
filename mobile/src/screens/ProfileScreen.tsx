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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { BrandLogo } from '../components/BrandLogo';
import { ChangePinModal } from '../components/ChangePinModal';
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
};

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

  if (contact.tiktokUrl) {
    items.push({
      label: 'TikTok',
      detail: contact.tiktokUrl.replace(/^https?:\/\/(www\.)?tiktok\.com\//, '@'),
      bg: '#E0E0E0',
      iconColor: '#212121',
      ion: 'logo-tiktok',
      onPress: () => void openExternal(contact.tiktokUrl!, 'TikTok'),
    });
  }

  items.push({
    label: 'Facebook',
    detail: contact.facebookUrl ? 'Open page' : 'Link coming soon',
    bg: '#BBDEFB',
    iconColor: '#1565C0',
    ion: 'logo-facebook',
    onPress: () => {
      if (contact.facebookUrl) {
        void openExternal(contact.facebookUrl, 'Facebook');
        return;
      }
      Alert.alert(
        'Facebook',
        'Facebook page link will be added soon. Contact us on WhatsApp or email for now.',
      );
    },
  });

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
  const { isPremium, daysLeft, isPending } = useSubscription();
  const { accounts, addAccount } = useAccounts();
  const auth = useAuth();
  const { colors, isDark, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [publicSettings, setPublicSettings] = useState<PublicAppSettings | null>(null);

  useEffect(() => {
    void fetchPublicAppSettings().then(setPublicSettings);
  }, []);

  const contact = publicSettings?.contact ?? FALLBACK_CONTACT;
  const contactItems = useMemo(() => buildContactItems(contact), [contact]);

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
        showActions
        onOptionsPress={() => setOptionsOpen(true)}
      />
      {isDark ? <PromoBanner /> : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoCard}>
            <BrandLogo variant="full" height={rs(70)} />
          </View>
          <Text style={styles.guest}>
            {auth.isAuthenticated ? auth.user?.name ?? auth.user?.email ?? 'Signed in' : 'Guest'}
          </Text>
          {auth.isAuthenticated && auth.user?.email ? (
            <Text style={styles.premiumDays}>{auth.user.email}</Text>
          ) : null}
          <Text style={styles.free}>
            {isPremium ? 'PREMIUM' : isPending ? 'PENDING VERIFICATION' : 'FREE'}
          </Text>
          {isPending ? (
            <Text style={styles.premiumDays}>
              Payment submitted — waiting for admin approval
            </Text>
          ) : null}
          {isPremium && daysLeft != null ? (
            <Text style={styles.premiumDays}>{daysLeft} days left</Text>
          ) : null}
          {auth.isAuthenticated ? (
            <View style={styles.authRow}>
              <Pressable
                style={[styles.loginBtn, styles.authBtnHalf]}
                onPress={() => setChangePinOpen(true)}
              >
                <Text style={styles.loginText}>Change PIN</Text>
              </Pressable>
              <Pressable
                style={[styles.loginBtn, styles.authBtnHalf]}
                onPress={() => void auth.signOut()}
              >
                <Text style={styles.loginText}>Log Out</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.loginBtn}
              onPress={() => void auth.signInWithGoogle().catch(() => undefined)}
            >
              <Text style={styles.loginText}>Log In</Text>
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

        <Text style={styles.sectionOutside}>Appearance</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={toggle}>
            <View
              style={[
                styles.rowIcon,
                { backgroundColor: isDark ? '#424242' : '#E3F2FD' },
              ]}
            >
              <Ionicons
                name={isDark ? 'moon' : 'sunny-outline'}
                size={rs(18)}
                color={isDark ? '#FFD54F' : '#1565C0'}
              />
            </View>
            <Text style={styles.rowLabel}>
              {isDark ? 'Dark Mode' : 'White Mode'}
            </Text>
            <View
              style={[
                styles.toggleTrackSmall,
                {
                  backgroundColor: isDark ? colors.primary : colors.primarySoft,
                },
              ]}
            >
              <View
                style={[
                  styles.toggleThumbSmall,
                  { alignSelf: isDark ? 'flex-end' : 'flex-start' },
                ]}
              />
            </View>
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

      <ChangePinModal
        visible={changePinOpen}
        onClose={() => setChangePinOpen(false)}
        onChanged={() => {
          setChangePinOpen(false);
          Alert.alert('PIN updated', 'Your new PIN is ready to use.');
        }}
      />
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
    toggleTrackSmall: {
      width: rs(40),
      height: rs(22),
      borderRadius: rs(11),
      paddingHorizontal: rs(2),
      justifyContent: 'center',
    },
    toggleThumbSmall: {
      width: rs(18),
      height: rs(18),
      borderRadius: rs(9),
      backgroundColor: '#FFFFFF',
    },
    content: { paddingBottom: rs(40) },
    hero: { alignItems: 'center', paddingVertical: rs(24) },
    logoCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: rs(16),
      paddingVertical: rs(14),
      paddingHorizontal: rs(18),
      marginBottom: rs(8),
    },
    guest: {
      color: c.text,
      fontSize: rs(20),
      fontWeight: '800',
      marginTop: rs(12),
    },
    free: {
      color: '#4FC3F7',
      fontWeight: '700',
      marginTop: rs(4),
      marginBottom: rs(4),
    },
    premiumDays: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginBottom: rs(12),
    },
    loginBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      paddingHorizontal: rs(28),
      paddingVertical: rs(10),
      backgroundColor: c.surface,
    },
    authRow: {
      flexDirection: 'row',
      gap: rs(10),
      marginTop: rs(4),
    },
    authBtnHalf: {
      paddingHorizontal: rs(16),
      minWidth: rs(130),
    },
    loginText: { color: c.text, fontWeight: '600' },
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
