import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
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
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

type ContactItem = {
  label: string;
  detail: string;
  bg: string;
  iconColor: string;
  ion: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

const KALASH_EMAIL = 'kalashfinancialsolution@gmail.com';
const KALASH_WHATSAPP = '9709133067';
const KALASH_WHATSAPP_URL = 'https://wa.me/9779709133067';
const KALASH_TIKTOK_URL =
  'https://www.tiktok.com/@unique_share_market?_r=1&_t=ZS-987xHBiY8G4';

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

function buildContactItems(): ContactItem[] {
  return [
    {
      label: 'Email',
      detail: KALASH_EMAIL,
      bg: '#FFCDD2',
      iconColor: '#C62828',
      ion: 'mail-outline',
      onPress: () => void openExternal(`mailto:${KALASH_EMAIL}`, 'Email'),
    },
    {
      label: 'WhatsApp',
      detail: KALASH_WHATSAPP,
      bg: '#C8E6C9',
      iconColor: '#2E7D32',
      ion: 'logo-whatsapp',
      onPress: () => void openExternal(KALASH_WHATSAPP_URL, 'WhatsApp'),
    },
    {
      label: 'TikTok',
      detail: '@unique_share_market',
      bg: '#E0E0E0',
      iconColor: '#212121',
      ion: 'logo-tiktok',
      onPress: () => void openExternal(KALASH_TIKTOK_URL, 'TikTok'),
    },
    {
      label: 'Facebook',
      detail: 'Link coming soon',
      bg: '#BBDEFB',
      iconColor: '#1565C0',
      ion: 'logo-facebook',
      onPress: () =>
        Alert.alert(
          'Facebook',
          'Facebook page link will be added soon. Contact us on WhatsApp or email for now.',
        ),
    },
  ];
}

const GENERAL = [
  { label: 'Settings', icon: 'settings-outline' as const, bg: '#CFD8DC', iconColor: '#455A64' },
  { label: 'Notifications', icon: 'notifications-outline' as const, bg: '#BBDEFB', iconColor: '#1565C0' },
  { label: 'Rate this App', icon: 'star-outline' as const, bg: '#FFF9C4', iconColor: '#F9A825' },
  { label: 'Whatsapp Group', icon: 'logo-whatsapp' as const, bg: '#E1BEE7', iconColor: '#7B1FA2' },
  { label: 'Share this App', icon: 'share-social-outline' as const, bg: '#C8E6C9', iconColor: '#2E7D32' },
  { label: 'Feedback', icon: 'mail-outline' as const, bg: '#FFCDD2', iconColor: '#C62828' },
  { label: 'Feature Request', icon: 'play-forward-outline' as const, bg: '#D1C4E9', iconColor: '#4527A0' },
];

export function ProfileScreen() {
  const openDrawer = useOpenDrawer();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isPremium, daysLeft } = useSubscription();
  const auth = useAuth();
  const { colors, isDark, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const contactItems = useMemo(() => buildContactItems(), []);

  return (
    <View style={styles.root}>
      <AppHeader
        onMenuPress={openDrawer}
        title="NEPSE GHAR"
        showLogo={false}
        showActions
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
          <Text style={styles.free}>{isPremium ? 'PREMIUM' : 'FREE'}</Text>
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

        <Text style={styles.sectionOutside}>General Options</Text>
        <View style={styles.card}>
          {GENERAL.map((item, index) => (
            <View key={item.label}>
              <Pressable style={styles.row}>
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

        <Text style={styles.sectionOutside}>Connect With Us</Text>
        <Text style={styles.sectionHint}>Kalash Financial Solution Pvt. Ltd.</Text>
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
  });
}
