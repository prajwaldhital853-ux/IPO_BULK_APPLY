import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
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
  formatNewsTime,
  loadShareNewsProgressive,
  NEWS_SOURCES,
  type NewsSourceId,
  type ShareNewsItem,
} from '../services/nepse/shareNews';
import { SwipeTabGesture } from '../components/SwipeTabGesture';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const ACCENT = '#4CAF50';

export function FinancialNewsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sourceId, setSourceId] = useState<NewsSourceId>('merolagani');
  const [rows, setRows] = useState<ShareNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const genRef = useRef(0);

  const refresh = useCallback(
    async (silent = false) => {
      const gen = ++genRef.current;
      if (!silent) {
        setLoading(true);
        setRows([]);
      }
      setLoadingMore(false);
      try {
        await loadShareNewsProgressive(sourceId, (items, meta) => {
          if (gen !== genRef.current) return;
          setRows(items);
          if (meta.phase === 'first') {
            setLoading(false);
            setRefreshing(false);
            if (!meta.done) setLoadingMore(true);
          }
          if (meta.done) setLoadingMore(false);
        });
      } catch {
        if (gen === genRef.current) {
          setRows([]);
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [sourceId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNews = async (item: ShareNewsItem) => {
    const url = (item.url || '').trim();
    const fallback =
      NEWS_SOURCES.find((s) => s.id === item.sourceId)?.homeUrl ?? '';
    const target = url || fallback;
    if (!target) return;
    try {
      await Linking.openURL(target);
    } catch {
      if (fallback && fallback !== target) {
        void Linking.openURL(fallback);
      }
    }
  };

  const featured = rows[0] ?? null;
  const rest = rows.slice(1);
  const sourceIndex = Math.max(
    0,
    NEWS_SOURCES.findIndex((s) => s.id === sourceId),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Share News</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsBar}
        contentContainerStyle={styles.tabs}
      >
        {NEWS_SOURCES.map((s) => {
          const active = s.id === sourceId;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSourceId(s.id)}
              style={styles.tab}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {s.label}
              </Text>
              {active ? <View style={styles.tabLine} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <SwipeTabGesture
        index={sourceIndex}
        count={NEWS_SOURCES.length}
        onIndexChange={(i) => {
          const next = NEWS_SOURCES[i];
          if (next) setSourceId(next.id);
        }}
      >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listBody}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true);
              }}
              tintColor={ACCENT}
            />
          }
          ListHeaderComponent={
            featured ? (
              <Pressable
                style={styles.featured}
                onPress={() => void openNews(featured)}
              >
                {featured.imageUrl ? (
                  <Image
                    source={{ uri: featured.imageUrl }}
                    style={styles.featuredImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.featuredImage, styles.imageFallback]}>
                    <Ionicons
                      name="newspaper-outline"
                      size={rs(36)}
                      color={colors.textMuted}
                    />
                  </View>
                )}
                <Text style={styles.featuredTitle}>{featured.title}</Text>
                <Text style={styles.featuredTime}>
                  {formatNewsTime(featured.publishedAt)}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => void openNews(item)}>
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.thumb}
                  resizeMode="cover"
                  onError={() => {
                    /* keep fallback via state if needed */
                  }}
                />
              ) : (
                <View style={[styles.thumb, styles.imageFallback]}>
                  <Ionicons
                    name="image-outline"
                    size={rs(20)}
                    color={colors.textMuted}
                  />
                </View>
              )}
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={3}>
                  {item.title}
                </Text>
                <Text style={styles.rowTime}>
                  {formatNewsTime(item.publishedAt)}
                </Text>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.moreWrap}>
                <ActivityIndicator color={ACCENT} />
                <Text style={styles.moreText}>Loading more…</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !featured ? (
              <Text style={styles.empty}>
                No news right now. Pull to refresh.
              </Text>
            ) : null
          }
        />
      )}
      </SwipeTabGesture>
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
      backgroundColor: c.bgElevated,
    },
    title: {
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
    },
    tabsBar: {
      maxHeight: rs(46),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    tabs: {
      paddingHorizontal: rs(8),
      alignItems: 'flex-end',
    },
    tab: {
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      alignItems: 'center',
    },
    tabText: {
      color: c.textMuted,
      fontSize: rs(13),
      fontWeight: '600',
    },
    tabTextActive: { color: c.text, fontWeight: '800' },
    tabLine: {
      marginTop: rs(6),
      height: rs(2),
      width: '100%',
      backgroundColor: c.primary,
      borderRadius: 1,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listBody: { paddingBottom: rs(32) },
    featured: {
      marginHorizontal: rs(14),
      marginTop: rs(12),
      marginBottom: rs(4),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      overflow: 'hidden',
      paddingBottom: rs(12),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderMuted,
    },
    featuredImage: {
      width: '100%',
      height: rs(180),
      backgroundColor: c.surfaceAlt,
    },
    featuredTitle: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '700',
      lineHeight: rs(21),
      paddingHorizontal: rs(12),
      paddingTop: rs(10),
    },
    featuredTime: {
      color: c.textMuted,
      fontSize: rs(11),
      paddingHorizontal: rs(12),
      paddingTop: rs(6),
    },
    row: {
      flexDirection: 'row',
      gap: rs(12),
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      alignItems: 'flex-start',
    },
    thumb: {
      width: rs(64),
      height: rs(64),
      borderRadius: rs(8),
      backgroundColor: c.surfaceAlt,
    },
    imageFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1 },
    rowTitle: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '600',
      lineHeight: rs(18),
    },
    rowTime: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(6),
    },
    sep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginHorizontal: rs(14),
    },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
      paddingHorizontal: rs(20),
    },
    moreWrap: {
      paddingVertical: rs(16),
      alignItems: 'center',
      gap: rs(8),
    },
    moreText: {
      color: c.textMuted,
      fontSize: rs(12),
    },
  });
}
