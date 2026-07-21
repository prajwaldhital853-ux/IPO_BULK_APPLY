import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  fmtNum,
  loadMiniScreener,
  type MiniScreenerRow,
} from '../services/nepse/screener';
import {
  addToWatchlist,
  listWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  type WatchItem,
} from '../storage/watchlistStorage';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

const LIME = '#4CAF50';

type WatchPalette = {
  screen: string;
  header: string;
  card: string;
  cardBorder: string;
  onDark: string;
  onDarkMuted: string;
  onHeader: string;
};

function makePalette(c: ThemeColors, isDark: boolean): WatchPalette {
  if (isDark) {
    return {
      screen: '#121212',
      header: '#212921',
      card: '#1E2C1E',
      cardBorder: '#2A3B2A',
      onDark: '#FFFFFF',
      onDarkMuted: 'rgba(255,255,255,0.78)',
      onHeader: '#FFFFFF',
    };
  }
  return {
    screen: c.bg,
    header: '#E8F5E9',
    card: '#FFFFFF',
    cardBorder: '#C8E6C9',
    onDark: c.text,
    onDarkMuted: c.textSecondary,
    onHeader: c.text,
  };
}

type EnrichedItem = WatchItem & {
  ltp: number | null;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  transactions: number | null;
  volume: number | null;
};

function fmtVol(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

export function WatchlistScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const pal = useMemo(() => makePalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => makeStyles(colors, pal), [colors, pal]);

  const [items, setItems] = useState<EnrichedItem[]>([]);
  const [screener, setScreener] = useState<MiniScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [saved, rows] = await Promise.all([
      listWatchlist(),
      loadMiniScreener(Boolean(silent)),
    ]);
    setScreener(rows);
    const bySym = new Map(rows.map((r) => [r.symbol.toUpperCase(), r]));
    setItems(
      saved.map((w) => {
        const r = bySym.get(w.symbol.toUpperCase());
        return {
          ...w,
          ltp: r?.ltp ?? null,
          change: r?.change ?? null,
          changePct: r?.changePercent ?? null,
          high: r?.high ?? null,
          low: r?.low ?? null,
          previousClose: r?.previousClose ?? null,
          transactions: r?.transactions ?? null,
          volume: r?.volume ?? null,
        };
      }),
    );
    setWatchedSet(new Set(saved.map((w) => w.symbol.toUpperCase())));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  usePollingRefresh(reload);

  const onRemove = useCallback(async (symbol: string) => {
    await removeFromWatchlist(symbol);
    await reload();
  }, [reload]);

  const onAdd = async (row: MiniScreenerRow) => {
    await addToWatchlist(row.symbol, row.name);
    setWatchedSet((prev) => new Set(prev).add(row.symbol.toUpperCase()));
    await reload();
  };

  const onToggleInModal = async (row: MiniScreenerRow) => {
    const sym = row.symbol.toUpperCase();
    if (watchedSet.has(sym)) {
      await removeFromWatchlist(sym);
      setWatchedSet((prev) => {
        const n = new Set(prev);
        n.delete(sym);
        return n;
      });
    } else {
      await onAdd(row);
    }
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = screener.filter((r) => r.symbol);
    if (!q) return base.slice(0, 100);
    return base
      .filter(
        (r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q),
      )
      .slice(0, 100);
  }, [screener, query]);

  const renderCard = useCallback(
    ({ item, drag, isActive }: RenderItemParams<EnrichedItem>) => {
      const up = (item.changePct ?? item.change ?? 0) >= 0;
      const changeColor = up ? LIME : colors.danger;
      const changeAbs = item.change;
      const changePct = item.changePct;
      const changeText =
        changeAbs != null || changePct != null
          ? `Change: ${
              changeAbs != null
                ? `${up && changeAbs >= 0 ? '' : ''}${fmtNum(changeAbs, 1)}`
                : '—'
            }${
              changePct != null
                ? ` (${changePct >= 0 ? '' : ''}${changePct.toFixed(2)}%)`
                : ''
            }`
          : 'Change: —';

      return (
        <ScaleDecorator>
          <Pressable
            style={[styles.card, isActive && styles.cardActive]}
            onPress={() =>
              navigation.navigate('StockDetail', { symbol: item.symbol })
            }
            onLongPress={drag}
            delayLongPress={180}
          >
            <View style={styles.cardTop}>
              <Pressable onLongPress={drag} hitSlop={8} style={styles.dragHit}>
                <MaterialCommunityIcons
                  name="menu"
                  size={rs(20)}
                  color={pal.onDark}
                />
              </Pressable>
              <Text style={styles.cardSym}>{item.symbol}</Text>
              <Pressable
                onPress={() => void onRemove(item.symbol)}
                hitSlop={10}
              >
                <Ionicons name="trash-outline" size={rs(20)} color={pal.onDark} />
              </Pressable>
            </View>

            <View style={styles.cardPriceRow}>
              <Text style={styles.ltpText}>LTP: {fmtNum(item.ltp, 0)}</Text>
              <Text style={[styles.changeText, { color: changeColor }]}>
                {changeText}
              </Text>
            </View>

            <View style={styles.statsRow3}>
              <Text style={styles.statText}>High: {fmtNum(item.high)}</Text>
              <Text style={styles.statText}>Low: {fmtNum(item.low)}</Text>
              <Text style={styles.statText}>
                Prev: {fmtNum(item.previousClose)}
              </Text>
            </View>

            <View style={styles.statsRow2}>
              <Text style={styles.statText}>
                Transactions: {fmtVol(item.transactions)}
              </Text>
              <Text style={styles.statText}>Vol: {fmtVol(item.volume)}</Text>
            </View>
          </Pressable>
        </ScaleDecorator>
      );
    },
    [colors.danger, navigation, onRemove, styles, pal],
  );

  const renderAddModal = () => (
    <Modal
      visible={addOpen}
      animationType="slide"
      onRequestClose={() => {
        setAddOpen(false);
        void reload();
      }}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              setAddOpen(false);
              void reload();
            }}
            hitSlop={12}
          >
            <Ionicons name="close" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Add to Watchlist</Text>
          <View style={{ width: rs(22) }} />
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={rs(15)} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search stock…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="characters"
            autoFocus
          />
        </View>

        <FlatList
          data={searchResults}
          keyExtractor={(item) => String(item.id ?? item.symbol)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const watched = watchedSet.has(item.symbol.toUpperCase());
            return (
              <Pressable
                style={styles.searchRow}
                onPress={() => {
                  setAddOpen(false);
                  navigation.navigate('StockDetail', { symbol: item.symbol });
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchSym}>{item.symbol}</Text>
                  <Text style={styles.searchName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void onToggleInModal(item)}
                  hitSlop={10}
                >
                  <Ionicons
                    name={watched ? 'star' : 'star-outline'}
                    size={rs(20)}
                    color={watched ? '#FFB300' : colors.textMuted}
                  />
                </Pressable>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>No stocks match “{query}”.</Text>
          }
        />
      </View>
    </Modal>
  );

  return (
    <ProtectedPersonalScreen title="Sign in to use watchlist">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.root, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <Ionicons name="arrow-back" size={rs(22)} color={pal.onHeader} />
            </Pressable>
            <Text style={styles.title}>My Watchlist</Text>
            <Pressable onPress={() => setAddOpen(true)} hitSlop={12}>
              <Ionicons name="add" size={rs(24)} color={pal.onHeader} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.emptyBody}>
              <Ionicons
                name="bookmark-outline"
                size={rs(46)}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>No stocks added</Text>
              <Text style={styles.emptySub}>
                Tap + to add items to your watchlist
              </Text>
              <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)}>
                <Ionicons name="add" size={rs(16)} color={LIME} />
                <Text style={styles.addBtnText}>Add to Watchlist</Text>
              </Pressable>
            </View>
          ) : (
            <DraggableFlatList
              data={items}
              keyExtractor={(item) => item.symbol}
              onDragEnd={({ data }) => {
                setItems(data);
                void reorderWatchlist(data.map((d) => d.symbol));
              }}
              contentContainerStyle={styles.listBody}
              renderItem={renderCard}
              activationDistance={10}
            />
          )}

          {renderAddModal()}
        </View>
      </GestureHandlerRootView>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors, pal: WatchPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: pal.screen },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      backgroundColor: pal.header,
    },
    title: {
      color: pal.onHeader,
      fontSize: rs(16),
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(30),
      gap: rs(8),
    },
    emptyTitle: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '800',
      marginTop: rs(10),
    },
    emptySub: {
      color: c.textMuted,
      fontSize: rs(12),
      textAlign: 'center',
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1,
      borderColor: LIME,
      borderRadius: rs(22),
      paddingHorizontal: rs(18),
      paddingVertical: rs(10),
      marginTop: rs(16),
    },
    addBtnText: { color: LIME, fontWeight: '700', fontSize: rs(13) },
    listBody: { padding: rs(14), paddingBottom: rs(40) },
    card: {
      backgroundColor: pal.card,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: pal.cardBorder,
      padding: rs(14),
      marginBottom: rs(12),
    },
    cardActive: { opacity: 0.92 },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: rs(10),
    },
    dragHit: { paddingRight: rs(8) },
    cardSym: {
      flex: 1,
      color: pal.onDark,
      fontSize: rs(16),
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    cardPriceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: rs(10),
    },
    ltpText: { color: pal.onDark, fontSize: rs(14), fontWeight: '600' },
    changeText: { fontSize: rs(13), fontWeight: '700' },
    statsRow3: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: rs(8),
    },
    statsRow2: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    statText: { color: pal.onDarkMuted, fontSize: rs(12) },
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
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(12),
      paddingHorizontal: rs(16),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    searchSym: { color: c.text, fontSize: rs(13), fontWeight: '800' },
    searchName: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
    },
  });
}
