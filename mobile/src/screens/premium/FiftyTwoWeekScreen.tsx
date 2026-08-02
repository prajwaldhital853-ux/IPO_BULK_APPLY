import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
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
  fmtNum,
  loadFiftyTwoWeekRows,
  type FiftyTwoWeekRow,
} from '../../services/nepse/brokerAnalytics';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import type { RootStackParamList } from '../../navigation/types';

export type FiftyTwoWeekMode = 'high' | 'low';

const HEADER_TEAL = '#1A5F5A';
const ROW_H = rs(42);

export function FiftyTwoWeekHighScreen() {
  return <FiftyTwoWeekScreen mode="high" />;
}

export function FiftyTwoWeekLowScreen() {
  return <FiftyTwoWeekScreen mode="low" />;
}

function priceDiff(
  mode: FiftyTwoWeekMode,
  item: FiftyTwoWeekRow,
): number | null {
  if (item.ltp == null) return null;
  if (mode === 'low') {
    if (item.low52 == null) return null;
    return item.ltp - item.low52;
  }
  if (item.high52 == null) return null;
  return item.high52 - item.ltp;
}

function FiftyTwoWeekScreen({ mode }: { mode: FiftyTwoWeekMode }) {
  const title = mode === 'high' ? '52 Week High' : '52 Week Low';
  const rangeLabel = mode === 'high' ? '52W High' : '52W Low';
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [rows, setRows] = useState<FiftyTwoWeekRow[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await loadFiftyTwoWeekRows(mode, 120);
        setRows(res.rows);
        setAsOf(res.asOf);
        setSourceNote(res.sourceNote);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [mode],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) void refresh();
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [refresh]),
  );

  const showInfo = () => {
    const lines = [
      sourceNote,
      asOf ? `Live LTP · ${asOf}` : null,
      mode === 'high'
        ? 'Diff = 52W High − LTP'
        : 'Diff = LTP − 52W Low',
    ].filter(Boolean);
    Alert.alert(title, lines.join('\n\n'));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const body =
    loading && rows.length === 0 ? (
      <View style={styles.center}>
        <ActivityIndicator color={HEADER_TEAL} />
        <Text style={styles.loadingHint}>Loading {title}…</Text>
      </View>
    ) : (
      <View style={styles.body}>
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={rs(15)} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search symbol / company…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="characters"
              clearButtonMode="while-editing"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={rs(16)}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Sticky column header — does not scroll with rows */}
        <View style={styles.tableHead}>
          <Text style={[styles.headCell, styles.colSym]}>SYM</Text>
          <Text style={[styles.headCell, styles.colLtp]}>LTP</Text>
          <Text style={[styles.headCell, styles.colRange]}>{rangeLabel}</Text>
          <Text style={[styles.headCell, styles.colDiff]}>Diff</Text>
        </View>

        <FlatList
          data={filtered}
          style={styles.list}
          keyExtractor={(item) => item.symbol}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true);
              }}
              tintColor={HEADER_TEAL}
            />
          }
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          updateCellsBatchingPeriod={40}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim()
                ? 'No matching symbols.'
                : 'No 52-week data available yet.'}
            </Text>
          }
          renderItem={({ item, index }) => {
            const range = mode === 'high' ? item.high52 : item.low52;
            const diff = priceDiff(mode, item);
            return (
              <Pressable
                style={[styles.row, index % 2 === 1 && styles.rowAlt]}
                onPress={() =>
                  navigation.navigate('StockDetail', { symbol: item.symbol })
                }
              >
                <Text
                  style={[styles.cell, styles.colSym, styles.symText]}
                  numberOfLines={1}
                >
                  {item.symbol}
                </Text>
                <Text style={[styles.cell, styles.colLtp]} numberOfLines={1}>
                  {item.ltp != null ? fmtNum(item.ltp) : '—'}
                </Text>
                <Text style={[styles.cell, styles.colRange]} numberOfLines={1}>
                  {range != null ? fmtNum(range) : '—'}
                </Text>
                <Text style={[styles.cell, styles.colDiff]} numberOfLines={1}>
                  {diff != null ? fmtNum(diff) : '—'}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={showInfo} hitSlop={12}>
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
      <PremiumGate
        title={title}
        subtitle={
          mode === 'high'
            ? 'Stocks nearest their 52-week high from live mini-screener prices.'
            : 'Stocks nearest their 52-week low from live mini-screener prices.'
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
      paddingVertical: rs(12),
      backgroundColor: c.bg,
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    body: { flex: 1 },
    searchWrap: {
      paddingHorizontal: rs(14),
      paddingBottom: rs(8),
      backgroundColor: c.bg,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingHorizontal: rs(12),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(10),
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(12),
    },
    loadingHint: { color: c.textMuted, fontSize: rs(12) },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_H,
      backgroundColor: HEADER_TEAL,
      paddingHorizontal: rs(14),
    },
    headCell: { color: '#FFF', fontWeight: '800', fontSize: rs(12) },
    list: { flex: 1, backgroundColor: c.bg },
    listContent: { paddingBottom: rs(28) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_H,
      paddingHorizontal: rs(14),
      backgroundColor: c.surface,
    },
    rowAlt: { backgroundColor: isDark ? c.bg : '#F0F4F5' },
    cell: { color: c.text, fontSize: rs(13), fontWeight: '600' },
    symText: { fontWeight: '700' },
    colSym: { flex: 1.15 },
    colLtp: { flex: 1.15, textAlign: 'right' },
    colRange: { flex: 1.2, textAlign: 'right' },
    colDiff: { flex: 1.1, textAlign: 'right' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      paddingHorizontal: rs(20),
      fontSize: rs(13),
    },
  });
}
