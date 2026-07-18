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
  loadProposedDividends,
  type DividendRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return 'N/A';
  if (n === 0) return '0.00';
  return n.toLocaleString('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function ProposedDividendScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<DividendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await loadProposedDividends(1, 200);
      setRows(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

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
        <Text style={styles.title}>Proposed Dividend</Text>
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

      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colSym]}>SYM</Text>
        <Text style={[styles.th, styles.colNum]}>BONUS %</Text>
        <Text style={[styles.th, styles.colNum]}>CASH %</Text>
        <Text style={[styles.th, styles.colNum]}>TOTAL</Text>
        <Text style={[styles.th, styles.colClose]}>BOOK CLOSE</Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.id}-${item.symbol}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={[styles.sym, styles.colSym]} numberOfLines={1}>
                {item.symbol}
              </Text>
              <Text style={[styles.td, styles.colNum]}>{pct(item.bonus)}</Text>
              <Text style={[styles.td, styles.colNum]}>{pct(item.cash)}</Text>
              <Text style={[styles.tdBold, styles.colNum]}>
                {pct(item.total)}
              </Text>
              <Text
                style={[
                  styles.colClose,
                  item.bookClose ? styles.bookDate : styles.bookNone,
                ]}
                numberOfLines={1}
              >
                {item.bookClose ?? 'Not Announced'}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No dividend data.</Text>
          }
        />
      )}
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
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#2196F3',
      paddingVertical: rs(9),
      paddingHorizontal: rs(10),
    },
    th: { color: '#FFF', fontSize: rs(10), fontWeight: '800' },
    colSym: { flex: 1.3 },
    colNum: { flex: 1, textAlign: 'right' },
    colClose: { flex: 1.5, textAlign: 'right' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(10),
      paddingHorizontal: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    sym: { color: c.text, fontSize: rs(12), fontWeight: '800' },
    td: { color: c.textSecondary, fontSize: rs(11), fontWeight: '600' },
    tdBold: { color: c.text, fontSize: rs(11), fontWeight: '800' },
    bookDate: { color: c.accentGreen, fontSize: rs(11), fontWeight: '700' },
    bookNone: { color: '#42A5F5', fontSize: rs(10), fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
    },
  });
}
