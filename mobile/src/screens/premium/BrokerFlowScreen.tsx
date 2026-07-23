import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
  invalidateBrokerAnalyticsCache,
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

function brokerNumber(code: string | null | undefined): string {
  if (!code) return '—';
  const m = String(code).match(/\d+/);
  return m ? m[0] : code;
}

/** Real directory name only — never invent brokers. */
function shortBrokerName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const cleaned = name
    .trim()
    .replace(
      /\s*(Pvt\.?|Private|Ltd\.?|Limited|Company|Co\.?)\.?$/gi,
      '',
    )
    .replace(/\s+Securities.*$/i, '')
    .trim();
  const first = cleaned.split(/\s+/)[0] ?? cleaned;
  return first.slice(0, 10) || null;
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

export function BrokerFlowScreen({ mode }: { mode: Mode }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const isAcc = mode === 'accumulation';
  const title = isAcc ? 'Broker Accumulation' : 'Broker Distribution';
  const amtLabel = isAcc ? 'Acc Amt' : 'Dis Amt';
  const qtyLabel = isAcc ? 'Acc Qty' : 'Dis Qty';
  const pctLabel = isAcc ? 'Acc %' : 'Dis %';
  const sortAccent = isAcc ? '#2E9E5B' : '#E5484D';

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
  const [period, setPeriod] = useState<Period>('1d');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('amount');
  const [sortDesc, setSortDesc] = useState(true);
  const genRef = useRef(0);
  const busyRef = useRef(false);
  const revealDoneRef = useRef(false);
  const hasRowsRef = useRef(false);

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
        setLoadingMore(true);
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
            setLoadingMore(meta.partial);
            // Show all ranked rows immediately (no one-by-one drip).
            setDisplayCount(snap.rows.length);
            if (!meta.partial) revealDoneRef.current = true;
          },
          120,
        );
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

  // Open: use warm cache when available; pull-to-refresh / header refresh forces live.
  useFocusEffect(
    useCallback(() => {
      void refresh({ silent: false, force: false });
    }, [refresh]),
  );

  // Background poll every 60s while focused (silent, no list reset).
  usePollingRefresh((silent) => refresh({ silent: !!silent }), 60_000);

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

      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colSym]}>SYM</Text>
        <Text style={[styles.th, styles.colBroker]}>Broker</Text>
        <Pressable
          style={[styles.thPress, styles.colAmt]}
          onPress={() => toggleSort('amount')}
        >
          <Text style={styles.th}>{amtLabel}</Text>
          <SortCaret active={sortKey === 'amount'} />
        </Pressable>
        <Pressable
          style={[styles.thPress, styles.colQty]}
          onPress={() => toggleSort('qty')}
        >
          <Text style={styles.th}>{qtyLabel}</Text>
          <SortCaret active={sortKey === 'qty'} />
        </Pressable>
        <Pressable
          style={[styles.thPress, styles.colPct]}
          onPress={() => toggleSort('pct')}
        >
          <Text style={styles.th}>{pctLabel}</Text>
          <SortCaret active={sortKey === 'pct'} />
        </Pressable>
      </View>

      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={HEADER_TEAL} />
      ) : (
        <FlatList
          data={visible}
          initialNumToRender={30}
          maxToRenderPerBatch={40}
          windowSize={8}
          removeClippedSubviews
          keyExtractor={(item) =>
            `${item.symbol}-${item.brokerCode ?? 'x'}-${item.rank}`
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh({ silent: true, force: true }).finally(() =>
                  setRefreshing(false),
                );
              }}
              tintColor={HEADER_TEAL}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No broker rows for this session.</Text>
          }
          ListFooterComponent={
            searchingBroker || loadingMore ? (
              <View style={styles.footerLoad}>
                <ActivityIndicator size="small" color={HEADER_TEAL} />
                <Text style={styles.footerText}>
                  {searchingBroker
                    ? `Loading broker ${query.trim()}…`
                    : 'Updating rankings…'}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <Pressable
              style={[styles.tr, index % 2 === 1 && styles.trAlt]}
              onPress={() =>
                navigation.navigate('StockDetail', { symbol: item.symbol })
              }
            >
              <View style={[styles.colSym, styles.symCell]}>
                <SymLogo
                  symbol={item.symbol}
                  iconUrl={item.iconUrl}
                  styles={styles}
                />
                <Text style={styles.symText} numberOfLines={1}>
                  {item.symbol}
                </Text>
              </View>
              <View style={[styles.colBroker, styles.brokerCell]}>
                <Text style={[styles.td, styles.brokerText]} numberOfLines={1}>
                  {brokerNumber(item.brokerCode)}
                </Text>
                {shortBrokerName(item.brokerName) ? (
                  <Text style={styles.brokerName} numberOfLines={1}>
                    {shortBrokerName(item.brokerName)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.td, styles.colAmt]} numberOfLines={1}>
                {fmtAmt(item.amount)}
              </Text>
              <Text style={[styles.td, styles.colQty]} numberOfLines={1}>
                {fmtQty(item.quantity)}
              </Text>
              <Text style={[styles.td, styles.colPct]} numberOfLines={1}>
                {item.sharePct != null
                  ? Number.isInteger(item.sharePct)
                    ? String(item.sharePct)
                    : item.sharePct.toFixed(1)
                  : '—'}
              </Text>
            </Pressable>
          )}
        />
      )}

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
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: HEADER_TEAL,
      paddingHorizontal: rs(8),
      paddingVertical: rs(10),
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
    },
    colSym: { width: '24%', paddingRight: rs(4) },
    colBroker: { width: '16%' },
    colAmt: { width: '22%' },
    colQty: { width: '22%' },
    colPct: { width: '16%' },
    tr: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(11),
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    trAlt: { backgroundColor: c.bg },
    td: { color: c.text, fontSize: rs(11.5), fontWeight: '600' },
    symCell: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    brokerCell: { justifyContent: 'center', paddingRight: rs(2) },
    logo: {
      width: rs(26),
      height: rs(26),
      borderRadius: rs(6),
      backgroundColor: '#DCE8E6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoImg: {
      width: rs(26),
      height: rs(26),
      borderRadius: rs(6),
      backgroundColor: '#DCE8E6',
    },
    logoText: {
      color: HEADER_TEAL,
      fontWeight: '900',
      fontSize: rs(10),
    },
    symText: {
      flex: 1,
      color: c.text,
      fontWeight: '700',
      fontSize: rs(11.5),
    },
    brokerText: { fontWeight: '800', fontSize: rs(11) },
    brokerName: {
      color: c.textMuted,
      fontSize: rs(8),
      fontWeight: '600',
      marginTop: rs(1),
    },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: rs(40),
      fontSize: rs(13),
    },
    footerLoad: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(14),
    },
    footerText: { color: c.textMuted, fontSize: rs(12), fontWeight: '600' },
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
