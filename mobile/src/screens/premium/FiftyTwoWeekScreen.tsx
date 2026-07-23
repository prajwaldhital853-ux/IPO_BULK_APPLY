import React, { useCallback, useMemo, useState } from 'react';
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
import type { RootStackParamList } from '../../navigation/types';

export type FiftyTwoWeekMode = 'high' | 'low';

export function FiftyTwoWeekHighScreen() {
  return <FiftyTwoWeekScreen mode="high" />;
}

export function FiftyTwoWeekLowScreen() {
  return <FiftyTwoWeekScreen mode="low" />;
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
      void refresh();
    }, [refresh]),
  );

  const body = loading && rows.length === 0 ? (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingHint}>Loading {title}…</Text>
    </View>
  ) : (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.symbol}
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
      ListHeaderComponent={
        <View>
          {asOf ? (
            <Text style={styles.asOf}>Live LTP · {asOf}</Text>
          ) : null}
          {sourceNote ? (
            <Text style={styles.note}>{sourceNote}</Text>
          ) : null}
          <View style={styles.tableHead}>
            <Text style={[styles.headCell, styles.colSym]}>SYM</Text>
            <Text style={[styles.headCell, styles.colLtp]}>LTP</Text>
            <Text style={[styles.headCell, styles.colRange]}>{rangeLabel}</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No 52-week data available yet.</Text>
      }
      renderItem={({ item, index }) => {
        const range = mode === 'high' ? item.high52 : item.low52;
        return (
          <Pressable
            style={[styles.row, index % 2 === 1 && styles.rowAlt]}
            onPress={() =>
              navigation.navigate('StockDetail', { symbol: item.symbol })
            }
          >
            <Text style={[styles.cell, styles.colSym, styles.symText]}>
              {item.symbol}
            </Text>
            <Text style={[styles.cell, styles.colLtp]}>
              {item.ltp != null ? fmtNum(item.ltp) : '—'}
            </Text>
            <Text style={[styles.cell, styles.colRange]}>
              {range != null ? fmtNum(range) : '—'}
            </Text>
          </Pressable>
        );
      }}
    />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: rs(22) }} />
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
    title: { color: c.text, fontWeight: '700', fontSize: rs(17) },
    list: { paddingBottom: rs(28) },
    asOf: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '700',
      paddingHorizontal: rs(14),
      marginBottom: rs(4),
    },
    note: {
      color: c.textMuted,
      fontSize: rs(11),
      lineHeight: rs(15),
      paddingHorizontal: rs(14),
      marginBottom: rs(10),
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
      backgroundColor: headBg,
      paddingVertical: rs(11),
      paddingHorizontal: rs(14),
      borderTopLeftRadius: rs(4),
      borderTopRightRadius: rs(4),
      marginHorizontal: rs(0),
    },
    headCell: { color: '#FFF', fontWeight: '800', fontSize: rs(12) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(12),
      paddingHorizontal: rs(14),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      backgroundColor: c.bg,
    },
    rowAlt: { backgroundColor: isDark ? c.surfaceAlt : '#F5F6F7' },
    cell: { color: c.text, fontSize: rs(13) },
    symText: { fontWeight: '700' },
    colSym: { flex: 1.2 },
    colLtp: { flex: 1.1, textAlign: 'right' },
    colRange: { flex: 1.2, textAlign: 'right' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      paddingHorizontal: rs(20),
      fontSize: rs(13),
    },
  });
}
