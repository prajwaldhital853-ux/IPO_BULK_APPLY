import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  invalidateBrokerAnalyticsCache,
  loadNetSideForQuery,
  peekNetSideBoard,
  streamNetSideBoard,
  type NetSideMode,
  type NetSideTradeRow,
} from '../../services/nepse/brokerAnalytics';
import { fmtMcap, fmtNum } from '../../services/nepse/screener';
import { invalidateMarketCaches } from '../../services/nepse/invalidateMarketCaches';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import type { RootStackParamList } from '../../navigation/types';

type Period = '1d' | '2d' | '3d' | '7d' | '1m';
type SortKey = 'qty' | 'amount';
type SortDir = 'desc' | 'asc';

const PERIODS: Array<{ id: Period; label: string; short: string }> = [
  { id: '1d', label: '1 Day', short: '1D' },
  { id: '2d', label: '2 Days', short: '2D' },
  { id: '3d', label: '3 Days', short: '3D' },
  { id: '7d', label: '1 Week', short: '1W' },
  { id: '1m', label: '1 Month', short: '1M' },
];

type Props = { mode: NetSideMode };

export function TopHoldersScreen() {
  return <TopHoldReleaseTableScreen mode="holders" />;
}

export function TopReleasesScreen() {
  return <TopHoldReleaseTableScreen mode="releases" />;
}

function TopHoldReleaseTableScreen({ mode }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const isHolders = mode === 'holders';
  const title = isHolders ? 'Top Holders' : 'Top Release';
  const partyPlaceholder = isHolders ? 'Buyer' : 'Seller';
  const showBroker = !isHolders;

  const [rows, setRows] = useState<NetSideTradeRow[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('1d');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [symbolQ, setSymbolQ] = useState('');
  const [partyQ, setPartyQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('qty');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [priorityFetching, setPriorityFetching] = useState(false);
  const priorityGen = useRef(0);
  const hasRowsRef = useRef(false);

  const refresh = useCallback(
    async (force = false) => {
      if (force) {
        invalidateMarketCaches();
        invalidateBrokerAnalyticsCache();
        setVisibleCount(0);
        setRows([]);
        hasRowsRef.current = false;
      }
      setLoadingMore(true);
      try {
        await streamNetSideBoard(mode, (board, meta) => {
          setLoadingMore(meta.partial);
          if (!meta.partial) {
            setRows(board.rows);
            setVisibleCount(0);
            setLoading(false);
            hasRowsRef.current = board.rows.length > 0;
          } else if (board.rows.length) {
            setRows(board.rows);
            setLoading(false);
            hasRowsRef.current = true;
          }
        });
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [mode],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Shell-first: never paint warm sticky rows mid stack push.
      if (!hasRowsRef.current) {
        setLoading(true);
        setVisibleCount(0);
      }
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        const peek = peekNetSideBoard(mode);
        if (peek?.rows.length) {
          setRows(peek.rows);
          setVisibleCount(Math.min(24, peek.rows.length));
          setLoading(false);
          hasRowsRef.current = true;
        }
        void refresh(false);
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [refresh, mode]),
  );

  useEffect(() => {
    if (rows.length === 0) {
      setVisibleCount(0);
      return;
    }
    if (visibleCount >= rows.length) {
      if (visibleCount !== rows.length) setVisibleCount(rows.length);
      return;
    }
    const step = visibleCount === 0 ? 12 : 8;
    const id = setTimeout(() => {
      setVisibleCount((n) => Math.min(n + step, rows.length));
    }, visibleCount === 0 ? 40 : 60);
    return () => clearTimeout(id);
  }, [rows, visibleCount]);

  useEffect(() => {
    const sym = symbolQ.trim();
    const party = partyQ.trim();
    if (sym.length < 1 && party.length < 1) {
      setPriorityFetching(false);
      return;
    }
    const gen = ++priorityGen.current;
    const timer = setTimeout(() => {
      void (async () => {
        setPriorityFetching(true);
        try {
          const hits = await loadNetSideForQuery(mode, {
            symbol: sym || undefined,
            broker: party || undefined,
          });
          if (gen !== priorityGen.current) return;
          if (!hits.length) return;
          setRows((prev) => {
            const have = new Set(prev.map((p) => p.id));
            const fresh = hits.filter((h) => !have.has(h.id));
            if (!fresh.length) return prev;
            return [...fresh, ...prev];
          });
          setVisibleCount((n) => Math.max(n, Math.min(20, hits.length)));
          setLoading(false);
        } finally {
          if (gen === priorityGen.current) setPriorityFetching(false);
        }
      })();
    }, 400);
    return () => clearTimeout(timer);
  }, [symbolQ, partyQ, mode]);

  const periodMeta = PERIODS.find((p) => p.id === period) ?? PERIODS[0];
  const partyActive = partyQ.trim().length > 0;
  const showBrokerCol = showBroker || partyActive;

  const filtered = useMemo(() => {
    const sq = symbolQ.trim().toUpperCase();
    const pq = partyQ.trim().toLowerCase();
    const digits = pq.replace(/\D/g, '');
    const searching = sq.length > 0 || pq.length > 0;
    const pool = searching ? rows : rows.slice(0, visibleCount);

    let list = pool;
    if (sq) list = list.filter((r) => r.symbol.includes(sq));
    if (pq) {
      list = list.filter((r) => {
        if (!r.brokerCode) return true;
        if (digits) return r.brokerCode.includes(digits);
        return r.brokerCode.toLowerCase().includes(pq);
      });
    }

    const mul = sortDir === 'desc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'amount') return mul * (b.amount - a.amount);
      return mul * (b.qty - a.qty);
    });
  }, [rows, symbolQ, partyQ, visibleCount, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const clearFilters = () => {
    setSymbolQ('');
    setPartyQ('');
  };

  const body = (
    <View style={styles.body}>
      {/* Fixed filters — only the data table scrolls below. */}
      <View style={styles.filters}>
        <View style={styles.periodRow}>
          <Pressable
            style={styles.periodBtn}
            onPress={() => setPeriodOpen(true)}
          >
            <Ionicons name="time-outline" size={rs(16)} color={colors.text} />
            <Text style={styles.periodText}>{periodMeta.short}</Text>
            <Ionicons
              name="chevron-down"
              size={rs(14)}
              color={colors.textMuted}
            />
          </Pressable>
          {symbolQ || partyQ ? (
            <Pressable onPress={clearFilters} hitSlop={10} style={styles.clearBtn}>
              <Ionicons name="close" size={rs(18)} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={rs(14)} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Symbol"
              placeholderTextColor={colors.textMuted}
              value={symbolQ}
              onChangeText={setSymbolQ}
              autoCorrect={false}
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={rs(14)} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={partyPlaceholder}
              placeholderTextColor={colors.textMuted}
              value={partyQ}
              onChangeText={setPartyQ}
              autoCorrect={false}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {priorityFetching || loadingMore ? (
          <View style={styles.loadingMoreRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingHint}>
              {priorityFetching ? 'Searching…' : 'Loading floorsheet…'}
            </Text>
          </View>
        ) : null}

        <View style={styles.tableHead}>
          <Text style={[styles.headCell, styles.colSym]}>SYM</Text>
          {showBrokerCol ? (
            <Text style={[styles.headCell, styles.colBroker]}>Broker</Text>
          ) : null}
          <Pressable
            style={[styles.headCell, styles.colQty, styles.headPress]}
            onPress={() => toggleSort('qty')}
          >
            <Text style={styles.headCellText}>Qty</Text>
            <Ionicons name="swap-vertical" size={rs(12)} color="#FFF" />
          </Pressable>
          <Pressable
            style={[styles.headCell, styles.colAmt, styles.headPress]}
            onPress={() => toggleSort('amount')}
          >
            <Text style={styles.headCellText}>Amount</Text>
            <Ionicons name="swap-vertical" size={rs(12)} color="#FFF" />
          </Pressable>
          {!showBrokerCol ? (
            <Text style={[styles.headCell, styles.colLtp, { textAlign: 'right' }]}>
              LTP
            </Text>
          ) : null}
        </View>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingHint}>Loading {title.toLowerCase()}…</Text>
        </View>
      ) : (
        <FlatList
          style={styles.dataList}
          data={filtered}
          keyExtractor={(item) => item.id}
          initialNumToRender={16}
          maxToRenderPerBatch={12}
          windowSize={7}
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
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No {isHolders ? 'holder' : 'release'} rows yet. Pull to refresh after
              market open.
            </Text>
          }
          renderItem={({ item, index }) => (
            <Pressable
              style={[styles.row, index % 2 === 1 && styles.rowAlt]}
              onPress={() =>
                navigation.navigate('StockDetail', { symbol: item.symbol })
              }
            >
              <Text style={[styles.cell, styles.colSym, styles.symText]}>
                {item.symbol}
              </Text>
              {showBrokerCol ? (
                <Text style={[styles.cell, styles.colBroker]}>
                  {item.brokerCode || '—'}
                </Text>
              ) : null}
              <Text style={[styles.cell, styles.colQty]}>{fmtMcap(item.qty)}</Text>
              <Text style={[styles.cell, styles.colAmt]}>
                {fmtMcap(item.amount)}
              </Text>
              {!showBrokerCol ? (
                <Text style={[styles.cell, styles.colLtp]}>
                  {item.ltp != null
                    ? fmtNum(item.ltp)
                    : item.avgRate != null
                      ? fmtNum(item.avgRate)
                      : '—'}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <PremiumGate
        title={title}
        subtitle={
          isHolders
            ? 'Net buyers on the session floorsheet — buy qty minus sell qty.'
            : 'Net sellers releasing on the session floorsheet — sell qty minus buy qty.'
        }
      >
        {body}
      </PremiumGate>

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
          <View style={styles.periodMenu}>
            {PERIODS.map((p) => (
              <Pressable
                key={p.id}
                style={styles.periodItem}
                onPress={() => {
                  setPeriod(p.id);
                  setPeriodOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.periodItemText,
                    period === p.id && styles.periodItemActive,
                  ]}
                >
                  {p.label}
                </Text>
                {period === p.id ? (
                  <Ionicons
                    name="checkmark"
                    size={rs(18)}
                    color={colors.accentGreen}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const headBg = isDark ? '#1A1C1A' : '#1C2529';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: c.bg,
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    body: { flex: 1 },
    filters: { flexGrow: 0 },
    dataList: { flex: 1 },
    list: { paddingBottom: rs(28) },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(12),
    },
    loadingHint: { color: c.textMuted, fontSize: rs(12) },
    loadingMoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingHorizontal: rs(14),
      marginBottom: rs(8),
    },
    periodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: rs(14),
      marginBottom: rs(10),
      gap: rs(8),
    },
    periodBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingHorizontal: rs(14),
      paddingVertical: rs(11),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    periodText: { flex: 1, color: c.text, fontWeight: '700', fontSize: rs(14) },
    clearBtn: {
      width: rs(36),
      height: rs(36),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: rs(18),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchRow: {
      flexDirection: 'row',
      gap: rs(8),
      marginHorizontal: rs(14),
      marginBottom: rs(10),
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(10),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(9),
    },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: headBg,
      paddingVertical: rs(10),
      paddingHorizontal: rs(12),
    },
    headCell: { color: '#FFF', fontWeight: '800', fontSize: rs(12) },
    headCellText: { color: '#FFF', fontWeight: '800', fontSize: rs(12) },
    headPress: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: rs(2),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(11),
      paddingHorizontal: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      backgroundColor: c.bg,
    },
    rowAlt: { backgroundColor: isDark ? c.surfaceAlt : '#F7F8F9' },
    cell: { color: c.text, fontSize: rs(13) },
    symText: { fontWeight: '700' },
    colSym: { flex: 1.05 },
    colBroker: { flex: 0.85, textAlign: 'center' },
    colQty: { flex: 1.15, textAlign: 'right' },
    colAmt: { flex: 1.15, textAlign: 'right' },
    colLtp: { flex: 0.95, textAlign: 'right' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      paddingHorizontal: rs(20),
      fontSize: rs(13),
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      paddingHorizontal: rs(40),
    },
    periodMenu: {
      backgroundColor: c.bgElevated,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    periodItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(14),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    periodItemText: { color: c.text, fontSize: rs(14), fontWeight: '600' },
    periodItemActive: { color: c.accentGreen, fontWeight: '800' },
  });
}
