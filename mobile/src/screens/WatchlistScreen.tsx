import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
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
  getCachedMiniScreenerSync,
  loadMiniScreener,
  type MiniScreenerRow,
} from '../services/nepse/screener';
import {
  addToWatchlist,
  addWatchSection,
  listWatchlist,
  listWatchlistSections,
  removeFromWatchlist,
  saveWatchlistLayout,
  type WatchItem,
  type WatchSection,
} from '../storage/watchlistStorage';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import { usePullToRefresh } from '../utils/usePullToRefresh';
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
    header: '#E4EDE0',
    card: c.surface,
    cardBorder: '#D0DCCE',
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

type WatchRow =
  | { kind: 'section'; key: string; sectionId: string; title: string }
  | { kind: 'stock'; key: string; sectionId: string; item: EnrichedItem };

function enrichItems(
  saved: WatchItem[],
  screener: MiniScreenerRow[],
): EnrichedItem[] {
  const bySym = new Map(screener.map((r) => [r.symbol.toUpperCase(), r]));
  return saved.map((w) => {
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
  });
}

function buildRows(sections: WatchSection[], items: EnrichedItem[]): WatchRow[] {
  const rows: WatchRow[] = [];
  for (const sec of sections) {
    rows.push({
      kind: 'section',
      key: `section-${sec.id}`,
      sectionId: sec.id,
      title: sec.name,
    });
    for (const item of items.filter((i) => i.sectionId === sec.id)) {
      rows.push({
        kind: 'stock',
        key: `stock-${item.symbol}`,
        sectionId: sec.id,
        item,
      });
    }
  }
  return rows;
}

function parseRows(
  rows: WatchRow[],
  prevSections: WatchSection[],
): { sections: WatchSection[]; items: WatchItem[] } {
  const nameById = new Map(prevSections.map((s) => [s.id, s.name]));
  const sections: WatchSection[] = [];
  const seen = new Set<string>();
  const items: WatchItem[] = [];
  let currentSectionId: string | null = null;

  for (const row of rows) {
    if (row.kind === 'section') {
      if (!seen.has(row.sectionId)) {
        seen.add(row.sectionId);
        sections.push({
          id: row.sectionId,
          name: nameById.get(row.sectionId) ?? row.title,
        });
      }
      currentSectionId = row.sectionId;
    } else if (row.kind === 'stock') {
      const sectionId = currentSectionId ?? row.sectionId;
      items.push({
        symbol: row.item.symbol,
        name: row.item.name,
        addedAt: row.item.addedAt,
        sectionId,
      });
    }
  }

  if (sections.length === 0) {
    return { sections: prevSections, items };
  }

  return { sections, items };
}

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
  const styles = useMemo(() => makeStyles(colors, pal, isDark), [colors, pal, isDark]);

  const [sections, setSections] = useState<WatchSection[]>([]);
  const [items, setItems] = useState<EnrichedItem[]>([]);
  const [screener, setScreener] = useState<MiniScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [query, setQuery] = useState('');
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () => buildRows(sections, items),
    [sections, items],
  );

  const applyWatchlistPayload = useCallback(
    (
      saved: WatchItem[],
      screenerRows: MiniScreenerRow[],
      storeSections: WatchSection[],
    ) => {
      setScreener(screenerRows);
      setItems(enrichItems(saved, screenerRows));

      const orderedIds: string[] = [];
      for (const item of saved) {
        if (!orderedIds.includes(item.sectionId)) orderedIds.push(item.sectionId);
      }
      for (const sec of storeSections) {
        if (!orderedIds.includes(sec.id)) orderedIds.push(sec.id);
      }

      const byId = new Map(storeSections.map((s) => [s.id, s]));
      setSections(
        orderedIds.map(
          (id) =>
            byId.get(id) ?? {
              id,
              name: id === 'default' ? 'My Watchlist' : 'Section',
            },
        ),
      );
      setWatchedSet(new Set(saved.map((w) => w.symbol.toUpperCase())));
      setLoading(false);
    },
    [],
  );

  const reload = useCallback(async (_silent = false) => {
    const [saved, screenerRows, storeSections] = await Promise.all([
      listWatchlist(),
      loadMiniScreener(false),
      listWatchlistSections(),
    ]);
    applyWatchlistPayload(saved, screenerRows, storeSections);
  }, [applyWatchlistPayload]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Instant paint from disk symbols + warm screener, then live prices.
      void (async () => {
        const [saved, storeSections] = await Promise.all([
          listWatchlist(),
          listWatchlistSections(),
        ]);
        if (cancelled) return;
        const warm = getCachedMiniScreenerSync() ?? [];
        if (saved.length) {
          applyWatchlistPayload(saved, warm, storeSections);
        } else {
          setSections(storeSections);
          setItems([]);
          setLoading(false);
        }
        InteractionManager.runAfterInteractions(() => {
          if (!cancelled) void reload(true);
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [applyWatchlistPayload, reload]),
  );

  usePollingRefresh(() => reload(true));

  const { refreshing, onRefresh } = usePullToRefresh(() => reload(false));

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

  const onDragEnd = useCallback(
    ({ data }: { data: WatchRow[] }) => {
      const parsed = parseRows(data, sections);
      setSections(parsed.sections);
      const enriched = enrichItems(parsed.items, screener);
      setItems(enriched);
      void saveWatchlistLayout(parsed.sections, parsed.items);
    },
    [sections, screener],
  );

  const onCreateSection = async () => {
    const name = sectionName.trim();
    if (!name) return;
    await addWatchSection(name);
    setSectionName('');
    setSectionOpen(false);
    await reload();
  };

  const renderRow = useCallback(
    ({ item, drag, isActive }: RenderItemParams<WatchRow>) => {
      if (item.kind === 'section') {
        const count = items.filter((i) => i.sectionId === item.sectionId).length;
        return (
          <View style={styles.sectionHead}>
            <View style={styles.sectionLine} />
            <View style={styles.sectionPill}>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              <Text style={styles.sectionCount}>{count}</Text>
            </View>
            <View style={styles.sectionLine} />
          </View>
        );
      }

      const stock = item.item;
      const up = (stock.changePct ?? stock.change ?? 0) >= 0;
      const changeColor = up ? LIME : colors.danger;
      const changeAbs = stock.change;
      const changePct = stock.changePct;
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
              navigation.navigate('StockDetail', { symbol: stock.symbol })
            }
            onLongPress={drag}
            delayLongPress={160}
          >
            <View style={styles.cardTop}>
              <Pressable onLongPress={drag} hitSlop={8} style={styles.dragHit}>
                <MaterialCommunityIcons
                  name="menu"
                  size={rs(20)}
                  color={pal.onDark}
                />
              </Pressable>
              <Text style={styles.cardSym}>{stock.symbol}</Text>
              <Pressable
                onPress={() => void onRemove(stock.symbol)}
                hitSlop={10}
              >
                <Ionicons name="trash-outline" size={rs(20)} color={pal.onDark} />
              </Pressable>
            </View>

            <View style={styles.cardPriceRow}>
              <Text style={styles.ltpText}>LTP: {fmtNum(stock.ltp, 0)}</Text>
              <Text style={[styles.changeText, { color: changeColor }]}>
                {changeText}
              </Text>
            </View>

            <View style={styles.statsRow3}>
              <Text style={styles.statText}>High: {fmtNum(stock.high)}</Text>
              <Text style={styles.statText}>Low: {fmtNum(stock.low)}</Text>
              <Text style={styles.statText}>
                Prev: {fmtNum(stock.previousClose)}
              </Text>
            </View>

            <View style={styles.statsRow2}>
              <Text style={styles.statText}>
                Transactions: {fmtVol(stock.transactions)}
              </Text>
              <Text style={styles.statText}>Vol: {fmtVol(stock.volume)}</Text>
            </View>
          </Pressable>
        </ScaleDecorator>
      );
    },
    [colors.danger, items, navigation, onRemove, styles, pal],
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
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setSectionOpen(true)}
                hitSlop={12}
                style={styles.headerIconBtn}
              >
                <Ionicons name="albums-outline" size={rs(22)} color={pal.onHeader} />
              </Pressable>
              <Pressable onPress={() => setAddOpen(true)} hitSlop={12}>
                <Ionicons name="add" size={rs(24)} color={pal.onHeader} />
              </Pressable>
            </View>
          </View>

          {loading && items.length === 0 ? (
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
              data={rows}
              keyExtractor={(item) => item.key}
              onDragEnd={onDragEnd}
              contentContainerStyle={styles.listBody}
              renderItem={renderRow}
              activationDistance={6}
              autoscrollThreshold={80}
              autoscrollSpeed={120}
              animationConfig={{
                damping: 22,
                stiffness: 200,
                mass: 0.35,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
            />
          )}

          {renderAddModal()}

          <Modal
            visible={sectionOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setSectionOpen(false)}
          >
            <Pressable
              style={styles.sectionModalBackdrop}
              onPress={() => setSectionOpen(false)}
            >
              <Pressable style={styles.sectionModalCard} onPress={() => {}}>
                <Text style={styles.sectionModalTitle}>New section</Text>
                <TextInput
                  value={sectionName}
                  onChangeText={setSectionName}
                  placeholder="Section name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.sectionModalInput}
                  autoFocus
                />
                <View style={styles.sectionModalActions}>
                  <Pressable
                    style={styles.sectionModalBtnGhost}
                    onPress={() => setSectionOpen(false)}
                  >
                    <Text style={styles.sectionModalBtnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={styles.sectionModalBtn}
                    onPress={() => void onCreateSection()}
                  >
                    <Text style={styles.sectionModalBtnText}>Add</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      </GestureHandlerRootView>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors, pal: WatchPalette, isDark: boolean) {
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
    },
    headerIconBtn: {
      padding: rs(2),
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
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(10),
      marginTop: rs(4),
    },
    sectionLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: pal.cardBorder,
    },
    sectionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      borderRadius: rs(10),
      backgroundColor: isDark ? '#2A3B2A' : '#E8EFE3',
      borderWidth: 1,
      borderColor: pal.cardBorder,
    },
    sectionTitle: {
      color: pal.onDark,
      fontSize: rs(12),
      fontWeight: '800',
    },
    sectionCount: {
      color: pal.onDarkMuted,
      fontSize: rs(11),
      fontWeight: '700',
    },
    sectionModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: rs(24),
    },
    sectionModalCard: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    sectionModalTitle: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '800',
      marginBottom: rs(10),
    },
    sectionModalInput: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      color: c.text,
      fontSize: rs(14),
    },
    sectionModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: rs(10),
      marginTop: rs(14),
    },
    sectionModalBtnGhost: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
    },
    sectionModalBtnGhostText: {
      color: c.textMuted,
      fontWeight: '700',
      fontSize: rs(13),
    },
    sectionModalBtn: {
      backgroundColor: LIME,
      paddingHorizontal: rs(16),
      paddingVertical: rs(8),
      borderRadius: rs(10),
    },
    sectionModalBtnText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(13),
    },
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
