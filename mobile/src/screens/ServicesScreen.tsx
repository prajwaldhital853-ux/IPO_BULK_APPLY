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

const H_PAD = rs(12);
const GAP = rs(8);
const COLS = 4;
const TILE_W = Math.floor((screenWidth - H_PAD * 2 - GAP * (COLS - 1)) / COLS);

function pastel(hex: string, isDark: boolean) {
  return isDark ? `${hex}33` : `${hex}28`;
}

function buildSections(): Section[] {
  return [
    {
      id: 'free',
      title: 'Free Services',
      variant: 'free',
      items: [
        { id: 'nepse-data', label: 'NEPSE Data', iconSet: 'feather', iconName: 'bar-chart-2', accent: '#42A5F5', route: 'NepseData' },
        { id: 'nepse-cal', label: 'NEPSE Calendar', iconSet: 'ion', iconName: 'calendar-outline', accent: '#66BB6A', route: 'NepseCalendar' },
        { id: 'share-portfolio', label: 'Share Portfolio', iconSet: 'ion', iconName: 'briefcase-outline', accent: '#EF5350', route: 'Portfolio' },
        { id: 'price-alert', label: 'Price Alert', badge: 'NEW', iconSet: 'ion', iconName: 'notifications-outline', accent: '#FFA726', route: 'PriceAlert' },
        { id: 'commercial', label: 'Commercial Leaders', iconSet: 'mci', iconName: 'office-building', accent: '#66BB6A', route: 'StockList', stockKind: 'commercial-leaders' },
        { id: 'large-caps', label: 'Large Caps', iconSet: 'mci', iconName: 'finance', accent: '#42A5F5', route: 'StockList', stockKind: 'large-caps' },
        { id: 'trending', label: 'Trending Stocks', iconSet: 'feather', iconName: 'trending-up', accent: '#42A5F5', route: 'StockList', stockKind: 'trending' },
        { id: 'high-div', label: 'High Dividend', iconSet: 'mci', iconName: 'cash-multiple', accent: '#42A5F5', route: 'StockList', stockKind: 'high-dividend' },
        { id: 'high-demand', label: 'High Demand', iconSet: 'mci', iconName: 'arrow-up-bold-circle-outline', accent: '#EF5350', route: 'HighDemand' },
        { id: 'bulk-txn', label: 'Bulk Transactions', iconSet: 'mci', iconName: 'swap-horizontal', accent: '#FFA726', route: 'BulkTransactions' },
        { id: 'nepse-history', label: 'NEPSE History', iconSet: 'mci', iconName: 'history', accent: '#90A4AE', route: 'NepseHistory' },
        { id: 'proposed-div', label: 'Proposed Dividend', iconSet: 'mci', iconName: 'cash', accent: '#66BB6A', route: 'ProposedDividend' },
        { id: 'charts', label: 'Charts', iconSet: 'mci', iconName: 'chart-areaspline', accent: '#AB47BC', route: 'Charts' },
        { id: 'announcements', label: 'Announcements', iconSet: 'ion', iconName: 'megaphone-outline', accent: '#FFA726', route: 'Announcements' },
        { id: 'watchlist', label: 'Watchlist', badge: 'NEW', iconSet: 'ion', iconName: 'eye-outline', accent: '#29B6F6', route: 'Watchlist' },
      ],
    },
    {
      id: 'mero',
      title: 'MeroShare Services',
      variant: 'mero',
      items: [
        { id: 'bulk-portfolio', label: 'Bulk Portfolio Check', iconSet: 'ion', iconName: 'albums-outline', accent: '#42A5F5', route: 'BulkPortfolio' },
        { id: 'bulk-status', label: 'Bulk IPO Status', badge: 'UPDATED', iconSet: 'ion', iconName: 'time-outline', accent: '#42A5F5', route: 'IpoBulkStatus' },
        { id: 'current-status', label: 'Current IPO Status', badge: 'UPDATED', iconSet: 'ion', iconName: 'search', accent: '#7E57C2', route: 'CurrentIpoStatus' },
        { id: 'auto-ipo', label: 'Auto IPO', badge: 'NEW', iconSet: 'ion', iconName: 'flash', accent: '#FDD835', route: 'ApplyTab' },
        { id: 'current-issues', label: 'Current Issues', iconSet: 'mci', iconName: 'file-document-outline', accent: '#66BB6A', route: 'IpoIssuesCurrent' },
        { id: 'upcoming', label: 'Upcoming Issues', badge: 'UPDATED', iconSet: 'ion', iconName: 'calendar-outline', accent: '#F48FB1', route: 'IpoIssuesUpcoming' },
        { id: 'meroshare-web', label: 'MeroShare Web', iconSet: 'ion', iconName: 'globe-outline', accent: '#26A69A', route: 'MeroshareWeb' },
        { id: 'bulk-result', label: 'Bulk IPO Result', iconSet: 'ion', iconName: 'checkmark-done-circle-outline', accent: '#66BB6A', route: 'CheckTab' },
        { id: 'change-password', label: 'Change Password', iconSet: 'ion', iconName: 'key-outline', accent: '#FF7043', route: 'ChangePassword' },
        { id: 'account-expiry', label: 'Account Expiry Status', iconSet: 'ion', iconName: 'hourglass-outline', accent: '#EC407A', route: 'AccountExpiry' },
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
        { id: 'accumulation', label: 'Accumulation', iconSet: 'feather', iconName: 'trending-up', accent: '#66BB6A', route: 'Accumulation' },
        { id: 'distribution', label: 'Distribution', iconSet: 'feather', iconName: 'trending-down', accent: '#EF5350', route: 'Distribution' },
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
        { id: 'gold-silver', label: 'Gold & Silver Price', badge: 'NEW', iconSet: 'mci', iconName: 'gold', accent: '#EC407A', route: 'ExtraTool', extraKind: 'gold-silver' },
        { id: 'calculator', label: 'Share Calculator', badge: 'NEW', iconSet: 'ion', iconName: 'calculator-outline', accent: '#7E57C2', route: 'Calculator' },
      ],
    },
  ];
}

function ServiceIcon({ item }: { item: ServiceItem }) {
  const size = rs(18);
  const color = item.accent;
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
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
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
      <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={2}>
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
    if (item.route === 'AccountExpiry') {
      navigation.navigate('AccountExpiry');
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
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchInner,
            {
              backgroundColor: colors.searchBg,
              borderColor: colors.borderMuted,
            },
          ]}
        >
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
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
      paddingBottom: rs(4),
    },
    searchInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderRadius: rs(12),
      borderWidth: 1,
      paddingHorizontal: rs(12),
      minHeight: rs(40),
    },
    searchInput: {
      flex: 1,
      fontSize: rs(13),
      paddingVertical: rs(8),
    },
    scroll: {
      paddingHorizontal: H_PAD,
      paddingBottom: rs(28),
      paddingTop: rs(8),
    },
    section: {
      marginBottom: rs(10),
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(12),
      marginTop: rs(4),
    },
    headLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
    },
    pill: {
      paddingHorizontal: rs(12),
      paddingVertical: rs(5),
      borderRadius: rs(14),
    },
    pillText: {
      fontWeight: '700',
      fontSize: rs(11),
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
      minHeight: rs(88),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingTop: rs(14),
      paddingBottom: rs(8),
      paddingHorizontal: rs(4),
      alignItems: 'center',
      overflow: 'visible',
    },
    tilePressed: {
      opacity: 0.88,
      transform: [{ scale: 0.97 }],
    },
    tileGhost: {
      width: TILE_W,
      minHeight: rs(88),
      opacity: 0,
    },
    badgeAbs: {
      position: 'absolute',
      top: rs(-4),
      right: rs(-2),
      zIndex: 2,
    },
    tileIcon: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(9),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(6),
    },
    tileLabel: {
      fontSize: rs(10),
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: rs(13),
      paddingHorizontal: rs(1),
    },
    empty: {
      textAlign: 'center',
      marginTop: rs(40),
      fontSize: rs(14),
    },
  });
}
