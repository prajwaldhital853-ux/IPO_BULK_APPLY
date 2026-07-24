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
  bordered,
}: {
  children: React.ReactNode;
  bg: string;
  bordered?: boolean;
}) {
  return (
    <View
      style={{
        width: rs(42),
        height: rs(42),
        borderRadius: rs(11),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: bordered ? 1 : 0,
        borderColor: 'rgba(0,0,0,0.12)',
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
  const iconSize = rs(24);

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

  // Light mode: richer wells + darker icon ink. Dark mode: keep bright glyphs.
  const well = (light: string, dark: string) => (isDark ? dark : light);
  const ink = (light: string, dark: string) => (isDark ? dark : light);
  const wellBorder = !isDark;

  const market: Item[] = [
    {
      label: 'NEPSE Calendar',
      icon: (
        <IconWell bg={well('#C8E6C9', '#1E3D28')} bordered={wellBorder}>
          <Ionicons
            name="calendar-outline"
            size={iconSize}
            color={ink('#1B5E20', '#81C784')}
          />
        </IconWell>
      ),
      onPress: () => goStack('NepseCalendar'),
    },
    {
      label: 'Live NEPSE',
      icon: (
        <IconWell bg={well('#BBDEFB', '#1A3A55')} bordered={wellBorder}>
          <Feather
            name="trending-up"
            size={iconSize}
            color={ink('#0D47A1', '#64B5F6')}
          />
        </IconWell>
      ),
      onPress: () => goStack('NepseData'),
    },
    {
      label: 'Investment Summary',
      icon: (
        <IconWell bg={well('#FFE082', '#4A3D14')} bordered={wellBorder}>
          <MaterialCommunityIcons
            name="currency-usd"
            size={iconSize}
            color={ink('#E65100', '#FFD54F')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('InvestmentSummary'),
    },
    {
      label: 'Share Portfolio',
      icon: (
        <IconWell bg={well('#F8BBD0', '#4A1E38')} bordered={wellBorder}>
          <MaterialCommunityIcons
            name="chart-pie"
            size={iconSize}
            color={ink('#880E4F', '#F48FB1')}
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('Portfolio'),
    },
    {
      label: 'Bulk Portfolio Check',
      icon: (
        <IconWell bg={well('#CFD8DC', '#2A3238')} bordered={wellBorder}>
          <Ionicons
            name="folder-outline"
            size={iconSize}
            color={ink('#37474F', '#B0BEC5')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('BulkPortfolio'),
    },
    {
      label: 'My Portfolio',
      icon: (
        <IconWell bg={well('#FFF59D', '#4A4014')} bordered={wellBorder}>
          <Ionicons
            name="person-circle-outline"
            size={iconSize}
            color={ink('#F57F17', '#FFD54F')}
          />
        </IconWell>
      ),
      onPress: () => goStack('UserPortfolio'),
    },
    {
      label: 'Watchlist',
      icon: (
        <IconWell bg={well('#B3E5FC', '#163A4A')} bordered={wellBorder}>
          <Ionicons
            name="eye-outline"
            size={iconSize}
            color={ink('#01579B', '#4FC3F7')}
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
        <IconWell bg={well('#C8E6C9', '#1E3D28')} bordered={wellBorder}>
          <Ionicons
            name="checkmark-circle"
            size={iconSize}
            color={ink('#1B5E20', '#81C784')}
          />
        </IconWell>
      ),
      onPress: () => goStack('PublicIpoResult'),
    },
    {
      label: 'Bulk IPO Status/Result',
      icon: (
        <IconWell bg={well('#B2DFDB', '#163D38')} bordered={wellBorder}>
          <MaterialCommunityIcons
            name="clipboard-check-outline"
            size={iconSize}
            color={ink('#00695C', '#4DB6AC')}
          />
        </IconWell>
      ),
      onPress: () => goStack('IpoBulkStatus'),
    },
    {
      label: 'Current IPO Status',
      icon: (
        <IconWell bg={well('#BBDEFB', '#1A3A55')} bordered={wellBorder}>
          <Ionicons
            name="search"
            size={iconSize}
            color={ink('#0D47A1', '#90CAF9')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('CurrentIpoStatus'),
    },
    {
      label: 'All IPO Status',
      icon: (
        <IconWell bg={well('#B2EBF2', '#163A44')} bordered={wellBorder}>
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
        <IconWell bg={well('#C8E6C9', '#1E3D28')} bordered={wellBorder}>
          <MaterialCommunityIcons
            name="chart-box-outline"
            size={iconSize}
            color={ink('#1B5E20', '#A5D6A7')}
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('AllIpoStatistics'),
    },
    {
      label: 'Calculate WACC',
      icon: (
        <IconWell bg={well('#FFE082', '#4A3D14')} bordered={wellBorder}>
          <MaterialCommunityIcons
            name="calculator-variant"
            size={iconSize}
            color={ink('#E65100', '#FFD54F')}
          />
        </IconWell>
      ),
      badge: 'NEW',
      onPress: () => goStack('CalculateWacc'),
    },
    {
      label: 'Upcoming Issues',
      icon: (
        <IconWell bg={well('#F8BBD0', '#4A2440')} bordered={wellBorder}>
          <Ionicons
            name="calendar"
            size={iconSize}
            color={ink('#AD1457', '#F48FB1')}
          />
        </IconWell>
      ),
      onPress: () => goStack('IpoIssues', { mode: 'upcoming' }),
    },
    {
      label: 'Current Issues',
      icon: (
        <IconWell bg={well('#E1BEE7', '#3A2450')} bordered={wellBorder}>
          <MaterialCommunityIcons
            name="clipboard-text-clock"
            size={iconSize}
            color={ink('#6A1B9A', '#CE93D8')}
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
        <IconWell bg={well('#CFD8DC', '#2A3238')} bordered={wellBorder}>
          <Ionicons
            name="newspaper-outline"
            size={iconSize}
            color={ink('#263238', '#CFD8DC')}
          />
        </IconWell>
      ),
      onPress: () => goStack('FinancialNews'),
    },
    {
      label: 'Share Calculator',
      icon: (
        <IconWell bg={well('#FFE0B2', '#4A3518')} bordered={wellBorder}>
          <Ionicons
            name="calculator-outline"
            size={iconSize}
            color={ink('#E65100', '#FFB74D')}
          />
        </IconWell>
      ),
      onPress: () => goStack('Calculator'),
    },
    {
      label: 'TMS Brokers',
      icon: (
        <IconWell bg={well('#B3E5FC', '#163A4A')} bordered={wellBorder}>
          <MaterialCommunityIcons
            name="handshake-outline"
            size={iconSize}
            color={ink('#01579B', '#81D4FA')}
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
            <BrandLogo variant="mark" height={rs(40)} />
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
      backgroundColor: isDark ? '#252724' : '#C5D4B0',
      borderRadius: rs(16),
      paddingVertical: rs(14),
      paddingHorizontal: rs(14),
      marginBottom: rs(10),
    },
    brandIcon: {
      width: rs(48),
      height: rs(48),
      borderRadius: rs(12),
      backgroundColor: isDark ? '#1A1A1A' : '#E4EAD9',
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
      color: isDark ? colors.text : '#0D0D0D',
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
      backgroundColor: isDark ? '#3A3A3A' : '#9AAB8A',
    },
    sectionTitle: {
      color: isDark ? '#A0A0A0' : '#1B2A14',
      fontSize: rs(11),
      fontWeight: '800',
      letterSpacing: 0.9,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#262626' : '#D5DEC8',
      borderRadius: rs(12),
      paddingVertical: rs(14),
      paddingHorizontal: rs(12),
      marginBottom: rs(10),
      gap: rs(12),
      borderWidth: 1,
      borderColor: isDark ? '#262626' : '#A8B89A',
    },
    itemPressed: { opacity: 0.88 },
    itemIcon: {
      // IconWell provides its own size; keep alignment box
    },
    itemLabel: {
      flex: 1,
      color: isDark ? colors.text : '#0A0A0A',
      fontSize: rs(15),
      fontWeight: '700',
    },
    version: {
      textAlign: 'center',
      color: isDark ? '#808080' : '#3D4A38',
      fontSize: rs(13),
      marginTop: rs(18),
      fontWeight: '600',
    },
  });
}
