import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
  fmtRatio,
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
  type StockChartRange,
} from '../services/nepse/screener';
import {
  formatRelativeNewsTime,
  loadSymbolNewsProgressive,
  NEWS_SOURCES,
  type ShareNewsItem,
} from '../services/nepse/shareNews';
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
  | 'announcements'
  | 'news-overview';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'info', label: 'Stock Information' },
  { id: 'history', label: 'Price History' },
  { id: 'floorsheet', label: 'FloorSheet' },
  { id: 'financial', label: 'Financial Report' },
  { id: 'dividends', label: 'Dividends/Rights' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'news-overview', label: 'News Overview' },
];

const CHART_RANGES: StockChartRange[] = ['1D', '1W', '1M', '6M', '1Y'];
const FS_PAGE_SIZE = 50;

const AVATAR_PALETTE = [
  { bg: '#E57373', fg: '#FFFFFF' },
  { bg: '#66BB6A', fg: '#FFFFFF' },
  { bg: '#42A5F5', fg: '#FFFFFF' },
  { bg: '#FFA726', fg: '#FFFFFF' },
  { bg: '#AB47BC', fg: '#FFFFFF' },
];

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '0';
  return n.toLocaleString('en-NP', { maximumFractionDigits: 4 });
}

function avatarColors(symbol: string) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h + symbol.charCodeAt(i) * 17) % 997;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

function rsPrice(n: number | null, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `Rs. ${fmtNum(n, digits)}`;
}

function fmtFloorTime(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '—';
  if (/am|pm/i.test(s)) {
    const m = s.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)/i);
    return m?.[1]?.replace(/\s+/g, ' ') ?? s;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 12);
  let h = d.getHours();
  const min = d.getMinutes();
  const sec = d.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} ${ampm}`;
}

export function StockDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'StockDetail'>>();
  const symbol = route.params.symbol.toUpperCase();
  const insets = useSafeAreaInsets();
  const { width: pageWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const chartBg = isDark ? colors.surface : '#F7FAF3';

  const [tabIndex, setTabIndex] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const tabsScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<number, { x: number; width: number }>>({});
  const tabIndexRef = useRef(0);
  tabIndexRef.current = tabIndex;
  const newsGenRef = useRef(0);
  const newsInFlightRef = useRef(false);
  const stockNameRef = useRef<string | undefined>();
  const newsCacheRef = useRef<{ symbol: string; rows: ShareNewsItem[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [stock, setStock] = useState<MiniScreenerRow | null>(null);
  const [watched, setWatched] = useState(false);
  const [chartRange, setChartRange] = useState<StockChartRange>('1D');
  const [chartPoints, setChartPoints] = useState<CandlePoint[]>([]);
  const [chartScrubbing, setChartScrubbing] = useState(false);

  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [floorsheet, setFloorsheet] = useState<FloorsheetRow[]>([]);
  const [fsPage, setFsPage] = useState(1);
  const [fsHasNext, setFsHasNext] = useState(false);
  const [fsTotalItems, setFsTotalItems] = useState<number | null>(null);
  const [fsBuyer, setFsBuyer] = useState('');
  const [fsSeller, setFsSeller] = useState('');
  const [fsDate, setFsDate] = useState('');

  const [reports, setReports] = useState<FinancialReportRow[]>([]);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [dividends, setDividends] = useState<DividendRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [newsRows, setNewsRows] = useState<ShareNewsItem[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsLoadingMore, setNewsLoadingMore] = useState(false);

  const tab = TABS[tabIndex].id;

  useEffect(() => {
    stockNameRef.current = stock?.name;
  }, [stock?.name]);

  const loadCore = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const [sec, watch] = await Promise.all([
        loadSecurityBySymbol(symbol),
        isWatched(symbol),
      ]);
      setStock(sec);
      setWatched(watch);
      setLoading(false);
    },
    [symbol],
  );

  const loadChart = useCallback(
    async (range: StockChartRange, silent = false) => {
      if (!silent) setChartLoading(true);
      try {
        setChartPoints(await loadCandles(symbol, range));
      } finally {
        setChartLoading(false);
      }
    },
    [symbol],
  );

  useEffect(() => {
    void loadCore();
    newsCacheRef.current = null;
    newsInFlightRef.current = false;
    setNewsRows([]);
    setNewsLoading(false);
    setNewsLoadingMore(false);
  }, [loadCore, symbol]);

  useEffect(() => {
    void loadChart(chartRange);
  }, [loadChart, chartRange]);

  const loadNewsTab = useCallback(async () => {
    const cached = newsCacheRef.current;
    if (cached?.symbol === symbol && cached.rows.length > 0) {
      setNewsRows(cached.rows);
      setNewsLoading(false);
      setNewsLoadingMore(false);
      return;
    }
    if (newsInFlightRef.current) return;
    newsInFlightRef.current = true;

    const gen = ++newsGenRef.current;
    setNewsLoading(true);
    setNewsLoadingMore(false);
    setNewsRows([]);

    try {
      await loadSymbolNewsProgressive(
        symbol,
        stockNameRef.current,
        (items, meta) => {
          if (gen !== newsGenRef.current) return;
          setNewsRows(items);
          newsCacheRef.current = { symbol, rows: items };
          if (meta.phase === 'first') {
            setNewsLoading(false);
            if (!meta.done) setNewsLoadingMore(true);
          }
          if (meta.done) setNewsLoadingMore(false);
        },
      );
    } catch {
      if (gen === newsGenRef.current) {
        setNewsRows([]);
        setNewsLoading(false);
        setNewsLoadingMore(false);
      }
    } finally {
      if (gen === newsGenRef.current) newsInFlightRef.current = false;
    }
  }, [symbol]);

  // Prefetch news in the background shortly after opening the screen, so it's
  // ready (or well underway) by the time the user actually taps the tab —
  // instead of only starting the two network round-trips on tap.
  useEffect(() => {
    const t = setTimeout(() => {
      void loadNewsTab();
    }, 400);
    return () => clearTimeout(t);
  }, [loadNewsTab]);

  const loadTab = useCallback(async () => {
    if (tab === 'info' || tab === 'news-overview') return;
    setTabLoading(true);
    try {
      switch (tab) {
        case 'history':
          setHistory(await loadPriceHistory(symbol, 1, 80));
          break;
        case 'floorsheet': {
          const res = await loadFloorsheet(1, FS_PAGE_SIZE, {
            symbol,
            buyerMemberId: fsBuyer || undefined,
            sellerMemberId: fsSeller || undefined,
            businessDate: fsDate || undefined,
          });
          setFloorsheet(res.rows);
          setFsPage(1);
          setFsHasNext(res.hasNext);
          setFsTotalItems(res.totalItems);
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
    } finally {
      setTabLoading(false);
    }
  }, [tab, symbol, fsBuyer, fsSeller, fsDate]);

  useEffect(() => {
    if (tab === 'news-overview') {
      void loadNewsTab();
      return;
    }
    if (tab !== 'info') void loadTab();
  }, [loadTab, loadNewsTab, tab]);

  const scrollTabBarToIndex = useCallback((index: number, animated = false) => {
    const layout = tabLayoutsRef.current[index];
    if (!layout || !tabsScrollRef.current) return;
    tabsScrollRef.current.scrollTo({
      x: Math.max(0, layout.x - rs(12)),
      animated,
    });
  }, []);

  const primeNewsLoading = useCallback(() => {
    const cached = newsCacheRef.current;
    if (cached?.symbol === symbol && cached.rows.length > 0) {
      setNewsRows(cached.rows);
      setNewsLoading(false);
      setNewsLoadingMore(false);
      return;
    }
    // A background prefetch may already be streaming results in — don't
    // reset its progress back to a blank spinner.
    if (newsInFlightRef.current) return;
    setNewsRows([]);
    setNewsLoading(true);
    setNewsLoadingMore(false);
  }, [symbol]);

  const setActiveTabIndex = useCallback(
    (index: number, scrollTabBar = true) => {
      if (index < 0 || index >= TABS.length) return;
      if (index === tabIndexRef.current) return;
      tabIndexRef.current = index;
      setTabIndex(index);
      if (TABS[index]?.id === 'news-overview') primeNewsLoading();
      if (scrollTabBar) scrollTabBarToIndex(index, false);
    },
    [scrollTabBarToIndex, primeNewsLoading],
  );

  const onTabPress = (index: number) => {
    if (index < 0 || index >= TABS.length) return;
    const nextTab = TABS[index]?.id;
    tabIndexRef.current = index;
    setTabIndex(index);
    if (nextTab === 'news-overview') {
      primeNewsLoading();
    } else if (nextTab !== 'info') {
      setTabLoading(true);
    }
    scrollTabBarToIndex(index, false);
    pagerRef.current?.scrollTo({ x: index * pageWidth, animated: false });
  };

  const pagerIndexFromOffset = (offsetX: number) => {
    if (pageWidth <= 0) return 0;
    const progress = offsetX / pageWidth;
    return Math.min(
      TABS.length - 1,
      Math.max(0, Math.floor(progress + 0.2)),
    );
  };

  const onPagerScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = pagerIndexFromOffset(offsetX);
    setActiveTabIndex(index);
  };

  const onPagerMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = pagerIndexFromOffset(event.nativeEvent.contentOffset.x);
    setActiveTabIndex(index);
  };

  const openNews = async (item: ShareNewsItem) => {
    const url = (item.url || '').trim();
    const fallback =
      NEWS_SOURCES.find((s) => s.id === item.sourceId)?.homeUrl ?? '';
    const target = url || fallback;
    if (!target) return;
    try {
      await Linking.openURL(target);
    } catch {
      if (fallback && fallback !== target) {
        void Linking.openURL(fallback);
      }
    }
  };

  const pollRefresh = useCallback(
    async (silent?: boolean) => {
      await loadCore(Boolean(silent));
      await loadChart(chartRange, true);
      if (tab !== 'info' && tab !== 'news-overview') await loadTab();
    },
    [loadCore, loadChart, chartRange, loadTab, tab],
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
    const res = await loadFloorsheet(1, FS_PAGE_SIZE, {
      symbol,
      buyerMemberId: fsBuyer || undefined,
      sellerMemberId: fsSeller || undefined,
      businessDate: fsDate || undefined,
    });
    setFloorsheet(res.rows);
    setFsPage(1);
    setFsHasNext(res.hasNext);
    setFsTotalItems(res.totalItems);
  };

  const goFloorPage = async (next: number) => {
    if (next < 1) return;
    const res = await loadFloorsheet(next, FS_PAGE_SIZE, {
      symbol,
      buyerMemberId: fsBuyer || undefined,
      sellerMemberId: fsSeller || undefined,
      businessDate: fsDate || undefined,
    });
    if (!res.rows.length && next > 1) return;
    setFloorsheet(res.rows);
    setFsPage(next);
    setFsHasNext(res.hasNext);
    setFsTotalItems(res.totalItems);
  };

  const up = (stock?.changePercent ?? 0) >= 0;
  const accent = up ? colors.accentGreen : colors.danger;
  const av = avatarColors(symbol);

  const renderInfo = () => {
    if (!stock) {
      return <Text style={styles.empty}>No live data for {symbol}.</Text>;
    }

    const changeAbs = stock.change ?? 0;
    const changePct = stock.changePercent ?? 0;
    const changeLabel = `${up ? '↑' : '↓'} ${up ? '+' : ''}${fmtNum(changeAbs, 1)} (${up ? '+' : ''}${changePct.toFixed(2)}%)`;

    return (
      <ScrollView
        contentContainerStyle={styles.tabBody}
        nestedScrollEnabled
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!chartScrubbing}
      >
        {/* Overview card */}
        <View style={styles.card}>
          <View style={styles.overviewHead}>
            {stock.iconUrl ? (
              <Image source={{ uri: stock.iconUrl }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                <Text style={[styles.avatarLetter, { color: av.fg }]}>
                  {symbol.charAt(0)}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.overviewSym}>{stock.symbol}</Text>
              <Text style={styles.overviewName} numberOfLines={2}>
                {stock.name}
              </Text>
            </View>
          </View>

          <Text style={styles.ltpCaption}>Last Traded Price</Text>
          <View style={styles.ltpRow}>
            <Text style={[styles.ltpValue, { color: accent }]}>
              {rsPrice(stock.ltp, 0)}
            </Text>
            <View
              style={[
                styles.changePill,
                {
                  backgroundColor: up ? 'rgba(76,175,80,0.15)' : 'rgba(229,57,53,0.14)',
                },
              ]}
            >
              <Text style={[styles.changePillText, { color: accent }]}>
                {changeLabel}
              </Text>
            </View>
          </View>

          <View style={styles.chipList}>
            {stock.sector ? (
              <View style={styles.chip}>
                <Ionicons name="triangle-outline" size={rs(13)} color={colors.primary} />
                <Text style={styles.chipText}>{stock.sector}</Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <Ionicons name="business-outline" size={rs(13)} color={colors.primary} />
              <Text style={styles.chipText}>
                Mkt Cap Rs. {fmtMcap(stock.marketCap)}
              </Text>
            </View>
            {stock.email ? (
              <Pressable
                style={styles.chip}
                onPress={() => void Linking.openURL(`mailto:${stock.email}`)}
              >
                <Ionicons name="mail-outline" size={rs(13)} color={colors.primary} />
                <Text style={styles.chipText}>{stock.email}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Price Chart card */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <MaterialCommunityIcons
              name="chart-line"
              size={rs(18)}
              color={colors.primary}
            />
            <Text style={styles.sectionTitle}>Price Chart</Text>
          </View>

          <View style={styles.rangeBar}>
            {CHART_RANGES.map((r) => {
              const active = chartRange === r;
              return (
                <Pressable
                  key={r}
                  style={[styles.rangeBtn, active && styles.rangeBtnActive]}
                  onPress={() => setChartRange(r)}
                >
                  <Text
                    style={[styles.rangeText, active && styles.rangeTextActive]}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.chartFrame}>
            {chartLoading ? (
              <View style={styles.chartLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <AreaChart
                points={chartPoints}
                isDark={isDark}
                up={up}
                height={rs(290)}
                showAxes
                interactive
                backgroundColor={chartBg}
                onInteractionChange={setChartScrubbing}
              />
            )}
          </View>
        </View>

        <Pressable
          style={styles.advancedBtn}
          onPress={() => navigation.navigate('Charts', { symbol })}
        >
          <MaterialCommunityIcons
            name="chart-candlestick"
            size={rs(18)}
            color={colors.primary}
          />
          <Text style={styles.advancedBtnText}>Advanced Chart</Text>
        </Pressable>

        {/* Today's Trading */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Ionicons name="calendar-outline" size={rs(17)} color={colors.primary} />
            <Text style={styles.sectionTitle}>Today&apos;s Trading</Text>
          </View>
          <View style={styles.grid}>
            <StatCell label="DAY HIGH" value={rsPrice(stock.high, 0)} styles={styles} />
            <StatCell label="DAY LOW" value={rsPrice(stock.low, 0)} styles={styles} />
            <StatCell label="OPEN PRICE" value={rsPrice(stock.open, 0)} styles={styles} />
            <StatCell
              label="PREV. CLOSE"
              value={rsPrice(stock.previousClose, 0)}
              styles={styles}
            />
            <StatCell
              label="TOTAL TRADES"
              value={stock.transactions?.toLocaleString('en-NP') ?? '—'}
              styles={styles}
            />
            <StatCell
              label="TOTAL VOLUME"
              value={stock.volume?.toLocaleString('en-NP') ?? '—'}
              styles={styles}
            />
          </View>
        </View>

        {/* Fundamentals */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <MaterialCommunityIcons
              name="chart-timeline-variant"
              size={rs(18)}
              color={colors.primary}
            />
            <Text style={styles.sectionTitle}>Fundamentals</Text>
          </View>
          <View style={styles.grid}>
            <StatCell
              label="52 WEEK HIGH"
              value={rsPrice(stock.fiftyTwoWeekHigh, 2)}
              styles={styles}
            />
            <StatCell
              label="52 WEEK LOW"
              value={rsPrice(stock.fiftyTwoWeekLow, 0)}
              styles={styles}
            />
            <StatCell label="EPS" value={fmtRatio(stock.eps)} styles={styles} />
            <StatCell
              label="BOOK VALUE / SHARE"
              value={fmtRatio(stock.bookValue)}
              styles={styles}
            />
            <StatCell
              label="P/E RATIO"
              value={fmtRatio(stock.peRatio)}
              styles={styles}
            />
            <StatCell
              label="MARKET CAP"
              value={`Rs. ${fmtMcap(stock.marketCap)}`}
              styles={styles}
            />
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderHistory = () => (
    <View style={styles.histWrap}>
      <View style={styles.histHead}>
        <Text style={[styles.histTh, { flex: 1.35, textAlign: 'left' }]}>DATE</Text>
        <Text style={[styles.histTh, { flex: 0.9 }]}>LTP</Text>
        <Text style={[styles.histTh, { flex: 0.9 }]}>CHG</Text>
        <Text style={[styles.histTh, { flex: 0.85 }]}>%</Text>
        <Text style={[styles.histTh, { flex: 1, textAlign: 'right' }]}>QTY</Text>
      </View>
      <FlatList
        data={history}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.histList}
        renderItem={({ item }) => {
          const chg = item.change ?? 0;
          const pct = item.changePercent ?? 0;
          const rowUp = chg > 0;
          const rowDown = chg < 0;
          const rowAccent = rowUp
            ? colors.accentGreen
            : rowDown
              ? colors.danger
              : colors.text;
          return (
            <View style={styles.histCard}>
              <Text style={[styles.histDate, { flex: 1.35 }]}>{item.date}</Text>
              <Text style={[styles.histLtp, { flex: 0.9 }]}>
                {fmtNum(item.ltp, item.ltp != null && item.ltp % 1 ? 2 : 0)}
              </Text>
              <Text style={[styles.histChg, { flex: 0.9, color: rowAccent }]}>
                {rowUp ? '+' : ''}
                {fmtNum(chg, 1)}
              </Text>
              <Text style={[styles.histChg, { flex: 0.85, color: rowAccent }]}>
                {rowUp ? '+' : ''}
                {pct.toFixed(2)}
              </Text>
              <Text style={[styles.histQty, { flex: 1 }]}>
                {item.volume?.toLocaleString('en-NP') ?? '—'}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          tabLoading ? (
            <View style={styles.tabLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <Text style={styles.empty}>No price history.</Text>
          )
        }
      />
    </View>
  );

  const fsPageCount = useMemo(() => {
    if (fsTotalItems != null && fsTotalItems > 0) {
      return Math.max(1, Math.ceil(fsTotalItems / FS_PAGE_SIZE));
    }
    return fsHasNext ? fsPage + 1 : fsPage;
  }, [fsTotalItems, fsHasNext, fsPage, FS_PAGE_SIZE]);

  const fsSummary = useMemo(() => {
    let amt = 0;
    let qty = 0;
    for (const r of floorsheet) {
      amt += r.amount ?? 0;
      qty += r.quantity ?? 0;
    }
    return { amt, qty, trades: floorsheet.length };
  }, [floorsheet]);

  const renderFloorsheet = () => (
    <View style={styles.fsRoot}>
      <View style={styles.fsFilters}>
        <View style={styles.fsInputRow}>
          <Ionicons
            name="calendar-outline"
            size={rs(16)}
            color={colors.primary}
            style={{ marginRight: rs(8) }}
          />
          <TextInput
            value={fsDate}
            onChangeText={setFsDate}
            placeholder="Business date"
            placeholderTextColor={colors.textMuted}
            style={styles.fsInput}
          />
        </View>
        <View style={styles.filterRow}>
          <TextInput
            value={fsBuyer}
            onChangeText={setFsBuyer}
            placeholder="Buyer broker Id"
            placeholderTextColor={colors.textMuted}
            style={[styles.fsInputSolo, { flex: 1 }]}
            keyboardType="number-pad"
          />
          <TextInput
            value={fsSeller}
            onChangeText={setFsSeller}
            placeholder="Seller broker id"
            placeholderTextColor={colors.textMuted}
            style={[styles.fsInputSolo, { flex: 1 }]}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.fsActionRow}>
          <Pressable
            style={styles.fsFilterBtn}
            onPress={() => void applyFloorFilter()}
          >
            <Ionicons name="filter" size={rs(16)} color="#fff" />
            <Text style={styles.filterBtnText}>Filter</Text>
          </Pressable>
          <Pressable
            style={styles.fsRefreshBtn}
            onPress={() => void applyFloorFilter()}
          >
            <Ionicons name="refresh" size={rs(18)} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.fsTableHead}>
          <Text style={[styles.fsTh, { width: rs(26) }]}>SN</Text>
          <Text style={[styles.fsTh, { width: rs(44) }]}>SYM</Text>
          <Text style={[styles.fsTh, { width: rs(28) }]}>BB</Text>
          <Text style={[styles.fsTh, { width: rs(28) }]}>SB</Text>
          <Text style={[styles.fsTh, styles.thNum, { flex: 0.9 }]}>QTY</Text>
          <Text style={[styles.fsTh, styles.thNum, { flex: 0.9 }]}>RATE</Text>
          <Text style={[styles.fsTh, styles.thNum, { flex: 1.1 }]}>AMT</Text>
          <Text style={[styles.fsTh, styles.thNum, { flex: 1.2 }]}>TIME</Text>
        </View>
      </View>

      <FlatList
        style={styles.fsDataList}
        data={floorsheet}
        keyExtractor={(item, index) => `${item.contractId}-${index}`}
        contentContainerStyle={styles.fsDataBody}
        nestedScrollEnabled
        ListEmptyComponent={
          tabLoading ? (
            <View style={styles.tabLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <Text style={styles.empty}>No floor sheet data.</Text>
          )
        }
        renderItem={({ item, index }) => (
          <View style={styles.fsRow}>
            <Text style={[styles.fsTd, { width: rs(26) }]}>
              {(fsPage - 1) * FS_PAGE_SIZE + index + 1}
            </Text>
            <Text style={[styles.fsTdSym, { width: rs(44) }]}>
              {item.symbol}
            </Text>
            <Text style={[styles.fsTd, { width: rs(28) }]}>
              {item.buyerBroker}
            </Text>
            <Text style={[styles.fsTd, { width: rs(28) }]}>
              {item.sellerBroker}
            </Text>
            <Text style={[styles.fsTd, styles.thNum, { flex: 0.9 }]}>
              {item.quantity?.toLocaleString('en-NP') ?? '—'}
            </Text>
            <Text style={[styles.fsTd, styles.thNum, { flex: 0.9 }]}>
              {fmtNum(item.rate, 1)}
            </Text>
            <Text style={[styles.fsTd, styles.thNum, { flex: 1.1 }]}>
              {fmtAmtShort(item.amount)}
            </Text>
            <Text style={[styles.fsTdTime, { flex: 1.2 }]}>
              {fmtFloorTime(item.tradeTime)}
            </Text>
          </View>
        )}
      />

      <View style={styles.fsStickyFooter}>
        <View style={styles.fsPager}>
          <Pressable
            style={[styles.fsPageBtn, fsPage <= 1 && { opacity: 0.4 }]}
            disabled={fsPage <= 1}
            onPress={() => void goFloorPage(fsPage - 1)}
          >
            <Ionicons name="chevron-back" size={rs(18)} color={colors.primary} />
          </Pressable>
          <Text style={styles.fsPageLabel}>
            {fsPage} / {fsPageCount}
          </Text>
          <Pressable
            style={[styles.fsPageBtn, !fsHasNext && { opacity: 0.4 }]}
            disabled={!fsHasNext}
            onPress={() => void goFloorPage(fsPage + 1)}
          >
            <Ionicons
              name="chevron-forward"
              size={rs(18)}
              color={colors.primary}
            />
          </Pressable>
        </View>
        <View style={styles.fsSummary}>
          <View style={styles.fsSumCell}>
            <Text style={styles.fsSumLabel}>Amt</Text>
            <Text style={styles.fsSumVal}>{fmtAmtShort(fsSummary.amt)}</Text>
          </View>
          <View style={styles.fsSumCell}>
            <Text style={styles.fsSumLabel}>Qty</Text>
            <Text style={styles.fsSumVal}>
              {fsSummary.qty.toLocaleString('en-NP')}
            </Text>
          </View>
          <View style={styles.fsSumCell}>
            <Text style={styles.fsSumLabel}>Trades</Text>
            <Text style={styles.fsSumVal}>{fsSummary.trades}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderFinancial = () => (
    <FlatList
      data={reports}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.tabBody}
      renderItem={({ item }) => (
        <View style={styles.finCard}>
          <View style={styles.finHead}>
            <View style={styles.finIconWrap}>
              <Ionicons name="document-text-outline" size={rs(20)} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.finTitle}>{item.title}</Text>
              <Text style={styles.finCompany} numberOfLines={1}>
                {item.securityName || stock?.name || symbol}
              </Text>
            </View>
          </View>
          <View style={styles.finChips}>
            {item.fiscalYear ? (
              <View style={styles.finChip}>
                <Ionicons name="calendar-outline" size={rs(12)} color={colors.primary} />
                <Text style={styles.finChipText}>{item.fiscalYear}</Text>
              </View>
            ) : null}
            {item.quarter ? (
              <View style={styles.finChip}>
                <Ionicons name="layers-outline" size={rs(12)} color={colors.primary} />
                <Text style={styles.finChipText}>{item.quarter}</Text>
              </View>
            ) : null}
            <View style={styles.finChip}>
              <Ionicons name="calendar-outline" size={rs(12)} color={colors.primary} />
              <Text style={styles.finChipText}>Report Date - {item.date || '—'}</Text>
            </View>
          </View>
          {item.details || item.title ? (
            <Text style={styles.finSummary} numberOfLines={2}>
              {item.details || item.title}
            </Text>
          ) : null}
          <View style={styles.finActions}>
            {item.attachmentUrl ? (
              <Pressable
                style={styles.viewBtn}
                onPress={() => void Linking.openURL(item.attachmentUrl!)}
              >
                <Ionicons name="eye-outline" size={rs(16)} color={colors.primary} />
                <Text style={[styles.viewBtnText, { color: colors.primary }]}>
                  View Report
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            {item.attachmentUrl ? (
              <Pressable
                style={styles.finShareBtn}
                onPress={() => void Linking.openURL(item.attachmentUrl!)}
              >
                <Ionicons name="open-outline" size={rs(16)} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      ListEmptyComponent={
        tabLoading ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Text style={styles.empty}>No financial reports found.</Text>
        )
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
      ListEmptyComponent={
        tabLoading ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Text style={styles.empty}>No dividends.</Text>
        )
      }
    />
  );

  const renderAnnouncements = () => (
    <FlatList
      data={announcements}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.tabBody}
      renderItem={({ item }) => (
        <View style={styles.annCard}>
          <View style={styles.annHead}>
            <View style={styles.annIconWrap}>
              <Ionicons name="megaphone-outline" size={rs(16)} color={colors.primary} />
            </View>
            <Text style={styles.annTitle} numberOfLines={3}>
              {item.title}
            </Text>
          </View>
          {item.details ? (
            <Text style={styles.annBody} numberOfLines={5}>
              {item.details}
            </Text>
          ) : null}
          <View style={styles.annMeta}>
            <View style={styles.annDateRow}>
              <Ionicons name="calendar-outline" size={rs(13)} color={colors.primary} />
              <Text style={styles.annDate}>{item.date || '—'}</Text>
            </View>
            {item.attachmentUrl ? (
              <Pressable onPress={() => void Linking.openURL(item.attachmentUrl!)}>
                <Ionicons name="document-attach" size={rs(18)} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
      ListEmptyComponent={
        tabLoading ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Text style={styles.empty}>No announcements.</Text>
        )
      }
    />
  );

  const renderNewsOverview = () => {
    if (newsLoading && newsRows.length === 0) {
      return (
        <View style={styles.newsLoadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.newsLoadingText}>Loading news…</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={newsRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.tabBody}
        renderItem={({ item }) => (
          <Pressable style={styles.newsCard} onPress={() => void openNews(item)}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.newsThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.newsThumb, styles.newsThumbFallback]}>
                <Ionicons
                  name="image-outline"
                  size={rs(20)}
                  color={colors.textMuted}
                />
              </View>
            )}
            <View style={styles.newsBody}>
              <Text style={styles.newsTitle} numberOfLines={3}>
                {item.title}
              </Text>
              <View style={styles.newsMeta}>
                <View style={styles.newsTag}>
                  <Ionicons name="pricetag" size={rs(11)} color={colors.primary} />
                  <Text style={styles.newsTagText}>Stock Market Analysis</Text>
                </View>
                <View style={styles.newsTimeRow}>
                  <Ionicons
                    name="time-outline"
                    size={rs(11)}
                    color={colors.textMuted}
                  />
                  <Text style={styles.newsTime}>
                    {formatRelativeNewsTime(item.publishedAt)}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.newsSep} />}
        ListEmptyComponent={
          newsLoading ? (
            <View style={styles.tabLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <Text style={styles.empty}>No news found for {symbol}.</Text>
          )
        }
        ListFooterComponent={
          newsLoadingMore ? (
            <View style={styles.newsMore}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : null
        }
      />
    );
  };

  // Tab pages are memoized so switching tabs (which only changes tabIndex)
  // doesn't force every page — charts, tables, lists — to re-render on the
  // JS thread. That recompute was the source of the multi-second lag when
  // tapping a tab or swiping the pager.
  const infoPage = useMemo(
    () => renderInfo(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      stock,
      chartPoints,
      chartLoading,
      chartRange,
      chartScrubbing,
      up,
      accent,
      av,
      symbol,
      colors,
      isDark,
      styles,
    ],
  );
  const historyPage = useMemo(
    () => renderHistory(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, tabLoading, symbol, colors, styles],
  );
  const floorsheetPage = useMemo(
    () => renderFloorsheet(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      floorsheet,
      fsPage,
      fsHasNext,
      fsTotalItems,
      fsBuyer,
      fsSeller,
      fsDate,
      fsPageCount,
      fsSummary,
      tabLoading,
      symbol,
      colors,
      styles,
    ],
  );
  const financialPage = useMemo(
    () => renderFinancial(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, stock?.name, tabLoading, symbol, colors, styles],
  );
  const dividendsPage = useMemo(
    () => renderDividends(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dividends, tabLoading, symbol, colors, styles],
  );
  const announcementsPage = useMemo(
    () => renderAnnouncements(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [announcements, tabLoading, symbol, colors, styles],
  );
  const newsPage = useMemo(
    () => renderNewsOverview(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newsRows, newsLoading, newsLoadingMore, symbol, colors, styles],
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
        ref={tabsScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((t, index) => (
          <Pressable
            key={t.id}
            onLayout={(e) => {
              tabLayoutsRef.current[index] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width,
              };
            }}
            style={[styles.tabBtn, tabIndex === index && styles.tabBtnActive]}
            onPress={() => onTabPress(index)}
          >
            <Text
              style={[
                styles.tabText,
                tabIndex === index && styles.tabTextActive,
              ]}
            >
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
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          directionalLockEnabled
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onPagerScroll}
          onMomentumScrollEnd={onPagerMomentumEnd}
          style={styles.pager}
        >
          <View style={{ width: pageWidth, flex: 1 }}>{infoPage}</View>
          <View style={{ width: pageWidth, flex: 1 }}>{historyPage}</View>
          <View style={{ width: pageWidth, flex: 1 }}>{floorsheetPage}</View>
          <View style={{ width: pageWidth, flex: 1 }}>{financialPage}</View>
          <View style={{ width: pageWidth, flex: 1 }}>{dividendsPage}</View>
          <View style={{ width: pageWidth, flex: 1 }}>{announcementsPage}</View>
          <View style={{ width: pageWidth, flex: 1 }}>{newsPage}</View>
        </ScrollView>
      )}
    </View>
  );
}

function StatCell({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? c.surface : '#F7FAF3';
  const chipBg = isDark ? c.surfaceAlt : '#E8EFE3';
  const rangeTrack = isDark ? c.surfaceAlt : '#E6EDE0';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
    },
    headerSym: {
      color: c.text,
      fontSize: rs(17),
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    tabsScroll: {
      maxHeight: rs(46),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    tabs: { paddingHorizontal: rs(10), alignItems: 'flex-end' },
    tabBtn: {
      paddingHorizontal: rs(12),
      paddingVertical: rs(11),
      marginRight: rs(2),
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    tabBtnActive: { borderBottomColor: c.primary },
    tabText: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    tabTextActive: { color: c.text, fontWeight: '800' },
    tabBody: { padding: rs(14), paddingBottom: rs(36), gap: rs(12) },
    pager: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    tabLoading: { padding: rs(30), alignItems: 'center' },
    empty: { color: c.textMuted, textAlign: 'center', padding: rs(30) },

    card: {
      backgroundColor: cardBg,
      borderRadius: rs(22),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(16),
      overflow: 'visible',
    },
    overviewHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      marginBottom: rs(14),
    },
    avatar: {
      width: rs(52),
      height: rs(52),
      borderRadius: rs(26),
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImg: {
      width: rs(52),
      height: rs(52),
      borderRadius: rs(26),
      backgroundColor: chipBg,
    },
    avatarLetter: { fontSize: rs(22), fontWeight: '800', color: '#FFFFFF' },
    overviewSym: { color: c.text, fontSize: rs(17), fontWeight: '800' },
    overviewName: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(2),
      lineHeight: rs(16),
    },
    ltpCaption: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '600',
      marginBottom: rs(4),
    },
    ltpRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: rs(10),
      marginBottom: rs(14),
    },
    ltpValue: { fontSize: rs(28), fontWeight: '800', letterSpacing: -0.3 },
    changePill: {
      borderRadius: rs(20),
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
    },
    changePillText: { fontSize: rs(12), fontWeight: '700' },
    chipList: { gap: rs(8) },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      alignSelf: 'flex-start',
      backgroundColor: chipBg,
      borderRadius: rs(14),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
    },
    chipText: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '600',
    },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(12),
    },
    sectionTitle: {
      color: c.primary,
      fontSize: rs(15),
      fontWeight: '800',
    },
    rangeBar: {
      flexDirection: 'row',
      backgroundColor: rangeTrack,
      borderRadius: rs(14),
      padding: rs(3),
      marginBottom: rs(12),
    },
    rangeBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: rs(8),
      borderRadius: rs(11),
    },
    rangeBtnActive: { backgroundColor: c.primary },
    rangeText: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '700',
    },
    rangeTextActive: { color: '#FFFFFF' },
    chartFrame: {
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      overflow: 'hidden',
      backgroundColor: cardBg,
      minHeight: rs(290),
    },
    chartLoading: {
      height: rs(290),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: cardBg,
    },

    advancedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      borderRadius: rs(28),
      borderWidth: 1.5,
      borderColor: c.primary,
      backgroundColor: cardBg,
      paddingVertical: rs(12),
    },
    advancedBtnText: {
      color: c.primary,
      fontSize: rs(14),
      fontWeight: '700',
    },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    statCell: {
      width: '50%',
      paddingRight: rs(8),
      marginBottom: rs(14),
    },
    statLabel: {
      color: c.textMuted,
      fontSize: rs(10),
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: rs(4),
    },
    statValue: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '800',
    },

    tableHead: {
      flexDirection: 'row',
      backgroundColor: c.primary,
      paddingVertical: rs(8),
      paddingHorizontal: rs(6),
    },
    th: { color: '#fff', fontSize: rs(9), fontWeight: '800' },
    thNum: { textAlign: 'right' },
    histWrap: { flex: 1, paddingTop: rs(8) },
    histHead: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: rs(12),
      marginBottom: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderRadius: rs(12),
      backgroundColor: isDark ? c.surfaceAlt : '#D8E4D0',
    },
    histTh: {
      color: c.primary,
      fontSize: rs(10),
      fontWeight: '800',
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    histList: { paddingHorizontal: rs(12), paddingBottom: rs(24), gap: rs(8) },
    histCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    histDate: { color: c.text, fontSize: rs(11), fontWeight: '600' },
    histLtp: {
      color: c.text,
      fontSize: rs(12),
      fontWeight: '800',
      textAlign: 'center',
    },
    histChg: {
      fontSize: rs(12),
      fontWeight: '700',
      textAlign: 'center',
    },
    histQty: {
      color: c.text,
      fontSize: rs(11),
      fontWeight: '600',
      textAlign: 'right',
    },

    fsWrap: { padding: rs(12), paddingBottom: rs(16) },
    fsRoot: { flex: 1 },
    fsFilters: {
      paddingHorizontal: rs(12),
      paddingTop: rs(10),
      paddingBottom: rs(4),
      backgroundColor: isDark ? c.bg : c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    fsDataList: { flex: 1 },
    fsDataBody: {
      paddingHorizontal: rs(12),
      paddingBottom: rs(8),
      flexGrow: 1,
    },
    fsStickyFooter: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      paddingHorizontal: rs(12),
      paddingTop: rs(8),
      paddingBottom: rs(10),
    },
    fsCard: {
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderRadius: rs(18),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(12),
    },
    fsInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? c.surfaceAlt : '#FFFFFF',
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingHorizontal: rs(12),
      marginBottom: rs(8),
    },
    fsInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(11),
    },
    fsInputSolo: {
      backgroundColor: isDark ? c.surfaceAlt : '#FFFFFF',
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingHorizontal: rs(12),
      paddingVertical: rs(11),
      color: c.text,
      fontSize: rs(13),
    },
    fsActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginTop: rs(4),
      marginBottom: rs(10),
    },
    fsFilterBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      backgroundColor: c.primary,
      borderRadius: rs(12),
      paddingVertical: rs(12),
    },
    fsRefreshBtn: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(22),
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fsTableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(8),
      paddingHorizontal: rs(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderTopLeftRadius: rs(10),
      borderTopRightRadius: rs(10),
    },
    fsTh: {
      color: c.textMuted,
      fontSize: rs(9),
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    fsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    fsTd: { color: c.textSecondary, fontSize: rs(9), fontWeight: '600' },
    fsTdSym: { color: c.text, fontSize: rs(9), fontWeight: '800' },
    fsTdTime: {
      color: c.textSecondary,
      fontSize: rs(8),
      fontWeight: '600',
      textAlign: 'right',
    },
    fsPager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(18),
      marginBottom: rs(8),
    },
    fsPageBtn: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      backgroundColor: isDark ? c.surfaceAlt : '#D8E4D0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fsPageLabel: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '700',
    },
    fsSummary: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: rs(4),
    },
    fsSumCell: { alignItems: 'center' },
    fsSumLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
      marginBottom: rs(2),
    },
    fsSumVal: { color: c.text, fontSize: rs(14), fontWeight: '800' },

    finCard: {
      backgroundColor: cardBg,
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(12),
    },
    finHead: { flexDirection: 'row', gap: rs(12), marginBottom: rs(10) },
    finIconWrap: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(10),
      backgroundColor: chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    finTitle: { color: c.text, fontSize: rs(13), fontWeight: '800', lineHeight: rs(18) },
    finCompany: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(3) },
    finChips: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8), marginBottom: rs(8) },
    finChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      backgroundColor: chipBg,
      borderRadius: rs(14),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
    },
    finChipText: { color: c.primary, fontSize: rs(11), fontWeight: '700' },
    finSummary: { color: c.text, fontSize: rs(12), marginBottom: rs(10), lineHeight: rs(17) },
    finActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    finShareBtn: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(10),
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(7),
      paddingHorizontal: rs(6),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    td: { color: c.textSecondary, fontSize: rs(10), fontWeight: '600' },
    tdSym: { color: c.text, fontSize: rs(10), fontWeight: '800' },
    tdDate: { color: c.text, fontSize: rs(10), fontWeight: '700' },
    filterBox: {
      padding: rs(10),
      gap: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    filterRow: { flexDirection: 'row', gap: rs(8) },
    filterInput: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(8),
      paddingHorizontal: rs(10),
      paddingVertical: rs(8),
      color: c.text,
      fontSize: rs(12),
    },
    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      backgroundColor: c.accentGreen,
      borderRadius: rs(8),
      paddingVertical: rs(10),
    },
    filterBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(13) },
    reportCard: {
      flexDirection: 'row',
      gap: rs(12),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(10),
    },
    reportTitle: { color: c.text, fontSize: rs(13), fontWeight: '800' },
    reportDate: { color: c.textMuted, fontSize: rs(10), marginTop: rs(4) },
    reportBody: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(6) },
    viewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginTop: rs(10),
      borderWidth: 1,
      borderColor: c.accentGreen,
      borderRadius: rs(20),
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      alignSelf: 'flex-start',
    },
    viewBtnText: { color: c.accentGreen, fontWeight: '700', fontSize: rs(12) },
    fundBox: {
      backgroundColor: c.surface,
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    fundTitle: {
      color: c.text,
      fontWeight: '800',
      marginBottom: rs(8),
      fontSize: rs(12),
    },
    fundRow: { color: c.textSecondary, fontSize: rs(11), marginBottom: rs(4) },
    divCard: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      paddingVertical: rs(12),
    },
    divLabel: {
      color: '#42A5F5',
      fontWeight: '800',
      fontSize: rs(13),
      marginBottom: rs(6),
    },
    divRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: rs(4),
    },
    divText: { color: c.textMuted, fontSize: rs(11), flex: 1 },
    divVal: { color: c.text, fontWeight: '700' },
    divTotal: { color: c.accentGreen, fontWeight: '800' },
    fiscal: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    annCard: {
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderRadius: rs(14),
      padding: rs(14),
      marginBottom: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    annHead: { flexDirection: 'row', gap: rs(10), marginBottom: rs(8) },
    annIconWrap: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      backgroundColor: chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: rs(2),
    },
    annTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    annBody: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginBottom: rs(10),
      lineHeight: rs(17),
    },
    annMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    annDateRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    annDate: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    newsCard: {
      flexDirection: 'row',
      gap: rs(12),
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderRadius: rs(14),
      padding: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    newsThumb: {
      width: rs(72),
      height: rs(72),
      borderRadius: rs(10),
      backgroundColor: chipBg,
    },
    newsThumbFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    newsBody: { flex: 1, gap: rs(8) },
    newsTitle: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '700',
      lineHeight: rs(18),
    },
    newsMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: rs(8),
    },
    newsTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: chipBg,
      paddingHorizontal: rs(8),
      paddingVertical: rs(4),
      borderRadius: rs(12),
    },
    newsTagText: {
      color: c.primary,
      fontSize: rs(10),
      fontWeight: '600',
    },
    newsTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
    },
    newsTime: { color: c.textMuted, fontSize: rs(10), fontWeight: '500' },
    newsSep: { height: rs(10) },
    newsMore: { paddingVertical: rs(16), alignItems: 'center' },
    newsLoadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: rs(48),
      gap: rs(12),
    },
    newsLoadingText: {
      color: c.textMuted,
      fontSize: rs(13),
      fontWeight: '600',
    },
  });
}
