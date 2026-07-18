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
  isOfferingCurrent,
  isOfferingUpcoming,
  loadPublicOfferingsByType,
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
    empty: 'No issues are open for application right now in this category.',
  },
  upcoming: {
    title: 'Upcoming Issues',
    empty: 'No upcoming issues in this category.',
  },
};

export function IpoIssuesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'IpoIssues'>>();
  const mode: Mode = route.params?.mode ?? 'upcoming';
  const copy = COPY[mode];
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<IssueTab>(ISSUE_TABS[0]);
  const [all, setAll] = useState<PublicOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filter = mode === 'current' ? isOfferingCurrent : isOfferingUpcoming;
    return all.filter((row) => filter(row));
  }, [all, mode]);

  const refresh = useCallback(
    async (force = false) => {
      setError(null);
      try {
        const list = await loadPublicOfferingsByType(tab.apiType, force);
        setAll(list);
        if (!list.length) {
          setError('ShareHub returned no issues for this category.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load issues');
        setAll([]);
      } finally {
        setLoading(false);
      }
    },
    [tab.apiType],
  );

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  usePollingRefresh((silent) => refresh(Boolean(silent)));

  const onTabChange = (next: IssueTab) => {
    setTab(next);
    setLoading(true);
    setAll([]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{copy.title}</Text>
        <Pressable onPress={() => void refresh(true)} hitSlop={10}>
          <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
        </Pressable>
      </View>

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
              onPress={() => onTabChange(t)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
              {active ? <View style={styles.tabLine} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {error && !loading ? <Text style={styles.error}>{error}</Text> : null}

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading {tab.label}…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => `${tab.id}-${item.id}`}
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
          ListEmptyComponent={
            <Text style={styles.empty}>{copy.empty}</Text>
          }
          renderItem={({ item }) => <IssueOfferingCard row={item} />}
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
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
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
    list: { paddingHorizontal: rs(16), paddingBottom: rs(24) },
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
