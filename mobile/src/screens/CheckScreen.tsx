import React, { useMemo } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { BrandLogo } from '../components/BrandLogo';
import { useAccounts } from '../context/AccountsContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import { isCdscBackendConfigured } from '../services/issuemanager/backendConfig';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import type { RootStackParamList } from '../navigation/types';

const MEROSHARE_WEB = 'https://meroshare.cdsc.com.np';

export function CheckScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const { accounts } = useAccounts();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const cards = [
    {
      title: 'Same-day IPO Result',
      desc: isCdscBackendConfigured()
        ? '11 issue managers + CDSC listed companies · bulk BOID check'
        : '11 live issue managers · bulk BOID (CDSC backend not linked)',
      tint: '#FFE0B2',
      iconColor: '#E65100',
      icon: 'trophy-outline' as const,
      onPress: () => {
        if (accounts.length === 0) {
          Alert.alert('No accounts', 'Add capital detail first from Apply.');
          return;
        }
        navigation.navigate('PublicIpoResult');
      },
    },
    {
      title: 'Check From MeroShare',
      desc: 'Open the official MeroShare portal in browser.',
      tint: '#FFECB3',
      iconColor: '#EF6C00',
      icon: 'file-document-outline' as const,
      onPress: () => {
        void Linking.openURL(MEROSHARE_WEB);
      },
    },
    {
      title: 'IPO Bulk Result',
      desc: 'Application Report list · pick account · live allotment check',
      tint: '#C8E6C9',
      iconColor: '#2E7D32',
      icon: 'clipboard-check-outline' as const,
      onPress: () => {
        if (accounts.length === 0) {
          Alert.alert('No accounts', 'Add capital detail first from Apply.');
          return;
        }
        navigation.navigate('CurrentIpoStatus', { mode: 'result' });
      },
    },
    {
      title: 'IPO Bulk Status',
      desc: 'Application Report IPOs · choose account · check across selected accounts',
      tint: '#BBDEFB',
      iconColor: '#1565C0',
      icon: 'timer-outline' as const,
      onPress: () => {
        if (accounts.length === 0) {
          Alert.alert('No accounts', 'Add capital detail first from Apply.');
          return;
        }
        navigation.navigate('CurrentIpoStatus', { mode: 'status' });
      },
    },
    {
      title: 'Current IPO Status',
      desc: 'Open IPOs + Application Report for any saved account',
      tint: '#E1BEE7',
      iconColor: '#7B1FA2',
      icon: 'eye-outline' as const,
      onPress: () => {
        if (accounts.length === 0) {
          Alert.alert('No accounts', 'Add capital detail first from Apply.');
          return;
        }
        navigation.navigate('CurrentIpoStatus', { mode: 'status' });
      },
    },
  ];

  return (
    <ProtectedPersonalScreen
      title="Sign in to check IPO results"
      subtitle="Bulk result and status checks require Google sign-in. MeroShare credentials stay on this device."
    >
    <View style={styles.root}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      {isDark ? <PromoBanner /> : null}

      <View style={styles.brandBlock}>
        <View style={styles.logoCard}>
          <BrandLogo variant="full" height={rs(64)} />
        </View>
        <Text style={styles.brandTitle}>
          <Text style={{ color: colors.text }}>MERO </Text>
          <Text style={{ color: colors.meroRed }}>SHARE</Text>
        </Text>
        <Text style={styles.subtitle}>IPO Allotment Result</Text>
      </View>

      <View style={styles.list}>
        {cards.map((card) => (
          <Pressable key={card.title} style={styles.card} onPress={card.onPress}>
            <View style={[styles.iconCircle, { backgroundColor: card.tint }]}>
              <MaterialCommunityIcons
                name={card.icon}
                size={rs(22)}
                color={card.iconColor}
              />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDesc}>{card.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={rs(18)} color={colors.textDim} />
          </Pressable>
        ))}
      </View>
    </View>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    brandBlock: {
      alignItems: 'center',
      marginTop: rs(16),
      marginBottom: rs(16),
      paddingHorizontal: rs(16),
    },
    logoCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: rs(14),
      paddingVertical: rs(12),
      paddingHorizontal: rs(16),
      width: '100%',
      alignItems: 'center',
    },
    brandTitle: {
      marginTop: rs(12),
      fontSize: rs(18),
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    subtitle: {
      textAlign: 'center',
      color: c.textSecondary,
      marginTop: rs(4),
      fontSize: rs(13),
    },
    list: { paddingHorizontal: rs(16), gap: rs(10) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(16),
      padding: rs(14),
      backgroundColor: c.surface,
      gap: rs(12),
    },
    iconCircle: {
      width: rs(48),
      height: rs(48),
      borderRadius: rs(24),
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardText: { flex: 1 },
    cardTitle: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    cardDesc: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(3),
      lineHeight: rs(16),
    },
  });
}
