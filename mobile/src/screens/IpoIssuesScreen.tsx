import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IssueOfferingCard } from '../components/ipo/IssueOfferingCard';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import {
  loadOpenIssuesForUi,
  type OpenIssue,
} from '../services/meroshare';
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
  type PublicOffering,
  type PublicOfferingType,
} from '../services/nepse/publicOffering';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import { usePullToRefresh } from '../utils/usePullToRefresh';
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
  // Open first, then coming-soon/proposed, then closed. Admin rows float to
  // the top within each group so curated issues aren't buried at the end.
  const rank = (row: PublicOffering) => {
    if (row.status === 'Open' || isOfferingCurrent(row)) return 0;
    if (isOfferingUpcoming(row)) return 1;
    if (isOfferingClosed(row) || row.status === 'Closed') return 2;
    return 3;
  };
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const aAdmin = a.managedId ? 0 : 1;
    const bAdmin = b.managedId ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;
    const at = a.openingDate ? Date.parse(a.openingDate) : 0;
    const bt = b.openingDate ? Date.parse(b.openingDate) : 0;
    // Open / upcoming: soonest open first. Closed: newest first.
    return ra <= 1 ? at - bt : bt - at;
  });
}

/** Hard cap: never show more than PREVIOUS_ISSUES_LIMIT cards in a tab. */
function limitPreviousIssues(rows: PublicOffering[]): PublicOffering[] {
  return rows.slice(0, PREVIOUS_ISSUES_LIMIT);
}

function upcomingRowsForType(
  apiType: PublicOfferingType,
  data: PublicOffering[],
): PublicOffering[] {
  const scoped = data.filter(
    (row) =>
      String(row.type) === apiType &&
      (row.displaySection
        ? row.displaySection === 'upcoming' || row.displaySection === 'both'
        : isOfferingNonCurrent(row)),
  );
  return limitPreviousIssues(sortUpcomingList(scoped));
}

function offeringSlug(raw?: string | null): string {
  return (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Add MeroShare's authoritative minUnit to matching currently open cards. */
function mergeMeroShareMinimums(
  rows: PublicOffering[],
  openings: OpenIssue[],
): PublicOffering[] {
  if (!openings.length) return rows;
  const bySymbol = new Map(
    openings
      .filter((issue) => offeringSlug(issue.scrip))
      .map((issue) => [offeringSlug(issue.scrip), issue]),
  );
  const byName = new Map(
    openings.map((issue) => [offeringSlug(issue.companyName), issue]),
  );
  return rows.map((row) => {
    const issue =
      bySymbol.get(offeringSlug(row.symbol)) ??
      byName.get(offeringSlug(row.name));
    const minimumUnits = Number(issue?.minUnit);
    return Number.isFinite(minimumUnits) && minimumUnits > 0
      ? { ...row, minimumUnits }
      : row;
  });
}

export function IpoIssuesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'IpoIssues'>>();
  const mode: Mode = route.params?.mode ?? 'upcoming';
  const copy = COPY[mode];
  const insets = useSafeAreaInsets();
  const { width: pageWidth } = useWindowDimensions();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [all, setAll] = useState<PublicOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [tabIndex, setTabIndex] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const activeTab = ISSUE_TABS[tabIndex];

  const [dataByType, setDataByType] = useState<
    Partial<Record<PublicOfferingType, PublicOffering[]>>
  >({});
  const [loadingByType, setLoadingByType] = useState<
    Partial<Record<PublicOfferingType, boolean>>
  >({});
  const [loadingMoreByType, setLoadingMoreByType] = useState<
    Partial<Record<PublicOfferingType, boolean>>
  >({});
  const [updatedAtByType, setUpdatedAtByType] = useState<
    Partial<Record<PublicOfferingType, number>>
  >({});

  const pagerRef = useRef<ScrollView>(null);
  const tabIndexRef = useRef(0);
  const highlightIndexRef = useRef(0);
  const loadGenByType = useRef<Partial<Record<PublicOfferingType, number>>>({});
  const filledTypes = useRef<Set<string>>(new Set());
  const fetchStartedRef = useRef<Set<PublicOfferingType>>(new Set());

  tabIndexRef.current = tabIndex;
  highlightIndexRef.current = highlightIndex;

  const markTypeLoading = useCallback((type: PublicOfferingType) => {
    setLoadingByType((prev) => {
      if (prev[type]) return prev;
      return { ...prev, [type]: true };
    });
  }, []);

  const setActiveTabIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= ISSUE_TABS.length) return;
      if (index === tabIndexRef.current) return;
      tabIndexRef.current = index;
      setTabIndex(index);
      markTypeLoading(ISSUE_TABS[index].apiType);
    },
    [markTypeLoading],
  );

  const currentRows = useMemo(() => {
    return all.filter((row) =>
      row.displaySection
        ? row.displaySection === 'current' || row.displaySection === 'both'
        : isOfferingCurrent(row),
    );
  }, [all]);

  const activeUpcomingRows = useMemo(
    () =>
      upcomingRowsForType(
        activeTab.apiType,
        dataByType[activeTab.apiType] ?? [],
      ),
    [activeTab.apiType, dataByType],
  );

  const headerRows = mode === 'current' ? currentRows : activeUpcomingRows;
  const headerLoadingMore =
    mode === 'upcoming'
      ? Boolean(loadingMoreByType[activeTab.apiType])
      : loadingMore;

  const refreshCurrent = useCallback(
    async (force = false) => {
      setError(null);
      const openingsPromise = loadOpenIssuesForUi(accounts).catch(
        () => [] as OpenIssue[],
      );
      try {
        const list = await loadAllPublicOfferings(force);
        setAll(list);
        setUpdatedAt(Date.now());
        setLoading(false);
        if (!list.length) setError('No issues available right now.');

        const openings = await openingsPromise;
        if (openings.length) {
          setAll((current) => mergeMeroShareMinimums(current, openings));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load issues');
        setAll([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accounts],
  );

  const refreshUpcoming = useCallback(async (force = false, type: PublicOfferingType) => {
    const gen = (loadGenByType.current[type] ?? 0) + 1;
    loadGenByType.current[type] = gen;
    if (force) {
      filledTypes.current.delete(type);
      fetchStartedRef.current.delete(type);
    }
    setError(null);
    setLoadingByType((prev) => {
      if (prev[type]) return prev;
      return { ...prev, [type]: true };
    });
    setLoadingMoreByType((prev) => ({ ...prev, [type]: false }));
    try {
      const first = await loadOfferingsTypeFirstPage(type, force);
      if (loadGenByType.current[type] !== gen) return;
      setDataByType((prev) => ({ ...prev, [type]: first.rows }));
      setUpdatedAtByType((prev) => ({ ...prev, [type]: Date.now() }));
      setLoadingByType((prev) => ({ ...prev, [type]: false }));

      if (first.totalPages <= 1 || filledTypes.current.has(type)) {
        filledTypes.current.add(type);
        return;
      }

      setLoadingMoreByType((prev) => ({ ...prev, [type]: true }));
      const rest = await loadOfferingsTypeRemainingPages(
        type,
        first.totalPages,
        force,
      );
      if (loadGenByType.current[type] !== gen) return;
      filledTypes.current.add(type);
      setDataByType((prev) => ({ ...prev, [type]: rest }));
      setUpdatedAtByType((prev) => ({ ...prev, [type]: Date.now() }));
    } catch (e) {
      if (loadGenByType.current[type] !== gen) return;
      setError(e instanceof Error ? e.message : 'Could not load issues');
      setDataByType((prev) => ({ ...prev, [type]: prev[type] ?? [] }));
    } finally {
      if (loadGenByType.current[type] === gen) {
        setLoadingByType((prev) => ({ ...prev, [type]: false }));
        setLoadingMoreByType((prev) => ({ ...prev, [type]: false }));
      }
    }
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      if (mode === 'current') return refreshCurrent(force);
      return refreshUpcoming(force, ISSUE_TABS[tabIndex].apiType);
    },
    [mode, tabIndex, refreshCurrent, refreshUpcoming],
  );

  useEffect(() => {
    if (mode !== 'current') return;
    setLoading(true);
    setAll([]);
    void refreshCurrent();
  }, [mode, refreshCurrent]);

  useEffect(() => {
    if (mode !== 'upcoming') return;
    const type = ISSUE_TABS[tabIndex].apiType;
    if (dataByType[type] !== undefined) return;
    if (fetchStartedRef.current.has(type)) return;
    fetchStartedRef.current.add(type);
    void refreshUpcoming(false, type);
  }, [mode, tabIndex, dataByType, refreshUpcoming]);

  usePollingRefresh(
    (silent) => {
      void refreshCurrent(Boolean(silent));
    },
    undefined,
    mode === 'current',
  );

  const { refreshing, onRefresh } = usePullToRefresh(() => refresh(true));

  const onTabPress = (index: number) => {
    highlightIndexRef.current = index;
    setHighlightIndex(index);
    setActiveTabIndex(index);
    pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const pagerIndexFromOffset = (offsetX: number) =>
    Math.min(
      ISSUE_TABS.length - 1,
      Math.max(0, Math.round(offsetX / pageWidth)),
    );

  const onPagerScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = pagerIndexFromOffset(event.nativeEvent.contentOffset.x);
    if (index === highlightIndexRef.current) return;
    highlightIndexRef.current = index;
    setHighlightIndex(index);
  };

  const onPagerMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = pagerIndexFromOffset(event.nativeEvent.contentOffset.x);
    highlightIndexRef.current = index;
    setHighlightIndex(index);
    setActiveTabIndex(index);
  };

  const renderUpcomingPage = (tab: typeof ISSUE_TABS[number]) => {
    const rawData = dataByType[tab.apiType];
    const hasLoaded = rawData !== undefined;
    const pageRows = upcomingRowsForType(tab.apiType, rawData ?? []);
    const pageLoading =
      Boolean(loadingByType[tab.apiType]) || !hasLoaded;
    const pageLoadingMore = Boolean(loadingMoreByType[tab.apiType]);
    const pageUpdatedAt = updatedAtByType[tab.apiType] ?? null;
    const isActiveTab = tab.id === activeTab.id;

    if (pageLoading && pageRows.length === 0) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading issues…</Text>
        </View>
      );
    }

    return (
      <FlatList
        style={styles.listFlex}
        data={pageRows}
        keyExtractor={(item) =>
          item.managedId
            ? `m-${item.managedId}`
            : `${item.type}-${item.id}`
        }
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={11}
        removeClippedSubviews={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing && isActiveTab}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={
          pageRows.length === 0 ? styles.emptyList : styles.list
        }
        ListEmptyComponent={
          hasLoaded ? <Text style={styles.empty}>{copy.empty}</Text> : null
        }
        ListFooterComponent={
          pageLoadingMore ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.footerText}>Loading more…</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <IssueOfferingCard row={item} updatedAt={pageUpdatedAt} />
        )}
      />
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.title}>{copy.title}</Text>
          {headerRows.length ? (
            <Text style={styles.subtitle}>
              {headerRows.length}{' '}
              {headerRows.length === 1 ? 'issue' : 'issues'}
              {headerLoadingMore ? ' · loading more…' : ''}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onRefresh} hitSlop={10}>
          <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
        </Pressable>
      </View>

      {mode === 'upcoming' ? (
        <ScrollView
          horizontal
          style={styles.tabsBar}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {ISSUE_TABS.map((t, index) => {
            const active = highlightIndex === index;
            return (
              <Pressable
                key={t.id}
                style={styles.tabBtn}
                onPress={() => onTabPress(index)}
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {mode === 'current' ? (
        loading && currentRows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading issues…</Text>
          </View>
        ) : (
          <FlatList
            style={styles.listFlex}
            data={currentRows}
            keyExtractor={(item) =>
              item.managedId
                ? `m-${item.managedId}`
                : `${item.type}-${item.id}`
            }
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={11}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={
              currentRows.length === 0 ? styles.emptyList : styles.list
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
        )
      ) : (
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          directionalLockEnabled
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onPagerScroll}
          onMomentumScrollEnd={onPagerMomentumEnd}
          style={styles.pager}
        >
          {ISSUE_TABS.map((t) => (
            <View key={t.id} style={{ width: pageWidth, flex: 1 }}>
              {renderUpcomingPage(t)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    listFlex: { flex: 1 },
    pager: { flex: 1 },
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
    tabsBar: { flexGrow: 0, flexShrink: 0 },
    tabs: {
      paddingHorizontal: rs(12),
      paddingBottom: rs(4),
      gap: rs(16),
      alignItems: 'center',
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
