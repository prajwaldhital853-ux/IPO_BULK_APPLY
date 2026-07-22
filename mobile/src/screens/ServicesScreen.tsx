import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { SoftBadge } from '../components/SoftBadge';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import type { RootStackParamList } from '../navigation/types';
import type { PremiumScreenerKind } from '../services/nepse/premiumScreeners';
import type { PremiumToolKind } from '../services/nepse/premiumServices';
import type { ExtraToolKind } from '../services/nepse/extraData';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs, screenWidth } from '../utils/responsive';

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

const H_PAD = rs(14);
const GAP = rs(14);
const COLS = 4;
const TILE_W = Math.floor((screenWidth - H_PAD * 2 - GAP * (COLS - 1)) / COLS);
/** Compact tiles so Free Services fits ~3.5 rows on screen. */
const TILE_H = Math.max(Math.floor(TILE_W * 0.98), rs(86));

/** Brighter pastels so icons read crisp against white cards. */
function pastel(hex: string, isDark: boolean) {
  if (isDark) return `${hex}40`;
  const map: Record<string, string> = {
    '#42A5F5': '#E3F2FD',
    '#66BB6A': '#E8F5E9',
    '#EF5350': '#FFEBEE',
    '#FFA726': '#FFF3E0',
    '#FFCA28': '#FFF8E1',
    '#90A4AE': '#ECEFF1',
    '#AB47BC': '#F3E5F5',
    '#29B6F6': '#E1F5FE',
    '#26A69A': '#E0F2F1',
    '#7E57C2': '#EDE7F6',
    '#FDD835': '#FFFDE7',
    '#F48FB1': '#FCE4EC',
    '#EC407A': '#FCE4EC',
    '#FF7043': '#FBE9E7',
    '#5C6BC0': '#E8EAF6',
    '#81C784': '#E8F5E9',
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
        { id: 'user-portfolio', label: 'My Portfolio', iconSet: 'ion', iconName: 'person-circle-outline', accent: '#FFCA28', route: 'UserPortfolio' },
        { id: 'price-alert', label: 'Price Alert', badge: 'NEW', iconSet: 'ion', iconName: 'notifications-outline', accent: '#FFA726', route: 'PriceAlert' },
        { id: 'commercial', label: 'Commercial Leaders', iconSet: 'mci', iconName: 'office-building', accent: '#66BB6A', route: 'StockList', stockKind: 'commercial-leaders' },
        { id: 'large-caps', label: 'Large Caps', iconSet: 'mci', iconName: 'finance', accent: '#42A5F5', route: 'StockList', stockKind: 'large-caps' },
        { id: 'trending', label: 'Trending Stocks', iconSet: 'feather', iconName: 'trending-up', accent: '#42A5F5', route: 'StockList', stockKind: 'trending' },
        { id: 'high-div', label: 'High Dividend', iconSet: 'mci', iconName: 'cash-multiple', accent: '#42A5F5', route: 'StockList', stockKind: 'high-dividend' },
        { id: 'high-demand', label: 'High Demand', iconSet: 'mci', iconName: 'arrow-up-bold-circle-outline', accent: '#EF5350', route: 'HighDemand' },
        { id: 'bulk-txn', label: 'Bulk Transactions', iconSet: 'mci', iconName: 'swap-horizontal', accent: '#FFA726', route: 'BulkTransactions' },
        { id: 'nepse-history', label: 'Nepse History', iconSet: 'mci', iconName: 'history', accent: '#90A4AE', route: 'NepseHistory' },
        { id: 'proposed-div', label: 'Proposed Dividend', iconSet: 'mci', iconName: 'cash', accent: '#66BB6A', route: 'ProposedDividend' },
        { id: 'charts', label: 'Charts', iconSet: 'mci', iconName: 'chart-areaspline', accent: '#AB47BC', route: 'Charts' },
        { id: 'announcements', label: 'Announcements', iconSet: 'ion', iconName: 'megaphone-outline', accent: '#FFA726', route: 'Announcements' },
        { id: 'watchlist', label: 'Watchlist', badge: 'NEW', iconSet: 'ion', iconName: 'eye-outline', accent: '#29B6F6', route: 'Watchlist' },
        { id: 'bank-tracker', label: 'Bank Tracker', badge: 'NEW', iconSet: 'mci', iconName: 'wallet-outline', accent: '#26A69A', route: 'BankTracker' },
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
        { id: 'auto-ipo', label: 'Auto IPO', badge: 'NEW', iconSet: 'ion', iconName: 'flash', accent: '#FDD835', route: 'ApplyTab' },
        { id: 'current-issues', label: 'Current Issues', iconSet: 'mci', iconName: 'file-document-outline', accent: '#66BB6A', route: 'IpoIssuesCurrent' },
        { id: 'upcoming', label: 'Upcoming Issues', badge: 'UPDATED', iconSet: 'ion', iconName: 'calendar-outline', accent: '#F48FB1', route: 'IpoIssuesUpcoming' },
        { id: 'meroshare-web', label: 'MeroShare Web', iconSet: 'ion', iconName: 'globe-outline', accent: '#26A69A', route: 'MeroshareWeb' },
        { id: 'bulk-result', label: 'Bulk IPO Result', iconSet: 'ion', iconName: 'checkmark-done-circle-outline', accent: '#66BB6A', route: 'CheckTab' },
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

function ServiceIcon({ item }: { item: ServiceItem }) {
  const size = rs(29);
  const color = darkIcon(item.accent);
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
}: {
  item: ServiceItem;
  onPress: () => void;
  colors: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const featured = FEATURED_IDS.has(item.id);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        !isDark && styles.tileLight,
        featured && !isDark && styles.tileFeatured,
        pressed && styles.tilePressed,
      ]}
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
          { backgroundColor: pastel(item.accent, isDark) },
        ]}
      >
        <ServiceIcon item={item} />
      </View>
      <Text
        style={[styles.tileLabel, { color: isDark ? colors.text : '#1A1A1A' }]}
        numberOfLines={2}
      >
        {item.label}
      </Text>
    </Pressable>
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
  const textColor =
    !isDark && section.variant !== 'premium' && section.variant !== 'extra'
      ? '#212121'
      : '#FFFFFF';

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
      <Text style={[styles.pillText, { color: textColor }]}>
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
}: {
  section: Section;
  onOpen: (item: ServiceItem) => void;
  colors: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const rows = chunkRows(section.items, COLS);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.headLine, { backgroundColor: colors.border }]} />
        <SectionPill
          section={section}
          colors={colors}
          styles={styles}
          isDark={isDark}
        />
        <View style={[styles.headLine, { backgroundColor: colors.border }]} />
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
            />
          ))}
          {row.length < COLS
            ? Array.from({ length: COLS - row.length }).map((_, i) => (
                <View key={`pad-${i}`} style={styles.tileGhost} />
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
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => buildSections(), []);

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

  const openItem = (item: ServiceItem) => {
    if (item.route === 'ApplyTab') {
      navigation.navigate('MainTabs', { screen: 'Apply' });
      return;
    }
    if (item.route === 'CheckTab') {
      navigation.navigate('MainTabs', { screen: 'Check' });
      return;
    }
    if (item.route === 'HomeTab') {
      navigation.navigate('MainTabs', { screen: 'Home' });
      return;
    }
    if (item.route === 'CurrentIpoStatus') {
      navigation.navigate('CurrentIpoStatus');
      return;
    }
    if (item.route === 'IpoBulkStatus') {
      navigation.navigate('IpoBulkStatus');
      return;
    }
    if (item.route === 'NepseData') {
      navigation.navigate('NepseData');
      return;
    }
    if (item.route === 'NepseCalendar') {
      navigation.navigate('NepseCalendar');
      return;
    }
    if (item.route === 'Portfolio') {
      navigation.navigate('Portfolio');
      return;
    }
    if (item.route === 'UserPortfolio') {
      navigation.navigate('UserPortfolio');
      return;
    }
    if (item.route === 'HighDemand') {
      navigation.navigate('HighDemand');
      return;
    }
    if (item.route === 'NepseHistory') {
      navigation.navigate('NepseHistory');
      return;
    }
    if (item.route === 'BulkTransactions') {
      navigation.navigate('BulkTransactions');
      return;
    }
    if (item.route === 'ProposedDividend') {
      navigation.navigate('ProposedDividend');
      return;
    }
    if (item.route === 'Charts') {
      navigation.navigate('Charts', {});
      return;
    }
    if (item.route === 'Announcements') {
      navigation.navigate('Announcements');
      return;
    }
    if (item.route === 'Watchlist') {
      navigation.navigate('Watchlist');
      return;
    }
    if (item.route === 'PriceAlert') {
      navigation.navigate('PriceAlert');
      return;
    }
    if (item.route === 'BulkPortfolio') {
      navigation.navigate('BulkPortfolio');
      return;
    }
    if (item.route === 'MeroshareWeb') {
      navigation.navigate('MeroshareWeb');
      return;
    }
    if (item.route === 'TrackAccountExpiry') {
      navigation.navigate('TrackAccountExpiry');
      return;
    }
    if (item.route === 'BankTracker') {
      navigation.navigate('BankTracker');
      return;
    }
    if (item.route === 'ChangePassword') {
      navigation.navigate('ChangePassword');
      return;
    }
    if (item.route === 'InvestmentSummary') {
      navigation.navigate('InvestmentSummary');
      return;
    }
    if (item.route === 'AggressiveHolders') {
      navigation.navigate('AggressiveHolders');
      return;
    }
    if (item.route === 'LiveMarketPulse') {
      navigation.navigate('LiveMarketPulse');
      return;
    }
    if (item.route === 'Accumulation') {
      navigation.navigate('Accumulation');
      return;
    }
    if (item.route === 'Distribution') {
      navigation.navigate('Distribution');
      return;
    }
    if (item.route === 'TopBuyers') {
      navigation.navigate('TopBuyers');
      return;
    }
    if (item.route === 'TopSellers') {
      navigation.navigate('TopSellers');
      return;
    }
    if (item.route === 'TopHolders') {
      navigation.navigate('TopHolders');
      return;
    }
    if (item.route === 'TopReleases') {
      navigation.navigate('TopReleases');
      return;
    }
    if (item.route === 'BrokerFavorites') {
      navigation.navigate('BrokerFavorites');
      return;
    }
    if (item.route === 'BrokerTopBuySell') {
      navigation.navigate('BrokerTopBuySell');
      return;
    }
    if (item.route === 'FiftyTwoWeekHigh') {
      navigation.navigate('FiftyTwoWeekHigh');
      return;
    }
    if (item.route === 'FiftyTwoWeekLow') {
      navigation.navigate('FiftyTwoWeekLow');
      return;
    }
    if (item.route === 'PremiumScreener' && item.premiumKind) {
      navigation.navigate('PremiumScreener', { kind: item.premiumKind });
      return;
    }
    if (item.route === 'PremiumTool' && item.premiumTool) {
      navigation.navigate('PremiumTool', { kind: item.premiumTool });
      return;
    }
    if (item.route === 'ExtraTool' && item.extraKind) {
      navigation.navigate('ExtraTool', { kind: item.extraKind });
      return;
    }
    if (item.route === 'Calculator') {
      navigation.navigate('Calculator');
      return;
    }
    if (item.route === 'IpoIssuesCurrent') {
      navigation.navigate('IpoIssues', { mode: 'current' });
      return;
    }
    if (item.route === 'IpoIssuesUpcoming') {
      navigation.navigate('IpoIssues', { mode: 'upcoming' });
      return;
    }
    if (item.route === 'StockList' && item.stockKind) {
      navigation.navigate('StockList', { kind: item.stockKind });
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: isDark ? colors.bg : '#E4EAD9' }]}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      {!isDark ? (
        <PromoBanner
          onPress={() => navigation.navigate('MainTabs', { screen: 'Apply' })}
        />
      ) : null}

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchInner,
            {
              backgroundColor: isDark ? colors.searchBg : '#EEF2E6',
              borderColor: isDark ? colors.borderMuted : '#C5D0B5',
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((sec) => (
          <SectionBlock
            key={sec.id}
            section={sec}
            onOpen={openItem}
            colors={colors}
            isDark={isDark}
            styles={styles}
          />
        ))}

        {filtered.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No services match “{query}”
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    searchWrap: {
      paddingHorizontal: H_PAD,
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
      paddingHorizontal: H_PAD,
      paddingBottom: rs(28),
      paddingTop: rs(10),
    },
    section: {
      marginBottom: rs(16),
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(14),
      marginTop: rs(4),
    },
    headLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
    },
    pill: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(6),
      borderRadius: rs(16),
    },
    pillText: {
      fontWeight: '800',
      fontSize: rs(12),
      letterSpacing: 0.2,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      gap: GAP,
      marginBottom: GAP,
    },
    tile: {
      width: TILE_W,
      height: TILE_H,
      backgroundColor: c.surface,
      borderRadius: rs(19),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderMuted,
      paddingTop: rs(10),
      paddingBottom: rs(6),
      paddingHorizontal: rs(3),
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'visible',
    },
    tileLight: {
      backgroundColor: '#EEF2E6',
      borderColor: 'rgba(45,90,39,0.08)',
      borderWidth: 1,
      shadowColor: '#1B1B1B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 4,
      elevation: 3,
    },
    tileFeatured: {
      borderColor: '#FFB300',
      borderWidth: 1.5,
    },
    tilePressed: {
      opacity: 0.94,
      transform: [{ scale: 0.97 }],
    },
    tileGhost: {
      width: TILE_W,
      height: TILE_H,
      opacity: 0,
    },
    badgeAbs: {
      position: 'absolute',
      top: rs(-5),
      right: rs(-3),
      zIndex: 2,
    },
    tileIcon: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(9),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(5),
      marginTop: rs(2),
    },
    tileLabel: {
      fontSize: rs(10),
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: rs(12),
      paddingHorizontal: rs(1),
      letterSpacing: 0.1,
    },
    empty: {
      textAlign: 'center',
      marginTop: rs(40),
      fontSize: rs(14),
    },
  });
}
