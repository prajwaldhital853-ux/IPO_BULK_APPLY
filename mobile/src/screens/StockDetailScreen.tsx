import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
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
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { AreaChart } from '../components/nepse/AreaChart';
import {
  fmtAmtShort,
  fmtMcap,
  fmtNum,
  loadAnnouncements,
  loadCandles,
  loadFinancialReports,
  loadFloorsheet,
  loadFundamentals,
  loadPriceHistory,
  loadProposedDividends,
  loadSecurityBySymbol,
  type AnnouncementRow,
  type CandlePoint,
  type DividendRow,
  type FinancialReportRow,
  type FloorsheetRow,
  type Fundamentals,
  type MiniScreenerRow,
  type PriceHistoryRow,
} from '../services/nepse/screener';
import {
  addToWatchlist,
  isWatched,
  removeFromWatchlist,
} from '../storage/watchlistStorage';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type TabId =
  | 'info'
  | 'history'
  | 'floorsheet'
  | 'financial'
  | 'dividends'
  | 'announcements';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'info', label: 'Stock Information' },
  { id: 'history', label: 'Price History' },
  { id: 'floorsheet', label: 'FloorSheet' },
  { id: 'financial', label: 'Financial Report' },
  { id: 'dividends', label: 'Dividends/Rights' },
  { id: 'announcements', label: 'Announcements' },
];

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '0';
  return n.toLocaleString('en-NP', { maximumFractionDigits: 4 });
}

export function StockDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'StockDetail'>>();
  const symbol = route.params.symbol.toUpperCase();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<TabId>('info');
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<MiniScreenerRow | null>(null);
  const [watched, setWatched] = useState(false);
  const [chartPoints, setChartPoints] = useState<CandlePoint[]>([]);

  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [floorsheet, setFloorsheet] = useState<FloorsheetRow[]>([]);
  const [fsPage, setFsPage] = useState(1);
  const [fsHasNext, setFsHasNext] = useState(false);
  const [fsBuyer, setFsBuyer] = useState('');
  const [fsSeller, setFsSeller] = useState('');
  const [fsDate, setFsDate] = useState('');

  const [reports, setReports] = useState<FinancialReportRow[]>([]);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [dividends, setDividends] = useState<DividendRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const loadCore = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [sec, watch, candles] = await Promise.all([
      loadSecurityBySymbol(symbol),
      isWatched(symbol),
      loadCandles(symbol, '1M'),
    ]);
    setStock(sec);
    setWatched(watch);
    setChartPoints(candles);
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const loadTab = useCallback(async () => {
    switch (tab) {
      case 'history':
        setHistory(await loadPriceHistory(symbol, 1, 80));
        break;
      case 'floorsheet': {
        const res = await loadFloorsheet(1, 50, {
          symbol,
          buyerMemberId: fsBuyer || undefined,
          sellerMemberId: fsSeller || undefined,
          businessDate: fsDate || undefined,
        });
        setFloorsheet(res.rows);
        setFsPage(1);
        setFsHasNext(res.hasNext);
        break;
      }
      case 'financial': {
        const [reps, fund] = await Promise.all([
          loadFinancialReports(symbol),
          loadFundamentals(symbol),
        ]);
        setReports(reps);
        setFundamentals(fund);
        break;
      }
      case 'dividends':
        setDividends(await loadProposedDividends(1, 50, symbol));
        break;
      case 'announcements':
        setAnnouncements(await loadAnnouncements(1, 50, symbol));
        break;
      default:
        break;
    }
  }, [tab, symbol, fsBuyer, fsSeller, fsDate]);

  useEffect(() => {
    if (tab !== 'info') void loadTab();
  }, [loadTab, tab]);

  const pollRefresh = useCallback(
    async (silent?: boolean) => {
      await loadCore(Boolean(silent));
      if (tab !== 'info') await loadTab();
    },
    [loadCore, loadTab, tab],
  );

  usePollingRefresh(pollRefresh);

  const toggleWatch = async () => {
    if (watched) {
      await removeFromWatchlist(symbol);
      setWatched(false);
    } else {
      await addToWatchlist(symbol, stock?.name ?? symbol);
      setWatched(true);
    }
  };

  const applyFloorFilter = async () => {
    const res = await loadFloorsheet(1, 50, {
      symbol,
      buyerMemberId: fsBuyer || undefined,
      sellerMemberId: fsSeller || undefined,
      businessDate: fsDate || undefined,
    });
    setFloorsheet(res.rows);
    setFsPage(1);
    setFsHasNext(res.hasNext);
  };

  const loadMoreFloorsheet = async () => {
    if (!fsHasNext) return;
    const next = fsPage + 1;
    const res = await loadFloorsheet(next, 50, {
      symbol,
      buyerMemberId: fsBuyer || undefined,
      sellerMemberId: fsSeller || undefined,
      businessDate: fsDate || undefined,
    });
    setFloorsheet((prev) => [...prev, ...res.rows]);
    setFsPage(next);
    setFsHasNext(res.hasNext);
  };

  const up = (stock?.changePercent ?? 0) >= 0;
  const accent = up ? colors.accentGreen : colors.danger;

  const renderInfo = () => {
    if (!stock) {
      return (
        <Text style={styles.empty}>No live data for {symbol}.</Text>
      );
    }
    return (
      <ScrollView
        contentContainerStyle={styles.tabBody}
        nestedScrollEnabled
        removeClippedSubviews={false}
      >
        <Text style={styles.companyTitle}>
          {stock.name} ({stock.symbol})
        </Text>
        <InfoLine label="Sector" value={stock.sector ?? '—'} styles={styles} />
        <InfoLine
          label="EPS"
          value={fmtNum(stock.peRatio ? stock.ltp! / stock.peRatio : null)}
          styles={styles}
        />
        <InfoLine label="Market Cap" value={fmtMcap(stock.marketCap)} styles={styles} />

        <View style={styles.chartHead}>
          <Text style={styles.sectionTitle}>Chart of {symbol}</Text>
          <Pressable
            style={styles.chartLink}
            onPress={() => navigation.navigate('Charts', { symbol })}
          >
            <Text style={styles.chartLinkText}>Advanced Chart</Text>
          </Pressable>
        </View>
        <View collapsable={false} style={styles.chartBox}>
          <AreaChart
            points={chartPoints}
            isDark={isDark}
            up={up}
            height={rs(170)}
          />
        </View>

        <Text style={styles.sectionTitle}>Today&apos;s Data</Text>
        <View style={styles.grid}>
          <GridCell label="Day High" value={`Rs. ${fmtNum(stock.high, 0)}`} styles={styles} />
          <GridCell label="Day Low" value={`Rs. ${fmtNum(stock.low, 0)}`} styles={styles} />
          <GridCell label="Open Price" value={`Rs. ${fmtNum(stock.open, 0)}`} styles={styles} />
          <GridCell label="Previous Closing Price" value={`Rs. ${fmtNum(stock.previousClose, 0)}`} styles={styles} />
          <GridCell label="Total Traded Quantity" value={stock.volume?.toLocaleString('en-NP') ?? '—'} styles={styles} />
          <GridCell label="Turnover" value={fmtAmtShort(stock.turnover)} styles={styles} />
        </View>

        <View style={[styles.ltpBox, { backgroundColor: up ? '#2e7d32' : colors.danger }]}>
          <Text style={styles.ltpLabel}>Last Traded Price</Text>
          <Text style={styles.ltpValue}>Rs. {fmtNum(stock.ltp, 0)}</Text>
          <Text style={styles.ltpChange}>
            Rs. {up ? '+' : ''}
            {fmtNum(stock.change)} ({up ? '+' : ''}
            {stock.changePercent?.toFixed(2) ?? '0'} %)
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderHistory = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 1.2 }]}>Date</Text>
        <Text style={[styles.th, styles.thNum]}>LTP</Text>
        <Text style={[styles.th, styles.thNum]}>CH P</Text>
        <Text style={[styles.th, styles.thNum]}>CH %</Text>
        <Text style={[styles.th, styles.thNum]}>QTY</Text>
      </View>
      <FlatList
        data={history}
        keyExtractor={(item) => item.date}
        renderItem={({ item }) => {
          const rowUp = (item.change ?? 0) > 0;
          const rowDown = (item.change ?? 0) < 0;
          const rowAccent = rowUp
            ? colors.accentGreen
            : rowDown
              ? colors.danger
              : '#42A5F5';
          return (
            <View style={styles.row}>
              <Text style={[styles.tdDate, { flex: 1.2 }]}>{item.date}</Text>
              <Text style={[styles.td, styles.thNum]}>{fmtNum(item.ltp, 0)}</Text>
              <Text style={[styles.td, styles.thNum, { color: rowAccent }]}>
                {rowUp ? '▲' : rowDown ? '▼' : '►'}{' '}
                {fmtNum(item.change, 1)}
              </Text>
              <Text style={[styles.td, styles.thNum, { color: rowAccent }]}>
                {item.changePercent?.toFixed(1) ?? '0.0'}%
              </Text>
              <Text style={[styles.td, styles.thNum]}>
                {item.volume?.toLocaleString('en-NP') ?? '—'}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No price history.</Text>}
      />
    </View>
  );

  const renderFloorsheet = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.filterBox}>
        <TextInput
          value={fsDate}
          onChangeText={setFsDate}
          placeholder="Business date (YYYY-MM-DD)"
          placeholderTextColor={colors.textMuted}
          style={styles.filterInput}
        />
        <View style={styles.filterRow}>
          <TextInput
            value={fsBuyer}
            onChangeText={setFsBuyer}
            placeholder="Buyer broker id"
            placeholderTextColor={colors.textMuted}
            style={[styles.filterInput, { flex: 1 }]}
            keyboardType="number-pad"
          />
          <TextInput
            value={fsSeller}
            onChangeText={setFsSeller}
            placeholder="Seller broker id"
            placeholderTextColor={colors.textMuted}
            style={[styles.filterInput, { flex: 1 }]}
            keyboardType="number-pad"
          />
        </View>
        <Pressable style={styles.filterBtn} onPress={() => void applyFloorFilter()}>
          <Ionicons name="filter" size={rs(16)} color="#fff" />
          <Text style={styles.filterBtnText}>Filter</Text>
        </Pressable>
      </View>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { width: rs(28) }]}>SN</Text>
        <Text style={[styles.th, { width: rs(42) }]}>SYM</Text>
        <Text style={[styles.th, { width: rs(28) }]}>BB</Text>
        <Text style={[styles.th, { width: rs(28) }]}>SB</Text>
        <Text style={[styles.th, styles.thNum, { flex: 1 }]}>QTY</Text>
        <Text style={[styles.th, styles.thNum, { flex: 1 }]}>RATE</Text>
        <Text style={[styles.th, styles.thNum, { flex: 1.2 }]}>AMT</Text>
      </View>
      <FlatList
        data={floorsheet}
        keyExtractor={(item) => String(item.contractId)}
        onEndReached={() => void loadMoreFloorsheet()}
        onEndReachedThreshold={0.4}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={[styles.td, { width: rs(28) }]}>{index + 1}</Text>
            <Text style={[styles.tdSym, { width: rs(42) }]}>{item.symbol}</Text>
            <Text style={[styles.td, { width: rs(28) }]}>{item.buyerBroker}</Text>
            <Text style={[styles.td, { width: rs(28) }]}>{item.sellerBroker}</Text>
            <Text style={[styles.td, styles.thNum, { flex: 1 }]}>
              {item.quantity?.toLocaleString('en-NP') ?? '—'}
            </Text>
            <Text style={[styles.td, styles.thNum, { flex: 1 }]}>
              {fmtNum(item.rate, 1)}
            </Text>
            <Text style={[styles.td, styles.thNum, { flex: 1.2 }]}>
              {fmtAmtShort(item.amount)}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No floor sheet data.</Text>}
      />
    </View>
  );

  const renderFinancial = () => (
    <FlatList
      data={reports}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.tabBody}
      ListHeaderComponent={
        fundamentals ? (
          <View style={styles.fundBox}>
            <Text style={styles.fundTitle}>
              Fundamentals · FY {fundamentals.fiscalYear} · {fundamentals.quarter}
            </Text>
            {fundamentals.values.slice(0, 8).map((v) => (
              <Text key={v.key} style={styles.fundRow}>
                {v.label}: {v.valueString ?? fmtNum(v.value)}
              </Text>
            ))}
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={styles.reportCard}>
          <Ionicons name="document-text" size={rs(22)} color={colors.accentGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>{item.title}</Text>
            <Text style={styles.reportDate}>{item.date}</Text>
            {item.details ? (
              <Text style={styles.reportBody} numberOfLines={2}>
                {item.details}
              </Text>
            ) : null}
            {item.attachmentUrl ? (
              <Pressable
                style={styles.viewBtn}
                onPress={() => void Linking.openURL(item.attachmentUrl!)}
              >
                <Ionicons name="eye-outline" size={rs(16)} color={colors.accentGreen} />
                <Text style={styles.viewBtnText}>View Report</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No financial reports found.</Text>
      }
    />
  );

  const renderDividends = () => (
    <FlatList
      data={dividends}
      keyExtractor={(item) => `${item.id}-${item.fiscalYear}`}
      contentContainerStyle={styles.tabBody}
      renderItem={({ item }) => (
        <View style={styles.divCard}>
          <Text style={styles.divLabel}>Dividend</Text>
          <View style={styles.divRow}>
            <Text style={styles.divText}>
              Bonus : <Text style={styles.divVal}>{fmtPct(item.bonus)}%</Text>
            </Text>
            <Text style={styles.divText}>
              Cash : <Text style={styles.divVal}>{fmtPct(item.cash)}%</Text>
            </Text>
          </View>
          <View style={styles.divRow}>
            <Text style={styles.divText}>
              Total Dividend :{' '}
              <Text style={styles.divTotal}>{fmtPct(item.total)}%</Text>
            </Text>
            <Text style={styles.divText}>
              Book Close :{' '}
              <Text style={styles.divVal}>{item.bookClose ?? 'N/A'}</Text>
            </Text>
          </View>
          <Text style={styles.fiscal}>Fiscal Year : {item.fiscalYear}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No dividends.</Text>}
    />
  );

  const renderAnnouncements = () => (
    <FlatList
      data={announcements}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.tabBody}
      renderItem={({ item }) => (
        <View style={styles.annCard}>
          <Text style={styles.annTitle}>{item.title}</Text>
          {item.details ? (
            <Text style={styles.annBody} numberOfLines={4}>
              {item.details}
            </Text>
          ) : null}
          <View style={styles.annMeta}>
            <Text style={styles.annDate}>{item.date}</Text>
            {item.attachmentUrl ? (
              <Pressable onPress={() => void Linking.openURL(item.attachmentUrl!)}>
                <Ionicons name="document-attach" size={rs(18)} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No announcements.</Text>}
    />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.headerSym}>{symbol}</Text>
        <Pressable onPress={() => void toggleWatch()} hitSlop={12}>
          <Ionicons
            name={watched ? 'star' : 'star-outline'}
            size={rs(22)}
            color={watched ? '#FFB300' : colors.textMuted}
          />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading && tab === 'info' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {tab === 'info' && renderInfo()}
          {tab === 'history' && renderHistory()}
          {tab === 'floorsheet' && renderFloorsheet()}
          {tab === 'financial' && renderFinancial()}
          {tab === 'dividends' && renderDividends()}
          {tab === 'announcements' && renderAnnouncements()}
        </View>
      )}
    </View>
  );
}

function InfoLine({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function GridCell({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.gridCell}>
      <Text style={styles.gridLabel}>{label}</Text>
      <Text style={styles.gridValue}>{value}</Text>
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
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    headerSym: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    tabsScroll: { maxHeight: rs(44), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    tabs: { paddingHorizontal: rs(8), alignItems: 'center' },
    tabBtn: { paddingHorizontal: rs(12), paddingVertical: rs(10), marginRight: rs(4) },
    tabBtnActive: { borderBottomWidth: 2, borderBottomColor: c.accentGreen },
    tabText: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    tabTextActive: { color: c.accentGreen },
    tabBody: { padding: rs(12), paddingBottom: rs(24) },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { color: c.textMuted, textAlign: 'center', padding: rs(30) },
    companyTitle: { color: c.text, fontSize: rs(14), fontWeight: '800', marginBottom: rs(10) },
    infoLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rs(6) },
    infoLabel: { color: c.textMuted, fontSize: rs(12) },
    infoValue: { color: c.text, fontSize: rs(12), fontWeight: '700', flex: 1, textAlign: 'right' },
    chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rs(14), marginBottom: rs(6) },
    chartBox: { width: '100%', marginBottom: rs(4) },
    sectionTitle: { color: c.text, fontSize: rs(13), fontWeight: '800', marginTop: rs(14), marginBottom: rs(8), textAlign: 'center' },
    chartLink: { borderWidth: 1, borderColor: c.accentGreen, borderRadius: rs(16), paddingHorizontal: rs(12), paddingVertical: rs(5) },
    chartLinkText: { color: c.accentGreen, fontSize: rs(11), fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8) },
    gridCell: { width: '48%', marginBottom: rs(6) },
    gridLabel: { color: c.textMuted, fontSize: rs(11) },
    gridValue: { color: c.text, fontSize: rs(12), fontWeight: '700', marginTop: rs(2) },
    ltpBox: { borderRadius: rs(8), padding: rs(14), marginTop: rs(16), alignItems: 'center' },
    ltpLabel: { color: '#fff', fontSize: rs(12) },
    ltpValue: { color: '#fff', fontSize: rs(22), fontWeight: '800', marginVertical: rs(4) },
    ltpChange: { color: '#fff', fontSize: rs(12), fontWeight: '600' },
    tableHead: { flexDirection: 'row', backgroundColor: c.primary, paddingVertical: rs(8), paddingHorizontal: rs(6) },
    th: { color: '#fff', fontSize: rs(9), fontWeight: '800' },
    thNum: { textAlign: 'right' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: rs(7), paddingHorizontal: rs(6), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderMuted },
    td: { color: c.textSecondary, fontSize: rs(10), fontWeight: '600' },
    tdSym: { color: c.text, fontSize: rs(10), fontWeight: '800' },
    tdDate: { color: c.text, fontSize: rs(10), fontWeight: '700' },
    filterBox: { padding: rs(10), gap: rs(8), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    filterRow: { flexDirection: 'row', gap: rs(8) },
    filterInput: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderMuted, borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(8), color: c.text, fontSize: rs(12) },
    filterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), backgroundColor: c.accentGreen, borderRadius: rs(8), paddingVertical: rs(10) },
    filterBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(13) },
    reportCard: { flexDirection: 'row', gap: rs(12), backgroundColor: c.surface, borderRadius: rs(12), borderWidth: 1, borderColor: c.borderMuted, padding: rs(14), marginBottom: rs(10) },
    reportTitle: { color: c.text, fontSize: rs(13), fontWeight: '800' },
    reportDate: { color: c.textMuted, fontSize: rs(10), marginTop: rs(4) },
    reportBody: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(6) },
    viewBtn: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(10), borderWidth: 1, borderColor: c.accentGreen, borderRadius: rs(20), paddingHorizontal: rs(14), paddingVertical: rs(8), alignSelf: 'flex-start' },
    viewBtnText: { color: c.accentGreen, fontWeight: '700', fontSize: rs(12) },
    fundBox: { backgroundColor: c.surface, borderRadius: rs(10), padding: rs(12), marginBottom: rs(12), borderWidth: 1, borderColor: c.borderMuted },
    fundTitle: { color: c.text, fontWeight: '800', marginBottom: rs(8), fontSize: rs(12) },
    fundRow: { color: c.textSecondary, fontSize: rs(11), marginBottom: rs(4) },
    divCard: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderMuted, paddingVertical: rs(12) },
    divLabel: { color: '#42A5F5', fontWeight: '800', fontSize: rs(13), marginBottom: rs(6) },
    divRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rs(4) },
    divText: { color: c.textMuted, fontSize: rs(11), flex: 1 },
    divVal: { color: c.text, fontWeight: '700' },
    divTotal: { color: c.accentGreen, fontWeight: '800' },
    fiscal: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    annCard: { backgroundColor: c.surface, borderRadius: rs(10), padding: rs(12), marginBottom: rs(10), borderWidth: 1, borderColor: c.borderMuted },
    annTitle: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    annBody: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(6), lineHeight: rs(16) },
    annMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rs(10) },
    annDate: { color: c.textMuted, fontSize: rs(10) },
  });
}
