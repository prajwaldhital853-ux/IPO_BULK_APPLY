import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
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
  loadAnnouncements,
  loadProposedDividends,
  type AnnouncementRow,
  type DividendRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type TabId = 'dividend' | 'news' | 'proposed';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dividend', label: 'Dividend/Right' },
  { id: 'news', label: 'Announcements' },
  { id: 'proposed', label: 'Proposed Dividends' },
];

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '0';
  return n.toLocaleString('en-NP', { maximumFractionDigits: 4 });
}

export function AnnouncementsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<TabId>('dividend');
  const [dividends, setDividends] = useState<DividendRow[]>([]);
  const [news, setNews] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [divs, ann] = await Promise.all([
        loadProposedDividends(1, 200),
        loadAnnouncements(1, 80),
      ]);
      setDividends(divs);
      setNews(ann);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const proposed = useMemo(
    () => dividends.filter((d) => /notannounced|proposed/i.test(d.status)),
    [dividends],
  );

  const showDivs = tab === 'proposed' ? proposed : dividends;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Announcements</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tab === 'news' ? (
        <FlatList
          data={news}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listBody}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.newsTitle}>{item.title}</Text>
              {item.details ? (
                <Text style={styles.newsBody} numberOfLines={3}>
                  {item.details}
                </Text>
              ) : null}
              <View style={styles.newsMeta}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {item.category || item.type || 'Notice'}
                  </Text>
                </View>
                <Text style={styles.metaDate}>{item.date}</Text>
                {item.attachmentUrl ? (
                  <Pressable
                    onPress={() => void Linking.openURL(item.attachmentUrl!)}
                    hitSlop={8}
                    style={styles.pdfBtn}
                  >
                    <Ionicons
                      name="document-attach-outline"
                      size={rs(14)}
                      color={colors.primary}
                    />
                    <Text style={styles.pdfText}>File</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No announcements.</Text>
          }
        />
      ) : (
        <FlatList
          data={showDivs}
          keyExtractor={(item) => `${item.id}-${item.symbol}`}
          contentContainerStyle={styles.listBody}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.divName}>
                {item.name} ({item.symbol})
              </Text>
              <View style={styles.divRow}>
                <Text style={styles.divCol}>
                  Bonus : <Text style={styles.divBonus}>{fmtPct(item.bonus)}%</Text>
                </Text>
                <Text style={styles.divCol}>
                  Cash : <Text style={styles.divCash}>{fmtPct(item.cash)}%</Text>
                </Text>
              </View>
              <View style={styles.divRow}>
                <Text style={styles.divCol}>
                  Total Dividend :{' '}
                  <Text style={styles.divTotal}>{fmtPct(item.total)}%</Text>
                </Text>
                <Text style={styles.divCol}>
                  Book Close :{' '}
                  <Text style={styles.divClose}>
                    {item.bookClose ?? 'N/A'}
                  </Text>
                </Text>
              </View>
              {item.fiscalYear ? (
                <Text style={styles.fiscal}>Fiscal Year : {item.fiscalYear}</Text>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No dividends.</Text>
          }
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
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: rs(10),
      paddingVertical: rs(8),
      gap: rs(8),
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: rs(8),
      borderRadius: rs(9),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    tabActive: { backgroundColor: c.accentGreen, borderColor: c.accentGreen },
    tabText: { color: c.textSecondary, fontSize: rs(11), fontWeight: '700' },
    tabTextActive: { color: '#FFF' },
    listBody: { paddingHorizontal: rs(12), paddingBottom: rs(24) },
    card: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(12),
      marginBottom: rs(10),
    },
    newsTitle: { color: c.text, fontSize: rs(13), fontWeight: '800' },
    newsBody: {
      color: c.textSecondary,
      fontSize: rs(11),
      lineHeight: rs(16),
      marginTop: rs(6),
    },
    newsMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginTop: rs(10),
    },
    chip: {
      backgroundColor: c.primarySoft,
      borderRadius: rs(6),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
    },
    chipText: { color: c.primary, fontSize: rs(9), fontWeight: '700' },
    metaDate: { color: c.textMuted, fontSize: rs(10), flex: 1 },
    pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
    pdfText: { color: c.primary, fontSize: rs(11), fontWeight: '700' },
    divName: {
      color: c.accentGreen,
      fontSize: rs(13),
      fontWeight: '800',
      marginBottom: rs(8),
    },
    divRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: rs(6),
    },
    divCol: { color: c.textMuted, fontSize: rs(11), flex: 1 },
    divBonus: { color: c.text, fontWeight: '700' },
    divCash: { color: c.text, fontWeight: '700' },
    divTotal: { color: c.accentGreen, fontWeight: '800' },
    divClose: { color: c.text, fontWeight: '700' },
    fiscal: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
    },
  });
}
