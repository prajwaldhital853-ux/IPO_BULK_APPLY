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
  fmtMcap,
  fmtNum,
  loadFloorsheet,
  type FloorsheetRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

const PAGE_SIZE = 50;

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function BulkTransactionsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<FloorsheetRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

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

  const pollRefresh = useCallback(async (silent?: boolean) => {
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
  }, [load]);

  useEffect(() => {
    void load(1, 'fresh');
  }, [load]);

  usePollingRefresh(pollRefresh);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q),
    );
  }, [rows, query]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Bulk Transactions</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={rs(15)} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search symbol…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="characters"
        />
      </View>

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
                  <View style={[styles.tag, styles.buyTag]}>
                    <Text style={styles.tagLabel}>BUYER </Text>
                    <View style={styles.buyNum}>
                      <Text style={styles.numText}>{item.buyerBroker}</Text>
                    </View>
                  </View>
                  <View style={[styles.tag, styles.sellTag]}>
                    <Text style={styles.tagLabel}>SELLER </Text>
                    <View style={styles.sellNum}>
                      <Text style={styles.numText}>{item.sellerBroker}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <Row label="Rate (Per Unit)" value={`Rs. ${fmtNum(item.rate, 0)}`} styles={styles} />
              <Row
                label="Quantity"
                value={`${item.quantity != null ? item.quantity.toLocaleString('en-NP') : '—'} Units`}
                styles={styles}
              />
              <Row label="Total Amount" value={`Rs. ${fmtMcap(item.amount)}`} styles={styles} />
              <Row label="Traded Time" value={fmtTime(item.tradeTime)} styles={styles} last />
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

function makeStyles(c: ThemeColors) {
  const brokerNum = {
    minWidth: rs(24),
    paddingHorizontal: rs(6),
    height: rs(18),
    borderRadius: rs(9),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
      marginVertical: rs(10),
      paddingHorizontal: rs(12),
      backgroundColor: c.surface,
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
    listBody: { paddingHorizontal: rs(12), paddingBottom: rs(24) },
    card: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
      marginBottom: rs(10),
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: rs(8),
      marginBottom: rs(4),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sym: { color: c.text, fontSize: rs(15), fontWeight: '800' },
    brokerTags: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
    tag: { flexDirection: 'row', alignItems: 'center' },
    buyTag: {},
    sellTag: {},
    tagLabel: { color: c.textMuted, fontSize: rs(9), fontWeight: '700' },
    buyNum: { ...brokerNum, backgroundColor: '#2E7D32' },
    sellNum: { ...brokerNum, backgroundColor: '#C62828' },
    numText: { color: '#FFF', fontSize: rs(10), fontWeight: '800' },
    dataRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: rs(6),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    dataRowLast: { borderBottomWidth: 0 },
    dataLabel: { color: c.textMuted, fontSize: rs(12) },
    dataValue: { color: c.text, fontSize: rs(12), fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
    },
  });
}
