import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
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
  loadHighDemand,
  loadHighSupply,
  type DemandRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type Tab = 'demand' | 'supply';

export function HighDemandScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('demand');
  const [demand, setDemand] = useState<DemandRow[]>([]);
  const [supply, setSupply] = useState<DemandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [d, s] = await Promise.all([loadHighDemand(), loadHighSupply()]);
      setDemand(d);
      setSupply(s);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const rows = tab === 'demand' ? demand : supply;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>High Demand</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {(['demand', 'supply'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t === 'demand' ? 'Top Demand' : 'Top Supply'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colSym]}>SYM</Text>
        <Text style={[styles.th, styles.colNum]}>LTP</Text>
        <Text style={[styles.th, styles.colNum]}>QTY</Text>
        <Text style={[styles.th, styles.colNum]}>ORD</Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
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
          renderItem={({ item, index }) => (
            <View style={styles.row}>
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
                  <Text style={styles.rank}>#{index + 1}</Text>
                </View>
              </View>
              <Text style={[styles.td, styles.colNum]}>{fmtNum(item.ltp)}</Text>
              <Text style={[styles.td, styles.colNum]}>
                {item.quantity?.toLocaleString('en-IN') ?? '—'}
              </Text>
              <Text style={[styles.td, styles.colNum]}>
                {item.orders?.toLocaleString('en-IN') ?? '—'}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No {tab} data right now</Text>
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
    tabs: { paddingHorizontal: rs(12), paddingVertical: rs(10), gap: rs(8) },
    tab: {
      borderRadius: rs(14),
      paddingHorizontal: rs(14),
      paddingVertical: rs(7),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    tabActive: { backgroundColor: c.accentGreen, borderColor: c.accentGreen },
    tabText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(12) },
    tabTextActive: { color: '#0A0A0A' },
    tableHead: {
      flexDirection: 'row',
      backgroundColor: c.primary,
      paddingVertical: rs(8),
      paddingHorizontal: rs(8),
    },
    th: { color: '#FFF', fontSize: rs(10), fontWeight: '800' },
    colSym: { flex: 1.4 },
    colNum: { width: rs(68), textAlign: 'right' },
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
    rank: { color: c.textMuted, fontSize: rs(10) },
    td: { color: c.textSecondary, fontSize: rs(11), fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { color: c.textMuted, textAlign: 'center', paddingVertical: rs(30) },
    emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  });
}
