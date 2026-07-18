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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  type WatchItem,
} from '../storage/watchlistStorage';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';

type EnrichedItem = WatchItem & {
  ltp: number | null;
  changePct: number | null;
};

export function WatchlistScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
          changePct: r?.changePercent ?? null,
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

  const onRemove = async (symbol: string) => {
    await removeFromWatchlist(symbol);
    await reload();
  };

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
                  onPress={(e) => {
                    e.stopPropagation?.();
                    void onToggleInModal(item);
                  }}
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

  if (!loading && items.length === 0) {
    return (
      <ProtectedPersonalScreen title="Sign in to use watchlist">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>My Watchlist</Text>
          <Pressable onPress={() => setAddOpen(true)} hitSlop={12}>
            <Ionicons name="add" size={rs(24)} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.emptyBody}>
          <Ionicons
            name="bookmark-outline"
            size={rs(46)}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>No stocks added</Text>
          <Text style={styles.emptySub}>Tap + to add items to your watchlist</Text>
          <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)}>
            <Ionicons name="add" size={rs(16)} color={colors.accentGreen} />
            <Text style={styles.addBtnText}>Add to Watchlist</Text>
          </Pressable>
        </View>

        {renderAddModal()}
      </View>
      </ProtectedPersonalScreen>
    );
  }

  return (
    <ProtectedPersonalScreen title="Sign in to use watchlist">
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>My Watchlist</Text>
        <Pressable onPress={() => setAddOpen(true)} hitSlop={12}>
          <Ionicons name="add" size={rs(24)} color={colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={styles.listBody}
          renderItem={({ item }) => {
            const up = (item.changePct ?? 0) >= 0;
            const accent = up ? colors.accentGreen : colors.danger;
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  navigation.navigate('StockDetail', { symbol: item.symbol })
                }
                onLongPress={() => void onRemove(item.symbol)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardSym}>{item.symbol}</Text>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.cardLtp}>{fmtNum(item.ltp)}</Text>
                  <Text style={[styles.cardChange, { color: accent }]}>
                    {item.changePct != null
                      ? `${up ? '+' : ''}${item.changePct.toFixed(2)}%`
                      : '—'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void onRemove(item.symbol)}
                  hitSlop={10}
                  style={styles.removeBtn}
                >
                  <Ionicons
                    name="close-circle"
                    size={rs(20)}
                    color={colors.textMuted}
                  />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      {renderAddModal()}
    </View>
    </ProtectedPersonalScreen>
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
      borderColor: c.accentGreen,
      borderRadius: rs(22),
      paddingHorizontal: rs(18),
      paddingVertical: rs(10),
      marginTop: rs(16),
    },
    addBtnText: { color: c.accentGreen, fontWeight: '700', fontSize: rs(13) },
    listBody: { padding: rs(12) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(10),
    },
    cardSym: { color: c.text, fontSize: rs(14), fontWeight: '800' },
    cardName: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    cardLtp: { color: c.text, fontSize: rs(14), fontWeight: '800' },
    cardChange: { fontSize: rs(11), fontWeight: '700', marginTop: rs(2) },
    removeBtn: { paddingLeft: rs(4) },
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
