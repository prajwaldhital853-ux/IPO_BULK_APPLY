import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MarketChartSection } from '../components/nepse/MarketChartSection';
import { useTheme } from '../context/ThemeContext';
import {
  loadNepseMarketSnapshot,
  type IndexQuote,
  type MoverRow,
  type NepseMarketSnapshot,
  type SecurityQuote,
  type TransactionRow,
  type TurnoverRow,
} from '../services/nepse';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type MainTab = 'summary' | 'live' | 'movers' | 'today';
type MoverTab = 'gainers' | 'losers' | 'turnovers' | 'transactions';

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'live', label: 'Live Market' },
  { id: 'movers', label: 'Market Movers' },
  { id: 'today', label: "Today's Share Price" },
];

const MOVER_TABS: { id: MoverTab; label: string }[] = [
  { id: 'gainers', label: 'Gainers' },
  { id: 'losers', label: 'Losers' },
  { id: 'turnovers', label: 'Turnovers' },
  { id: 'transactions', label: 'Transactions' },
];

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

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
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function changeColor(
  value: number | null,
  colors: ThemeColors,
): { color: string; icon: '▲' | '▼' | '■' } {
  if (value == null || value === 0) {
    return { color: '#42A5F5', icon: '■' };
  }
  if (value > 0) return { color: colors.accentGreen, icon: '▲' };
  return { color: colors.danger, icon: '▼' };
}

function IndexPill({
  data,
  indexQuote,
  colors,
  styles,
}: {
  data: NepseMarketSnapshot;
  indexQuote?: IndexQuote;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const quote = indexQuote ?? {
    name: 'NEPSE',
    current: data.summary.index,
    change: data.summary.indexChange,
    pct: data.summary.indexPct,
  };
  const ch = quote.change;
  const pct = quote.pct;
  const tint = changeColor(ch, colors).color;
  const up = (ch ?? 0) >= 0;
  return (
    <View style={styles.indexPill}>
      <Text style={styles.pillLabel}>{quote.name}</Text>
      <Text style={styles.pillValue}>{fmtNum(quote.current)}</Text>
      <View style={styles.pillChangeWrap}>
        <Ionicons
          name={up ? 'caret-up' : 'caret-down'}
          size={rs(12)}
          color={tint}
        />
        <Text style={[styles.pillChange, { color: tint }]}>
          {ch != null ? `${ch >= 0 ? '+ ' : ''}${fmtNum(Math.abs(ch))}` : '—'}
        </Text>
        <Text style={[styles.pillPct, { color: tint }]}>
          {pct != null
            ? `${pct >= 0 ? '+ ' : ''}${fmtNum(Math.abs(pct))}%`
            : ''}
        </Text>
      </View>
    </View>
  );
}

function TableHeader({
  cols,
  styles,
  layout,
}: {
  cols: string[];
  styles: ReturnType<typeof makeStyles>;
  layout: ('sym' | 'sn' | 'num' | 'narrow' | 'wide')[];
}) {
  return (
    <View style={styles.tableHead}>
      {cols.map((col, i) => (
        <Text
          key={col}
          style={[
            styles.th,
            layout[i] === 'sym' && styles.colSym,
            layout[i] === 'sn' && styles.colSn,
            layout[i] === 'num' && styles.colNum,
            layout[i] === 'narrow' && styles.colNarrow,
            layout[i] === 'wide' && styles.colWide,
          ]}
          numberOfLines={1}
        >
          {col}
        </Text>
      ))}
    </View>
  );
}

function ChangeCell({
  value,
  colors,
  styles,
  pct = false,
}: {
  value: number | null;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  pct?: boolean;
}) {
  const { color } = changeColor(value, colors);
  const up = (value ?? 0) > 0;
  const down = (value ?? 0) < 0;
  const text =
    value == null
      ? '—'
      : `${value >= 0 ? '+' : ''}${fmtNum(value, pct ? 2 : 2)}${pct ? '%' : ''}`;
  return (
    <View style={styles.changeCellRow}>
      {up || down ? (
        <Ionicons
          name={up ? 'caret-up' : 'caret-down'}
          size={rs(11)}
          color={color}
        />
      ) : null}
      <Text style={[styles.changeCell, { color }]}>{text}</Text>
    </View>
  );
}

export function NepseDataScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'NepseData'>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [data, setData] = useState<NepseMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MainTab>(route.params?.tab ?? 'summary');
  const [moverTab, setMoverTab] = useState<MoverTab>('gainers');
  const [searchOpen, setSearchOpen] = useState(
    Boolean(route.params?.openSearch || route.params?.query),
  );
  const [query, setQuery] = useState(route.params?.query ?? '');
  const [selectedIndex, setSelectedIndex] = useState<IndexQuote | null>(null);
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const snap = await loadNepseMarketSnapshot({ allowCache: !silent });
      setData(snap);
      if (snap.source === 'offline') {
        setError('Could not reach NEPSE live feed. Pull to retry.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load market data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = route.params;
    if (!params) return;
    if (params.tab) setTab(params.tab);
    if (params.query != null) {
      setQuery(params.query);
      setSearchOpen(true);
      if (!params.tab) setTab('live');
    }
    if (params.openSearch) {
      setSearchOpen(true);
      if (!params.tab && !params.query) setTab('live');
    }
  }, [route.params]);

  useEffect(() => {
    if (query.trim() && tab === 'summary') {
      setTab('live');
    }
  }, [query, tab]);

  usePollingRefresh(refresh);

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

  const indexQuote = selectedIndex ?? {
    name: 'NEPSE',
    symbol: 'NEPSE',
    current: data?.summary.index ?? null,
    change: data?.summary.indexChange ?? null,
    pct: data?.summary.indexPct ?? null,
  };

  const filteredSecurities = useMemo(() => {
    const rows = data?.securities ?? [];
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.symbol.toUpperCase().includes(q) ||
        r.name.toUpperCase().includes(q),
    );
  }, [data?.securities, query]);

  const statusLabel =
    data?.status === 'open'
      ? 'MARKET OPEN'
      : data?.status === 'closed'
        ? 'MARKET CLOSED'
        : 'LIVE DATA UNAVAILABLE';

  const statusColor =
    data?.status === 'open'
      ? colors.accentGreen
      : data?.status === 'closed'
        ? colors.danger
        : colors.textMuted;

  const renderSecurityRow = useCallback(
    ({ item }: { item: SecurityQuote }) => (
      <Pressable
        style={styles.tableRow}
        onPress={() =>
          navigation.navigate('StockDetail', { symbol: item.symbol })
        }
      >
        <Text style={[styles.tdSym, styles.colSym]} numberOfLines={1}>
          {item.symbol}
        </Text>
        <Text style={[styles.td, styles.colNum]}>{fmtNum(item.ltp)}</Text>
        <View style={styles.colNarrow}>
          <ChangeCell value={item.change} colors={colors} styles={styles} />
        </View>
        <View style={styles.colNarrow}>
          <ChangeCell
            value={item.pct}
            colors={colors}
            styles={styles}
            pct
          />
        </View>
        <Text style={[styles.td, styles.colNum]}>{fmtQty(item.qty)}</Text>
      </Pressable>
    ),
    [colors, navigation, styles],
  );

  const renderMoverRow = useCallback(
    ({
      item,
      index,
    }: {
      item: MoverRow | TurnoverRow | TransactionRow;
      index: number;
    }) => {
      const openDetail = () =>
        navigation.navigate('StockDetail', { symbol: item.symbol });
      if ('turnover' in item) {
        return (
          <Pressable style={styles.tableRow} onPress={openDetail}>
            <Text style={styles.tdSn}>{index + 1}</Text>
            <Text style={[styles.tdSym, styles.colSym]} numberOfLines={1}>
              {item.symbol}
            </Text>
            <Text style={[styles.td, styles.colNum]}>{fmtNum(item.ltp)}</Text>
            <Text style={[styles.td, styles.colWide]}>
              {fmtNum(item.turnover, 0)}
            </Text>
            <Text style={[styles.td, styles.colNarrow]}>—</Text>
          </Pressable>
        );
      }
      if ('trades' in item) {
        return (
          <Pressable style={styles.tableRow} onPress={openDetail}>
            <Text style={styles.tdSn}>{index + 1}</Text>
            <Text style={[styles.tdSym, styles.colSym]} numberOfLines={1}>
              {item.symbol}
            </Text>
            <Text style={[styles.td, styles.colNum]}>{fmtNum(item.ltp)}</Text>
            <Text style={[styles.td, styles.colNum]}>{fmtQty(item.trades)}</Text>
            <Text style={[styles.td, styles.colNarrow]}>—</Text>
          </Pressable>
        );
      }
      const row = item as MoverRow;
      return (
        <Pressable style={styles.tableRow} onPress={openDetail}>
          <Text style={styles.tdSn}>{index + 1}</Text>
          <Text style={[styles.tdSym, styles.colSym]} numberOfLines={1}>
            {row.symbol}
          </Text>
          <Text style={[styles.td, styles.colNum]}>{fmtNum(row.ltp)}</Text>
          <View style={styles.colNarrow}>
            <ChangeCell value={row.change} colors={colors} styles={styles} />
          </View>
          <View style={styles.colNarrow}>
            <ChangeCell value={row.pct} colors={colors} styles={styles} pct />
          </View>
        </Pressable>
      );
    },
    [colors, navigation, styles],
  );

  const moverRows = useMemo(() => {
    if (!data) return [];
    if (moverTab === 'gainers') return data.gainers;
    if (moverTab === 'losers') return data.losers;
    if (moverTab === 'turnovers') return data.turnovers;
    return data.transactions;
  }, [data, moverTab]);

  const moverCols =
    moverTab === 'turnovers'
      ? ['SN', 'SYM', 'LTP', 'TURNOVER', 'CH %']
      : moverTab === 'transactions'
        ? ['SN', 'SYM', 'LTP', 'TRADES', 'CH %']
        : ['SN', 'SYM', 'LTP', 'CH P', 'CH %'];

  const renderSummary = () => {
    if (!data) return null;
    return (
      <ScrollView
        contentContainerStyle={styles.tabBody}
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
      >
        <IndexPill data={data} indexQuote={indexQuote} colors={colors} styles={styles} />

        <MarketChartSection
          indexQuote={indexQuote}
          sectorOptions={sectorOptions}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          intradayPoints={data.chartPoints}
          isDark={isDark}
          colors={colors}
        />

        <Text style={styles.sectionTitle}>Market Summary</Text>
        <View style={styles.summaryGrid}>
          <SummaryCell
            label="Turnover"
            value={fmtNum(data.summary.turnover, 2)}
            styles={styles}
          />
          <SummaryCell
            label="Volume"
            value={fmtQty(data.summary.tradedShares)}
            styles={styles}
          />
          <SummaryCell
            label="Transactions"
            value={fmtQty(data.summary.transactions)}
            styles={styles}
          />
          <SummaryCell
            label="Scrips Traded"
            value={fmtQty(data.summary.scripsTraded)}
            styles={styles}
          />
        </View>

        <View style={styles.breadthRow}>
          <View style={styles.breadthItem}>
            <Text style={[styles.breadthNum, { color: colors.accentGreen }]}>
              {data.summary.advanced ?? '—'}
            </Text>
            <Text style={styles.breadthLabel}>Advanced</Text>
          </View>
          <View style={styles.breadthItem}>
            <Text style={[styles.breadthNum, { color: colors.danger }]}>
              {data.summary.declined ?? '—'}
            </Text>
            <Text style={styles.breadthLabel}>Declined</Text>
          </View>
          <View style={styles.breadthItem}>
            <Text style={[styles.breadthNum, { color: colors.teal }]}>
              {data.summary.unchanged ?? '—'}
            </Text>
            <Text style={styles.breadthLabel}>Unchanged</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Top Gainers</Text>
        <MoverPreviewTable
          rows={data.gainers.slice(0, 8)}
          colors={colors}
          styles={styles}
          onPressSymbol={(symbol) =>
            navigation.navigate('StockDetail', { symbol })
          }
        />
        <Pressable style={styles.moreBtn} onPress={() => setTab('movers')}>
          <Text style={styles.moreBtnText}>All gainers →</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Top Losers</Text>
        <MoverPreviewTable
          rows={data.losers.slice(0, 8)}
          colors={colors}
          styles={styles}
          onPressSymbol={(symbol) =>
            navigation.navigate('StockDetail', { symbol })
          }
        />
        <Pressable
          style={styles.moreBtn}
          onPress={() => {
            setMoverTab('losers');
            setTab('movers');
          }}
        >
          <Text style={styles.moreBtnText}>All losers →</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>All Indices</Text>
        <TableHeader
          cols={['Index', 'Current', 'CH P', 'CH %']}
          layout={['sym', 'num', 'narrow', 'narrow']}
          styles={styles}
        />
        {data.indices.map((row: IndexQuote) => (
          <View key={row.name} style={styles.tableRow}>
            <Text style={[styles.tdSym, styles.colSym]} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[styles.td, styles.colNum]}>{fmtNum(row.current)}</Text>
            <View style={styles.colNarrow}>
              <ChangeCell value={row.change} colors={colors} styles={styles} />
            </View>
            <View style={styles.colNarrow}>
              <ChangeCell value={row.pct} colors={colors} styles={styles} pct />
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Full market lists</Text>
        <View style={styles.quickLinks}>
          <Pressable style={styles.quickLink} onPress={() => setTab('live')}>
            <Text style={styles.quickLinkText}>Live prices</Text>
          </Pressable>
          <Pressable style={styles.quickLink} onPress={() => setTab('today')}>
            <Text style={styles.quickLinkText}>Today A–Z</Text>
          </Pressable>
          <Pressable style={styles.quickLink} onPress={() => setTab('movers')}>
            <Text style={styles.quickLinkText}>Turnover & trades</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  };

  const renderSecurityList = (rows: SecurityQuote[]) => (
    <View style={styles.listWrap}>
      {data ? (
        <View style={styles.pillPad}>
          <IndexPill data={data} colors={colors} styles={styles} />
        </View>
      ) : null}
      <TableHeader
        cols={['SYM', 'LTP', 'CH P', 'CH %', 'QTY']}
        layout={['sym', 'num', 'narrow', 'narrow', 'num']}
        styles={styles}
      />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.symbol}
        renderItem={renderSecurityRow}
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
        ListEmptyComponent={
          <Text style={styles.emptyList}>No stocks to show</Text>
        }
        contentContainerStyle={rows.length ? undefined : styles.emptyContainer}
      />
    </View>
  );

  const renderMovers = () => {
    if (!data) return null;
    return (
      <View style={styles.listWrap}>
        <View style={styles.pillPad}>
          <IndexPill data={data} colors={colors} styles={styles} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.moverTabs}
        >
          {MOVER_TABS.map((t) => {
            const active = moverTab === t.id;
            return (
              <Pressable
                key={t.id}
                style={[styles.moverTab, active && styles.moverTabActive]}
                onPress={() => setMoverTab(t.id)}
              >
                <Text
                  style={[
                    styles.moverTabText,
                    active && styles.moverTabTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <TableHeader
          cols={moverCols}
          layout={
            moverTab === 'turnovers'
              ? ['sn', 'sym', 'num', 'wide', 'narrow']
              : moverTab === 'transactions'
                ? ['sn', 'sym', 'num', 'num', 'narrow']
                : ['sn', 'sym', 'num', 'narrow', 'narrow']
          }
          styles={styles}
        />
        <FlatList
          data={moverRows}
          keyExtractor={(item, i) => `${item.symbol}-${i}`}
          renderItem={renderMoverRow}
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
          ListEmptyComponent={
            <Text style={styles.emptyList}>No movers to show</Text>
          }
          contentContainerStyle={moverRows.length ? undefined : styles.emptyContainer}
        />
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>NEPSE Live</Text>
          <Text style={styles.subtitle}>
            As of: {fmtAsOf(data?.asOf ?? data?.fetchedAt ?? null)}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.marketTag, { color: statusColor }]}>
            {statusLabel}
          </Text>
          <Pressable
            onPress={() => setSearchOpen((v) => !v)}
            hitSlop={10}
          >
            <Ionicons name="search" size={rs(20)} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search symbol or company"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={rs(18)} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.mainTabsBar}
        contentContainerStyle={styles.mainTabs}
      >
        {MAIN_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)} style={styles.mainTab}>
              <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>
                {t.label}
              </Text>
              {active ? <View style={styles.mainTabLine} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading NEPSE Live…</Text>
        </View>
      ) : null}

      {!loading || data ? (
        <>
          {tab === 'summary' ? renderSummary() : null}
          {tab === 'live' ? renderSecurityList(filteredSecurities) : null}
          {tab === 'today'
            ? renderSecurityList(
                [...filteredSecurities].sort((a, b) =>
                  a.symbol.localeCompare(b.symbol),
                ),
              )
            : null}
          {tab === 'movers' ? renderMovers() : null}
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function SummaryCell({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function MoverPreviewTable({
  rows,
  colors,
  styles,
  onPressSymbol,
}: {
  rows: MoverRow[];
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onPressSymbol: (symbol: string) => void;
}) {
  if (!rows.length) {
    return <Text style={styles.emptyList}>No data</Text>;
  }
  return (
    <>
      <TableHeader
        cols={['SYM', 'LTP', 'CH P', 'CH %']}
        layout={['sym', 'num', 'narrow', 'narrow']}
        styles={styles}
      />
      {rows.map((row) => (
        <Pressable
          key={row.symbol}
          style={styles.tableRow}
          onPress={() => onPressSymbol(row.symbol)}
        >
          <Text style={[styles.tdSym, styles.colSym]} numberOfLines={1}>
            {row.symbol}
          </Text>
          <Text style={[styles.td, styles.colNum]}>{fmtNum(row.ltp)}</Text>
          <View style={styles.colNarrow}>
            <ChangeCell value={row.change} colors={colors} styles={styles} />
          </View>
          <View style={styles.colNarrow}>
            <ChangeCell value={row.pct} colors={colors} styles={styles} pct />
          </View>
        </Pressable>
      ))}
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      gap: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    headerCenter: { flex: 1 },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
    },
    title: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    subtitle: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    marketTag: { fontSize: rs(10), fontWeight: '800', letterSpacing: 0.4 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
      marginBottom: rs(6),
      paddingHorizontal: rs(10),
      paddingVertical: rs(8),
      borderRadius: rs(8),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      padding: 0,
    },
    mainTabsBar: {
      maxHeight: rs(44),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    mainTabs: {
      paddingHorizontal: rs(8),
      alignItems: 'flex-end',
    },
    mainTab: {
      paddingHorizontal: rs(10),
      paddingVertical: rs(10),
      alignItems: 'center',
    },
    mainTabText: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '600',
    },
    mainTabTextActive: {
      color: c.text,
      fontWeight: '800',
    },
    mainTabLine: {
      marginTop: rs(6),
      height: rs(2),
      width: '100%',
      backgroundColor: c.accentGreen,
      borderRadius: rs(1),
    },
    tabBody: {
      padding: rs(12),
      paddingBottom: rs(40),
      gap: rs(10),
    },
    indexPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(8),
      borderWidth: 1,
      borderColor: c.accentGreen,
      borderRadius: rs(22),
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
      width: '100%',
      backgroundColor: c.surface,
    },
    pillLabel: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      minWidth: rs(52),
    },
    pillValue: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      textAlign: 'center',
    },
    pillChangeWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
    },
    pillChange: { fontWeight: '700', fontSize: rs(12) },
    pillPct: { fontWeight: '700', fontSize: rs(12) },
    dropdownRow: {
      flexDirection: 'row',
      gap: rs(10),
    },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(6),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
    },
    dropdownText: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    sectionTitle: {
      color: c.text,
      fontSize: rs(14),
      fontWeight: '800',
      marginTop: rs(6),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      paddingBottom: rs(6),
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
    },
    summaryCell: {
      width: '48%',
      backgroundColor: c.surface,
      borderRadius: rs(8),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(10),
    },
    summaryLabel: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    summaryValue: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '800',
      marginTop: rs(4),
    },
    breadthRow: {
      flexDirection: 'row',
      marginTop: rs(12),
      marginBottom: rs(8),
      gap: rs(12),
    },
    breadthItem: { flex: 1, alignItems: 'center' },
    breadthNum: { fontWeight: '800', fontSize: rs(18) },
    breadthLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    moreBtn: { alignSelf: 'flex-start', paddingVertical: rs(4), marginBottom: rs(8) },
    moreBtnText: { color: c.primary, fontWeight: '700', fontSize: rs(12) },
    quickLinks: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(12),
    },
    quickLink: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
      borderRadius: rs(20),
      backgroundColor: c.primarySoft,
    },
    quickLinkText: { color: c.primary, fontWeight: '700', fontSize: rs(12) },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primary,
      paddingVertical: rs(8),
      paddingHorizontal: rs(6),
    },
    th: {
      color: '#FFFFFF',
      fontSize: rs(10),
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    colSym: { flex: 1, textAlign: 'left' },
    colSn: { width: rs(24), textAlign: 'left' },
    colNum: { width: rs(58), textAlign: 'right' },
    colNarrow: { width: rs(58), textAlign: 'right' },
    colWide: { width: rs(72), textAlign: 'right' },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(7),
      paddingHorizontal: rs(6),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    td: { color: c.textSecondary, fontSize: rs(11), fontWeight: '600' },
    tdSym: { color: c.text, fontSize: rs(11), fontWeight: '800' },
    tdSn: {
      width: rs(24),
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
    },
    changeCell: { fontSize: rs(10), fontWeight: '700', textAlign: 'right' },
    changeCellRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: rs(2),
    },
    listWrap: { flex: 1 },
    pillPad: { paddingHorizontal: rs(12), paddingTop: rs(10), paddingBottom: rs(4), gap: rs(6) },
    stockCount: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    moverTabs: {
      paddingHorizontal: rs(10),
      paddingVertical: rs(8),
      gap: rs(8),
    },
    moverTab: {
      borderRadius: rs(14),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    moverTabActive: {
      backgroundColor: c.accentGreen,
      borderColor: c.accentGreen,
    },
    moverTabText: {
      color: c.textSecondary,
      fontSize: rs(11),
      fontWeight: '700',
    },
    moverTabTextActive: {
      color: '#0A0A0A',
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: rs(10) },
    muted: { color: c.textSecondary, fontSize: rs(12) },
    error: {
      color: c.danger,
      fontSize: rs(12),
      textAlign: 'center',
      padding: rs(8),
    },
    emptyList: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(24),
      fontSize: rs(13),
    },
    emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  });
}
