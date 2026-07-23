import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { PriorSessionBanner } from '../../components/PriorSessionBanner';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  loadBrokerDirectory,
  loadBrokerFavoriteBuys,
  loadPremiumIntel,
  priorSessionReason,
  type BrokerInfo,
  type PremiumIntelRow,
} from '../../services/nepse/brokerAnalytics';
import { iconUri } from '../../services/nepse/screener';
import { nepalTodayIso } from '../../services/nepse/holidays';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import type { RootStackParamList } from '../../navigation/types';

type SearchMode = 'symbol' | 'name' | 'broker';

const MODES: Array<{ id: SearchMode; label: string }> = [
  { id: 'symbol', label: 'Symbol' },
  { id: 'name', label: 'Name' },
  { id: 'broker', label: 'Broker # / name' },
];

function SymLogo({
  symbol,
  iconUrl,
  styles,
}: {
  symbol: string;
  iconUrl: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);
  const uri = iconUri(iconUrl) ?? iconUrl ?? null;
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.logo}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.logoFallback}>
      <Text style={styles.logoLetter}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

export function BrokerFavoritesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [rows, setRows] = useState<PremiumIntelRow[]>([]);
  const [brokers, setBrokers] = useState<BrokerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<SearchMode>('symbol');
  const [query, setQuery] = useState('');
  const [brokerFetching, setBrokerFetching] = useState(false);
  const [brokerRows, setBrokerRows] = useState<PremiumIntelRow[] | null>(null);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [priorReason, setPriorReason] = useState<string | null>(null);
  const [pickedBroker, setPickedBroker] = useState<BrokerInfo | null>(null);

  const refresh = useCallback(async () => {
    const [snap, dir] = await Promise.all([
      loadPremiumIntel('broker-favorites'),
      loadBrokerDirectory(),
    ]);
    setRows(snap.rows);
    setBrokers(dir);
    setSessionDate(snap.sessionDate ?? nepalTodayIso());
    setPriorReason(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void refresh().finally(() => setLoading(false));
    }, [refresh]),
  );

  useEffect(() => {
    if (mode !== 'broker') {
      setBrokerRows(null);
      setPickedBroker(null);
      setPriorReason(null);
      return;
    }
    const q = query.trim();
    if (q.length < 1) {
      setBrokerRows(null);
      setPickedBroker(null);
      setPriorReason(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setBrokerFetching(true);
        try {
          const hit = await loadBrokerFavoriteBuys(q, 80);
          setBrokerRows(hit.rows);
          setPickedBroker(hit.broker);
          if (hit.sessionDate) setSessionDate(hit.sessionDate);
          setPriorReason(
            priorSessionReason(hit.sessionDate, nepalTodayIso()),
          );
        } finally {
          setBrokerFetching(false);
        }
      })();
    }, 350);
    return () => clearTimeout(t);
  }, [mode, query]);

  const brokerSuggestions = useMemo(() => {
    if (mode !== 'broker') return [];
    const q = query.trim().toLowerCase();
    if (q.length < 1) return brokers.slice(0, 8);
    const digits = q.replace(/\D/g, '');
    return brokers
      .filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.code.includes(digits || q) ||
          (digits && b.code === digits),
      )
      .slice(0, 8);
  }, [brokers, mode, query]);

  const filtered = useMemo(() => {
    if (mode === 'broker' && brokerRows) return brokerRows;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    if (mode === 'symbol') {
      const qu = q.toUpperCase();
      return rows.filter((r) => r.symbol.toUpperCase().includes(qu));
    }
    // name
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.brokerName ?? '').toLowerCase().includes(q),
    );
  }, [rows, query, mode, brokerRows]);

  const placeholder =
    mode === 'symbol'
      ? 'Search symbol (e.g. NABIL)'
      : mode === 'name'
        ? 'Search company name'
        : 'Broker number or name (e.g. 58)';

  const body =
    loading && rows.length === 0 ? (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.hint}>Loading live favorites…</Text>
      </View>
    ) : (
      <FlatList
        data={filtered}
        keyExtractor={(item) =>
          `${item.rank}-${item.symbol}-${item.brokerCode ?? 'x'}`
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.subtitle}>
              Live demand + turnover + momentum watchlist. Pick Symbol, Name, or
              a Broker to see what they are buying.
            </Text>
            <Text style={styles.meta}>
              Live · {sessionDate ?? nepalTodayIso()}
              {pickedBroker
                ? ` · Broker ${pickedBroker.code} ${pickedBroker.name}`
                : ''}
            </Text>
            <PriorSessionBanner reason={priorReason} />

            <View style={styles.modeRow}>
              {MODES.map((m) => (
                <Pressable
                  key={m.id}
                  style={[styles.modeChip, mode === m.id && styles.modeChipOn]}
                  onPress={() => {
                    setMode(m.id);
                    setQuery('');
                  }}
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode === m.id && styles.modeTextOn,
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                autoCapitalize={mode === 'symbol' ? 'characters' : 'none'}
                autoCorrect={false}
              />
              {query.length ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons
                    name="close-circle"
                    size={rs(16)}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>

            {mode === 'broker' && brokerSuggestions.length > 0 && !pickedBroker ? (
              <View style={styles.suggestBox}>
                {brokerSuggestions.map((b) => (
                  <Pressable
                    key={b.code}
                    style={styles.suggestRow}
                    onPress={() => setQuery(b.code)}
                  >
                    <Text style={styles.suggestCode}>{b.code}</Text>
                    <Text style={styles.suggestName} numberOfLines={1}>
                      {b.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {brokerFetching ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.hint}>Loading broker buys…</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {mode === 'broker' && query.trim()
              ? 'No buys found for that broker on the latest floorsheet.'
              : 'No favorites match your search.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              navigation.navigate('StockDetail', { symbol: item.symbol })
            }
          >
            <SymLogo
              symbol={item.symbol}
              iconUrl={item.iconUrl}
              styles={styles}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.sym}>{item.symbol}</Text>
                {item.changePct != null ? (
                  <Text
                    style={[
                      styles.chg,
                      {
                        color:
                          item.changePct >= 0
                            ? colors.accentGreen
                            : colors.danger,
                      },
                    ]}
                  >
                    {item.changePct >= 0 ? '+' : ''}
                    {item.changePct.toFixed(2)}%
                  </Text>
                ) : null}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.brokerCode ? (
                <Text style={styles.brokerLine}>
                  Broker {item.brokerCode}
                  {item.brokerName ? ` · ${item.brokerName}` : ''}
                </Text>
              ) : null}
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreVal}>{item.score.toFixed(0)}</Text>
            </View>
          </Pressable>
        )}
      />
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Broker Favorites</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate
        title="Broker Favorites"
        subtitle="Live multi-signal watchlist — filter by symbol, name, or broker."
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
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    list: { padding: rs(14), paddingBottom: rs(28) },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(10),
    },
    hint: { color: c.textMuted, fontSize: rs(12) },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginBottom: rs(6),
    },
    meta: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
      marginBottom: rs(8),
    },
    modeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(6),
      marginBottom: rs(8),
    },
    modeChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(16),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      backgroundColor: c.surface,
    },
    modeChipOn: {
      borderColor: c.accentGreen,
      backgroundColor: isDark ? '#1B2E22' : '#E8F5E9',
    },
    modeText: { color: c.text, fontSize: rs(11), fontWeight: '700' },
    modeTextOn: { color: c.accentGreen },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      paddingHorizontal: rs(10),
      backgroundColor: c.surface,
      marginBottom: rs(8),
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(9),
    },
    suggestBox: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      backgroundColor: c.bgElevated,
      marginBottom: rs(8),
      overflow: 'hidden',
    },
    suggestRow: {
      flexDirection: 'row',
      gap: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    suggestCode: { color: c.accentGreen, fontWeight: '800', width: rs(36) },
    suggestName: { flex: 1, color: c.text, fontSize: rs(12) },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(8),
    },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(30),
      fontSize: rs(13),
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: isDark ? c.surface : '#FFF',
      marginBottom: rs(10),
    },
    logo: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      backgroundColor: '#FFF',
    },
    logoFallback: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      backgroundColor: isDark ? c.surfaceAlt : '#E8F5E9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    chg: { fontWeight: '700', fontSize: rs(12) },
    name: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    brokerLine: { color: c.textSecondary, fontSize: rs(10), marginTop: rs(2) },
    scoreBox: { alignItems: 'flex-end' },
    scoreLabel: { color: c.textMuted, fontSize: rs(10) },
    scoreVal: { color: c.text, fontWeight: '800', fontSize: rs(15) },
  });
}
