import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  isOfferingClosed,
  isOfferingCurrent,
  isOfferingNonCurrent,
  isOfferingUpcoming,
  loadAllPublicOfferings,
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
    // Upcoming: soonest first; Closed: newest first.
    return ra === 0 ? at - bt : bt - at;
  });
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<IssueTab>(ISSUE_TABS[0]);

  const rows = useMemo(() => {
    if (mode === 'current') {
      return all.filter((row) => isOfferingCurrent(row));
    }
    const scoped = all.filter(
      (row) =>
        isOfferingNonCurrent(row) && String(row.type) === tab.apiType,
    );
    return sortUpcomingList(scoped);
  }, [all, mode, tab.apiType]);

  const refresh = useCallback(async (force = false) => {
    setError(null);
    try {
      const list = await loadAllPublicOfferings(force);
      setAll(list);
      setUpdatedAt(Date.now());
      if (!list.length) {
        setError('No issues available right now.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load issues');
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  usePollingRefresh((silent) => refresh(Boolean(silent)));

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
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => void refresh(true)} hitSlop={10}>
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
          renderItem={({ item }) => (
            <IssueOfferingCard row={item} updatedAt={updatedAt} />
          )}
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
  });
}
