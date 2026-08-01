import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  InteractionManager,
  Modal,
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
import { PriorSessionBanner } from '../../components/PriorSessionBanner';
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  invalidateBrokerAnalyticsCache,
  loadAggressiveHolderForSymbol,
  streamAggressiveHolderStocks,
  type AggressiveBrokerCard,
  type AggressiveHolderStock,
} from '../../services/nepse/brokerAnalytics';
import { invalidateMarketCaches } from '../../services/nepse/invalidateMarketCaches';
import { fmtNum, iconUri, loadMiniScreener } from '../../services/nepse/screener';
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

function shiftYmd(iso: string, daysBack: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - (daysBack - 1));
  const yy = dt.getUTCFullYear();
  const mm = `${dt.getUTCMonth() + 1}`.padStart(2, '0');
  const dd = `${dt.getUTCDate()}`.padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} Lakh`;
  return Math.round(n).toLocaleString('en-NP');
}

function brokerNumber(code: string): string {
  const m = String(code).match(/\d+/);
  return m ? m[0] : code;
}

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
  if (iconUrl && !failed) {
    return (
      <Image
        source={{ uri: iconUri(iconUrl) ?? iconUrl }}
        style={styles.logoImg}
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

function MetricCell({
  label,
  value,
  valueColor,
  styles,
}: {
  label: string;
  value: string;
  valueColor?: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.metricValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function BrokerRow({
  broker,
  styles,
  isDark,
}: {
  broker: AggressiveBrokerCard;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUri = useMemo(() => {
    const raw = broker.iconUrl?.trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://cdn.arthakendra.com/${raw.replace(/^\//, '')}`;
  }, [broker.iconUrl]);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUri]);

  return (
    <View style={[styles.brokerCard, isDark && styles.brokerCardDark]}>
      {logoUri && !logoFailed ? (
        <Image
          source={{ uri: logoUri }}
          style={styles.brokerLogoImg}
          resizeMode="contain"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <View style={styles.brokerLogo}>
          <Text style={styles.brokerLogoText}>
            {broker.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.brokerName}>{broker.name}</Text>
        <View style={styles.brokerBadge}>
          <Text style={styles.brokerBadgeText}>
            Broker No: {brokerNumber(broker.code)}
          </Text>
        </View>
        <Text style={styles.brokerMeta}>
          Hold Qty: {fmtQty(broker.holdQty)} ({broker.holdPct.toFixed(2)}%)
        </Text>
        <Text style={styles.brokerMeta}>
          Total Buy Qty: {fmtQty(broker.buyQty)}
        </Text>
      </View>
    </View>
  );
}

function StockCard({
  item,
  styles,
  isDark,
  onPress,
}: {
  item: AggressiveHolderStock;
  styles: ReturnType<typeof makeStyles>;
  isDark: boolean;
  onPress: () => void;
}) {
  const up = (item.changePct ?? 0) >= 0;
  const chgColor = up ? '#00C853' : '#E53935';
  const changeText =
    item.change != null && item.changePct != null
      ? `${item.change >= 0 ? '' : ''}${fmtNum(item.change)} (${item.changePct >= 0 ? '' : ''}${item.changePct.toFixed(2)}%)`
      : item.changePct != null
        ? `${item.changePct.toFixed(2)}%`
        : '—';

  return (
    <Pressable style={styles.stockCard} onPress={onPress}>
      <View style={styles.stockHead}>
        <SymLogo symbol={item.symbol} iconUrl={item.iconUrl} styles={styles} />
        <View style={{ flex: 1 }}>
          <Text style={styles.stockSym}>{item.symbol}</Text>
          <Text style={styles.stockName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        <MetricCell
          label="LTP"
          value={item.ltp != null ? fmtNum(item.ltp) : '—'}
          styles={styles}
        />
        <MetricCell
          label="Change"
          value={changeText}
          valueColor={chgColor}
          styles={styles}
        />
        <MetricCell
          label="Public Trade %"
          value={
            item.publicTradePct != null
              ? `${item.publicTradePct.toFixed(2)}%`
              : '—'
          }
          valueColor="#1E88E5"
          styles={styles}
        />
        <MetricCell
          label="Brokers involv..."
          value={String(item.brokersInvolved || '—')}
          valueColor="#FB8C00"
          styles={styles}
        />
        <MetricCell
          label="Top 3 Holding %"
          value={`${item.top3HoldingPct.toFixed(2)}%`}
          valueColor="#1565C0"
          styles={styles}
        />
        <MetricCell
          label="Total Traded Q"
          value={fmtQty(item.totalTradedQty)}
          valueColor="#039BE5"
          styles={styles}
        />
      </View>

      {item.topBrokers.length > 0 ? (
        <>
          <Text style={styles.topBrokersTitle}>Top 3 Brokers</Text>
          {item.topBrokers.map((b) => (
            <BrokerRow
              key={`${item.symbol}-${b.code}`}
              broker={b}
              styles={styles}
              isDark={isDark}
            />
          ))}
        </>
      ) : (
        <Text style={[styles.brokerMeta, { marginTop: rs(8) }]}>
          Broker breakdown unavailable for this session.
        </Text>
      )}
    </Pressable>
  );
}

export function AggressiveHoldersScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [stocks, setStocks] = useState<AggressiveHolderStock[]>([]);
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
  const symbolIndex = useRef<Map<string, string>>(new Map());
  const stocksRef = useRef(stocks);
  stocksRef.current = stocks;

  const refresh = useCallback(async (force = false) => {
    if (force) {
      invalidateMarketCaches();
      invalidateBrokerAnalyticsCache();
      setVisibleCount(0);
      setStocks([]);
    }
    setLoadingMore(true);
    try {
      await streamAggressiveHolderStocks((board, meta) => {
        setStocks((prev) => {
          // Keep priority-fetched symbols pinned at the top while streaming merges in.
          const incoming = board.stocks;
          const prioritySyms = new Set(
            prev
              .filter((p) => !incoming.some((i) => i.symbol === p.symbol))
              .map((p) => p.symbol),
          );
          if (!prioritySyms.size) return incoming;
          const pinned = prev.filter((p) => prioritySyms.has(p.symbol));
          const rest = incoming.filter((i) => !prioritySyms.has(i.symbol));
          return [...pinned, ...rest];
        });
        setSessionDate(board.sessionDate);
        setPriorReason(board.priorSessionReason ?? null);
        if (board.stocks.length > 0) setLoading(false);
        setLoadingMore(meta.partial);
      }, 0);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Keep prior cards visible; only full-spinner when we have nothing yet.
      if (!stocksRef.current.length) {
        setLoading(true);
        setVisibleCount(0);
      }
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        void refresh(false);
        // Warm symbol index for search-priority resolution
        void loadMiniScreener(false).then((rows) => {
          if (cancelled) return;
          const map = new Map<string, string>();
          for (const r of rows) {
            map.set(r.symbol.toUpperCase(), r.symbol.toUpperCase());
            map.set(r.name.toUpperCase(), r.symbol.toUpperCase());
          }
          symbolIndex.current = map;
        });
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [refresh]),
  );

  // Reveal cards one-by-one so the list doesn't dump all at once.
  useEffect(() => {
    if (stocks.length === 0) {
      setVisibleCount(0);
      return;
    }
    if (visibleCount >= stocks.length) {
      if (visibleCount !== stocks.length) setVisibleCount(stocks.length);
      return;
    }
    const id = setTimeout(() => {
      setVisibleCount((n) => Math.min(n + 1, stocks.length));
    }, visibleCount === 0 ? 40 : 90);
    return () => clearTimeout(id);
  }, [stocks, visibleCount]);

  /** When user searches a share not loaded yet — fetch it first. */
  useEffect(() => {
    const raw = query.trim();
    if (raw.length < 2) {
      setPriorityFetching(false);
      return;
    }

    const q = raw.toUpperCase();
    const gen = ++priorityGen.current;
    const timer = setTimeout(() => {
      void (async () => {
        const candidates: string[] = [];
        const idx = symbolIndex.current;
        if (idx.has(q)) candidates.push(idx.get(q)!);
        for (const [key, sym] of idx) {
          if (candidates.length >= 5) break;
          if (key.startsWith(q) || key.includes(q)) {
            if (!candidates.includes(sym)) candidates.push(sym);
          }
        }
        const ticker = q.replace(/[^A-Z0-9.]/g, '');
        if (ticker.length >= 2 && !candidates.includes(ticker)) {
          candidates.unshift(ticker);
        }

        const missing = candidates.filter(
          (sym) =>
            !stocksRef.current.some((s) => s.symbol.toUpperCase() === sym),
        );
        if (!missing.length) return;

        setPriorityFetching(true);
        try {
          for (const sym of missing.slice(0, 3)) {
            if (gen !== priorityGen.current) return;
            const stock = await loadAggressiveHolderForSymbol(sym);
            if (gen !== priorityGen.current) return;
            if (!stock) continue;
            setStocks((prev) => {
              const without = prev.filter((s) => s.symbol !== stock.symbol);
              return [stock, ...without];
            });
            setVisibleCount((n) => Math.max(n, 1));
            setLoading(false);
          }
        } finally {
          if (gen === priorityGen.current) setPriorityFetching(false);
        }
      })();
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const periodMeta = PERIODS.find((p) => p.id === period) ?? PERIODS[0];
  const endDate = sessionDate ?? nepalTodayIso();
  const startDate = shiftYmd(endDate, periodMeta.days);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? stocks : stocks.slice(0, visibleCount);
    if (!q) return pool;
    const matched = pool.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.topBrokers.some(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.code.includes(q),
        ),
    );
    // Exact / prefix symbol matches first
    const qu = q.toUpperCase();
    return matched.sort((a, b) => {
      const rank = (s: AggressiveHolderStock) => {
        const sym = s.symbol.toUpperCase();
        if (sym === qu) return 0;
        if (sym.startsWith(qu)) return 1;
        if (s.name.toUpperCase().startsWith(qu)) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    });
  }, [stocks, query, visibleCount]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    setPriorityFetching(false);
  };

  const body = loading && stocks.length === 0 ? (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingHint}>Loading floorsheet holders…</Text>
    </View>
  ) : (
    <FlatList
      data={filtered}
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
          <PriorSessionBanner reason={priorReason} />
          <View style={styles.metaRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaCount}>{filtered.length} stocks</Text>
              <Text style={styles.metaDates}>
                {startDate} to {endDate} ({periodMeta.days} days)
              </Text>
            </View>
            <Pressable
              style={styles.periodBtn}
              onPress={() => setPeriodOpen(true)}
            >
              <Text style={styles.periodText}>{periodMeta.label}</Text>
              <Ionicons name="chevron-down" size={rs(14)} color={colors.text} />
            </Pressable>
          </View>
          {priorityFetching || loadingMore ? (
            <View style={styles.loadingMoreRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingHint}>
                {priorityFetching
                  ? 'Fetching searched share…'
                  : 'Loading more holders…'}
              </Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          No aggressive holder stocks for this session. Pull to refresh after
          market open.
        </Text>
      }
      renderItem={({ item }) => (
        <StockCard
          item={item}
          styles={styles}
          isDark={isDark}
          onPress={() =>
            navigation.navigate('StockDetail', { symbol: item.symbol })
          }
        />
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
          Broker Aggressive Holders
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
            placeholder="Search stock or broker…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={(t) => setQuery(t)}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={rs(18)} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <PremiumGate
        title="Broker Aggressive Holders"
        subtitle="Stocks where top brokers show concentrated net buying on the session floorsheet."
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
  const cardBg = c.surface;
  const brokerBg = isDark ? c.surfaceAlt : '#EEF3F0';

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
      backgroundColor: cardBg,
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
      gap: rs(10),
      marginBottom: rs(12),
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
      backgroundColor: cardBg,
    },
    periodText: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    list: { padding: rs(12), paddingBottom: rs(28) },
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
      lineHeight: rs(18),
      fontSize: rs(13),
    },
    stockCard: {
      backgroundColor: cardBg,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      padding: rs(14),
      marginBottom: rs(14),
    },
    stockHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(12),
    },
    logoImg: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(8),
      backgroundColor: c.surfaceAlt,
    },
    logoFallback: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(8),
      backgroundColor: isDark ? c.surfaceAlt : '#E8F5E9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    stockSym: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    stockName: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(2) },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
      paddingTop: rs(10),
    },
    metricCell: {
      width: '33.33%',
      paddingVertical: rs(6),
      paddingRight: rs(4),
    },
    metricLabel: {
      color: c.textMuted,
      fontSize: rs(10),
      fontWeight: '600',
      marginBottom: rs(2),
    },
    metricValue: {
      color: c.text,
      fontSize: rs(12),
      fontWeight: '800',
    },
    topBrokersTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      marginTop: rs(12),
      marginBottom: rs(8),
    },
    brokerCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(10),
      backgroundColor: brokerBg,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(8),
    },
    brokerCardDark: {
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    brokerLogo: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      backgroundColor: isDark ? c.bgElevated : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    brokerLogoImg: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      backgroundColor: isDark ? c.bgElevated : '#FFFFFF',
      borderWidth: 1,
      borderColor: c.borderMuted,
      overflow: 'hidden',
    },
    brokerLogoText: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    brokerName: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(12.5),
      lineHeight: rs(17),
      marginBottom: rs(4),
    },
    brokerBadge: {
      alignSelf: 'flex-start',
      backgroundColor: isDark ? c.bgElevated : '#CFD8DC',
      borderRadius: rs(8),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
      marginBottom: rs(4),
    },
    brokerBadgeText: {
      color: isDark ? c.textSecondary : '#37474F',
      fontSize: rs(9),
      fontWeight: '700',
    },
    brokerMeta: {
      color: c.textSecondary,
      fontSize: rs(11),
      marginTop: rs(2),
      fontWeight: '600',
    },
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
