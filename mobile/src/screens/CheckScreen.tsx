import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const CARDS = [
  {
    title: 'Check From MeroShare',
    desc: 'Verify your allocation directly through the official MeroShare portal.',
    color: colors.checkIconBrown,
    icon: 'file-document-outline' as const,
  },
  {
    title: 'IPO Bulk Result',
    desc: 'View IPO results in bulk',
    color: colors.checkIconGreen,
    icon: 'clipboard-check-outline' as const,
  },
  {
    title: 'IPO Bulk Status',
    desc: 'View your all application status in bulk',
    color: colors.checkIconBlue,
    icon: 'timer-outline' as const,
  },
  {
    title: 'Current IPO Status',
    desc: 'Check only current Opening Status',
    color: colors.checkIconPurple,
    icon: 'moon-waning-crescent' as const,
    route: 'CurrentIpoStatus' as const,
  },
];

export function CheckScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();

  return (
    <View style={styles.root}>
      <AppHeader onMenuPress={openDrawer} />
      <PromoBanner />

      <View style={styles.brandRow}>
        <MaterialCommunityIcons name="bank" size={rs(22)} color={colors.meroRed} />
        <Text style={styles.mero}>
          MERO <Text style={styles.share}>SHARE</Text>
        </Text>
      </View>
      <Text style={styles.subtitle}>IPO Allotment Result</Text>

      <View style={styles.list}>
        {CARDS.map((card) => (
          <Pressable
            key={card.title}
            style={styles.card}
            onPress={() => {
              if (card.route) navigation.navigate(card.route);
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: card.color }]}>
              <MaterialCommunityIcons
                name={card.icon}
                size={rs(22)}
                color={colors.text}
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    marginTop: rs(28),
  },
  mero: {
    color: colors.text,
    fontSize: rs(22),
    fontWeight: '800',
    letterSpacing: 1,
  },
  share: { color: colors.meroRed },
  subtitle: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: rs(6),
    marginBottom: rs(20),
    fontSize: rs(13),
  },
  list: { paddingHorizontal: rs(16), gap: rs(10) },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(14),
    padding: rs(14),
    backgroundColor: colors.surface,
    gap: rs(12),
  },
  iconCircle: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: rs(14) },
  cardDesc: {
    color: colors.textSecondary,
    fontSize: rs(12),
    marginTop: rs(3),
    lineHeight: rs(16),
  },
});
