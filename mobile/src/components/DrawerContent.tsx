import React, { useMemo } from 'react';
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
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import { SoftBadge } from './SoftBadge';
import type { DrawerParamList, RootStackParamList } from '../navigation/types';

type Item = {
  label: string;
  icon: React.ReactNode;
  badge?: 'NEW' | 'UPDATED';
  onPress?: () => void;
};

type Styles = ReturnType<typeof makeStyles>;

function Section({
  title,
  items,
  styles,
}: {
  title: string;
  items: Item[];
  styles: Styles;
}) {
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

function IconWell({
  children,
  bg,
}: {
  children: React.ReactNode;
  bg: string;
}) {
  return (
    <View
      style={{
        width: rs(40),
        height: rs(40),
        borderRadius: rs(11),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

export function DrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { colors: theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme, isDark), [theme, isDark]);
  const nav = props.navigation as unknown as DrawerNavigationProp<DrawerParamList>;
  const iconSize = rs(22);

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

  const well = (light: string, dark: string) => (isDark ? dark : light);

  const market: Item[] = [
    {
      label: 'NEPSE Calendar',
      icon: (
        <IconWell bg={well('#E8F5E9', '#1E3D28')}>
          <Ionicons name="calendar-outline" size={iconSize} color="#66BB6A" />
        </IconWell>
      ),
      onPress: () => goStack('NepseCalendar'),
    },
    {
      label: 'Live NEPSE',
      icon: (
        <IconWell bg={well('#E3F2FD', '#1A3A55')}>
          <Feather name="trending-up" size={iconSize} color="#42A5F5" />
        </IconWell>
      ),
      onPress: () => goStack('NepseData'),
    },
    {
      label: 'Investment Summary',
      icon: (
        <IconWell bg={well('#FFF8E1', '#4A3D14')}>
          <MaterialCommunityIcons
            name="currency-usd"
            size={iconSize}
            color="#F9A825"
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('InvestmentSummary'),
    },
    {
      label: 'Share Portfolio',
      icon: (
        <IconWell bg={well('#FCE4EC', '#4A1E38')}>
          <MaterialCommunityIcons
            name="chart-pie"
            size={iconSize}
            color="#EC407A"
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('Portfolio'),
    },
    {
      label: 'Bulk Portfolio Check',
      icon: (
        <IconWell bg={well('#ECEFF1', '#2A3238')}>
          <Ionicons
            name="folder-outline"
            size={iconSize}
            color={isDark ? '#B0BEC5' : '#78909C'}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('BulkPortfolio'),
    },
    {
      label: 'My Portfolio',
      icon: (
        <IconWell bg={well('#FFFDE7', '#4A4014')}>
          <Ionicons name="person-circle-outline" size={iconSize} color="#FFCA28" />
        </IconWell>
      ),
      onPress: () => goStack('UserPortfolio'),
    },
    {
      label: 'Watchlist',
      icon: (
        <IconWell bg={well('#E1F5FE', '#163A4A')}>
          <Ionicons name="eye-outline" size={iconSize} color="#29B6F6" />
        </IconWell>
      ),
      onPress: () => goStack('Watchlist'),
    },
  ];

  const ipo: Item[] = [
    {
      label: 'Bulk IPO Result',
      icon: (
        <IconWell bg={well('#E8F5E9', '#1E3D28')}>
          <Ionicons name="checkmark-circle" size={iconSize} color="#66BB6A" />
        </IconWell>
      ),
      onPress: () => goStack('PublicIpoResult'),
    },
    {
      label: 'Upcoming Issues',
      icon: (
        <IconWell bg={well('#FCE4EC', '#4A2440')}>
          <Ionicons name="calendar" size={iconSize} color="#F48FB1" />
        </IconWell>
      ),
      onPress: () => goStack('IpoIssues', { mode: 'upcoming' }),
    },
    {
      label: 'Bulk IPO Status/Result',
      icon: (
        <IconWell bg={well('#E0F2F1', '#163D38')}>
          <MaterialCommunityIcons
            name="clipboard-check-outline"
            size={iconSize}
            color="#4DB6AC"
          />
        </IconWell>
      ),
      onPress: () => goStack('IpoBulkStatus'),
    },
    {
      label: 'Current IPO Status',
      icon: (
        <IconWell bg={well('#E3F2FD', '#1A3A55')}>
          <Ionicons name="search" size={iconSize} color="#90CAF9" />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('CurrentIpoStatus'),
    },
    {
      label: 'Current Issues',
      icon: (
        <IconWell bg={well('#F3E5F5', '#3A2450')}>
          <MaterialCommunityIcons
            name="clipboard-text-clock"
            size={iconSize}
            color="#CE93D8"
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('IpoIssues', { mode: 'current' }),
    },
    {
      label: 'All IPO Statistics',
      icon: (
        <IconWell bg={well('#E8F5E9', '#1E3D28')}>
          <MaterialCommunityIcons
            name="chart-box-outline"
            size={iconSize}
            color="#A5D6A7"
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('AllIpoStatus'),
    },
  ];

  const resources: Item[] = [
    {
      label: 'Share News',
      icon: (
        <IconWell bg={well('#ECEFF1', '#2A3238')}>
          <Ionicons
            name="newspaper-outline"
            size={iconSize}
            color={isDark ? '#CFD8DC' : '#90A4AE'}
          />
        </IconWell>
      ),
      onPress: () => goStack('FinancialNews'),
    },
    {
      label: 'Share Calculator',
      icon: (
        <IconWell bg={well('#FFF3E0', '#4A3518')}>
          <Ionicons name="calculator-outline" size={iconSize} color="#FFB74D" />
        </IconWell>
      ),
      onPress: () => goStack('Calculator'),
    },
    {
      label: 'TMS Brokers',
      icon: (
        <IconWell bg={well('#E1F5FE', '#163A4A')}>
          <MaterialCommunityIcons
            name="handshake-outline"
            size={iconSize}
            color="#81D4FA"
          />
        </IconWell>
      ),
      onPress: () => goStack('TmsBrokers'),
    },
  ];

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + rs(10), backgroundColor: theme.bg },
      ]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(28) }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.brand} onPress={() => goTab('Apply')}>
          <View style={styles.brandIcon}>
            <MaterialCommunityIcons
              name="chart-bar"
              size={rs(26)}
              color="#66BB6A"
            />
            <Text style={styles.ipoTag}>IPO</Text>
          </View>
          <Text style={styles.brandText}>NEPSE GHAR</Text>
        </Pressable>

        <Section title="MARKET & PORTFOLIO" items={market} styles={styles} />
        <Section title="IPO STATUS & RESULTS" items={ipo} styles={styles} />
        <Section title="RESOURCES & TOOLS" items={resources} styles={styles} />

        <Text style={styles.version}>Version : 3.2.9 (34)</Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: rs(14),
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(14),
      borderWidth: isDark ? 1 : 2,
      borderColor: isDark ? '#434540' : colors.accentGreen,
      backgroundColor: isDark ? '#252724' : colors.primarySoft,
      borderRadius: rs(16),
      paddingVertical: rs(14),
      paddingHorizontal: rs(14),
      marginBottom: rs(10),
    },
    brandIcon: {
      width: rs(48),
      height: rs(48),
      borderRadius: rs(12),
      backgroundColor: isDark ? '#1A1A1A' : colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ipoTag: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      fontSize: rs(8),
      fontWeight: '800',
      color: '#42A5F5',
    },
    brandText: {
      color: colors.text,
      fontSize: rs(18),
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    section: {
      marginTop: rs(12),
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginVertical: rs(12),
    },
    line: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? '#3A3A3A' : colors.border,
    },
    sectionTitle: {
      color: isDark ? '#A0A0A0' : colors.textDim,
      fontSize: rs(11),
      fontWeight: '800',
      letterSpacing: 0.9,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#262626' : colors.surface,
      borderRadius: rs(12),
      paddingVertical: rs(14),
      paddingHorizontal: rs(12),
      marginBottom: rs(10),
      gap: rs(12),
      borderWidth: 1,
      borderColor: isDark ? '#262626' : colors.borderMuted,
    },
    itemPressed: { opacity: 0.88 },
    itemIcon: {
      // IconWell provides its own size; keep alignment box
    },
    itemLabel: {
      flex: 1,
      color: colors.text,
      fontSize: rs(15),
      fontWeight: '600',
    },
    version: {
      textAlign: 'center',
      color: isDark ? '#808080' : colors.textDim,
      fontSize: rs(13),
      marginTop: rs(18),
      fontWeight: '600',
    },
  });
}
