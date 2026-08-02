import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import { SoftBadge } from '../components/SoftBadge';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import type { RootStackParamList } from '../navigation/types';
import type { PremiumScreenerKind } from '../services/nepse/premiumScreeners';
import type { PremiumToolKind } from '../services/nepse/premiumServices';
import type { ExtraToolKind } from '../services/nepse/extraData';
import { prefetchHotPremiumTools } from '../services/nepse/prefetchServices';
import { pausePrefetch } from '../services/nepse/prefetchGate';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';

type Badge = 'NEW' | 'UPDATED';
type ServiceItem = {
  id: string;
  label: string;
  badge?: Badge;
  iconName: string;
  iconSet: 'ion' | 'mci' | 'feather';
  accent: string;
  route?: keyof RootStackParamList | 'ApplyTab' | 'CheckTab' | 'HomeTab' | 'IpoIssuesCurrent' | 'IpoIssuesUpcoming';
  stockKind?: 'large-caps' | 'commercial-leaders' | 'trending' | 'high-dividend';
  premiumKind?: PremiumScreenerKind;
  premiumTool?: PremiumToolKind;
  extraKind?: ExtraToolKind;
};

type Section = {
  id: string;
  title: string;
  variant: 'free' | 'mero' | 'premium' | 'extra';
  items: ServiceItem[];
};

const GRID_COLS = 4;
/** Shared grid spacing — same for Free, MeroShare, Premium, Extra. */
const H_PAD = rs(12);
const GAP = rs(10);
/** Reference SS tile proportions — nearly square, icon ~44px well. */
const TILE_ICON = rs(44);
const TILE_LABEL_LINE_H = rs(13);
const TILE_LABEL_LINES = 2;
const TILE_LABEL_BAND = TILE_LABEL_LINE_H * TILE_LABEL_LINES + rs(2);

type ServiceGridLayout = {
  hPad: number;
  gap: number;
  cols: number;
  tileW: number;
  tileH: number;
};

/** Free Services SS grid — shared by every section (MeroShare, Premium, Extra). */
function computeServiceGridLayout(screenW: number): ServiceGridLayout {
  const cols = GRID_COLS;
  const tileW = Math.floor((screenW - H_PAD * 2 - GAP * (cols - 1)) / cols);
  // Reference: cards are nearly square, only a little taller than wide.
  const chrome = rs(10) + TILE_ICON + rs(4) + rs(6);
  const tileH = chrome + TILE_LABEL_BAND;
  return { hPad: H_PAD, gap: GAP, cols, tileW, tileH };
}

/** Reference SS palette (IPO Bulk Apply Free Services). */
const SS = {
  cream: '#FDFBF2',
  card: '#FFFFFF',
  cardBorder: '#E8E8E8',
  featuredBorder: '#F2A154',
  headLine: '#9A9A9A',
  headLineHeight: 2,
  pillFreeBg: '#82C3FB',
  pillFreeText: '#2D2D2D',
  pillMeroBg: '#6BC4BE',
  pillPremiumStart: '#C8ED72',
  pillPremiumMid: '#7AE8B8',
  pillPremiumEnd: '#42CFF5',
  pillExtraBg: '#43A047',
  pillLabelInk: '#111111',
  iconInk: '#1A1A1A',
  labelInk: '#000000',
} as const;

/** SS icon wells — soft pastels on white cards. */
function ssPastel(hex: string): string {
  const map: Record<string, string> = {
    '#42A5F5': '#C5DCF5',
    '#66BB6A': '#C8E6C9',
    '#EF5350': '#FFCDD2',
    '#FFA726': '#FFE0B2',
    '#FFCA28': '#FFF9C4',
    '#90A4AE': '#ECEFF1',
    '#AB47BC': '#E1BEE7',
    '#29B6F6': '#B3E5FC',
    '#26A69A': '#B2DFDB',
    '#7E57C2': '#D1C4E9',
    '#FDD835': '#FFF9C4',
    '#F48FB1': '#F8BBD0',
    '#EC407A': '#F8BBD0',
    '#FF7043': '#FFCCBC',
    '#5C6BC0': '#C5CAE9',
    '#81C784': '#C8E6C9',
  };
  return map[hex] ?? '#ECEFF1';
}

/** Icon well — brighter wells in dark so white glyphs stay crisp (SS2 look). */
function pastel(hex: string, isDark: boolean) {
  if (isDark) {
    const map: Record<string, string> = {
      '#42A5F5': '#1E4A6E',
      '#66BB6A': '#1F4A2E',
      '#EF5350': '#5C2428',
      '#FFA726': '#5C3A12',
      '#FFCA28': '#5C4810',
      '#90A4AE': '#3A444C',
      '#AB47BC': '#4A2A62',
      '#29B6F6': '#1A4A5C',
      '#26A69A': '#1A4A44',
      '#7E57C2': '#3A2A62',
      '#FDD835': '#5C4E12',
      '#F48FB1': '#5C2A48',
      '#EC407A': '#5C1E40',
      '#FF7043': '#5C3018',
      '#5C6BC0': '#2A3262',
      '#81C784': '#1F4A2E',
    };
    return map[hex] ?? `${hex}66`;
  }
  const map: Record<string, string> = {
    '#42A5F5': '#90CAF9',
    '#66BB6A': '#A5D6A7',
    '#EF5350': '#EF9A9A',
    '#FFA726': '#FFCC80',
    '#FFCA28': '#FFE082',
    '#90A4AE': '#B0BEC5',
    '#AB47BC': '#CE93D8',
    '#29B6F6': '#81D4FA',
    '#26A69A': '#80CBC4',
    '#7E57C2': '#B39DDB',
    '#FDD835': '#FFE082',
    '#F48FB1': '#F48FB1',
    '#EC407A': '#F06292',
    '#FF7043': '#FF8A65',
    '#5C6BC0': '#9FA8DA',
    '#81C784': '#A5D6A7',
  };
  return map[hex] ?? `${hex}28`;
}

/** Darker icon ink so glyphs read bold on light pastels. */
function darkIcon(hex: string): string {
  const map: Record<string, string> = {
    '#42A5F5': '#0D47A1',
    '#66BB6A': '#1B5E20',
    '#EF5350': '#B71C1C',
    '#FFA726': '#E65100',
    '#FFCA28': '#F57F17',
    '#90A4AE': '#37474F',
    '#AB47BC': '#6A1B9A',
    '#29B6F6': '#01579B',
    '#26A69A': '#004D40',
    '#7E57C2': '#4527A0',
    '#FDD835': '#F57F17',
    '#F48FB1': '#AD1457',
    '#EC407A': '#880E4F',
    '#FF7043': '#BF360C',
    '#5C6BC0': '#1A237E',
    '#81C784': '#1B5E20',
  };
  return map[hex] ?? '#212121';
}

const FEATURED_IDS = new Set([
  'share-portfolio',
  'bank-tracker',
  'price-alert',
  'watchlist',
]);

function buildSections(): Section[] {
  return [
    {
      id: 'free',
      title: 'Free Services',
      variant: 'free',
      items: [
        { id: 'nepse-data', label: 'NEPSE Data', iconSet: 'feather', iconName: 'bar-chart-2', accent: '#42A5F5', route: 'NepseData' },
        { id: 'nepse-cal', label: 'NEPSE Calendar', iconSet: 'ion', iconName: 'calendar-outline', accent: '#66BB6A', route: 'NepseCalendar' },
        { id: 'share-portfolio', label: 'Share Portfolio', badge: 'NEW', iconSet: 'mci', iconName: 'chart-pie', accent: '#EF5350', route: 'Portfolio' },
        { id: 'bank-tracker', label: 'Bank Tracker', badge: 'NEW', iconSet: 'mci', iconName: 'wallet-outline', accent: '#26A69A', route: 'BankTracker' },
        { id: 'price-alert', label: 'Price Alert', badge: 'NEW', iconSet: 'ion', iconName: 'notifications-outline', accent: '#FFA726', route: 'PriceAlert' },
        { id: 'commercial', label: 'Commercial Leaders', iconSet: 'mci', iconName: 'office-building', accent: '#90A4AE', route: 'StockList', stockKind: 'commercial-leaders' },
        { id: 'large-caps', label: 'Large Caps', iconSet: 'mci', iconName: 'finance', accent: '#42A5F5', route: 'StockList', stockKind: 'large-caps' },
        { id: 'trending', label: 'Trending Stocks', iconSet: 'feather', iconName: 'trending-up', accent: '#66BB6A', route: 'StockList', stockKind: 'trending' },
        { id: 'high-div', label: 'High Dividend', iconSet: 'mci', iconName: 'cash-multiple', accent: '#42A5F5', route: 'StockList', stockKind: 'high-dividend' },
        { id: 'bulk-txn', label: 'Bulk Transactions', iconSet: 'mci', iconName: 'swap-horizontal', accent: '#FFA726', route: 'BulkTransactions' },
        { id: 'nepse-history', label: 'Nepse History', iconSet: 'mci', iconName: 'history', accent: '#90A4AE', route: 'NepseHistory' },
        { id: 'proposed-div', label: 'Proposed Dividend', iconSet: 'mci', iconName: 'cash', accent: '#66BB6A', route: 'ProposedDividend' },
        { id: 'charts', label: 'Charts', iconSet: 'mci', iconName: 'chart-areaspline', accent: '#AB47BC', route: 'Charts' },
        { id: 'announcements', label: 'Announcements', iconSet: 'ion', iconName: 'megaphone-outline', accent: '#FFCA28', route: 'Announcements' },
        { id: 'watchlist', label: 'Watchlist', badge: 'NEW', iconSet: 'ion', iconName: 'eye-outline', accent: '#29B6F6', route: 'Watchlist' },
        { id: 'user-portfolio', label: 'My Portfolio', iconSet: 'ion', iconName: 'person-circle-outline', accent: '#FFCA28', route: 'UserPortfolio' },
        { id: 'high-demand', label: 'High Demand', iconSet: 'mci', iconName: 'arrow-up-bold-circle-outline', accent: '#EF5350', route: 'HighDemand' },
      ],
    },
    {
      id: 'mero',
      title: 'MeroShare Services',
      variant: 'mero',
      items: [
        { id: 'bulk-portfolio', label: 'Bulk Portfolio', badge: 'UPDATED', iconSet: 'mci', iconName: 'wallet-outline', accent: '#42A5F5', route: 'BulkPortfolio' },
        { id: 'bulk-status', label: 'Bulk IPO Status', badge: 'UPDATED', iconSet: 'ion', iconName: 'checkbox-outline', accent: '#42A5F5', route: 'IpoBulkStatus' },
        { id: 'current-status', label: 'Current IPO Status', badge: 'UPDATED', iconSet: 'ion', iconName: 'search', accent: '#7E57C2', route: 'CurrentIpoStatus' },
        { id: 'all-ipo-status', label: 'All IPO Status', badge: 'UPDATED', iconSet: 'ion', iconName: 'list-outline', accent: '#26A69A', route: 'AllIpoStatus' },
        { id: 'all-ipo-stats', label: 'All IPO Statistics', badge: 'NEW', iconSet: 'mci', iconName: 'chart-box-outline', accent: '#66BB6A', route: 'AllIpoStatistics' },
        { id: 'calc-wacc', label: 'Calculate WACC', badge: 'NEW', iconSet: 'mci', iconName: 'calculator-variant', accent: '#FFA726', route: 'CalculateWacc' },
        { id: 'auto-ipo', label: 'Auto IPO', badge: 'NEW', iconSet: 'ion', iconName: 'flash', accent: '#FDD835', route: 'ApplyTab' },
        { id: 'current-issues', label: 'Current Issues', iconSet: 'mci', iconName: 'file-document-outline', accent: '#66BB6A', route: 'IpoIssuesCurrent' },
        { id: 'upcoming', label: 'Upcoming Issues', badge: 'UPDATED', iconSet: 'ion', iconName: 'calendar-outline', accent: '#F48FB1', route: 'IpoIssuesUpcoming' },
        { id: 'meroshare-web', label: 'MeroShare Web', iconSet: 'ion', iconName: 'globe-outline', accent: '#26A69A', route: 'MeroshareWeb' },
        { id: 'bulk-result', label: 'IPO Result', iconSet: 'ion', iconName: 'checkmark-done-circle-outline', accent: '#66BB6A', route: 'PublicIpoResult' },
        { id: 'change-password', label: 'Change Password', iconSet: 'ion', iconName: 'key-outline', accent: '#FF7043', route: 'ChangePassword' },
        { id: 'track-account-expiry', label: 'Track Account Expiry', badge: 'NEW', iconSet: 'ion', iconName: 'hourglass-outline', accent: '#EC407A', route: 'TrackAccountExpiry' },
      ],
    },
    {
      id: 'premium',
      title: 'Premium Services',
      variant: 'premium',
      items: [
        { id: 'investment-summary', label: 'Investment Summary', badge: 'UPDATED', iconSet: 'mci', iconName: 'clipboard-text-outline', accent: '#66BB6A', route: 'InvestmentSummary' },
        { id: 'aggressive-holders', label: 'Aggressive Holders', iconSet: 'ion', iconName: 'people-outline', accent: '#42A5F5', route: 'AggressiveHolders' },
        { id: 'live-pulse', label: 'Live Market Pulse', badge: 'NEW', iconSet: 'mci', iconName: 'pulse', accent: '#EF5350', route: 'LiveMarketPulse' },
        { id: 'accumulation', label: 'Broker Accumulation', iconSet: 'feather', iconName: 'trending-up', accent: '#66BB6A', route: 'Accumulation' },
        { id: 'distribution', label: 'Broker Distribution', iconSet: 'feather', iconName: 'trending-down', accent: '#EF5350', route: 'Distribution' },
        { id: 'broker-top', label: 'Broker Top Buy Sell', badge: 'UPDATED', iconSet: 'ion', iconName: 'star', accent: '#EF5350', route: 'BrokerTopBuySell' },
        { id: 'top-buyers', label: 'Top Buyers', badge: 'UPDATED', iconSet: 'feather', iconName: 'trending-up', accent: '#66BB6A', route: 'TopBuyers' },
        { id: 'top-sellers', label: 'Top Sellers', badge: 'UPDATED', iconSet: 'feather', iconName: 'trending-down', accent: '#EF5350', route: 'TopSellers' },
        { id: 'top-holders', label: 'Top Holders', iconSet: 'ion', iconName: 'trophy-outline', accent: '#FFA726', route: 'TopHolders' },
        { id: 'top-release', label: 'Top Release', iconSet: 'mci', iconName: 'lock-open-variant-outline', accent: '#AB47BC', route: 'TopReleases' },
        { id: 'broker-favorites', label: 'Broker Favorites', iconSet: 'ion', iconName: 'heart-outline', accent: '#EC407A', route: 'BrokerFavorites' },
        { id: 'week-high', label: '52 Week High', iconSet: 'mci', iconName: 'arrow-up-bold', accent: '#66BB6A', route: 'FiftyTwoWeekHigh' },
        { id: 'week-low', label: '52 Week Low', iconSet: 'mci', iconName: 'arrow-down-bold', accent: '#EF5350', route: 'FiftyTwoWeekLow' },
        { id: 'small-caps', label: 'Small Caps', badge: 'NEW', iconSet: 'mci', iconName: 'chart-bell-curve', accent: '#26A69A', route: 'PremiumScreener', premiumKind: 'small-caps' },
        { id: 'rising-stocks', label: 'Rising Stocks', badge: 'NEW', iconSet: 'feather', iconName: 'trending-up', accent: '#66BB6A', route: 'PremiumScreener', premiumKind: 'rising-stocks' },
        { id: 'price-droppers', label: 'Price Droppers', badge: 'NEW', iconSet: 'feather', iconName: 'trending-down', accent: '#EF5350', route: 'PremiumScreener', premiumKind: 'price-droppers' },
        { id: 'value-pick', label: 'Value Pick', badge: 'NEW', iconSet: 'ion', iconName: 'star', accent: '#AB47BC', route: 'PremiumScreener', premiumKind: 'value-pick' },
        { id: 'unlock-period', label: 'Unlock Period', badge: 'NEW', iconSet: 'ion', iconName: 'lock-open-outline', accent: '#5C6BC0', route: 'PremiumScreener', premiumKind: 'unlock-period' },
        { id: 'hydropower', label: 'Hydropower Leaders', badge: 'NEW', iconSet: 'mci', iconName: 'hydro-power', accent: '#29B6F6', route: 'PremiumScreener', premiumKind: 'hydropower-leaders' },
        { id: 'microfinance', label: 'Microfinance Leaders', badge: 'NEW', iconSet: 'mci', iconName: 'home-city-outline', accent: '#66BB6A', route: 'PremiumScreener', premiumKind: 'microfinance-leaders' },
        { id: 'development', label: 'Development Leaders', badge: 'NEW', iconSet: 'feather', iconName: 'bar-chart-2', accent: '#42A5F5', route: 'PremiumScreener', premiumKind: 'development-leaders' },
        { id: 'finance', label: 'Finance Leaders', badge: 'NEW', iconSet: 'mci', iconName: 'cash-sync', accent: '#66BB6A', route: 'PremiumScreener', premiumKind: 'finance-leaders' },
        { id: 'strong-reserves', label: 'Strong Reserves', badge: 'NEW', iconSet: 'ion', iconName: 'folder-outline', accent: '#81C784', route: 'PremiumScreener', premiumKind: 'strong-reserves' },
        { id: 'high-earners', label: 'High Earners', badge: 'NEW', iconSet: 'feather', iconName: 'trending-up', accent: '#66BB6A', route: 'PremiumScreener', premiumKind: 'high-earners' },
        { id: 'stock-filter', label: 'Stock Filter', badge: 'NEW', iconSet: 'ion', iconName: 'filter-outline', accent: '#42A5F5', route: 'PremiumTool', premiumTool: 'stock-filter' },
        { id: 'fin-reports', label: 'Financial Reports', badge: 'NEW', iconSet: 'ion', iconName: 'document-text-outline', accent: '#90A4AE', route: 'PremiumTool', premiumTool: 'financial-reports' },
        { id: 'floor-sheet', label: 'Floor Sheet', badge: 'NEW', iconSet: 'ion', iconName: 'list-outline', accent: '#EF5350', route: 'PremiumTool', premiumTool: 'floor-sheet' },
        { id: 'market-depth', label: 'Market Depth', badge: 'NEW', iconSet: 'feather', iconName: 'bar-chart-2', accent: '#42A5F5', route: 'PremiumTool', premiumTool: 'market-depth' },
      ],
    },
    {
      id: 'extra',
      title: 'Extra Information',
      variant: 'extra',
      items: [
        { id: 'global-indices', label: 'Global Indices', iconSet: 'ion', iconName: 'globe-outline', accent: '#42A5F5', route: 'ExtraTool', extraKind: 'global-indices' },
        { id: 'indicators', label: 'Indicators', iconSet: 'mci', iconName: 'chart-timeline-variant', accent: '#AB47BC', route: 'ExtraTool', extraKind: 'indicators' },
        { id: 'forex', label: 'Forex Data', iconSet: 'mci', iconName: 'currency-usd', accent: '#66BB6A', route: 'ExtraTool', extraKind: 'forex' },
        { id: 'fuel', label: 'Fuel Price', badge: 'NEW', iconSet: 'ion', iconName: 'flash', accent: '#FFA726', route: 'ExtraTool', extraKind: 'fuel' },
        { id: 'gold-silver', label: 'Gold/Silver Price', badge: 'NEW', iconSet: 'mci', iconName: 'gold', accent: '#EC407A', route: 'ExtraTool', extraKind: 'gold-silver' },
        { id: 'calculator', label: 'Share Calculator', badge: 'NEW', iconSet: 'ion', iconName: 'calculator-outline', accent: '#7E57C2', route: 'Calculator' },
      ],
    },
  ];
}

function ServiceIcon({
  item,
  isDark,
}: {
  item: ServiceItem;
  isDark: boolean;
}) {
  const size = isDark ? rs(26) : rs(24);
  const color = isDark ? '#FFFFFF' : SS.iconInk;
  if (item.iconSet === 'mci') {
    return (
      <MaterialCommunityIcons
        name={item.iconName as keyof typeof MaterialCommunityIcons.glyphMap}
        size={size}
        color={color}
      />
    );
  }
  if (item.iconSet === 'feather') {
    return (
      <Feather
        name={item.iconName as keyof typeof Feather.glyphMap}
        size={size}
        color={color}
      />
    );
  }
  return (
    <Ionicons
      name={item.iconName as keyof typeof Ionicons.glyphMap}
      size={size}
      color={color}
    />
  );
}

function chunkRows<T>(items: T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

function ServiceTile({
  item,
  onPress,
  colors,
  isDark,
  styles,
  gridLayout,
}: {
  item: ServiceItem;
  onPress: () => void;
  colors: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
  gridLayout: ServiceGridLayout;
}) {
  const featured = FEATURED_IDS.has(item.id);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        {
          width: gridLayout.tileW,
          minWidth: gridLayout.tileW,
          height: gridLayout.tileH,
          minHeight: gridLayout.tileH,
        },
        !isDark && styles.tileLight,
        featured && styles.tileFeatured,
        pressed && styles.tilePressed,
      ]}
      // Fire as soon as the finger lifts — no Android press delay.
      delayPressIn={0}
      onPress={onPress}
    >
      {item.badge ? (
        <View style={styles.badgeAbs}>
          <SoftBadge label={item.badge} />
        </View>
      ) : null}
      <View
        style={[
          styles.tileIcon,
          {
            backgroundColor: isDark
              ? pastel(item.accent, true)
              : ssPastel(item.accent),
          },
        ]}
      >
        <ServiceIcon item={item} isDark={isDark} />
      </View>
      <View style={styles.tileLabelWrap}>
        <Text
          style={[
            styles.tileLabel,
            { color: isDark ? colors.text : SS.labelInk },
          ]}
          numberOfLines={TILE_LABEL_LINES}
          ellipsizeMode="tail"
        >
          {item.label}
        </Text>
      </View>
    </Pressable>
  );
}

function PremiumSectionPill({
  title,
  styles,
  textColor,
}: {
  title: string;
  styles: ReturnType<typeof makeStyles>;
  textColor: string;
}) {
  const [pillSize, setPillSize] = useState({ w: 0, h: 0 });
  const radius = rs(10);

  return (
    <View
      style={[styles.pill, styles.pillPremium]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== pillSize.w || height !== pillSize.h) {
          setPillSize({ w: width, h: height });
        }
      }}
    >
      {pillSize.w > 0 && pillSize.h > 0 ? (
        <Svg
          width={pillSize.w}
          height={pillSize.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <SvgGradient id="premiumPillGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={SS.pillPremiumStart} />
              <Stop offset="0.5" stopColor={SS.pillPremiumMid} />
              <Stop offset="1" stopColor={SS.pillPremiumEnd} />
            </SvgGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={pillSize.w}
            height={pillSize.h}
            rx={radius}
            ry={radius}
            fill="url(#premiumPillGrad)"
          />
        </Svg>
      ) : null}
      <Text
        style={[styles.pillText, styles.pillTextPremium, { color: textColor }]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}

function SectionPill({
  section,
  colors,
  styles,
  isDark,
}: {
  section: Section;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
}) {
  const textColor = isDark
    ? '#FFFFFF'
    : section.variant === 'free'
      ? SS.pillFreeText
      : SS.pillLabelInk;

  if (isDark) {
    const bg =
      section.variant === 'free'
        ? colors.pillFree
        : section.variant === 'mero'
          ? colors.pillMero
          : section.variant === 'premium'
            ? colors.pillPremiumEnd
            : '#66BB6A';
    return (
      <View style={[styles.pill, { backgroundColor: bg }]}>
        <Text
          style={[styles.pillText, { color: textColor }]}
          numberOfLines={1}
        >
          {section.title}
        </Text>
      </View>
    );
  }

  if (section.variant === 'premium') {
    return (
      <PremiumSectionPill
        title={section.title}
        styles={styles}
        textColor={textColor}
      />
    );
  }

  const bg =
    section.variant === 'free'
      ? SS.pillFreeBg
      : section.variant === 'mero'
        ? SS.pillMeroBg
        : SS.pillExtraBg;

  return (
    <View style={[styles.pill, styles.pillLight, { backgroundColor: bg }]}>
      <Text
        style={[styles.pillText, { color: textColor }]}
        numberOfLines={1}
      >
        {section.title}
      </Text>
    </View>
  );
}

function SectionBlock({
  section,
  onOpen,
  colors,
  isDark,
  styles,
  gridLayout,
}: {
  section: Section;
  onOpen: (item: ServiceItem) => void;
  colors: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
  gridLayout: ServiceGridLayout;
}) {
  const rows = chunkRows(section.items, gridLayout.cols);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View
          style={[
            styles.sectionHeadLine,
            { backgroundColor: styles.headLineColor },
          ]}
        />
        <SectionPill
          section={section}
          colors={colors}
          styles={styles}
          isDark={isDark}
        />
      </View>

      {rows.map((row, rowIndex) => (
        <View key={`${section.id}-r${rowIndex}`} style={styles.row}>
          {row.map((item) => (
            <ServiceTile
              key={item.id}
              item={item}
              onPress={() => onOpen(item)}
              colors={colors}
              isDark={isDark}
              styles={styles}
              gridLayout={gridLayout}
            />
          ))}
          {row.length < gridLayout.cols
            ? Array.from({ length: gridLayout.cols - row.length }).map((_, i) => (
                <View
                  key={`pad-${i}`}
                  style={[
                    styles.tileGhost,
                    {
                      width: gridLayout.tileW,
                      minWidth: gridLayout.tileW,
                      height: gridLayout.tileH,
                      minHeight: gridLayout.tileH,
                    },
                  ]}
                />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

export function ServicesScreen() {
  const openDrawer = useOpenDrawer();
  const { colors, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const gridLayout = useMemo(
    () => computeServiceGridLayout(windowWidth),
    [windowWidth],
  );
  const styles = useMemo(
    () => makeStyles(colors, isDark, gridLayout),
    [colors, isDark, gridLayout],
  );
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => buildSections(), []);
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Warm premium tools only after the tab switch has settled — never compete
  // with the Home↔Services transition on the JS thread.
  useFocusEffect(
    useCallback(() => {
      prefetchTimerRef.current = setTimeout(() => {
        prefetchTimerRef.current = null;
        void prefetchHotPremiumTools();
      }, 2800);
      return () => {
        if (prefetchTimerRef.current) {
          clearTimeout(prefetchTimerRef.current);
          prefetchTimerRef.current = null;
        }
      };
    }, []),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((i) => i.label.toLowerCase().includes(q)),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [query, sections]);

  const openItem = useCallback(
    (item: ServiceItem) => {
      // Cancel background warmup so the push isn't fighting floorsheet work.
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
      pausePrefetch(4000);
      // Navigate in this tick — never prefetch / hydrate before the push starts.
      const route = item.route;
      if (!route) return;
      if (route === 'ApplyTab') {
        navigation.navigate('MainTabs', { screen: 'Apply' });
        return;
      }
      if (route === 'CheckTab') {
        navigation.navigate('MainTabs', { screen: 'Check' });
        return;
      }
      if (route === 'HomeTab') {
        navigation.navigate('MainTabs', { screen: 'Home' });
        return;
      }
      if (route === 'PremiumScreener' && item.premiumKind) {
        navigation.navigate('PremiumScreener', { kind: item.premiumKind });
        return;
      }
      if (route === 'PremiumTool' && item.premiumTool) {
        navigation.navigate('PremiumTool', { kind: item.premiumTool });
        return;
      }
      if (route === 'ExtraTool' && item.extraKind) {
        navigation.navigate('ExtraTool', { kind: item.extraKind });
        return;
      }
      if (route === 'IpoIssuesCurrent') {
        navigation.navigate('IpoIssues', { mode: 'current' });
        return;
      }
      if (route === 'IpoIssuesUpcoming') {
        navigation.navigate('IpoIssues', { mode: 'upcoming' });
        return;
      }
      if (route === 'StockList' && item.stockKind) {
        navigation.navigate('StockList', { kind: item.stockKind });
        return;
      }
      if (route === 'Charts') {
        navigation.navigate('Charts', {});
        return;
      }
      // Plain stack screens (CurrentIpoStatus, Accumulation, Watchlist, …).
      navigation.navigate(route as keyof RootStackParamList);
    },
    [navigation],
  );

  return (
    <View style={[styles.root, { backgroundColor: isDark ? colors.bg : SS.cream }]}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      <AdminPromoBanner page="services" />

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchInner,
            {
              backgroundColor: isDark ? colors.searchBg : SS.cream,
              borderColor: isDark ? colors.border : SS.cardBorder,
            },
          ]}
        >
          <Ionicons name="search" size={rs(17)} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search services..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={rs(16)} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(sec) => sec.id}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={4}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        renderItem={({ item: sec }) => (
          <SectionBlock
            section={sec}
            onOpen={openItem}
            colors={colors}
            isDark={isDark}
            styles={styles}
            gridLayout={gridLayout}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No services match “{query}”
          </Text>
        }
      />
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean, layout: ServiceGridLayout) {
  const headLineColor = isDark ? c.border : SS.headLine;

  return StyleSheet.create({
    headLineColor,
    root: { flex: 1 },
    searchWrap: {
      paddingHorizontal: layout.hPad,
      paddingTop: rs(10),
      paddingBottom: rs(6),
    },
    searchInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderRadius: rs(14),
      borderWidth: 1,
      paddingHorizontal: rs(14),
      minHeight: rs(44),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    searchInput: {
      flex: 1,
      fontSize: rs(14),
      fontWeight: '500',
      paddingVertical: rs(8),
    },
    scroll: {
      paddingHorizontal: layout.hPad,
      paddingBottom: rs(28),
      paddingTop: rs(10),
    },
    section: {
      marginBottom: rs(16),
    },
    sectionHead: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(14),
      marginTop: rs(4),
      minHeight: rs(34),
    },
    sectionHeadLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      height: rs(SS.headLineHeight),
      marginTop: -rs(SS.headLineHeight) / 2,
    },
    pill: {
      flexShrink: 0,
      paddingHorizontal: rs(18),
      paddingVertical: rs(7),
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: rs(34),
      zIndex: 1,
    },
    pillLight: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 1,
    },
    pillPremium: {
      overflow: 'hidden',
      paddingHorizontal: rs(22),
      paddingVertical: rs(8),
      minHeight: rs(36),
    },
    pillTextPremium: {
      fontSize: rs(14),
      fontWeight: '800',
    },
    pillText: {
      fontWeight: '800',
      fontSize: rs(13),
      letterSpacing: 0,
      textAlign: 'center',
      includeFontPadding: false,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      gap: layout.gap,
      marginBottom: layout.gap,
    },
    tile: {
      flexShrink: 0,
      backgroundColor: isDark ? c.surface : SS.cream,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: isDark ? c.border : SS.cardBorder,
      paddingTop: rs(10),
      paddingBottom: rs(6),
      paddingHorizontal: rs(4),
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    tileLight: {
      backgroundColor: SS.cream,
      borderColor: SS.cardBorder,
      borderWidth: 1,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    tileFeatured: {
      borderColor: SS.featuredBorder,
      borderWidth: 1.5,
    },
    tilePressed: {
      opacity: 0.94,
      transform: [{ scale: 0.97 }],
    },
    tileGhost: {
      flexShrink: 0,
      opacity: 0,
    },
    badgeAbs: {
      position: 'absolute',
      top: rs(4),
      right: rs(4),
      zIndex: 2,
    },
    tileIcon: {
      width: TILE_ICON,
      height: TILE_ICON,
      borderRadius: rs(12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(4),
    },
    tileLabelWrap: {
      width: '100%',
      minHeight: TILE_LABEL_BAND,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(2),
    },
    tileLabel: {
      width: '100%',
      fontSize: rs(11),
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: TILE_LABEL_LINE_H,
      letterSpacing: 0,
      includeFontPadding: false,
    },
    empty: {
      textAlign: 'center',
      marginTop: rs(40),
      fontSize: rs(14),
    },
  });
}
