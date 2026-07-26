import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { HOME_H_PAD } from './homeLayout';

type Props = { active: boolean };

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
  accent: string;
  headerBg: string;
  headerBgDark: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  {
    id: 'gainers',
    label: 'Top Gainers',
    metric: 'Change %',
    accent: '#2E7D32',
    headerBg: '#E8F5E9',
    headerBgDark: '#1B3320',
    icon: 'trending-up',
  },
  {
    id: 'losers',
    label: 'Top Losers',
    metric: 'Change %',
    accent: '#C62828',
    headerBg: '#FFEBEE',
    headerBgDark: '#3A1B1B',
    icon: 'trending-down',
  },
  {
    id: 'turnover',
    label: 'Top Turnover',
    metric: 'Turnover',
    accent: '#1565C0',
    headerBg: '#E3F2FD',
    headerBgDark: '#0D2137',
    icon: 'cash-multiple',
  },
  {
    id: 'traded',
    label: 'Top Traded Shares',
    metric: 'Shares Traded',
    accent: '#00897B',
    headerBg: '#E0F2F1',
    headerBgDark: '#0D2A28',
    icon: 'chart-bar',
  },
  {
    id: 'transactions',
    label: 'Top Transactions',
    metric: 'Transactions',
    accent: '#F57C00',
    headerBg: '#FFE8CC',
    headerBgDark: '#3A2A12',
    icon: 'swap-horizontal',
  },
];

const SCREEN_W = Dimensions.get('window').width;
/** Slightly narrower so next/prev card peeks at the edge (matches SS carousel). */
const CARD_GAP = 12;
const CARD_PEEK = 18;
const CARD_W = SCREEN_W - HOME_H_PAD * 2 - CARD_PEEK;

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
  const [failed, setFailed] = useState(false);
  if (!iconUrl || failed) {
    return (
      <View style={styles.logoFallback}>
        <Text style={styles.logoLetter}>{symbol.slice(0, 1)}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: iconUrl }}
      style={styles.logo}
      onError={() => setFailed(true)}
    />
  );
}

const DOT_H = rs(8);
const DOT_IDLE_W = rs(8);
const DOT_ACTIVE_W = rs(22);
const DOT_RADIUS = rs(4);

export function HomeMarketPanel({ active }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [data, setData] = useState<NepseMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moverPage, setMoverPage] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<IndexQuote | null>(null);
  const moversRef = useRef<FlatList<(typeof LIST_TABS)[number]>>(null);

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
        iconUrl: s.iconUrl ?? null,
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

  const advanced = data?.summary.advanced ?? 0;
  const declined = data?.summary.declined ?? 0;
  const unchanged = data?.summary.unchanged ?? 0;
  const breadthTotal = Math.max(advanced + declined + unchanged, 1);

  const openStock = (symbol: string) => {
    navigation.navigate('StockDetail', { symbol });
  };

  const moversSnap = CARD_W + rs(CARD_GAP);

  const goMoversPage = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(LIST_TABS.length - 1, page));
      setMoverPage(clamped);
      moversRef.current?.scrollToOffset({
        offset: clamped * moversSnap,
        animated: true,
      });
    },
    [moversSnap],
  );

  const onMoversScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / moversSnap);
      if (page >= 0 && page < LIST_TABS.length) {
        setMoverPage((prev) => (prev === page ? prev : page));
      }
    },
    [moversSnap],
  );

  const renderMoverRow = (item: MoverRow, rank: number, metricColor?: string) => (
    <Pressable
      key={`${item.symbol}-${rank}`}
      style={styles.listRow}
      onPress={() => openStock(item.symbol)}
    >
      <Text style={styles.rank}>#{rank}</Text>
      <StockLogo symbol={item.symbol} iconUrl={item.iconUrl} styles={styles} />
      <View style={styles.rowMid}>
        <Text style={styles.sym} numberOfLines={1}>
          {item.symbol}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text
          style={[
            styles.metric,
            { color: metricColor ?? changeColor(item.pct, colors) },
          ]}
        >
          {item.pct != null
            ? `${item.pct >= 0 ? '+' : ''}${fmtNum(item.pct)}%`
            : '—'}
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
        <Text style={styles.sym} numberOfLines={1}>
          {item.symbol}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[styles.metric, { color: '#1565C0' }]}>
          {fmtMcap(item.turnover)}
        </Text>
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
        <Text style={styles.sym} numberOfLines={1}>
          {item.symbol}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[styles.metric, { color: '#00897B' }]}>
          {fmtMcap(item.shares)}
        </Text>
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
        <Text style={styles.sym} numberOfLines={1}>
          {item.symbol}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.price}>
          {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[styles.metric, { color: '#F57C00' }]}>
          {fmtQty(item.trades)}
        </Text>
        {item.pct != null ? (
          <Text style={[styles.pctSmall, { color: changeColor(item.pct, colors) }]}>
            {`${item.pct >= 0 ? '+' : ''}${fmtNum(item.pct)}%`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  const renderCardBody = (tab: ListTab) => {
    if (!data) return null;
    switch (tab) {
      case 'gainers':
        return (data.gainers ?? [])
          .slice(0, 10)
          .map((r, i) => renderMoverRow(r, i + 1));
      case 'losers':
        return (data.losers ?? [])
          .slice(0, 10)
          .map((r, i) => renderMoverRow(r, i + 1));
      case 'turnover':
        return (data.turnovers ?? [])
          .slice(0, 10)
          .map((r, i) => renderTurnoverRow(r, i + 1));
      case 'traded':
        return tradedRows.slice(0, 10).map((r, i) => renderTradedRow(r, i + 1));
      case 'transactions':
        return (data.transactions ?? [])
          .slice(0, 10)
          .map((r, i) => renderTransactionRow(r, i + 1));
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

  const isOpen = data?.status === 'open';

  const indexHeader = (
    <View style={styles.indexBar}>
      <View
        style={[
          styles.indexPill,
          {
            backgroundColor: isDark
              ? indexUp
                ? '#1B3320'
                : '#3A1B1B'
              : indexUp
                ? '#E8F5E9'
                : '#FFEBEE',
            borderColor: indexTint,
          },
        ]}
      >
        <Text
          style={[
            styles.indexName,
            { color: isDark ? indexTint : '#1A1A1A' },
          ]}
        >
          {indexQuote.name}
        </Text>
        <Text
          style={[
            styles.indexValue,
            { color: isDark ? '#F5F5F5' : '#1A1A1A' },
          ]}
        >
          {fmtNum(indexQuote.current)}
        </Text>
        <Text style={[styles.indexChange, { color: indexTint }]}>
          {indexQuote.change != null
            ? `${indexQuote.change >= 0 ? '+ ' : ''}${fmtNum(indexQuote.change)}`
            : '—'}
        </Text>
        <Text style={[styles.indexPct, { color: indexTint }]}>
          {indexQuote.pct != null
            ? `${indexQuote.pct >= 0 ? '+ ' : ''}${fmtNum(indexQuote.pct)}%`
            : ''}
        </Text>
      </View>
      <Pressable
        style={[styles.shortcutBtn, styles.shortcutUp]}
        onPress={() => goMoversPage(0)}
      >
        <MaterialCommunityIcons name="trending-up" size={rs(24)} color="#fff" />
      </Pressable>
      <Pressable
        style={[styles.shortcutBtn, styles.shortcutDown]}
        onPress={() => goMoversPage(1)}
      >
        <MaterialCommunityIcons name="trending-down" size={rs(24)} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.indexSticky}>{indexHeader}</View>
      <ScrollView
        style={styles.scrollFlex}
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

      {/* Summary card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <View style={styles.summaryTitleRow}>
            <MaterialCommunityIcons
              name="chart-bar"
              size={rs(18)}
              color={colors.accentGreen}
            />
            <Text style={styles.summaryTitle}>Summary</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isDark
                  ? isOpen
                    ? '#1B3320'
                    : '#3A1B1B'
                  : isOpen
                    ? '#E8F5E9'
                    : '#FFEBEE',
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOpen ? colors.accentGreen : colors.danger,
                },
              ]}
            />
            <Text
              style={[
                styles.statusBadgeText,
                { color: isOpen ? colors.accentGreen : colors.danger },
              ]}
            >
              {isOpen ? 'OPEN' : 'CLOSE'} |{' '}
              {fmtAsOf(data?.asOf ?? data?.fetchedAt ?? null)}
            </Text>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>TOTAL TURNOVER</Text>
            <Text style={styles.kpiValue}>
              {fmtMcap(data?.summary.turnover ?? null)}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>TOTAL TRADED SHARES</Text>
            <Text style={styles.kpiValue}>
              {fmtMcap(data?.summary.tradedShares ?? null)}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>TOTAL TRANSACTIONS</Text>
            <Text style={styles.kpiValue}>
              {fmtQty(data?.summary.transactions ?? null)}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>TOTAL SCRIPTS TRADED</Text>
            <Text style={styles.kpiValue}>
              {fmtQty(data?.summary.scripsTraded ?? null)}
            </Text>
          </View>
        </View>

        <View style={styles.breadthLabels}>
          <Text style={[styles.breadthText, { color: colors.accentGreen }]}>
            {advanced} Advancing
          </Text>
          <Text style={[styles.breadthText, { color: colors.textMuted }]}>
            {unchanged} Unchanged
          </Text>
          <Text style={[styles.breadthText, { color: colors.danger }]}>
            {declined} Declining
          </Text>
        </View>
        <View style={styles.breadthBar}>
          <View
            style={[
              styles.breadthSeg,
              {
                flex: advanced / breadthTotal,
                backgroundColor: colors.accentGreen,
                borderTopLeftRadius: rs(6),
                borderBottomLeftRadius: rs(6),
              },
            ]}
          />
          <View
            style={[
              styles.breadthSeg,
              {
                flex: unchanged / breadthTotal,
                backgroundColor: '#B0BEC5',
              },
            ]}
          />
          <View
            style={[
              styles.breadthSeg,
              {
                flex: declined / breadthTotal,
                backgroundColor: colors.danger,
                borderTopRightRadius: rs(6),
                borderBottomRightRadius: rs(6),
              },
            ]}
          />
        </View>
      </View>

      {/* Market Movers carousel */}
      <View style={styles.moversHead}>
        <Text style={styles.moversTitle}>Market Movers</Text>
        <Text style={styles.moversPage}>
          {moverPage + 1}/{LIST_TABS.length}
        </Text>
      </View>
      <View style={styles.dotsRow}>
        {LIST_TABS.map((t, i) => (
          <Pressable key={t.id} onPress={() => goMoversPage(i)} hitSlop={8}>
            <View
              style={{
                height: DOT_H,
                borderRadius: DOT_RADIUS,
                width: i === moverPage ? DOT_ACTIVE_W : DOT_IDLE_W,
                backgroundColor: i === moverPage ? '#2196F3' : '#D0D5DD',
              }}
            />
          </Pressable>
        ))}
      </View>

      <FlatList
        ref={moversRef}
        data={LIST_TABS}
        keyExtractor={(t) => t.id}
        horizontal
        nestedScrollEnabled
        decelerationRate="fast"
        snapToInterval={moversSnap}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMoversScroll}
        onScrollEndDrag={onMoversScroll}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: moversSnap,
          offset: moversSnap * index,
          index,
        })}
        contentContainerStyle={styles.moversCarousel}
        renderItem={({ item: tab, index }) => {
          const nearby = Math.abs(index - moverPage) <= 1;
          return (
            <View
              style={[
                styles.moverCard,
                {
                  width: CARD_W,
                  marginRight: index === LIST_TABS.length - 1 ? 0 : rs(CARD_GAP),
                  borderColor: isDark ? colors.borderMuted : `${tab.accent}55`,
                },
              ]}
            >
              <View
                style={[
                  styles.moverCardHead,
                  {
                    backgroundColor: isDark ? tab.headerBgDark : tab.headerBg,
                  },
                ]}
              >
                <View style={styles.moverCardTitleRow}>
                  <MaterialCommunityIcons
                    name={tab.icon}
                    size={rs(18)}
                    color={tab.accent}
                  />
                  <Text style={[styles.moverCardTitle, { color: tab.accent }]}>
                    {tab.label}
                  </Text>
                </View>
                <Text style={styles.moverCardMetric}>{tab.metric}</Text>
              </View>
              <View style={styles.moverCardBody}>
                {nearby ? (
                  renderCardBody(tab.id)
                ) : (
                  <View style={styles.moverCardPlaceholder} />
                )}
              </View>
            </View>
          );
        }}
      />

      <Pressable
        style={styles.moreLink}
        onPress={() => navigation.navigate('NepseData', { tab: 'live' })}
      >
        <Text style={styles.moreLinkText}>See full market data →</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1 },
    scrollFlex: { flex: 1 },
    indexSticky: {
      paddingHorizontal: HOME_H_PAD,
      paddingTop: rs(8),
      paddingBottom: rs(6),
      backgroundColor: c.bg,
      zIndex: 2,
    },
    scroll: {
      paddingHorizontal: HOME_H_PAD,
      paddingBottom: rs(28),
      paddingTop: rs(4),
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: rs(48),
    },
    loadingText: { color: c.textMuted, marginTop: rs(12), fontSize: rs(13) },

    indexBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    indexPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: rs(6),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderRadius: rs(22),
      borderWidth: 1.5,
    },
    indexName: { fontWeight: '800', fontSize: rs(13) },
    indexValue: { fontWeight: '800', fontSize: rs(15) },
    indexChange: { fontWeight: '700', fontSize: rs(12) },
    indexPct: { fontWeight: '700', fontSize: rs(12) },
    shortcutBtn: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    shortcutUp: {
      backgroundColor: '#2E7D32',
    },
    shortcutDown: {
      backgroundColor: '#C62828',
    },

    summaryCard: {
      marginTop: rs(14),
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E8C4C4',
      backgroundColor: isDark ? '#1C1C1C' : c.surface,
      padding: rs(14),
    },
    summaryHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(12),
      gap: rs(8),
    },
    summaryTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
    },
    summaryTitle: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
      borderRadius: rs(14),
      maxWidth: '58%',
    },
    statusDot: { width: rs(7), height: rs(7), borderRadius: rs(4) },
    statusBadgeText: {
      fontWeight: '700',
      fontSize: rs(10),
      flexShrink: 1,
    },
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
    },
    kpiBox: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: isDark ? '#262626' : '#F3F5F0',
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
    kpiLabel: {
      color: c.textMuted,
      fontSize: rs(9),
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    kpiValue: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginTop: rs(4),
    },
    breadthLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: rs(14),
      marginBottom: rs(8),
    },
    breadthText: { fontWeight: '700', fontSize: rs(11) },
    breadthBar: {
      flexDirection: 'row',
      height: rs(8),
      borderRadius: rs(6),
      overflow: 'hidden',
      backgroundColor: c.borderMuted,
    },
    breadthSeg: { height: '100%' },

    moversHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: rs(20),
      marginBottom: rs(10),
    },
    moversTitle: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    moversPage: { color: '#9E9E9E', fontWeight: '600', fontSize: rs(13) },
    dotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(7),
      marginBottom: rs(14),
    },
    moversCarousel: {
      paddingRight: rs(CARD_PEEK),
      alignItems: 'flex-start',
    },
    moverCard: {
      borderRadius: rs(18),
      borderWidth: 1,
      backgroundColor: isDark ? '#1C1C1C' : c.surface,
      overflow: 'hidden',
    },
    moverCardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(13),
    },
    moverCardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    moverCardTitle: { fontWeight: '800', fontSize: rs(14) },
    moverCardMetric: {
      color: isDark ? '#9E9E9E' : '#9E9E9E',
      fontSize: rs(12),
      fontWeight: '500',
    },
    moverCardBody: { paddingHorizontal: rs(10), paddingBottom: rs(4) },
    moverCardPlaceholder: { height: rs(380) },

    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(9),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#2A2A2A' : c.borderMuted,
      gap: rs(8),
    },
    rank: {
      color: c.textMuted,
      fontSize: rs(11),
      width: rs(24),
      fontWeight: '700',
    },
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
    pctSmall: { fontSize: rs(10), fontWeight: '700', marginTop: rs(1) },
    moreLink: { marginTop: rs(10), alignItems: 'center', paddingBottom: rs(4) },
    moreLinkText: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
  });
}
