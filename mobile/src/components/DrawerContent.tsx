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
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import { SoftBadge } from './SoftBadge';
import type { DrawerParamList } from '../navigation/types';

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
          style={styles.item}
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
  const nav = props.navigation as unknown as DrawerNavigationProp<DrawerParamList>;

  const goCheck = () => {
    nav.navigate('RootStack', {
      screen: 'MainTabs',
      params: { screen: 'Check' },
    });
    nav.closeDrawer();
  };

  const market: Item[] = [
    {
      label: 'NEPSE Calendar',
      icon: <Ionicons name="calendar-outline" size={rs(18)} color="#66BB6A" />,
    },
    {
      label: 'Live NEPSE',
      icon: <Feather name="trending-up" size={rs(18)} color="#42A5F5" />,
    },
    {
      label: 'Investment Summary',
      icon: <MaterialCommunityIcons name="currency-usd" size={rs(18)} color="#66BB6A" />,
      badge: 'UPDATED',
    },
    {
      label: 'Share Portfolio',
      icon: <MaterialCommunityIcons name="chart-pie" size={rs(18)} color="#EC407A" />,
      badge: 'NEW',
    },
    {
      label: 'Bulk Portfolio',
      icon: <Ionicons name="folder-outline" size={rs(18)} color="#BDBDBD" />,
      badge: 'UPDATED',
    },
    {
      label: 'User Portfolio',
      icon: <Ionicons name="person-circle-outline" size={rs(18)} color="#FFCA28" />,
    },
    {
      label: 'Watchlist',
      icon: <Ionicons name="eye-outline" size={rs(18)} color="#42A5F5" />,
    },
  ];

  const ipo: Item[] = [
    {
      label: 'Bulk IPO Result',
      icon: <Ionicons name="checkmark-circle" size={rs(18)} color="#66BB6A" />,
      onPress: goCheck,
    },
    {
      label: 'Upcoming Issues',
      icon: <Ionicons name="calendar" size={rs(18)} color="#F48FB1" />,
    },
    {
      label: 'Bulk IPO Status/Result',
      icon: <MaterialCommunityIcons name="clipboard-check-outline" size={rs(18)} color="#80CBC4" />,
      onPress: goCheck,
    },
    {
      label: 'Current IPO Status',
      icon: <Ionicons name="search" size={rs(18)} color="#90CAF9" />,
      badge: 'UPDATED',
      onPress: () => {
        nav.navigate('RootStack', { screen: 'CurrentIpoStatus' });
        nav.closeDrawer();
      },
    },
    {
      label: 'Current Issues',
      icon: <MaterialCommunityIcons name="clipboard-text-clock" size={rs(18)} color="#CE93D8" />,
      badge: 'NEW',
    },
    {
      label: 'All IPO Status',
      icon: <MaterialCommunityIcons name="checkbox-multiple-marked" size={rs(18)} color="#A5D6A7" />,
      onPress: goCheck,
    },
    {
      label: 'IPO Result',
      icon: <MaterialCommunityIcons name="file-document-check-outline" size={rs(18)} color="#80CBC4" />,
      onPress: goCheck,
    },
  ];

  const resources: Item[] = [
    {
      label: 'Financial News',
      icon: <Ionicons name="newspaper-outline" size={rs(18)} color="#90A4AE" />,
    },
    {
      label: 'Share Calculator',
      icon: <Ionicons name="calculator-outline" size={rs(18)} color="#FFB74D" />,
    },
    {
      label: 'TMS Brokers',
      icon: <MaterialCommunityIcons name="handshake-outline" size={rs(18)} color="#81D4FA" />,
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + rs(8) }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(24) }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.brand}
          onPress={() => {
            nav.navigate('RootStack', {
              screen: 'MainTabs',
              params: { screen: 'Apply' },
            });
            nav.closeDrawer();
          }}
        >
          <View style={styles.brandIcon}>
            <MaterialCommunityIcons name="chart-bar" size={rs(22)} color="#66BB6A" />
            <Text style={styles.ipoTag}>IPO</Text>
          </View>
          <Text style={styles.brandText}>IPO Bulk Apply</Text>
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
