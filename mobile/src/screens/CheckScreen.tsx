import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import { GlassClusterBackground } from '../components/GlassClusterBackground';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import type { ThemeColors } from '../theme/colors';
import {
  GLASS_CARD_BG,
  GLASS_CARD_BORDER,
  GLASS_CYAN_GLOW,
  NEPSE_NAVY,
} from '../theme/glassUi';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type CheckCard = {
  title: string;
  desc: string;
  tint: string;
  chevron: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
};

export function CheckScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { usableAccounts } = useActiveAccounts();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const needAccounts = (go: () => void, requireActive = true) => {
    if (accounts.length === 0) {
      Alert.alert('No accounts', 'Add capital detail first from Apply.');
      return;
    }
    if (requireActive && usableAccounts.length === 0) {
      Alert.alert(
        'No active accounts',
        'Your plan limit is smaller than the number of saved accounts, and none of the accounts on this phone are in the active set. Delete an active account to free a slot, or ask admin to raise your limit.',
        [
          { text: 'OK', style: 'cancel' },
          {
            text: 'View active',
            onPress: () => navigation.navigate('ChooseActiveAccounts'),
          },
        ],
      );
      return;
    }
    go();
  };

  const cards: CheckCard[] = [
    {
      title: 'Check From MeroShare',
      desc: "CDSC check via this phone's session (auto captcha, WAF-safe).",
      tint: '#A1887F',
      chevron: '#2E7D32',
      icon: 'file-document-outline',
      onPress: () =>
        needAccounts(() => navigation.navigate('CheckResultWeb')),
    },
    {
      title: 'IPO Bulk Result',
      desc: 'View IPO results in bulk (issue managers + CDSC)',
      tint: '#2E7D32',
      chevron: '#2E7D32',
      icon: 'format-list-checks',
      onPress: () =>
        needAccounts(() => navigation.navigate('PublicIpoResult')),
    },
    {
      title: 'IPO Bulk Status',
      desc: 'View your all application status in bulk',
      tint: '#1565C0',
      chevron: '#1565C0',
      icon: 'clock-outline',
      onPress: () =>
        needAccounts(() => navigation.navigate('IpoBulkStatus'), false),
    },
    {
      title: 'Current IPO Status',
      desc: 'Check only current Opening Status',
      tint: '#6A1B9A',
      chevron: '#6A1B9A',
      icon: 'chart-donut',
      onPress: () =>
        needAccounts(() => navigation.navigate('CurrentIpoStatus'), false),
    },
  ];

  return (
    <ProtectedPersonalScreen
      title="Sign in to check IPO results"
      subtitle="Bulk result and status checks require Google sign-in. MeroShare credentials stay on this device."
    >
      <View style={styles.root}>
        <GlassClusterBackground variant="check">
          <AppHeader
            onMenuPress={openDrawer}
            title="Check"
            showLogo={false}
            glassActions
          />
          <AdminPromoBanner page="check" art="home" />

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + rs(100) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroCard}>
              <View style={styles.heroLogoWrap}>
                <MaterialCommunityIcons
                  name="bank"
                  size={rs(30)}
                  color="#E53935"
                />
              </View>
              <Text style={styles.heroTitle}>
                <Text style={styles.heroMero}>MERO </Text>
                <Text style={styles.heroShare}>SHARE</Text>
              </Text>
              <Text style={styles.heroSubtitle}>IPO Allotment Result</Text>
              <View style={styles.heroDividerRow}>
                <View style={styles.heroDividerLine} />
                <Text style={styles.heroTagline}>
                  Check • Track • Know Your Result
                </Text>
                <View style={styles.heroDividerLine} />
              </View>
            </View>

            <View style={styles.list}>
              {cards.map((card) => (
                <Pressable
                  key={card.title}
                  style={styles.card}
                  onPress={card.onPress}
                >
                  <View
                    style={[styles.iconCircle, { backgroundColor: card.tint }]}
                  >
                    <MaterialCommunityIcons
                      name={card.icon}
                      size={rs(22)}
                      color="#FFFFFF"
                    />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{card.title}</Text>
                    <Text style={styles.cardDesc}>{card.desc}</Text>
                  </View>
                  <View
                    style={[
                      styles.chevronWell,
                      { borderColor: `${card.chevron}44` },
                    ]}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={rs(16)}
                      color={card.chevron}
                    />
                  </View>
                </Pressable>
              ))}
            </View>

            <Text style={styles.footer}>
              Transparent • Simple • For a Smarter Investor
            </Text>
          </ScrollView>
        </GlassClusterBackground>
      </View>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? c.surface : GLASS_CARD_BG;
  const cardBorder = isDark ? c.borderMuted : GLASS_CARD_BORDER;

  return StyleSheet.create({
    root: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: rs(16),
      paddingTop: rs(8),
    },
    heroCard: {
      alignItems: 'center',
      borderRadius: rs(20),
      borderWidth: 1.5,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      paddingVertical: rs(18),
      paddingHorizontal: rs(16),
      marginBottom: rs(16),
      shadowColor: GLASS_CYAN_GLOW,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.22,
      shadowRadius: 8,
      elevation: isDark ? 0 : 2,
    },
    heroLogoWrap: {
      width: rs(58),
      height: rs(58),
      borderRadius: rs(14),
      backgroundColor: isDark ? c.surfaceAlt : '#FDECEA',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(10),
    },
    heroTitle: {
      fontSize: rs(20),
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    heroMero: { color: isDark ? c.text : NEPSE_NAVY },
    heroShare: { color: '#E53935' },
    heroSubtitle: {
      color: c.textSecondary,
      marginTop: rs(4),
      fontSize: rs(12),
      fontWeight: '600',
    },
    heroDividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginTop: rs(10),
      width: '100%',
    },
    heroDividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? c.border : '#81C784',
      opacity: 0.7,
    },
    heroTagline: {
      color: isDark ? c.textMuted : '#1565C0',
      fontSize: rs(10),
      fontWeight: '700',
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    list: { gap: rs(12) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: rs(16),
      paddingVertical: rs(14),
      paddingHorizontal: rs(14),
      backgroundColor: cardBg,
      gap: rs(14),
    },
    iconCircle: {
      width: rs(48),
      height: rs(48),
      borderRadius: rs(24),
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardText: { flex: 1 },
    cardTitle: {
      color: isDark ? c.text : NEPSE_NAVY,
      fontWeight: '700',
      fontSize: rs(15),
    },
    cardDesc: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
      lineHeight: rs(16),
    },
    chevronWell: {
      width: rs(30),
      height: rs(30),
      borderRadius: rs(15),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)',
      borderWidth: 1,
    },
    footer: {
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
      marginTop: rs(16),
      letterSpacing: 0.15,
    },
  });
}
