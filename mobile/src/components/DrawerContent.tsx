import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Ionicons,
  MaterialCommunityIcons,
  Feather,
} from '@expo/vector-icons';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import { SoftBadge } from './SoftBadge';
import type { DrawerParamList, RootStackParamList } from '../navigation/types';

type Item = {
  label: string;
  icon: React.ReactNode;
  badge?: 'NEW' | 'UPDATED';
  onPress?: () => void;
};

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.line} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.line} />
      </View>
      {items.map((item) => (
        <Pressable
          key={item.label}
          style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          onPress={item.onPress}
        >
          <View style={styles.itemIcon}>{item.icon}</View>
          <Text style={styles.itemLabel} numberOfLines={1}>
            {item.label}
          </Text>
          {item.badge ? <SoftBadge label={item.badge} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function DrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useTheme();
  const nav = props.navigation as unknown as DrawerNavigationProp<DrawerParamList>;

  const close = () => nav.closeDrawer();

  const goStack = <T extends keyof RootStackParamList>(
    screen: T,
    params?: RootStackParamList[T],
  ) => {
    nav.navigate('RootStack', { screen, params } as never);
    close();
  };

  const goTab = (screen: 'Home' | 'Apply' | 'Services' | 'Check' | 'Profile') => {
    nav.navigate('RootStack', {
      screen: 'MainTabs',
      params: { screen },
    });
    close();
  };

  const market: Item[] = [
    {
      label: 'NEPSE Calendar',
      icon: <Ionicons name="calendar-outline" size={rs(18)} color="#66BB6A" />,
      onPress: () => goStack('NepseCalendar'),
    },
    {
      label: 'Live NEPSE',
      icon: <Feather name="trending-up" size={rs(18)} color="#42A5F5" />,
      onPress: () => goStack('NepseData'),
    },
    {
      label: 'Investment Summary',
      icon: <MaterialCommunityIcons name="currency-usd" size={rs(18)} color="#66BB6A" />,
      badge: 'UPDATED',
      onPress: () => goStack('InvestmentSummary'),
    },
    {
      label: 'Share Portfolio',
      icon: <MaterialCommunityIcons name="chart-pie" size={rs(18)} color="#EC407A" />,
      badge: 'NEW',
      onPress: () => goStack('Portfolio'),
    },
    {
      label: 'Bulk Portfolio',
      icon: <Ionicons name="folder-outline" size={rs(18)} color="#BDBDBD" />,
      badge: 'UPDATED',
      onPress: () => goStack('BulkPortfolio'),
    },
    {
      label: 'User Portfolio',
      icon: <Ionicons name="person-circle-outline" size={rs(18)} color="#FFCA28" />,
      onPress: () => goStack('Portfolio'),
    },
    {
      label: 'Watchlist',
      icon: <Ionicons name="eye-outline" size={rs(18)} color="#42A5F5" />,
      onPress: () => goStack('Watchlist'),
    },
  ];

  const ipo: Item[] = [
    {
      label: 'Bulk IPO Result',
      icon: <Ionicons name="checkmark-circle" size={rs(18)} color="#66BB6A" />,
      onPress: () => goTab('Check'),
    },
    {
      label: 'Upcoming Issues',
      icon: <Ionicons name="calendar" size={rs(18)} color="#F48FB1" />,
      onPress: () => goStack('IpoIssues', { mode: 'upcoming' }),
    },
    {
      label: 'Bulk IPO Status/Result',
      icon: <MaterialCommunityIcons name="clipboard-check-outline" size={rs(18)} color="#80CBC4" />,
      onPress: () => goStack('CurrentIpoStatus', { mode: 'result' }),
    },
    {
      label: 'Current IPO Status',
      icon: <Ionicons name="search" size={rs(18)} color="#90CAF9" />,
      badge: 'UPDATED',
      onPress: () => goStack('CurrentIpoStatus', { mode: 'status' }),
    },
    {
      label: 'Current Issues',
      icon: <MaterialCommunityIcons name="clipboard-text-clock" size={rs(18)} color="#CE93D8" />,
      badge: 'NEW',
      onPress: () => goStack('IpoIssues', { mode: 'current' }),
    },
    {
      label: 'All IPO Status',
      icon: <MaterialCommunityIcons name="checkbox-multiple-marked" size={rs(18)} color="#A5D6A7" />,
      onPress: () => goStack('CurrentIpoStatus'),
    },
    {
      label: 'IPO Result',
      icon: <MaterialCommunityIcons name="file-document-check-outline" size={rs(18)} color="#80CBC4" />,
      onPress: () => goTab('Check'),
    },
  ];

  const resources: Item[] = [
    {
      label: 'Financial News',
      icon: <Ionicons name="newspaper-outline" size={rs(18)} color="#90A4AE" />,
      onPress: () => goStack('FinancialNews'),
    },
    {
      label: 'Share Calculator',
      icon: <Ionicons name="calculator-outline" size={rs(18)} color="#FFB74D" />,
      onPress: () => goStack('Calculator'),
    },
    {
      label: 'TMS Brokers',
      icon: <MaterialCommunityIcons name="handshake-outline" size={rs(18)} color="#81D4FA" />,
      onPress: () => goStack('TmsBrokers'),
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + rs(8), backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(24) }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.brand}
          onPress={() => goTab('Apply')}
        >
          <View style={styles.brandIcon}>
            <MaterialCommunityIcons name="chart-bar" size={rs(22)} color="#66BB6A" />
            <Text style={styles.ipoTag}>IPO</Text>
          </View>
          <Text style={styles.brandText}>NEPSE GHAR</Text>
        </Pressable>

        <Section title="MARKET & PORTFOLIO" items={market} />
        <Section title="IPO STATUS & RESULTS" items={ipo} />
        <Section title="RESOURCES & TOOLS" items={resources} />

        <Text style={styles.version}>Version : 3.1.0 (310)</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: rs(12),
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    borderWidth: 2,
    borderColor: colors.accentGreen,
    backgroundColor: colors.primarySoft,
    borderRadius: rs(14),
    paddingVertical: rs(12),
    paddingHorizontal: rs(14),
    marginBottom: rs(8),
  },
  brandIcon: {
    width: rs(42),
    height: rs(42),
    borderRadius: rs(10),
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ipoTag: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    fontSize: rs(7),
    fontWeight: '800',
    color: '#42A5F5',
  },
  brandText: {
    color: colors.text,
    fontSize: rs(16),
    fontWeight: '700',
  },
  section: {
    marginTop: rs(10),
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    marginVertical: rs(10),
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  sectionTitle: {
    color: colors.textDim,
    fontSize: rs(10),
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: rs(12),
    paddingVertical: rs(12),
    paddingHorizontal: rs(12),
    marginBottom: rs(8),
    gap: rs(10),
  },
  itemPressed: { opacity: 0.85 },
  itemIcon: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(8),
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    flex: 1,
    color: colors.text,
    fontSize: rs(14),
    fontWeight: '500',
  },
  version: {
    textAlign: 'center',
    color: colors.textDim,
    fontSize: rs(12),
    marginTop: rs(16),
  },
});
