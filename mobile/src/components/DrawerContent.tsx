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
import Constants from 'expo-constants';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import { SoftBadge } from './SoftBadge';
import { BrandLogo } from './BrandLogo';
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
        width: rs(30),
        height: rs(30),
        borderRadius: rs(8),
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
  const iconSize = rs(17);
  const versionName =
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    '3.4.13';
  const versionCode =
    Constants.expoConfig?.android?.versionCode ??
    Constants.nativeBuildVersion ??
    '';

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
  const ink = (light: string, dark: string) => (isDark ? dark : light);

  const market: Item[] = [
    {
      label: 'NEPSE Calendar',
      icon: (
        <IconWell bg={well('#D8EDD9', '#1E3D28')}>
          <Ionicons
            name="calendar-outline"
            size={iconSize}
            color={ink('#2E7D32', '#81C784')}
          />
        </IconWell>
      ),
      onPress: () => goStack('NepseCalendar'),
    },
    {
      label: 'Live NEPSE',
      icon: (
        <IconWell bg={well('#D6E8FA', '#1A3A55')}>
          <Feather
            name="trending-up"
            size={iconSize}
            color={ink('#1565C0', '#64B5F6')}
          />
        </IconWell>
      ),
      onPress: () => goStack('NepseData'),
    },
    {
      label: 'Investment Summary',
      icon: (
        <IconWell bg={well('#FFF0C2', '#4A3D14')}>
          <MaterialCommunityIcons
            name="currency-usd"
            size={iconSize}
            color={ink('#EF6C00', '#FFD54F')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('InvestmentSummary'),
    },
    {
      label: 'Share Portfolio',
      icon: (
        <IconWell bg={well('#FAD4E4', '#4A1E38')}>
          <MaterialCommunityIcons
            name="chart-pie"
            size={iconSize}
            color={ink('#C2185B', '#F48FB1')}
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('Portfolio'),
    },
    {
      label: 'Bulk Portfolio Check',
      icon: (
        <IconWell bg={well('#E3E8EA', '#2A3238')}>
          <Ionicons
            name="folder-outline"
            size={iconSize}
            color={ink('#455A64', '#B0BEC5')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('BulkPortfolio'),
    },
    {
      label: 'My Portfolio',
      icon: (
        <IconWell bg={well('#FFF6C7', '#4A4014')}>
          <Ionicons
            name="person-circle-outline"
            size={iconSize}
            color={ink('#F9A825', '#FFD54F')}
          />
        </IconWell>
      ),
      onPress: () => goStack('UserPortfolio'),
    },
    {
      label: 'Watchlist',
      icon: (
        <IconWell bg={well('#D1EFFA', '#163A4A')}>
          <Ionicons
            name="eye-outline"
            size={iconSize}
            color={ink('#0277BD', '#4FC3F7')}
          />
        </IconWell>
      ),
      onPress: () => goStack('Watchlist'),
    },
  ];

  const ipo: Item[] = [
    {
      label: 'IPO Result',
      icon: (
        <IconWell bg={well('#D8EDD9', '#1E3D28')}>
          <Ionicons
            name="checkmark-circle"
            size={iconSize}
            color={ink('#2E7D32', '#81C784')}
          />
        </IconWell>
      ),
      onPress: () => goStack('PublicIpoResult'),
    },
    {
      label: 'Bulk IPO Status/Result',
      icon: (
        <IconWell bg={well('#CFECE8', '#163D38')}>
          <MaterialCommunityIcons
            name="clipboard-check-outline"
            size={iconSize}
            color={ink('#00897B', '#4DB6AC')}
          />
        </IconWell>
      ),
      onPress: () => goStack('IpoBulkStatus'),
    },
    {
      label: 'Current IPO Status',
      icon: (
        <IconWell bg={well('#D6E8FA', '#1A3A55')}>
          <Ionicons
            name="search"
            size={iconSize}
            color={ink('#1565C0', '#90CAF9')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('CurrentIpoStatus'),
    },
    {
      label: 'All IPO Status',
      icon: (
        <IconWell bg={well('#CFF3F7', '#163A44')}>
          <Ionicons
            name="list-outline"
            size={iconSize}
            color={ink('#00838F', '#4DD0E1')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('AllIpoStatus'),
    },
    {
      label: 'All IPO Statistics',
      icon: (
        <IconWell bg={well('#D8EDD9', '#1E3D28')}>
          <MaterialCommunityIcons
            name="chart-box-outline"
            size={iconSize}
            color={ink('#2E7D32', '#A5D6A7')}
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('AllIpoStatistics'),
    },
    {
      label: 'Calculate WACC',
      icon: (
        <IconWell bg={well('#FFF0C2', '#4A3D14')}>
          <MaterialCommunityIcons
            name="calculator-variant"
            size={iconSize}
            color={ink('#EF6C00', '#FFD54F')}
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('CalculateWacc'),
    },
    {
      label: 'Upcoming Issues',
      icon: (
        <IconWell bg={well('#FAD4E4', '#4A2440')}>
          <Ionicons
            name="calendar"
            size={iconSize}
            color={ink('#C2185B', '#F48FB1')}
          />
        </IconWell>
      ),
      onPress: () => goStack('IpoIssues', { mode: 'upcoming' }),
    },
    {
      label: 'Current Issues',
      icon: (
        <IconWell bg={well('#E8D4F2', '#3A2450')}>
          <MaterialCommunityIcons
            name="clipboard-text-clock"
            size={iconSize}
            color={ink('#7B1FA2', '#CE93D8')}
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('IpoIssues', { mode: 'current' }),
    },
  ];

  const resources: Item[] = [
    {
      label: 'Share News',
      icon: (
        <IconWell bg={well('#E3E8EA', '#2A3238')}>
          <Ionicons
            name="newspaper-outline"
            size={iconSize}
            color={ink('#37474F', '#CFD8DC')}
          />
        </IconWell>
      ),
      onPress: () => goStack('FinancialNews'),
    },
    {
      label: 'Share Calculator',
      icon: (
        <IconWell bg={well('#FFE8CC', '#4A3518')}>
          <Ionicons
            name="calculator-outline"
            size={iconSize}
            color={ink('#EF6C00', '#FFB74D')}
          />
        </IconWell>
      ),
      onPress: () => goStack('Calculator'),
    },
    {
      label: 'TMS Brokers',
      icon: (
        <IconWell bg={well('#D1EFFA', '#163A4A')}>
          <MaterialCommunityIcons
            name="handshake-outline"
            size={iconSize}
            color={ink('#0277BD', '#81D4FA')}
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
        { paddingTop: insets.top + rs(8) },
      ]}
    >
      <Pressable style={styles.brand} onPress={() => goTab('Apply')}>
        <View style={styles.brandIcon}>
          <BrandLogo variant="mark" height={rs(32)} />
        </View>
        <Text style={styles.brandText}>NEPSE GHAR</Text>
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(20) }}
        showsVerticalScrollIndicator={false}
      >
        <Section title="MARKET & PORTFOLIO" items={market} styles={styles} />
        <Section title="IPO STATUS & RESULTS" items={ipo} styles={styles} />
        <Section title="RESOURCES & TOOLS" items={resources} styles={styles} />

        <Text style={styles.version}>
          Version : {versionName}
          {versionCode ? ` (${versionCode})` : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ThemeColors, isDark: boolean) {
  const panelBg = isDark ? colors.bg : '#F5F6F2';
  const rowBg = isDark ? '#2A2A2A' : '#F0F3EE';
  const brandBg = isDark ? '#252724' : '#FAFCF9';
  const brandBorder = isDark ? '#434540' : '#8BC4A0';
  const lineBg = isDark ? '#3A3A3A' : '#C8D0C4';

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: panelBg,
      paddingHorizontal: rs(12),
    },
    scroll: {
      flex: 1,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      borderWidth: 1,
      borderColor: brandBorder,
      backgroundColor: brandBg,
      borderRadius: rs(14),
      paddingVertical: rs(10),
      paddingHorizontal: rs(12),
      marginBottom: rs(6),
    },
    brandIcon: {
      width: rs(42),
      height: rs(42),
      borderRadius: rs(10),
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: rs(4),
    },
    brandText: {
      color: isDark ? colors.text : '#111111',
      fontSize: rs(16),
      fontWeight: '800',
      letterSpacing: 0.2,
      flexShrink: 1,
    },
    section: {
      marginTop: rs(8),
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginTop: rs(6),
      marginBottom: rs(8),
    },
    line: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: lineBg,
    },
    sectionTitle: {
      color: isDark ? '#9E9E9E' : '#7A8574',
      fontSize: rs(10),
      fontWeight: '700',
      letterSpacing: 0.7,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: rowBg,
      borderRadius: rs(12),
      paddingVertical: rs(8),
      paddingHorizontal: rs(8),
      marginBottom: rs(6),
      gap: rs(8),
    },
    itemPressed: { opacity: 0.88 },
    itemIcon: {},
    itemLabel: {
      flex: 1,
      color: isDark ? colors.text : '#111111',
      fontSize: rs(13),
      fontWeight: '600',
    },
    version: {
      textAlign: 'center',
      color: isDark ? '#808080' : '#8A948A',
      fontSize: rs(12),
      marginTop: rs(14),
      fontWeight: '500',
    },
  });
}
