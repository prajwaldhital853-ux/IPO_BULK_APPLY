import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
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
  loadNepseIndexHistory,
  type IndexHistoryRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

export function NepseHistoryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<IndexHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await loadNepseIndexHistory();
      setRows(data);
      if (!data.length) {
        setError('History unavailable right now. Pull to retry.');
      }
    } catch {
      setError('Failed to load NEPSE history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Nepse History</Text>
        <Pressable hitSlop={10}>
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={colors.textMuted}
          />
        </Pressable>
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colDate]}>Date</Text>
        <Text style={[styles.th, styles.colNum]}>Open</Text>
        <Text style={[styles.th, styles.colNum]}>High</Text>
        <Text style={[styles.th, styles.colNum]}>Low</Text>
        <Text style={[styles.th, styles.colNum]}>Close</Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.date}
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
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={[styles.tdDate, styles.colDate]}>{item.date}</Text>
              <Text style={[styles.td, styles.colNum]}>{fmtNum(item.open)}</Text>
              <Text style={[styles.td, styles.colNum]}>{fmtNum(item.high)}</Text>
              <Text style={[styles.td, styles.colNum]}>{fmtNum(item.low)}</Text>
              <Text style={[styles.td, styles.colNum]}>{fmtNum(item.close)}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>{error ?? 'No history data'}</Text>
          }
          contentContainerStyle={rows.length ? undefined : styles.emptyWrap}
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
    tableHead: {
      flexDirection: 'row',
      backgroundColor: c.primary,
      paddingVertical: rs(8),
      paddingHorizontal: rs(8),
    },
    th: { color: '#FFF', fontSize: rs(10), fontWeight: '800' },
    colDate: { flex: 1.1 },
    colNum: { width: rs(62), textAlign: 'right' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(8),
      paddingHorizontal: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    tdDate: { color: c.text, fontSize: rs(11), fontWeight: '700' },
    td: { color: c.textSecondary, fontSize: rs(11), fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(30),
      paddingHorizontal: rs(20),
    },
    emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  });
}
