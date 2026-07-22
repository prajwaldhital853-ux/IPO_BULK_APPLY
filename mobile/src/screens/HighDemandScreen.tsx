import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { sessionStatus } from '../services/nepse/calendar';
import {
  fmtNum,
  loadHighDemandBoard,
  type DemandRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type Tab = 'demand' | 'supply';

function formatAsOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-NP', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HighDemandScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('demand');
  const [demand, setDemand] = useState<DemandRow[]>([]);
  const [supply, setSupply] = useState<DemandRow[]>([]);
  const [source, setSource] = useState<'live' | 'cached'>('live');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const marketOpen = sessionStatus() === 'open';

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const board = await loadHighDemandBoard();
      setDemand(board.demand);
      setSupply(board.supply);
      setSource(board.source);
      setSavedAt(board.savedAt);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while the market is open for live board updates.
  usePollingRefresh(refresh, undefined, marketOpen);

  const rows = tab === 'demand' ? demand : supply;

  const statusLabel = marketOpen
    ? source === 'live'
      ? 'Live demand'
      : 'Updating…'
    : source === 'cached'
      ? `Last session${savedAt ? ` · ${formatAsOf(savedAt)}` : ''}`
      : 'Market closed — no board data yet';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>High Demand</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.tabs}>
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
      </View>

      <View
        style={[
          styles.statusBar,
          marketOpen && source === 'live'
            ? styles.statusLive
            : styles.statusCached,
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                marketOpen && source === 'live' ? '#00C853' : colors.textMuted,
            },
          ]}
        />
        <Text style={styles.statusText} numberOfLines={1}>
          {statusLabel}
        </Text>
      </View>

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
            <Text style={styles.empty}>
              {marketOpen
                ? `No ${tab} data right now`
                : 'No saved board yet. Open this screen once while the market is open to keep last-session data.'}
            </Text>
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
    tabs: {
      flexDirection: 'row',
      marginHorizontal: rs(12),
      marginTop: rs(10),
      marginBottom: rs(6),
      gap: rs(8),
    },
    tab: {
      flex: 1,
      borderRadius: rs(10),
      paddingVertical: rs(8),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    tabActive: { backgroundColor: c.accentGreen, borderColor: c.accentGreen },
    tabText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(12) },
    tabTextActive: { color: '#0A0A0A' },
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginHorizontal: rs(12),
      marginBottom: rs(8),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(8),
    },
    statusLive: { backgroundColor: 'rgba(0,200,83,0.12)' },
    statusCached: { backgroundColor: c.surfaceAlt },
    statusDot: {
      width: rs(7),
      height: rs(7),
      borderRadius: rs(4),
    },
    statusText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: rs(11),
      fontWeight: '600',
    },
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
    symCell: {
      flex: 1.4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
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
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingHorizontal: rs(24),
      paddingVertical: rs(30),
      lineHeight: rs(18),
      fontSize: rs(13),
    },
    emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  });
}
