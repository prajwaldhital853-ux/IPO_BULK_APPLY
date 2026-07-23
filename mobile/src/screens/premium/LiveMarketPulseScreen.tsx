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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MarketChartSection } from '../../components/nepse/MarketChartSection';
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  fmtMcap,
  fmtNum,
  loadNepseMarketSnapshot,
  type IndexQuote,
  type MoverRow,
  type NepseMarketSnapshot,
  type TurnoverRow,
} from '../../services/nepse';
import {
  loadMarketPulse,
  type MarketPulse,
} from '../../services/nepse/premiumAnalytics';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

type ListTab = 'gainers' | 'losers' | 'turnover' | 'demand' | 'supply';

const LIST_TABS: { id: ListTab; label: string }[] = [
  { id: 'gainers', label: 'Gainers' },
  { id: 'losers', label: 'Losers' },
  { id: 'turnover', label: 'Turnover' },
  { id: 'demand', label: 'Demand' },
  { id: 'supply', label: 'Supply' },
];

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN');
}

function fmtAsOf(iso: string | null): string {
  if (!iso) return 'Live feed';
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
  iconUrl?: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (iconUrl) return <Image source={{ uri: iconUrl }} style={styles.logo} />;
  return (
    <View style={styles.logoFallback}>
      <Text style={styles.logoLetter}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

function BreadthBar({
  advanced,
  declined,
  unchanged,
  colors,
  styles,
}: {
  advanced: number;
  declined: number;
  unchanged: number;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const total = Math.max(advanced + declined + unchanged, 1);
  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barSeg,
          {
            flex: advanced / total,
            backgroundColor: colors.accentGreen,
            borderTopLeftRadius: rs(6),
            borderBottomLeftRadius: rs(6),
          },
        ]}
      />
      <View
        style={[
          styles.barSeg,
          { flex: unchanged / total, backgroundColor: '#42A5F5' },
        ]}
      />
      <View
        style={[
          styles.barSeg,
          {
            flex: declined / total,
            backgroundColor: colors.danger,
            borderTopRightRadius: rs(6),
            borderBottomRightRadius: rs(6),
          },
        ]}
      />
    </View>
  );
}

export function LiveMarketPulseScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [data, setData] = useState<NepseMarketSnapshot | null>(null);
  const [pulse, setPulse] = useState<MarketPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listTab, setListTab] = useState<ListTab>('gainers');
  const [selectedIndex, setSelectedIndex] = useState<IndexQuote | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [snap, pulseData] = await Promise.all([
        loadNepseMarketSnapshot({ allowCache: !silent }),
        loadMarketPulse(),
      ]);
      setData(snap);
      setPulse(pulseData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const indexQuote = selectedIndex ?? {
    name: 'NEPSE',
    symbol: 'NEPSE',
    current: data?.summary.index ?? null,
    change: data?.summary.indexChange ?? null,
    pct: data?.summary.indexPct ?? null,
  };
  const indexUp = (indexQuote.change ?? 0) >= 0;
  const indexTint = indexUp ? colors.accentGreen : colors.danger;

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

  const openStock = (symbol: string) => {
    navigation.navigate('StockDetail', { symbol });
  };

  const advanced =
    pulse?.breadth?.advanced ?? data?.summary.advanced ?? 0;
  const declined =
    pulse?.breadth?.declined ?? data?.summary.declined ?? 0;
  const unchanged =
    pulse?.breadth?.unchanged ?? data?.summary.unchanged ?? 0;

  const renderMover = (item: MoverRow, rank: number) => (
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
        <Text style={[styles.metric, { color: changeColor(item.pct, colors) }]}>
          {item.pct != null
            ? `${item.pct >= 0 ? '+' : ''}${fmtNum(item.pct)}%`
            : '—'}
        </Text>
      </View>
    </Pressable>
  );

  const renderTurnover = (item: TurnoverRow, rank: number) => (
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
        <Text style={[styles.metric, { color: '#42A5F5' }]}>
          {fmtMcap(item.turnover)}
        </Text>
      </View>
    </Pressable>
  );

  const renderBook = (
    rows: Array<{ symbol: string; quantity: number; price: number | null }>,
    tone: 'demand' | 'supply',
  ) =>
    rows.map((item, i) => (
      <Pressable
        key={`${tone}-${item.symbol}-${i}`}
        style={styles.listRow}
        onPress={() => openStock(item.symbol)}
      >
        <Text style={styles.rank}>#{i + 1}</Text>
        <StockLogo symbol={item.symbol} styles={styles} />
        <View style={styles.rowMid}>
          <Text style={styles.sym}>{item.symbol}</Text>
          <Text style={styles.name}>
            {tone === 'demand' ? 'Buy pressure' : 'Sell pressure'}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.price}>
            {item.price != null ? fmtNum(item.price) : '—'}
          </Text>
          <Text
            style={[
              styles.metric,
              {
                color:
                  tone === 'demand' ? colors.accentGreen : colors.danger,
              },
            ]}
          >
            {fmtQty(item.quantity)}
          </Text>
        </View>
      </Pressable>
    ));

  const listBody = useMemo(() => {
    if (!data && !pulse) return [] as React.ReactNode[];
    switch (listTab) {
      case 'gainers':
        return (data?.gainers ?? [])
          .slice(0, 12)
          .map((r, i) => renderMover(r, i + 1));
      case 'losers':
        return (data?.losers ?? [])
          .slice(0, 12)
          .map((r, i) => renderMover(r, i + 1));
      case 'turnover':
        return (data?.turnovers ?? [])
          .slice(0, 12)
          .map((r, i) => renderTurnover(r, i + 1));
      case 'demand':
        return renderBook(pulse?.demand ?? [], 'demand');
      case 'supply':
        return renderBook(pulse?.supply ?? [], 'supply');
      default:
        return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- render helpers close over latest data/colors
  }, [data, pulse, listTab, colors]);


  const body = loading && !data ? (
    <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
  ) : (
    <ScrollView
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
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Status + index hero */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.liveBadge}>
            <View
              style={[
                styles.liveDot,
                {
                  backgroundColor:
                    data?.status === 'open'
                      ? colors.accentGreen
                      : colors.danger,
                },
              ]}
            />
            <Text
              style={[
                styles.liveText,
                {
                  color:
                    data?.status === 'open'
                      ? colors.accentGreen
                      : colors.danger,
                },
              ]}
            >
              {data?.status === 'open'
                ? 'MARKET OPEN'
                : pulse?.status?.toUpperCase() || 'CLOSED'}
            </Text>
          </View>
          <Text style={styles.asOf}>
            {fmtAsOf(data?.asOf ?? pulse?.asOf ?? data?.fetchedAt ?? null)}
          </Text>
        </View>
        <Text style={[styles.indexName, { color: indexTint }]}>
          {indexQuote.name}
        </Text>
        <Text style={styles.indexValue}>{fmtNum(indexQuote.current)}</Text>
        <Text style={[styles.indexChange, { color: indexTint }]}>
          {indexQuote.change != null
            ? `${indexQuote.change >= 0 ? '+' : ''}${fmtNum(indexQuote.change)}`
            : '—'}
          {indexQuote.pct != null
            ? `  (${indexQuote.pct >= 0 ? '+' : ''}${fmtNum(indexQuote.pct)}%)`
            : ''}
        </Text>
      </View>

      {/* KPI boxes */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Turnover</Text>
          <Text style={styles.kpiValue}>
            {fmtMcap(data?.summary.turnover ?? null)}
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Volume</Text>
          <Text style={styles.kpiValue}>
            {fmtMcap(data?.summary.tradedShares ?? null)}
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Trades</Text>
          <Text style={styles.kpiValue}>
            {fmtQty(data?.summary.transactions)}
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Scrips</Text>
          <Text style={styles.kpiValue}>
            {fmtQty(data?.summary.scripsTraded)}
          </Text>
        </View>
      </View>

      {/* Breadth */}
      <View style={styles.card}>
        <Text style={styles.section}>Market breadth</Text>
        <BreadthBar
          advanced={advanced}
          declined={declined}
          unchanged={unchanged}
          colors={colors}
          styles={styles}
        />
        <View style={styles.breadthRow}>
          <View style={styles.bItem}>
            <Text style={[styles.bNum, { color: colors.accentGreen }]}>
              {advanced}
            </Text>
            <Text style={styles.bLabel}>Adv</Text>
          </View>
          <View style={styles.bItem}>
            <Text style={[styles.bNum, { color: '#42A5F5' }]}>{unchanged}</Text>
            <Text style={styles.bLabel}>Flat</Text>
          </View>
          <View style={styles.bItem}>
            <Text style={[styles.bNum, { color: colors.danger }]}>
              {declined}
            </Text>
            <Text style={styles.bLabel}>Dec</Text>
          </View>
        </View>
        {pulse?.breadth ? (
          <Text style={styles.circuit}>
            Circuit hits: +{pulse.breadth.positiveCircuit} / −
            {pulse.breadth.negativeCircuit}
          </Text>
        ) : null}
      </View>

      {/* Chart */}
      {data ? (
        <View style={styles.chartWrap}>
          <Text style={styles.section}>Index chart</Text>
          <MarketChartSection
            indexQuote={indexQuote}
            sectorOptions={sectorOptions}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            intradayPoints={data.chartPoints}
            isDark={isDark}
            colors={colors}
            onSearchPress={() =>
              navigation.navigate('NepseData', {
                tab: 'live',
                openSearch: true,
              })
            }
          />
        </View>
      ) : null}

      {/* Sub-index chips */}
      {(data?.subIndices?.length ?? 0) > 0 ? (
        <>
          <Text style={styles.section}>Sector indices</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {(data?.subIndices ?? []).slice(0, 16).map((idx) => {
              const up = (idx.change ?? 0) >= 0;
              return (
                <Pressable
                  key={idx.name}
                  style={styles.sectorChip}
                  onPress={() => setSelectedIndex(idx)}
                >
                  <Text style={styles.sectorName} numberOfLines={1}>
                    {idx.name.replace(/ Index$/i, '')}
                  </Text>
                  <Text
                    style={[
                      styles.sectorPct,
                      {
                        color: up ? colors.accentGreen : colors.danger,
                      },
                    ]}
                  >
                    {idx.pct != null
                      ? `${idx.pct >= 0 ? '+' : ''}${fmtNum(idx.pct)}%`
                      : '—'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {/* Interactive tables */}
      <Text style={[styles.section, { marginTop: rs(12) }]}>Live tables</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {LIST_TABS.map((t) => {
          const active = listTab === t.id;
          return (
            <Pressable
              key={t.id}
              style={[styles.tabChip, active && styles.tabChipActive]}
              onPress={() => setListTab(t.id)}
            >
              <Text
                style={[styles.tabChipText, active && styles.tabChipTextActive]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={styles.thLeft}># Symbol</Text>
          <Text style={styles.thRight}>
            {listTab === 'turnover'
              ? 'LTP / Turnover'
              : listTab === 'demand' || listTab === 'supply'
                ? 'Price / Qty'
                : 'LTP / %'}
          </Text>
        </View>
        {listBody.length ? listBody : (
          <Text style={styles.empty}>No rows for this tab yet.</Text>
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Live Market Pulse</Text>
        <Pressable onPress={() => void refresh(true)} hitSlop={12}>
          <Ionicons name="refresh" size={rs(20)} color={colors.primary} />
        </Pressable>
      </View>
      <PremiumGate title="Live Market Pulse">{body}</PremiumGate>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    scroll: { padding: rs(16), paddingBottom: rs(40) },
    hero: {
      padding: rs(16),
      borderRadius: rs(16),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      marginBottom: rs(12),
    },
    heroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: rs(8),
    },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    liveDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
    liveText: { fontWeight: '800', fontSize: rs(11), letterSpacing: 0.4 },
    asOf: { color: c.textMuted, fontSize: rs(10) },
    indexName: { fontWeight: '700', fontSize: rs(13) },
    indexValue: {
      color: c.text,
      fontWeight: '900',
      fontSize: rs(28),
      marginTop: rs(2),
    },
    indexChange: { fontWeight: '700', fontSize: rs(14), marginTop: rs(4) },
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(12),
    },
    kpiBox: {
      width: '48%',
      flexGrow: 1,
      padding: rs(12),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    kpiLabel: { color: c.textMuted, fontSize: rs(10), fontWeight: '600' },
    kpiValue: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginTop: rs(4),
    },
    card: {
      padding: rs(14),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      marginBottom: rs(12),
    },
    section: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginBottom: rs(10),
    },
    barTrack: {
      flexDirection: 'row',
      height: rs(10),
      borderRadius: rs(6),
      overflow: 'hidden',
      backgroundColor: c.borderMuted,
      marginBottom: rs(12),
    },
    barSeg: { height: '100%' },
    breadthRow: { flexDirection: 'row', justifyContent: 'space-around' },
    bItem: { alignItems: 'center' },
    bNum: { color: c.text, fontWeight: '800', fontSize: rs(18) },
    bLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    circuit: {
      color: c.textSecondary,
      fontSize: rs(11),
      marginTop: rs(10),
      textAlign: 'center',
    },
    chartWrap: { marginBottom: rs(8) },
    chipRow: { gap: rs(8), paddingBottom: rs(8) },
    sectorChip: {
      minWidth: rs(96),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    sectorName: { color: c.text, fontWeight: '700', fontSize: rs(11) },
    sectorPct: { fontWeight: '800', fontSize: rs(12), marginTop: rs(4) },
    tabRow: { gap: rs(8), paddingBottom: rs(10) },
    tabChip: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(18),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    tabChipActive: {
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    tabChipText: { color: c.textMuted, fontWeight: '700', fontSize: rs(12) },
    tabChipTextActive: { color: c.text },
    table: {
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      overflow: 'hidden',
    },
    tableHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    thLeft: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    thRight: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      gap: rs(8),
    },
    rank: {
      width: rs(22),
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
    },
    logo: { width: rs(28), height: rs(28), borderRadius: rs(14) },
    logoFallback: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(12) },
    rowMid: { flex: 1, minWidth: 0 },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    name: { color: c.textMuted, fontSize: rs(10), marginTop: 1 },
    rowRight: { alignItems: 'flex-end' },
    price: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    metric: { fontWeight: '800', fontSize: rs(11), marginTop: 2 },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(24),
      fontSize: rs(12),
    },
  });
}
