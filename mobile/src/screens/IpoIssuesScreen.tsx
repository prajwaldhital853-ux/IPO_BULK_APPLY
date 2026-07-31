import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IssueOfferingCard } from '../components/ipo/IssueOfferingCard';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  ISSUE_TABS,
  PREVIOUS_ISSUES_LIMIT,
  isOfferingClosed,
  isOfferingCurrent,
  isOfferingNonCurrent,
  isOfferingUpcoming,
  loadAllPublicOfferings,
  loadOfferingsTypeFirstPage,
  loadOfferingsTypeRemainingPages,
  type IssueTab,
  type PublicOffering,
} from '../services/nepse/publicOffering';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type Mode = 'current' | 'upcoming';

const COPY: Record<Mode, { title: string; empty: string }> = {
  current: {
    title: 'Current Issues',
    empty: 'No issues are open for application right now.',
  },
  upcoming: {
    title: 'Upcoming Issues',
    empty: 'No upcoming or closed issues in this category.',
  },
};

function sortUpcomingList(rows: PublicOffering[]): PublicOffering[] {
  const rank = (row: PublicOffering) => {
    if (isOfferingUpcoming(row)) return 0;
    if (isOfferingClosed(row)) return 1;
    return 2;
  };
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const at = a.openingDate ? Date.parse(a.openingDate) : 0;
    const bt = b.openingDate ? Date.parse(b.openingDate) : 0;
    return ra === 0 ? at - bt : bt - at;
  });
}

/** Hard cap: never show more than PREVIOUS_ISSUES_LIMIT cards in a tab. */
function limitPreviousIssues(rows: PublicOffering[]): PublicOffering[] {
  return rows.slice(0, PREVIOUS_ISSUES_LIMIT);
}

export function IpoIssuesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'IpoIssues'>>();
  const mode: Mode = route.params?.mode ?? 'upcoming';
  const copy = COPY[mode];
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [all, setAll] = useState<PublicOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<IssueTab>(ISSUE_TABS[0]);
  const loadGen = useRef(0);
  // Types whose background pages already finished — never re-run for them.
  const filledTypes = useRef<Set<string>>(new Set());

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          mode === 'upcoming' &&
          Math.abs(gesture.dx) > rs(18) &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) < rs(55)) return;
          const currentIndex = ISSUE_TABS.findIndex((item) => item.id === tab.id);
          const nextIndex =
            gesture.dx < 0 ? currentIndex + 1 : currentIndex - 1;
          if (nextIndex >= 0 && nextIndex < ISSUE_TABS.length) {
            setTab(ISSUE_TABS[nextIndex]);
          }
        },
      }),
    [mode, tab.id],
  );

  const rows = useMemo(() => {
    if (mode === 'current') {
      return all.filter((row) =>
        row.displaySection
          ? row.displaySection === 'current' || row.displaySection === 'both'
          : isOfferingCurrent(row),
      );
    }
    const scoped = all.filter(
      (row) =>
        String(row.type) === tab.apiType &&
        (row.displaySection
          ? row.displaySection === 'upcoming' || row.displaySection === 'both'
          : isOfferingNonCurrent(row)),
    );
    return limitPreviousIssues(sortUpcomingList(scoped));
  }, [all, mode, tab.apiType]);

  const refreshCurrent = useCallback(async (force = false) => {
    setError(null);
    try {
      const list = await loadAllPublicOfferings(force);
      setAll(list);
      setUpdatedAt(Date.now());
      if (!list.length) setError('No issues available right now.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load issues');
      setAll([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const refreshUpcoming = useCallback(
    async (force = false, type = tab.apiType) => {
      const gen = ++loadGen.current;
      if (force) filledTypes.current.delete(type);
      setError(null);
      setLoadingMore(false);
      try {
        // 1) First page only — paint cards as soon as this resolves.
        const first = await loadOfferingsTypeFirstPage(type, force);
        if (gen !== loadGen.current) return;
        setAll(first.rows);
        setUpdatedAt(Date.now());
        setLoading(false);

        if (first.totalPages <= 1 || filledTypes.current.has(type)) {
          filledTypes.current.add(type);
          return;
        }

        // 2) Remaining pages once, in background (total capped at 50 cards).
        setLoadingMore(true);
        const rest = await loadOfferingsTypeRemainingPages(
          type,
          first.totalPages,
          force,
        );
        if (gen !== loadGen.current) return;
        filledTypes.current.add(type);
        setAll(rest);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (gen !== loadGen.current) return;
        setError(e instanceof Error ? e.message : 'Could not load issues');
        setAll((prev) => prev);
      } finally {
        if (gen === loadGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [tab.apiType],
  );

  const refresh = useCallback(
    async (force = false) => {
      if (mode === 'current') return refreshCurrent(force);
      return refreshUpcoming(force);
    },
    [mode, refreshCurrent, refreshUpcoming],
  );

  useEffect(() => {
    setLoading(true);
    setAll([]);
    if (mode === 'current') {
      void refreshCurrent();
    } else {
      void refreshUpcoming(false, tab.apiType);
    }
  }, [mode, tab.apiType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upcoming/closed data barely changes; polling there caused repeat reloads.
  usePollingRefresh(
    (silent) => {
      void refreshCurrent(Boolean(silent));
    },
    undefined,
    mode === 'current',
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.title}>{copy.title}</Text>
          {rows.length ? (
            <Text style={styles.subtitle}>
              {rows.length} {rows.length === 1 ? 'issue' : 'issues'}
              {loadingMore ? ' · loading more…' : ''}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
          hitSlop={10}
        >
          <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
        </Pressable>
      </View>

      {mode === 'upcoming' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {ISSUE_TABS.map((t) => {
            const active = tab.id === t.id;
            return (
              <Pressable
                key={t.id}
                style={styles.tabBtn}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
                {active ? <View style={styles.tabLine} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.content} {...swipeResponder.panHandlers}>
        {error && !loading ? <Text style={styles.error}>{error}</Text> : null}

        {loading && rows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading issues…</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) =>
              item.managedId
                ? `m-${item.managedId}`
                : `${item.type}-${item.id}`
            }
            initialNumToRender={2}
            maxToRenderPerBatch={4}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void refresh(true).finally(() => setRefreshing(false));
                }}
              />
            }
            contentContainerStyle={
              rows.length === 0 ? styles.emptyList : styles.list
            }
            ListEmptyComponent={<Text style={styles.empty}>{copy.empty}</Text>}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.footerText}>Loading more…</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <IssueOfferingCard row={item} updatedAt={updatedAt} />
            )}
          />
        )}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      gap: rs(12),
    },
    headerMid: { flex: 1 },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    subtitle: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    tabs: {
      paddingHorizontal: rs(12),
      paddingBottom: rs(4),
      gap: rs(16),
    },
    tabBtn: {
      alignItems: 'center',
      paddingVertical: rs(8),
      minWidth: rs(72),
    },
    tabText: {
      color: c.textMuted,
      fontWeight: '700',
      fontSize: rs(12),
    },
    tabTextActive: { color: c.text },
    tabLine: {
      marginTop: rs(6),
      height: rs(2),
      width: '100%',
      backgroundColor: c.accentGreen,
      borderRadius: rs(2),
    },
    error: {
      color: c.danger,
      fontSize: rs(12),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(10),
    },
    loadingText: { color: c.textSecondary, fontSize: rs(13) },
    list: {
      paddingHorizontal: rs(16),
      paddingTop: rs(4),
      paddingBottom: rs(24),
    },
    emptyList: { flexGrow: 1, paddingHorizontal: rs(16) },
    empty: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(48),
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    footerLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(16),
    },
    footerText: { color: c.textMuted, fontSize: rs(12) },
  });
}
