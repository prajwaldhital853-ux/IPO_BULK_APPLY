import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  fmtMcap,
  fmtNum,
  fmtRatio,
  type StockRankRow,
} from '../../services/nepse/screener';
import { rs } from '../../utils/responsive';
import type { RootStackParamList } from '../../navigation/types';

type Props = {
  title: string;
  rows: StockRankRow[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  showYield?: boolean;
};

export function StockRankList({
  title,
  rows,
  loading,
  refreshing,
  onRefresh,
  showYield = false,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable hitSlop={10}>
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={colors.textMuted}
          />
        </Pressable>
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colSym]}>SYM</Text>
        <Text style={[styles.th, styles.colNum]}>LTP</Text>
        <Text style={[styles.th, styles.colNum]}>
          {showYield ? 'YIELD' : 'PE'}
        </Text>
        <Text style={[styles.th, styles.colNum]}>PB</Text>
        <Text style={[styles.th, styles.colWide]}>MCAP</Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => `${item.symbol}-${item.rank}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                navigation.navigate('StockDetail', { symbol: item.symbol })
              }
            >
              <View style={styles.symCell}>
                {item.iconUrl ? (
                  <Image source={{ uri: item.iconUrl }} style={styles.logo} />
                ) : (
                  <View style={styles.logoFallback}>
                    <Text style={styles.logoLetter}>
                      {item.symbol.slice(0, 1)}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.sym}>{item.symbol}</Text>
                  <Text style={styles.rank}>#{item.rank}</Text>
                </View>
              </View>
              <Text style={[styles.td, styles.colNum]}>{fmtNum(item.ltp)}</Text>
              <Text style={[styles.td, styles.colNum]}>
                {showYield
                  ? item.yieldPct != null
                    ? `${fmtNum(item.yieldPct)}%`
                    : '—'
                  : fmtRatio(item.pe)}
              </Text>
              <Text style={[styles.td, styles.colNum]}>{fmtRatio(item.pb)}</Text>
              <Text style={[styles.td, styles.colWide]}>{fmtMcap(item.mcap)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No stocks to show</Text>
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
      alignItems: 'center',
      backgroundColor: c.primary,
      paddingVertical: rs(8),
      paddingHorizontal: rs(8),
    },
    th: {
      color: '#FFFFFF',
      fontSize: rs(10),
      fontWeight: '800',
    },
    colSym: { flex: 1.4 },
    colNum: { width: rs(54), textAlign: 'right' },
    colWide: { width: rs(72), textAlign: 'right' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(8),
      paddingHorizontal: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    symCell: { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: rs(8) },
    logo: { width: rs(28), height: rs(28), borderRadius: rs(14) },
    logoFallback: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(12) },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(12) },
    rank: { color: c.textMuted, fontSize: rs(10), marginTop: rs(1) },
    td: { color: c.textSecondary, fontSize: rs(11), fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(30),
      fontSize: rs(13),
    },
    emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  });
}
