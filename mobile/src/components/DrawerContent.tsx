import React, { useMemo } from 'react';
import {
  ImageBackground,
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
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
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
  accent: string;
  icon: React.ReactNode;
  badge?: 'NEW' | 'UPDATED';
  onPress?: () => void;
};

type Styles = ReturnType<typeof makeStyles>;

function Section({
  title,
  items,
  styles,
  isDark,
}: {
  title: string;
  items: Item[];
  styles: Styles;
  isDark: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.line} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.line} />
      </View>
      {items.map((item) => {
        const rowColors: [string, string, string] = isDark
          ? ['rgba(255,255,255,0.16)', `${item.accent}40`, 'rgba(30,30,30,0.72)']
          : ['rgba(255,255,255,1)', `${item.accent}55`, `${item.accent}22`];
        return (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [styles.itemWrap, pressed && styles.itemPressed]}
          >
            <LinearGradient
              colors={rowColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.item}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.05)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.itemShine}
                pointerEvents="none"
              />
              <View style={styles.itemIcon}>{item.icon}</View>
              <Text style={styles.itemLabel} numberOfLines={1}>
                {item.label}
              </Text>
              {item.badge ? <SoftBadge label={item.badge} /> : null}
              <Ionicons
                name="chevron-forward"
                size={rs(15)}
                color={item.accent}
              />
            </LinearGradient>
          </Pressable>
        );
      })}
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
        width: rs(38),
        height: rs(38),
        borderRadius: rs(12),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.65)',
      }}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.05)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function DrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { colors: theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme, isDark), [theme, isDark]);
  const nav = props.navigation as unknown as DrawerNavigationProp<DrawerParamList>;
  const iconSize = rs(19);
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
      accent: ink('#2E7D32', '#81C784'),
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
      accent: ink('#1565C0', '#64B5F6'),
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
      accent: ink('#EF6C00', '#FFD54F'),
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
      accent: ink('#C2185B', '#F48FB1'),
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
      accent: ink('#1565C0', '#90CAF9'),
      icon: (
        <IconWell bg={well('#D6E8FA', '#1A3A55')}>
          <Ionicons
            name="folder-outline"
            size={iconSize}
            color={ink('#1565C0', '#90CAF9')}
          />
        </IconWell>
      ),
      badge: 'UPDATED',
      onPress: () => goStack('BulkPortfolio'),
    },
    {
      label: 'My Portfolio',
      accent: ink('#EF6C00', '#FFD54F'),
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
      accent: ink('#00838F', '#4DD0E1'),
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
      accent: ink('#2E7D32', '#81C784'),
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
      accent: ink('#3949AB', '#9FA8DA'),
      icon: (
        <IconWell bg={well('#E8EAF6', '#1A237E')}>
          <MaterialCommunityIcons
            name="clipboard-check-outline"
            size={iconSize}
            color={ink('#3949AB', '#9FA8DA')}
          />
        </IconWell>
      ),
      onPress: () => goStack('IpoBulkStatus'),
    },
    {
      label: 'Current IPO Status',
      accent: ink('#1565C0', '#90CAF9'),
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
      accent: ink('#00838F', '#4DD0E1'),
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
      accent: ink('#2E7D32', '#A5D6A7'),
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
      accent: ink('#EF6C00', '#FFD54F'),
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
      accent: ink('#C2185B', '#F48FB1'),
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
      accent: ink('#7B1FA2', '#CE93D8'),
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
      accent: ink('#455A64', '#CFD8DC'),
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
      accent: ink('#EF6C00', '#FFB74D'),
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
      accent: ink('#0277BD', '#81D4FA'),
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
    <LinearGradient
      colors={
        isDark
          ? [theme.bg, '#1A2A32']
          : ['#CFFAFE', '#E0F2FE', '#F0FDFA']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.root, { paddingTop: insets.top + rs(8) }]}
    >
      <Pressable onPress={() => goTab('Apply')} style={styles.brandWrap}>
        <ImageBackground
          source={require('../../assets/drawer-header-banner.png')}
          style={styles.brand}
          imageStyle={styles.brandImage}
          resizeMode="cover"
        >
          {isDark ? <View style={styles.brandDim} /> : null}
        </ImageBackground>
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(20) }}
        showsVerticalScrollIndicator={false}
      >
        <Section title="MARKET & PORTFOLIO" items={market} styles={styles} isDark={isDark} />
        <Section title="IPO STATUS & RESULTS" items={ipo} styles={styles} isDark={isDark} />
        <Section title="RESOURCES & TOOLS" items={resources} styles={styles} isDark={isDark} />

        <Text style={styles.version}>
          Version : {versionName}
          {versionCode ? ` (${versionCode})` : ''}
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

function makeStyles(colors: ThemeColors, isDark: boolean) {
  const lineBg = isDark ? '#3A3A3A' : '#A5D8F0';

  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: rs(14),
    },
    scroll: {
      flex: 1,
    },
    brandWrap: {
      marginBottom: rs(10),
      borderRadius: rs(20),
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.8)',
      shadowColor: '#67E8F9',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 6,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      minHeight: rs(76),
      paddingVertical: rs(12),
      paddingHorizontal: rs(12),
    },
    brandImage: {
      borderRadius: rs(18),
    },
    brandDim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.22)',
    },
    brandIcon: {
      width: rs(48),
      height: rs(48),
      borderRadius: rs(12),
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: rs(3),
    },
    brandText: {
      flex: 1,
      color: isDark ? '#F8FAFC' : '#111111',
      fontSize: rs(16),
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    section: {
      marginTop: rs(8),
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginTop: rs(8),
      marginBottom: rs(10),
    },
    line: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: lineBg,
    },
    sectionTitle: {
      color: isDark ? '#90CAF9' : '#5B8DEF',
      fontSize: rs(10),
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    itemWrap: {
      marginBottom: rs(9),
      borderRadius: rs(18),
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,1)',
      shadowColor: isDark ? '#000' : '#67E8F9',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.25 : 0.45,
      shadowRadius: 8,
      elevation: 4,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(11),
      paddingHorizontal: rs(10),
      gap: rs(10),
      minHeight: rs(54),
    },
    itemShine: {
      ...StyleSheet.absoluteFill,
    },
    itemPressed: { opacity: 0.88 },
    itemIcon: {},
    itemLabel: {
      flex: 1,
      color: isDark ? colors.text : '#111111',
      fontSize: rs(14),
      fontWeight: '700',
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
