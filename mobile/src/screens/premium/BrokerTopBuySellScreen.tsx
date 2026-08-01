import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PriorSessionBanner } from '../../components/PriorSessionBanner';
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  invalidateBrokerAnalyticsCache,
  loadBrokerTopBuySellForQuery,
  streamBrokerTopBuySellBoard,
  type BrokerTopBuySellCard,
} from '../../services/nepse/brokerAnalytics';
import { invalidateMarketCaches } from '../../services/nepse/invalidateMarketCaches';
import { nepalTodayIso } from '../../services/nepse/holidays';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import type { RootStackParamList } from '../../navigation/types';

type Period = '1d' | '2d' | '3d' | '7d' | '1m';

const PERIODS: Array<{ id: Period; label: string; days: number }> = [
  { id: '1d', label: '1 Day', days: 1 },
  { id: '2d', label: '2 Days', days: 2 },
  { id: '3d', label: '3 Days', days: 3 },
  { id: '7d', label: '1 Week', days: 7 },
  { id: '1m', label: '1 Month', days: 30 },
];

const BUY = '#2E7D32';
const SELL = '#E64A19';

function BrokerLogo({
  name,
  iconUrl,
  styles,
}: {
  name: string;
  iconUrl: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [failed, setFailed] = useState(false);
  const uri = useMemo(() => {
    const raw = iconUrl?.trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://cdn.arthakendra.com/${raw.replace(/^\//, '')}`;
  }, [iconUrl]);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.logoImg}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.logoFallback}>
      <Text style={styles.logoLetter}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function ChipRow({
  label,
  symbols,
  color,
  styles,
  onPressSymbol,
}: {
  label: string;
  symbols: string[];
  color: string;
  styles: ReturnType<typeof makeStyles>;
  onPressSymbol: (sym: string) => void;
}) {
  return (
    <View style={[styles.sideCard, { borderColor: color }]}>
      <View style={[styles.sideCardHead, { backgroundColor: color }]}>
        <Text style={styles.sideCardHeadText}>{label}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {symbols.length ? (
          symbols.map((sym) => (
            <Pressable
              key={`${label}-${sym}`}
              onPress={() => onPressSymbol(sym)}
              style={[styles.symPill, { backgroundColor: color }]}
            >
              <Text style={styles.symPillText}>{sym}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyChips}>—</Text>
        )}
      </ScrollView>
    </View>
  );
}

function BrokerCard({
  item,
  styles,
  onPressSymbol,
}: {
  item: BrokerTopBuySellCard;
  styles: ReturnType<typeof makeStyles>;
  onPressSymbol: (sym: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <BrokerLogo name={item.name} iconUrl={item.iconUrl} styles={styles} />
        <Text style={styles.brokerTitle}>
          {item.name} ({item.code})
        </Text>
      </View>
      <ChipRow
        label="BUY"
        symbols={item.buySymbols}
        color={BUY}
        styles={styles}
        onPressSymbol={onPressSymbol}
      />
      <ChipRow
        label="SELL"
        symbols={item.sellSymbols}
        color={SELL}
        styles={styles}
        onPressSymbol={onPressSymbol}
      />
    </View>
  );
}

export function BrokerTopBuySellScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [brokers, setBrokers] = useState<BrokerTopBuySellCard[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [priorReason, setPriorReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('1d');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [priorityFetching, setPriorityFetching] = useState(false);
  const priorityGen = useRef(0);
  const brokersRef = useRef(brokers);
  brokersRef.current = brokers;

  const refresh = useCallback(async (force = false) => {
    if (force) {
      invalidateMarketCaches();
      invalidateBrokerAnalyticsCache();
      setVisibleCount(0);
      setBrokers([]);
    }
    setLoadingMore(true);
    try {
      await streamBrokerTopBuySellBoard((board, meta) => {
        setSessionDate(board.sessionDate);
        setPriorReason(board.priorSessionReason ?? null);
        setLoadingMore(meta.partial);
        // Publish finished board (including empty) so yesterday's chips don't stick.
        if (!meta.partial) {
          setBrokers(board.brokers);
          setVisibleCount(0);
          setLoading(false);
        } else if (board.brokers.length) {
          setBrokers(board.brokers);
          setLoading(false);
        }
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!brokersRef.current.length) {
        setLoading(true);
        setVisibleCount(0);
      }
      const task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) void refresh(false);
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [refresh]),
  );

  // Show one complete broker card at a time (frozen buy/sell chips).
  useEffect(() => {
    if (brokers.length === 0) {
      setVisibleCount(0);
      return;
    }
    if (visibleCount >= brokers.length) {
      if (visibleCount !== brokers.length) setVisibleCount(brokers.length);
      return;
    }
    const id = setTimeout(() => {
      setVisibleCount((n) => Math.min(n + 1, brokers.length));
    }, visibleCount === 0 ? 30 : 120);
    return () => clearTimeout(id);
  }, [brokers, visibleCount]);

  useEffect(() => {
    const raw = query.trim();
    if (raw.length < 1) {
      setPriorityFetching(false);
      return;
    }
    const gen = ++priorityGen.current;
    const timer = setTimeout(() => {
      void (async () => {
        const q = raw.toLowerCase();
        const already = brokersRef.current.some(
          (b) =>
            b.code.includes(q.replace(/\D/g, '')) ||
            b.name.toLowerCase().includes(q),
        );
        if (already) return;

        setPriorityFetching(true);
        try {
          const hits = await loadBrokerTopBuySellForQuery(raw);
          if (gen !== priorityGen.current) return;
          if (!hits.length) return;
          setBrokers((prev) => {
            const have = new Set(prev.map((p) => p.code));
            const fresh = hits.filter((h) => !have.has(h.code));
            if (!fresh.length) return prev;
            return [...fresh, ...prev];
          });
          setVisibleCount((n) => Math.max(n, 1));
          setLoading(false);
        } finally {
          if (gen === priorityGen.current) setPriorityFetching(false);
        }
      })();
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const periodMeta = PERIODS.find((p) => p.id === period) ?? PERIODS[0];
  const endDate = sessionDate ?? nepalTodayIso();
  const dateLabel = endDate;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? brokers : brokers.slice(0, visibleCount);
    if (!q) return pool;
    const matched = pool.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.code.includes(q.replace(/\D/g, '')) ||
        b.buySymbols.some((s) => s.toLowerCase().includes(q)) ||
        b.sellSymbols.some((s) => s.toLowerCase().includes(q)),
    );
    const qu = q.toUpperCase();
    return matched.sort((a, b) => {
      const rank = (x: BrokerTopBuySellCard) => {
        if (x.code === qu.replace(/\D/g, '') || x.code === qu) return 0;
        if (x.name.toUpperCase().startsWith(qu)) return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });
  }, [brokers, query, visibleCount]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    setPriorityFetching(false);
  };

  const openSymbol = (sym: string) => {
    navigation.navigate('StockDetail', { symbol: sym });
  };

  const body =
    loading && brokers.length === 0 ? (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingHint}>Loading broker buy / sell…</Text>
      </View>
    ) : (
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
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
            <PriorSessionBanner reason={priorReason} />
            <View style={styles.metaRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.metaCount}>
                  {filtered.length} brokers
                </Text>
                <Text style={styles.metaDates}>{dateLabel}</Text>
              </View>
              <Pressable
                style={styles.periodBtn}
                onPress={() => setPeriodOpen(true)}
              >
                <Text style={styles.periodText}>{periodMeta.label}</Text>
                <Ionicons
                  name="chevron-down"
                  size={rs(14)}
                  color={colors.text}
                />
              </Pressable>
            </View>
            {priorityFetching || loadingMore ? (
              <View style={styles.loadingMoreRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingHint}>
                  {priorityFetching
                    ? 'Fetching searched broker…'
                    : 'Loading more brokers…'}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No broker buy/sell data yet. Pull to refresh after the floorsheet
            publishes.
          </Text>
        }
        renderItem={({ item }) => (
          <BrokerCard item={item} styles={styles} onPressSymbol={openSymbol} />
        )}
      />
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Broker Top Buy / Sell
        </Text>
        <Pressable
          onPress={() => {
            if (searchOpen) closeSearch();
            else setSearchOpen(true);
          }}
          hitSlop={10}
          style={styles.headerIcon}
        >
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={rs(22)}
            color={colors.text}
          />
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search broker or symbol…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="characters"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={rs(18)}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <PremiumGate
        title="Broker Top Buy / Sell"
        subtitle="Top symbols each broker bought and sold on the session floorsheet."
      >
        {body}
      </PremiumGate>

      <Modal
        visible={periodOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPeriodOpen(false)}
        >
          <View style={styles.periodMenu}>
            {PERIODS.map((p) => (
              <Pressable
                key={p.id}
                style={styles.periodItem}
                onPress={() => {
                  setPeriod(p.id);
                  setPeriodOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.periodItemText,
                    period === p.id && styles.periodItemActive,
                  ]}
                >
                  {p.label}
                </Text>
                {period === p.id ? (
                  <Ionicons
                    name="checkmark"
                    size={rs(18)}
                    color={colors.accentGreen}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(10),
      paddingVertical: rs(10),
      gap: rs(6),
      backgroundColor: c.bgElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    headerIcon: {
      width: rs(36),
      height: rs(36),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
      marginTop: rs(8),
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
      paddingVertical: rs(9),
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: rs(12),
      gap: rs(10),
    },
    metaCount: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    metaDates: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    periodBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(16),
      paddingHorizontal: rs(12),
      paddingVertical: rs(7),
      backgroundColor: c.surface,
    },
    periodText: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    list: { padding: rs(14), paddingBottom: rs(28) },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(12),
    },
    loadingHint: { color: c.textMuted, fontSize: rs(12) },
    loadingMoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(10),
    },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      paddingHorizontal: rs(20),
      fontSize: rs(13),
    },
    card: {
      marginBottom: rs(14),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      padding: rs(12),
      gap: rs(8),
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(2),
    },
    logoImg: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      backgroundColor: isDark ? c.surfaceAlt : '#FFF',
      borderWidth: 1,
      borderColor: c.borderMuted,
      overflow: 'hidden',
    },
    logoFallback: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      backgroundColor: isDark ? c.surfaceAlt : '#E8F5E9',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    brokerTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      lineHeight: rs(19),
    },
    sideCard: {
      borderRadius: rs(10),
      borderWidth: 1.5,
      backgroundColor: isDark ? c.surfaceAlt : '#FAFBFC',
      overflow: 'hidden',
    },
    sideCardHead: {
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
    },
    sideCardHeadText: {
      color: '#FFF',
      fontWeight: '800',
      fontSize: rs(11),
      letterSpacing: 0.4,
    },
    chipScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(10),
      paddingVertical: rs(10),
      paddingRight: rs(12),
    },
    symPill: {
      borderRadius: rs(6),
      paddingHorizontal: rs(9),
      paddingVertical: rs(5),
    },
    symPillText: {
      color: '#FFF',
      fontWeight: '800',
      fontSize: rs(11),
    },
    emptyChips: { color: c.textMuted, fontSize: rs(12) },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      paddingHorizontal: rs(40),
    },
    periodMenu: {
      backgroundColor: c.bgElevated,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    periodItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(14),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    periodItemText: { color: c.text, fontSize: rs(14), fontWeight: '600' },
    periodItemActive: { color: c.accentGreen, fontWeight: '800' },
  });
}
