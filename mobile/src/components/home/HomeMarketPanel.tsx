import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MarketChartSection } from '../nepse/MarketChartSection';
import { useTheme } from '../../context/ThemeContext';
import {
  fmtMcap,
  fmtNum,
  loadNepseMarketSnapshot,
  type IndexQuote,
  type MoverRow,
  type NepseMarketSnapshot,
  type TradedShareRow,
  type TransactionRow,
  type TurnoverRow,
} from '../../services/nepse';
import type { ThemeColors } from '../../theme/colors';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

type Props = {
  active: boolean;
};

type ListTab =
  | 'gainers'
  | 'losers'
  | 'turnover'
  | 'traded'
  | 'transactions';

const LIST_TABS: {
  id: ListTab;
  label: string;
  metric: string;
  color: string;
}[] = [
  { id: 'gainers', label: 'Top Gainers', metric: 'Change %', color: 'green' },
  { id: 'losers', label: 'Top Losers', metric: 'Change %', color: 'red' },
  { id: 'turnover', label: 'Top Turnover', metric: 'Turnover', color: 'blue' },
  { id: 'traded', label: 'Top Traded', metric: 'Volume', color: 'teal' },
  { id: 'transactions', label: 'Top Txns', metric: 'Trades', color: 'orange' },
];

function fmtQty(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN');
}

function fmtAsOf(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ', ');
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function changeColor(value: number | null, colors: ThemeColors): string {
  if (value == null || value === 0) return '#42A5F5';
  return value > 0 ? colors.accentGreen : colors.danger;
}

function StockLogo({
  symbol,
  iconUrl,
  styles,
}: {
  symbol: string;
  iconUrl: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (iconUrl) {
    return <Image source={{ uri: iconUrl }} style={styles.logo} />;
  }
  return (
    <View style={styles.logoFallback}>
      <Text style={styles.logoLetter}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

export function HomeMarketPanel({ active }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [data, setData] = useState<NepseMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listTab, setListTab] = useState<ListTab>('gainers');
  const [selectedIndex, setSelectedIndex] = useState<IndexQuote | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await loadNepseMarketSnapshot({ allowCache: !silent });
      setData(snap);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  usePollingRefresh(refresh, undefined, active);

  const indexQuote = selectedIndex ?? {
    name: 'NEPSE',
    symbol: 'NEPSE',
    current: data?.summary.index ?? null,
    change: data?.summary.indexChange ?? null,
    pct: data?.summary.indexPct ?? null,
  };

  const indexUp = (indexQuote.change ?? 0) >= 0;
  const indexTint = indexUp ? colors.accentGreen : colors.danger;

  const tradedRows = useMemo((): TradedShareRow[] => {
    if (data?.tradedShares?.length) return data.tradedShares;
    if (!data?.securities?.length) return [];
    return [...data.securities]
      .filter((s) => (s.qty ?? 0) > 0)
      .sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0))
      .slice(0, 10)
      .map((s) => ({
        symbol: s.symbol,
        name: s.name,
        ltp: s.ltp,
        shares: s.qty,
        pct: s.pct,
        iconUrl: null,
      }));
  }, [data]);

  const sectorOptions = useMemo(() => {
    const nepse: IndexQuote = {
      name: 'NEPSE',
      symbol: 'NEPSE',
      current: data?.summary.index ?? null,
      change: data?.summary.indexChange ?? null,
      pct: data?.summary.indexPct ?? null,
    };
    return [nepse, ...(data?.subIndices ?? [])];
  }, [data]);

  const activeListMeta = LIST_TABS.find((t) => t.id === listTab)!;

  const openStock = (symbol: string) => {
    navigation.navigate('StockDetail', { symbol });
  };

  const renderMoverRow = (item: MoverRow, rank: number) => (
    <Pressable
      key={`${item.symbol}-${rank}`}
      style={styles.listRow}
      onPress={() => openStock(item.symbol)}
    >
      <Text style={styles.rank}>#{rank}</Text>
      <StockLogo symbol={item.symbol} iconUrl={item.iconUrl} styles={styles} />
      <View style={styles.rowMid}>
        <Text style={styles.sym} numberOfLines={1}>{item.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[styles.metric, { color: changeColor(item.pct, colors) }]}>
          {item.pct != null ? `${item.pct >= 0 ? '+' : ''}${fmtNum(item.pct)}%` : '—'}
        </Text>
      </View>
    </Pressable>
  );

  const renderTurnoverRow = (item: TurnoverRow, rank: number) => (
    <Pressable
      key={`${item.symbol}-${rank}`}
      style={styles.listRow}
      onPress={() => openStock(item.symbol)}
    >
      <Text style={styles.rank}>#{rank}</Text>
      <StockLogo symbol={item.symbol} iconUrl={item.iconUrl} styles={styles} />
      <View style={styles.rowMid}>
        <Text style={styles.sym} numberOfLines={1}>{item.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[styles.metric, styles.metricBlue]}>{fmtMcap(item.turnover)}</Text>
        {item.pct != null ? (
          <Text style={[styles.pctSmall, { color: changeColor(item.pct, colors) }]}>
            {`${item.pct >= 0 ? '+' : ''}${fmtNum(item.pct)}%`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  const renderTransactionRow = (item: TransactionRow, rank: number) => (
    <Pressable
      key={`${item.symbol}-${rank}`}
      style={styles.listRow}
      onPress={() => openStock(item.symbol)}
    >
      <Text style={styles.rank}>#{rank}</Text>
      <StockLogo symbol={item.symbol} iconUrl={item.iconUrl} styles={styles} />
      <View style={styles.rowMid}>
        <Text style={styles.sym} numberOfLines={1}>{item.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[styles.metric, styles.metricOrange]}>{fmtQty(item.trades)}</Text>
        {item.pct != null ? (
          <Text style={[styles.pctSmall, { color: changeColor(item.pct, colors) }]}>
            {`${item.pct >= 0 ? '+' : ''}${fmtNum(item.pct)}%`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  const renderTradedRow = (item: TradedShareRow, rank: number) => (
    <Pressable
      key={`${item.symbol}-${rank}`}
      style={styles.listRow}
      onPress={() => openStock(item.symbol)}
    >
      <Text style={styles.rank}>#{rank}</Text>
      <StockLogo symbol={item.symbol} iconUrl={item.iconUrl} styles={styles} />
      <View style={styles.rowMid}>
        <Text style={styles.sym} numberOfLines={1}>{item.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[styles.metric, styles.metricTeal]}>{fmtQty(item.shares)}</Text>
        {item.pct != null ? (
          <Text style={[styles.pctSmall, { color: changeColor(item.pct, colors) }]}>
            {`${item.pct >= 0 ? '+' : ''}${fmtNum(item.pct)}%`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  const renderListBody = () => {
    if (!data) return null;
    switch (listTab) {
      case 'gainers':
        return (data.gainers ?? []).slice(0, 10).map((r, i) => renderMoverRow(r, i + 1));
      case 'losers':
        return (data.losers ?? []).slice(0, 10).map((r, i) => renderMoverRow(r, i + 1));
      case 'turnover':
        return (data.turnovers ?? []).slice(0, 10).map((r, i) => renderTurnoverRow(r, i + 1));
      case 'traded':
        return tradedRows.slice(0, 10).map((r, i) => renderTradedRow(r, i + 1));
      case 'transactions':
        return (data.transactions ?? []).slice(0, 10).map((r, i) => renderTransactionRow(r, i + 1));
      default:
        return null;
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading live market…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true);
          }}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.indexRow}>
        <Text style={[styles.indexLabel, { color: indexTint }]}>{indexQuote.name}</Text>
        <Text style={[styles.indexValue, { color: colors.text }]}>
          {fmtNum(indexQuote.current)}
        </Text>
        <Text style={[styles.indexChange, { color: indexTint }]}>
          {indexQuote.change != null
            ? `${indexQuote.change >= 0 ? '+' : ''}${fmtNum(indexQuote.change)}`
            : '—'}
        </Text>
        <Text style={[styles.indexPct, { color: indexTint }]}>
          {indexQuote.pct != null
            ? `${indexQuote.pct >= 0 ? '+' : ''}${fmtNum(indexQuote.pct)}%`
            : ''}
        </Text>
        <Pressable
          style={styles.liveLink}
          onPress={() => navigation.navigate('NepseData')}
        >
          <Ionicons name="open-outline" size={rs(16)} color={colors.primary} />
        </Pressable>
      </View>

      {data ? (
        <MarketChartSection
          indexQuote={indexQuote}
          sectorOptions={sectorOptions}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          intradayPoints={data.chartPoints}
          isDark={isDark}
          colors={colors}
          onSearchPress={() =>
            navigation.navigate('NepseData', { tab: 'live', openSearch: true })
          }
        />
      ) : null}

      <View style={styles.summaryHead}>
        <Text style={styles.sectionTitle}>Market Summary</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  data?.status === 'open' ? colors.accentGreen : colors.danger,
              },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              {
                color:
                  data?.status === 'open' ? colors.accentGreen : colors.danger,
              },
            ]}
          >
            {data?.status === 'open' ? 'OPEN' : 'CLOSED'}
          </Text>
          <Text style={styles.statusTime}>
            {fmtAsOf(data?.asOf ?? data?.fetchedAt ?? null)}
          </Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Turnover</Text>
          <Text style={styles.summaryValue}>{fmtMcap(data?.summary.turnover ?? null)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Traded Shares</Text>
          <Text style={styles.summaryValue}>{fmtMcap(data?.summary.tradedShares ?? null)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Transactions</Text>
          <Text style={styles.summaryValue}>{fmtQty(data?.summary.transactions ?? null)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Scripts Traded</Text>
          <Text style={styles.summaryValue}>{fmtQty(data?.summary.scripsTraded ?? null)}</Text>
        </View>
      </View>

      <View style={styles.breadthRow}>
        <View style={styles.breadthItem}>
          <Text style={[styles.breadthNum, { color: colors.accentGreen }]}>
            {data?.summary.advanced ?? '—'}
          </Text>
          <Text style={styles.breadthLabel}>Advanced</Text>
        </View>
        <View style={styles.breadthItem}>
          <Text style={[styles.breadthNum, { color: colors.danger }]}>
            {data?.summary.declined ?? '—'}
          </Text>
          <Text style={styles.breadthLabel}>Declined</Text>
        </View>
        <View style={styles.breadthItem}>
          <Text style={[styles.breadthNum, { color: '#42A5F5' }]}>
            {data?.summary.unchanged ?? '—'}
          </Text>
          <Text style={styles.breadthLabel}>Unchanged</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Market Movers</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {LIST_TABS.map((t) => {
          const activeTab = listTab === t.id;
          return (
            <Pressable
              key={t.id}
              style={[styles.tabChip, activeTab && styles.tabChipActive]}
              onPress={() => setListTab(t.id)}
            >
              <Text style={[styles.tabChipText, activeTab && styles.tabChipTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>{activeListMeta.label}</Text>
        <Text style={styles.listMetric}>{activeListMeta.metric}</Text>
      </View>

      {renderListBody()}

      <Pressable
        style={styles.moreLink}
        onPress={() => navigation.navigate('NepseData', { tab: 'live' })}
      >
        <Text style={styles.moreLinkText}>See full market data →</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingHorizontal: rs(16), paddingBottom: rs(100), paddingTop: rs(8) },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: rs(48),
    },
    loadingText: { color: c.textMuted, marginTop: rs(12), fontSize: rs(13) },
    indexRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: rs(8),
      paddingVertical: rs(6),
    },
    indexLabel: { fontWeight: '800', fontSize: rs(14) },
    indexValue: { fontWeight: '800', fontSize: rs(18) },
    indexChange: { fontWeight: '700', fontSize: rs(13) },
    indexPct: { fontWeight: '700', fontSize: rs(13) },
    liveLink: { marginLeft: 'auto', padding: rs(4) },
    summaryHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: rs(16),
      marginBottom: rs(10),
    },
    sectionTitle: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
    statusDot: { width: rs(7), height: rs(7), borderRadius: rs(4) },
    statusText: { fontWeight: '800', fontSize: rs(10) },
    statusTime: { color: c.textMuted, fontSize: rs(10) },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(12),
    },
    summaryItem: { width: '47%' },
    summaryLabel: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    summaryValue: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginTop: rs(3),
    },
    breadthRow: {
      flexDirection: 'row',
      marginTop: rs(14),
      gap: rs(16),
    },
    breadthItem: { flex: 1, alignItems: 'center' },
    breadthNum: { fontWeight: '800', fontSize: rs(18) },
    breadthLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: rs(16),
    },
    tabRow: { gap: rs(8), paddingVertical: rs(10) },
    tabChip: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(20),
      backgroundColor: c.surfaceAlt,
    },
    tabChipActive: { backgroundColor: c.primarySoft },
    tabChipText: { color: c.textMuted, fontWeight: '600', fontSize: rs(12) },
    tabChipTextActive: { color: c.primary, fontWeight: '800' },
    listHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(4),
    },
    listTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    listMetric: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      gap: rs(8),
    },
    rank: { color: c.textMuted, fontSize: rs(11), width: rs(24), fontWeight: '700' },
    logo: { width: rs(32), height: rs(32), borderRadius: rs(16) },
    logoFallback: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    rowMid: { flex: 1, minWidth: 0 },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    name: { color: c.textMuted, fontSize: rs(10), marginTop: rs(1) },
    rowRight: { alignItems: 'flex-end', minWidth: rs(72) },
    price: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    metric: { fontWeight: '700', fontSize: rs(11), marginTop: rs(2) },
    metricBlue: { color: '#42A5F5' },
    metricTeal: { color: '#26a69a' },
    metricOrange: { color: '#FF9800' },
    pctSmall: { fontSize: rs(10), fontWeight: '700', marginTop: rs(1) },
    moreLink: { marginTop: rs(16), alignItems: 'center', paddingBottom: rs(8) },
    moreLinkText: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
  });
}
