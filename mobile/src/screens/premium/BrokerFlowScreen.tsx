import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PriorSessionBanner } from '../../components/PriorSessionBanner';
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  ensureBrokerFlowIntelHydrated,
  invalidateBrokerAnalyticsCache,
  peekBrokerFlowIntel,
  searchBrokerNetRows,
  streamPremiumIntel,
  type PremiumIntelRow,
} from '../../services/nepse/brokerAnalytics';
import { invalidateMarketCaches } from '../../services/nepse/invalidateMarketCaches';
import { nepalTodayIso } from '../../services/nepse/holidays';
import { iconUri } from '../../services/nepse/screener';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

type Mode = 'accumulation' | 'distribution';
type Period = '1d' | '3d' | '7d' | '1m';
type SortKey = 'amount' | 'qty' | 'pct';

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: '1d', label: '1 Day' },
  { id: '3d', label: '3 Days' },
  { id: '7d', label: '7 Days' },
  { id: '1m', label: '1 Month' },
];

const HEADER_TEAL = '#1A5F5A';
const SYM_COL_W = rs(96);
const ROW_H = rs(44);
const LOGO_SZ = rs(20);
const HCOL_QTY = rs(80);
const HCOL_PCT = rs(64);
const HCOL_AMT = rs(78);
const HCOL_BUY = rs(72);
const HCOL_AVG = rs(60);
const HCOL_BROKER = rs(64);
const HCOL_LTP = rs(64);
const HCOL_CHG = rs(62);
const HCOL_SELL = rs(64);
/** ~char width at 11pt + padding — used to fit full broker names. */
const BROKER_NAME_CHAR_W = rs(8);
const BROKER_NAME_PAD = rs(24);
const BROKER_NAME_MIN_W = rs(180);

function brokerNumber(code: string | null | undefined): string {
  if (!code) return '—';
  const m = String(code).match(/\d+/);
  return m ? m[0] : code;
}

/** Full directory name — never invent brokers. */
function fullBrokerName(name: string | null | undefined): string {
  const t = name?.trim();
  return t ? t : '—';
}

function fmtAmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} Lakh`;
  return n.toLocaleString('en-NP', { maximumFractionDigits: 0 });
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} Lakh`;
  return Math.round(n).toLocaleString('en-NP');
}

function fmtRate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NP', { maximumFractionDigits: 2 });
}

function fmtChg(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function metricValue(item: PremiumIntelRow, label: string): string {
  const hit = item.metrics.find((m) => m.label === label);
  return hit?.value ?? '—';
}

function todayYmd(): string {
  return nepalTodayIso();
}

function SymLogo({
  symbol,
  iconUrl,
  styles,
}: {
  symbol: string;
  iconUrl: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);
  if (iconUrl && !failed) {
    const uri = iconUri(iconUrl) ?? iconUrl;
    return (
      <Image
        source={{ uri }}
        style={styles.logoImg}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.logo}>
      <Text style={styles.logoText}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

export function AccumulationScreen() {
  return <BrokerFlowScreen mode="accumulation" />;
}

export function DistributionScreen() {
  return <BrokerFlowScreen mode="distribution" />;
}

export function BrokerFlowScreen({ mode }: { mode: Mode }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const isAcc = mode === 'accumulation';
  const title = isAcc ? 'Broker Accumulation' : 'Broker Distribution';
  const amtLabel = isAcc ? 'Buy Amt' : 'Sell Amt';
  const buyQtyLabel = isAcc ? 'Buy Qty' : 'Sell Qty';
  const qtyLabel = isAcc ? 'Acc Qty' : 'Dis Qty';
  const pctLabel = isAcc ? 'Acc %' : 'Dis %';
  const sortAccent = isAcc ? '#2E9E5B' : '#E5484D';

  // Shell-first: never seed rows/table on the first paint. Painting a warm
  // 100+ row sticky table during the stack transition freezes the UI for seconds.
  const [rows, setRows] = useState<PremiumIntelRow[]>([]);
  const [searchHits, setSearchHits] = useState<PremiumIntelRow[]>([]);
  const [searchingBroker, setSearchingBroker] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [priorReason, setPriorReason] = useState<string | null>(null);
  const [brokerBreakdown, setBrokerBreakdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tableReady, setTableReady] = useState(false);
  const [period, setPeriod] = useState<Period>('1d');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('amount');
  const [sortDesc, setSortDesc] = useState(true);
  const genRef = useRef(0);
  const busyRef = useRef(false);
  const revealDoneRef = useRef(false);
  const hasRowsRef = useRef(false);
  const hScrollX = useRef(new Animated.Value(0)).current;

  const rowKey = useCallback(
    (item: PremiumIntelRow) =>
      `${item.symbol}-${item.brokerCode ?? 'x'}-${item.rank}`,
    [],
  );

  const onHorizScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: hScrollX } } }], {
        useNativeDriver: true,
      }),
    [hScrollX],
  );

  /** Keeps SYM visually pinned while the wide table scrolls horizontally. */
  const stickySymStyle = useMemo(
    () => ({ transform: [{ translateX: hScrollX }] }),
    [hScrollX],
  );

  const refresh = useCallback(
    async (opts: { silent?: boolean; force?: boolean } = {}) => {
      const silent = opts.silent === true;
      const force = opts.force === true;

      // Don't let background poll restart mid-load.
      if (silent && busyRef.current) return;

      const gen = ++genRef.current;
      busyRef.current = true;

      if (force) {
        invalidateMarketCaches();
        invalidateBrokerAnalyticsCache();
      }

      if (!silent) {
        // Keep existing rows visible — only full spinner if we have nothing yet.
        if (!hasRowsRef.current) setLoading(true);
        else setLoadingMore(true);
      }

      try {
        await streamPremiumIntel(
          isAcc ? 'top-holders' : 'top-releases',
          (snap, meta) => {
            if (gen !== genRef.current) return;

            // Silent poll: only swap in the finished list.
            if (silent) {
              if (!meta.partial) {
                setRows(snap.rows);
                hasRowsRef.current = snap.rows.length > 0;
                setSessionDate(snap.sessionDate);
                setPriorReason(snap.priorSessionReason ?? null);
                setBrokerBreakdown(snap.brokerBreakdown);
                setDisplayCount(snap.rows.length);
                setLoadingMore(false);
                revealDoneRef.current = true;
              }
              return;
            }

            setRows(snap.rows);
            hasRowsRef.current = snap.rows.length > 0;
            setSessionDate(snap.sessionDate);
            setPriorReason(snap.priorSessionReason ?? null);
            setBrokerBreakdown(snap.brokerBreakdown);
            setLoading(false);
            // Progressive reveal — avoid mounting 100+ complex rows in one frame.
            const total = snap.rows.length;
            setDisplayCount((prev) => {
              const capped = Math.min(24, total);
              if (!meta.partial && total > capped && prev < total) {
                requestAnimationFrame(() => setDisplayCount(total));
                return Math.max(prev, capped);
              }
              return meta.partial ? Math.max(prev, capped) : total;
            });
            setLoadingMore(meta.partial && snap.rows.length > 0);
            if (!meta.partial) {
              setLoadingMore(false);
              revealDoneRef.current = true;
            }
          },
          120,
        );
      } catch {
        // Fall through to finally — never leave the spinner stuck.
      } finally {
        if (gen === genRef.current) {
          setLoading(false);
          setLoadingMore(false);
          busyRef.current = false;
        }
      }
    },
    [isAcc],
  );

  // Open shell immediately; hydrate + stream only after the stack animation finishes.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setTableReady(false);
      setLoading(true);

      const interactionTask = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        setTableReady(true);
        void (async () => {
          await ensureBrokerFlowIntelHydrated();
          if (cancelled) return;
          const warm = peekBrokerFlowIntel(
            isAcc ? 'top-holders' : 'top-releases',
          );
          if (warm?.rows.length) {
            setRows(warm.rows);
            setDisplayCount(Math.min(24, warm.rows.length));
            setSessionDate(warm.sessionDate);
            setPriorReason(warm.priorSessionReason ?? null);
            setBrokerBreakdown(warm.brokerBreakdown);
            setLoading(false);
            hasRowsRef.current = true;
            // Expand remaining cached rows on the next ticks.
            requestAnimationFrame(() => {
              if (!cancelled) setDisplayCount(warm.rows.length);
            });
          }
          void refresh({ silent: false, force: false });
        })();
      });

      return () => {
        cancelled = true;
        interactionTask.cancel();
      };
    }, [refresh, isAcc]),
  );

  // Soft poll — do not wipe warm floorsheet/logo caches (that caused 4–5s reloads).
  usePollingRefresh(() => refresh({ silent: true }), 60_000, true, {
    invalidate: false,
  });

  // Broker-number search only works when floorsheet includes member IDs.
  useEffect(() => {
    const q = query.trim();
    if (!brokerBreakdown || !/^\d{1,4}$/.test(q)) {
      setSearchHits([]);
      setSearchingBroker(false);
      return;
    }
    const already = rows.some((r) => brokerNumber(r.brokerCode) === q);
    if (already) {
      setSearchHits([]);
      setSearchingBroker(false);
      return;
    }
    let cancelled = false;
    setSearchingBroker(true);
    const t = setTimeout(() => {
      void searchBrokerNetRows(
        isAcc ? 'top-holders' : 'top-releases',
        q,
        40,
      ).then((hits) => {
        if (cancelled) return;
        setSearchHits(hits);
        setSearchingBroker(false);
      });
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, rows, isAcc, brokerBreakdown]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sortFn = (list: PremiumIntelRow[]) => {
      const sorted = [...list].sort((a, b) => {
        const av =
          sortKey === 'amount'
            ? Math.abs(a.amount ?? 0)
            : sortKey === 'qty'
              ? Math.abs(a.quantity ?? 0)
              : a.sharePct ?? 0;
        const bv =
          sortKey === 'amount'
            ? Math.abs(b.amount ?? 0)
            : sortKey === 'qty'
              ? Math.abs(b.quantity ?? 0)
              : b.sharePct ?? 0;
        return sortDesc ? bv - av : av - bv;
      });
      return sorted;
    };

    if (q) {
      const filtered = rows.filter((r) => {
        const num = brokerNumber(r.brokerCode).toLowerCase();
        const name = (r.brokerName ?? '').toLowerCase();
        return (
          r.symbol.toLowerCase().includes(q) ||
          num.includes(q) ||
          name.includes(q) ||
          (r.brokerCode ?? '').toLowerCase().includes(q)
        );
      });
      // Prefer on-demand broker hits (shown first), then streamed matches.
      const hitKeys = new Set(
        searchHits.map((r) => `${r.symbol}-${brokerNumber(r.brokerCode)}`),
      );
      const rest = filtered.filter(
        (r) => !hitKeys.has(`${r.symbol}-${brokerNumber(r.brokerCode)}`),
      );
      return sortFn([...searchHits, ...rest]);
    }

    return sortFn(rows).slice(0, displayCount);
  }, [rows, query, sortKey, sortDesc, displayCount, searchHits]);

  const periodLabel =
    PERIODS.find((p) => p.id === period)?.label ?? '1 Day';

  const SortCaret = ({ active }: { active: boolean }) =>
    active ? (
      <Ionicons
        name={sortDesc ? 'caret-down' : 'caret-up'}
        size={rs(10)}
        color={sortAccent}
      />
    ) : (
      <Ionicons name="swap-vertical" size={rs(10)} color="rgba(255,255,255,0.55)" />
    );

  // Size Broker Name column to the longest name so nothing is clipped.
  const brokerNameColW = useMemo(() => {
    let maxLen = 'Broker Name'.length;
    for (const r of rows) {
      const n = fullBrokerName(r.brokerName);
      if (n.length > maxLen) maxLen = n.length;
    }
    for (const r of searchHits) {
      const n = fullBrokerName(r.brokerName);
      if (n.length > maxLen) maxLen = n.length;
    }
    return Math.max(
      BROKER_NAME_MIN_W,
      Math.ceil(maxLen * BROKER_NAME_CHAR_W) + BROKER_NAME_PAD,
    );
  }, [rows, searchHits]);

  const scrollColsWidth =
    HCOL_QTY +
    HCOL_PCT +
    HCOL_AMT +
    HCOL_BUY +
    HCOL_AVG +
    HCOL_BROKER +
    HCOL_LTP +
    HCOL_CHG +
    HCOL_SELL +
    brokerNameColW;
  const tableWidth = SYM_COL_W + scrollColsWidth;
  const brokerNameColStyle = useMemo(
    () => ({ width: brokerNameColW }),
    [brokerNameColW],
  );

  const renderDataCols = (item: PremiumIntelRow) => (
    <>
      <Text style={[styles.td, styles.hColQty, styles.hColQtyVal]} numberOfLines={1}>
        {fmtQty(item.quantity)}
      </Text>
      <Text style={[styles.td, styles.hColPct]} numberOfLines={1}>
        {item.sharePct != null
          ? `${Number.isInteger(item.sharePct) ? item.sharePct : item.sharePct.toFixed(2)}%`
          : '—'}
      </Text>
      <Text style={[styles.td, styles.hColAmt]} numberOfLines={1}>
        {fmtAmt(item.amount)}
      </Text>
      <Text style={[styles.td, styles.hColBuy]} numberOfLines={1}>
        {metricValue(item, isAcc ? 'Buy' : 'Sell')}
      </Text>
      <Text style={[styles.td, styles.hColAvg]} numberOfLines={1}>
        {fmtRate(item.avgRate)}
      </Text>
      <Text style={[styles.td, styles.hColBroker, styles.brokerText]} numberOfLines={1}>
        {brokerNumber(item.brokerCode)}
      </Text>
      <Text style={[styles.td, styles.hColLtp]} numberOfLines={1}>
        {fmtRate(item.ltp)}
      </Text>
      <Text
        style={[
          styles.td,
          styles.hColChg,
          (item.changePct ?? 0) >= 0 ? styles.chgUp : styles.chgDown,
        ]}
        numberOfLines={1}
      >
        {fmtChg(item.changePct)}
      </Text>
      <Text style={[styles.td, styles.hColSell]} numberOfLines={1}>
        {metricValue(item, isAcc ? 'Sell' : 'Buy')}
      </Text>
      <Text
        style={[styles.td, styles.hColBrokerName, brokerNameColStyle]}
        ellipsizeMode="clip"
      >
        {fullBrokerName(item.brokerName)}
      </Text>
    </>
  );

  const tableHeader = (
    <View style={[styles.tableHeadRow, { width: tableWidth }]}>
      <Animated.View
        style={[styles.symHeadFixed, styles.stickySym, stickySymStyle]}
      >
        <Text style={styles.th}>SYM</Text>
      </Animated.View>
      <Pressable
        style={[styles.thPress, styles.hColQty]}
        onPress={() => toggleSort('qty')}
      >
        <Text style={styles.th}>{qtyLabel}</Text>
        <SortCaret active={sortKey === 'qty'} />
      </Pressable>
      <Pressable
        style={[styles.thPress, styles.hColPct]}
        onPress={() => toggleSort('pct')}
      >
        <Text style={styles.th}>{pctLabel}</Text>
        <SortCaret active={sortKey === 'pct'} />
      </Pressable>
      <Pressable
        style={[styles.thPress, styles.hColAmt]}
        onPress={() => toggleSort('amount')}
      >
        <Text style={styles.th}>{amtLabel}</Text>
        <SortCaret active={sortKey === 'amount'} />
      </Pressable>
      <Text style={[styles.th, styles.hColBuy]}>{buyQtyLabel}</Text>
      <Text style={[styles.th, styles.hColAvg]}>Avg</Text>
      <Text style={[styles.th, styles.hColBroker]}>Broker</Text>
      <Text style={[styles.th, styles.hColLtp]}>LTP</Text>
      <Text style={[styles.th, styles.hColChg]}>Chg %</Text>
      <Text style={[styles.th, styles.hColSell]}>Sell</Text>
      <Text style={[styles.th, styles.hColBrokerName, brokerNameColStyle]}>
        Broker Name
      </Text>
    </View>
  );

  const body = (
    <View style={styles.body}>
      <Text style={styles.dateText}>{sessionDate ?? todayYmd()}</Text>
      <PriorSessionBanner reason={priorReason} />

      <View style={styles.filters}>
        <Pressable style={styles.periodBtn} onPress={() => setPeriodOpen(true)}>
          <Ionicons name="time-outline" size={rs(15)} color={colors.textMuted} />
          <Text style={styles.periodText}>{periodLabel}</Text>
          <Ionicons name="chevron-down" size={rs(14)} color={colors.textMuted} />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={rs(15)} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="broker no / company…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="characters"
          />
        </View>
      </View>

      <View style={styles.tableWrap}>
        {!tableReady || (loading && rows.length === 0) ? (
          <ActivityIndicator style={{ marginTop: rs(40) }} color={HEADER_TEAL} />
        ) : (
          <Animated.ScrollView
            horizontal
            bounces={false}
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            scrollEventThrottle={16}
            onScroll={onHorizScroll}
            style={styles.hTableScroll}
            contentContainerStyle={styles.hTableContent}
          >
            <View style={[styles.tableInner, { width: tableWidth }]}>
              {tableHeader}
              <FlatList
                data={visible}
                style={styles.dataList}
                contentContainerStyle={styles.listContent}
                nestedScrollEnabled
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={5}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews
                keyExtractor={rowKey}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => {
                      setRefreshing(true);
                      void refresh({ silent: false, force: true }).finally(() =>
                        setRefreshing(false),
                      );
                    }}
                    tintColor={HEADER_TEAL}
                  />
                }
                ListEmptyComponent={
                  <Text style={styles.empty}>No broker rows for this session.</Text>
                }
                ListFooterComponent={<View style={styles.footerPad} />}
                renderItem={({ item, index }) => (
                  <Pressable
                    style={[
                      styles.fullRow,
                      { width: tableWidth },
                      index % 2 === 1 && styles.rowAlt,
                    ]}
                    onPress={() =>
                      navigation.navigate('StockDetail', { symbol: item.symbol })
                    }
                  >
                    <Animated.View
                      style={[
                        styles.symCell,
                        index % 2 === 1 && styles.rowAlt,
                        styles.stickySym,
                        stickySymStyle,
                      ]}
                    >
                      <SymLogo
                        symbol={item.symbol}
                        iconUrl={item.iconUrl}
                        styles={styles}
                      />
                      <Text style={styles.symText} numberOfLines={1}>
                        {item.symbol}
                      </Text>
                    </Animated.View>
                    {renderDataCols(item)}
                  </Pressable>
                )}
              />
            </View>
          </Animated.ScrollView>
        )}

      </View>

      <Modal
        visible={periodOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPeriodOpen(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Time range</Text>
            {PERIODS.map((p) => (
              <Pressable
                key={p.id}
                style={styles.sheetRow}
                onPress={() => {
                  setPeriod(p.id);
                  setPeriodOpen(false);
                }}
              >
                <Text style={styles.sheetRowText}>{p.label}</Text>
                {period === p.id ? (
                  <Ionicons name="checkmark" size={rs(18)} color={HEADER_TEAL} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable hitSlop={12} onPress={() => void refresh({ force: true })}>
          <Ionicons
            name="refresh"
            size={rs(20)}
            color={loading || loadingMore ? colors.textMuted : colors.text}
          />
        </Pressable>
      </View>
      <PremiumGate
        title={title}
        subtitle={
          isAcc
            ? 'Broker-level net buy accumulation from the live floorsheet.'
            : 'Broker-level net sell distribution from the live floorsheet.'
        }
      >
        {body}
      </PremiumGate>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
      backgroundColor: c.bgElevated,
    },
    title: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    body: { flex: 1, minHeight: 0 },
    dateText: {
      textAlign: 'center',
      color: c.textSecondary,
      fontSize: rs(13),
      marginBottom: rs(10),
    },
    filters: {
      flexDirection: 'row',
      gap: rs(8),
      paddingHorizontal: rs(12),
      marginBottom: rs(10),
    },
    periodBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      backgroundColor: c.surfaceAlt,
      borderRadius: rs(10),
      paddingHorizontal: rs(10),
      paddingVertical: rs(9),
    },
    periodText: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(10),
      paddingVertical: rs(7),
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(12),
      paddingVertical: 0,
    },
    tableWrap: { flex: 1, minHeight: 0, overflow: 'hidden' },
    hTableScroll: { flex: 1 },
    hTableContent: { flexGrow: 1 },
    tableInner: { flex: 1 },
    dataList: { flex: 1 },
    listContent: { paddingBottom: rs(8) },
    tableHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_H,
      backgroundColor: HEADER_TEAL,
    },
    stickySym: {
      zIndex: 4,
      elevation: 4,
    },
    symHeadFixed: {
      width: SYM_COL_W,
      height: ROW_H,
      justifyContent: 'center',
      paddingLeft: rs(8),
      paddingRight: rs(4),
      backgroundColor: HEADER_TEAL,
    },
    fullRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_H,
      backgroundColor: c.surface,
    },
    symCell: {
      width: SYM_COL_W,
      height: ROW_H,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      paddingLeft: rs(8),
      paddingRight: rs(4),
      backgroundColor: c.surface,
    },
    th: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(11),
      letterSpacing: 0.2,
    },
    thPress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(3),
      height: ROW_H,
    },
    hColQty: { width: HCOL_QTY, justifyContent: 'center' },
    hColQtyVal: { paddingLeft: rs(12) },
    hColPct: { width: HCOL_PCT, justifyContent: 'center' },
    hColAmt: { width: HCOL_AMT, justifyContent: 'center' },
    hColBuy: { width: HCOL_BUY, justifyContent: 'center' },
    hColAvg: { width: HCOL_AVG, justifyContent: 'center' },
    hColBroker: {
      width: HCOL_BROKER,
      justifyContent: 'center',
      textAlign: 'center',
      paddingRight: rs(10),
    },
    hColLtp: {
      width: HCOL_LTP,
      justifyContent: 'center',
      paddingLeft: rs(6),
    },
    hColChg: { width: HCOL_CHG, justifyContent: 'center' },
    hColSell: { width: HCOL_SELL, justifyContent: 'center' },
    hColBrokerName: {
      justifyContent: 'center',
      paddingLeft: rs(6),
      paddingRight: rs(14),
      color: c.textMuted,
      fontWeight: '600',
      fontSize: rs(11),
      flexShrink: 0,
    },
    rowAlt: { backgroundColor: isDark ? c.bg : '#FAFAF8' },
    td: { color: c.text, fontSize: rs(11.5), fontWeight: '600' },
    logo: {
      width: LOGO_SZ,
      height: LOGO_SZ,
      borderRadius: LOGO_SZ / 2,
      backgroundColor: isDark ? c.surfaceAlt : '#DCE8E6',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    logoImg: {
      width: LOGO_SZ,
      height: LOGO_SZ,
      borderRadius: LOGO_SZ / 2,
      backgroundColor: isDark ? c.surfaceAlt : '#DCE8E6',
      flexShrink: 0,
    },
    logoText: {
      color: HEADER_TEAL,
      fontWeight: '900',
      fontSize: rs(9),
    },
    symText: {
      flex: 1,
      minWidth: 0,
      color: c.text,
      fontWeight: '700',
      fontSize: rs(11),
    },
    brokerText: { fontWeight: '800', fontSize: rs(11), textAlign: 'center' },
    chgUp: { color: '#2E9E5B' },
    chgDown: { color: '#E5484D' },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: rs(40),
      fontSize: rs(13),
    },
    footerPad: { height: rs(24) },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(16),
      borderTopRightRadius: rs(16),
      padding: rs(16),
      paddingBottom: rs(28),
    },
    sheetTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginBottom: rs(8),
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: rs(14),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#E6EBE6',
    },
    sheetRowText: { color: c.text, fontWeight: '600', fontSize: rs(14) },
  });
}
