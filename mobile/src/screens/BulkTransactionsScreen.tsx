import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  fmtNum,
  loadFloorsheet,
  type FloorsheetRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

const PAGE_SIZE = 50;

/** e.g. "Thu 2:08:19 PM" — matches SS. */
function fmtTradeTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return `${day} ${time}`;
}

/** Indian / Nepali grouping: 14,52,000 */
function fmtAmountIn(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

function fmtQty(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('en-IN')} Units`;
}

export function BulkTransactionsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [rows, setRows] = useState<FloorsheetRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async (pageNum: number, mode: 'fresh' | 'more') => {
    if (mode === 'fresh') setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await loadFloorsheet(pageNum, PAGE_SIZE);
      setHasNext(res.hasNext);
      setPage(pageNum);
      setRows((prev) => (mode === 'fresh' ? res.rows : [...prev, ...res.rows]));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  const pollRefresh = useCallback(
    async (silent?: boolean) => {
      if (silent) {
        try {
          const res = await loadFloorsheet(1, PAGE_SIZE);
          setHasNext(res.hasNext);
          setPage(1);
          setRows(res.rows);
        } catch {
          /* keep last good data */
        }
        return;
      }
      await load(1, 'fresh');
    },
    [load],
  );

  useEffect(() => {
    void load(1, 'fresh');
  }, [load]);

  usePollingRefresh(pollRefresh);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.symbol.includes(q) ||
        r.name.toUpperCase().includes(q) ||
        String(r.buyerBroker).includes(q) ||
        String(r.sellerBroker).includes(q),
    );
  }, [rows, query]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Bulk Transactions</Text>
        <Pressable
          onPress={() => setFilterOpen((v) => !v)}
          hitSlop={12}
          accessibilityLabel="Filter transactions"
        >
          <Ionicons
            name={filterOpen ? 'close' : 'filter'}
            size={rs(22)}
            color={filterOpen ? colors.primary : colors.text}
          />
        </Pressable>
      </View>

      {filterOpen ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={rs(15)} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search symbol or broker…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="characters"
            autoFocus
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={rs(16)} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.contractId)}
          contentContainerStyle={styles.listBody}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(1, 'fresh');
              }}
              tintColor={colors.primary}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNext && !loadingMore && !query) void load(page + 1, 'more');
          }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.sym}>{item.symbol}</Text>
                <View style={styles.brokerTags}>
                  <View style={styles.tag}>
                    <View style={styles.buyNum}>
                      <Text style={styles.numText}>{item.buyerBroker}</Text>
                    </View>
                    <Text style={styles.tagLabel}>BUYER</Text>
                  </View>
                  <View style={styles.tag}>
                    <View style={styles.sellNum}>
                      <Text style={styles.numText}>{item.sellerBroker}</Text>
                    </View>
                    <Text style={styles.tagLabel}>SELLER</Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardBody}>
                <Row
                  label="Rate (Per Unit)"
                  value={`Rs. ${fmtNum(item.rate, 0)}`}
                  styles={styles}
                />
                <Row
                  label="Quantity"
                  value={fmtQty(item.quantity)}
                  styles={styles}
                />
                <Row
                  label="Total Amount"
                  value={`Rs. ${fmtAmountIn(item.amount)}`}
                  styles={styles}
                />
                <Row
                  label="Traded Time"
                  value={fmtTradeTime(item.tradeTime)}
                  styles={styles}
                  last
                />
              </View>
            </View>
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.primary}
                style={{ marginVertical: rs(16) }}
              />
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No transactions found.</Text>
          }
        />
      )}
    </View>
  );
}

function Row({
  label,
  value,
  styles,
  last,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  last?: boolean;
}) {
  return (
    <View style={[styles.dataRow, last && styles.dataRowLast]}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const brokerNum = {
    minWidth: rs(26),
    paddingHorizontal: rs(7),
    height: rs(22),
    borderRadius: rs(11),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? c.bg : '#F8FBF2' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: isDark ? c.bgElevated : '#F8FBF2',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: {
      color: c.text,
      fontSize: rs(17),
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
      marginTop: rs(10),
      marginBottom: rs(2),
      paddingHorizontal: rs(12),
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(9),
    },
    listBody: {
      paddingHorizontal: rs(12),
      paddingTop: rs(12),
      paddingBottom: rs(28),
    },
    card: {
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderRadius: rs(14),
      paddingHorizontal: rs(16),
      paddingTop: rs(14),
      paddingBottom: rs(8),
      marginBottom: rs(12),
      borderWidth: isDark ? 1 : 0,
      borderColor: c.borderMuted,
      // Soft lift like the SS cards
      shadowColor: '#000',
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: isDark ? 0 : 2,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sym: {
      color: c.text,
      fontSize: rs(16),
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    brokerTags: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
    },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
    },
    tagLabel: {
      color: c.textMuted,
      fontSize: rs(9),
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    buyNum: { ...brokerNum, backgroundColor: '#2E7D32' },
    sellNum: { ...brokerNum, backgroundColor: '#C62828' },
    numText: { color: '#FFF', fontSize: rs(11), fontWeight: '800' },
    cardBody: {
      paddingTop: rs(4),
    },
    dataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: rs(9),
    },
    dataRowLast: {},
    dataLabel: {
      color: c.textMuted,
      fontSize: rs(13),
      fontWeight: '500',
    },
    dataValue: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '700',
      textAlign: 'right',
      flexShrink: 1,
      marginLeft: rs(12),
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
      fontSize: rs(14),
    },
  });
}
