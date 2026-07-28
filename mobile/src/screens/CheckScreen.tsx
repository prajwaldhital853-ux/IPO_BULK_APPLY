import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function CheckScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const needAccounts = (go: () => void) => {
    if (accounts.length === 0) {
      Alert.alert('No accounts', 'Add capital detail first from Apply.');
      return;
    }
    go();
  };

  const cards = [
    {
      title: 'Check From MeroShare',
      desc: 'Open the CDSC result page in-app with BOID and captcha auto-filled.',
      tint: '#A1887F',
      icon: 'file-document-outline' as const,
      onPress: () => needAccounts(() => navigation.navigate('CheckResultWeb')),
    },
    {
      title: 'IPO Bulk Result',
      desc: 'View IPO results in bulk',
      tint: '#2E7D32',
      icon: 'format-list-checks' as const,
      onPress: () =>
        needAccounts(() => navigation.navigate('PublicIpoResult')),
    },
    {
      title: 'IPO Bulk Status',
      desc: 'View your all application status in bulk',
      tint: '#1565C0',
      icon: 'clock-outline' as const,
      onPress: () =>
        needAccounts(() => navigation.navigate('IpoBulkStatus')),
    },
    {
      title: 'Current IPO Status',
      desc: 'Check only current Opening Status',
      tint: '#6A1B9A',
      icon: 'chart-donut' as const,
      onPress: () =>
        needAccounts(() => navigation.navigate('CurrentIpoStatus')),
    },
  ];

  return (
    <ProtectedPersonalScreen
      title="Sign in to check IPO results"
      subtitle="Bulk result and status checks require Google sign-in. MeroShare credentials stay on this device."
    >
      <View style={styles.root}>
        <AppHeader onMenuPress={openDrawer} title="Check" showLogo={false} />
        <AdminPromoBanner />

        <View
          style={[
            styles.centerWrap,
            { paddingBottom: insets.bottom + rs(12) },
          ]}
        >
          <View style={styles.brandBlock}>
            <View style={styles.brandIconBox}>
              <MaterialCommunityIcons
                name="bank"
                size={rs(30)}
                color="#E53935"
              />
            </View>
            <Text style={styles.brandTitle}>
              <Text style={{ color: colors.text }}>MERO </Text>
              <Text style={{ color: '#E53935' }}>SHARE</Text>
            </Text>
            <Text style={styles.subtitle}>IPO Allotment Result</Text>
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
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    centerWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: rs(16),
    },
    brandBlock: {
      alignItems: 'center',
      marginBottom: rs(20),
    },
    brandIconBox: {
      width: rs(58),
      height: rs(58),
      borderRadius: rs(14),
      backgroundColor: '#FDECEA',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(10),
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    brandTitle: {
      fontSize: rs(20),
      fontWeight: '800',
      letterSpacing: 1,
    },
    subtitle: {
      textAlign: 'center',
      color: c.textSecondary,
      marginTop: rs(4),
      fontSize: rs(12),
    },
    list: { gap: rs(12) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(16),
      paddingVertical: rs(16),
      paddingHorizontal: rs(14),
      backgroundColor: c.surface,
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
    cardTitle: { color: c.text, fontWeight: '700', fontSize: rs(15) },
    cardDesc: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
      lineHeight: rs(16),
    },
  });
}
