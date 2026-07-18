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
  loadFinancialNews,
  type AnnouncementRow,
} from '../services/nepse/screener';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

export function FinancialNewsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setRows(await loadFinancialNews(1, 80));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Financial News</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <Text style={styles.subtitle}>
        NEPSE news, alerts and market updates from the official feed.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listBody}
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
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => {
                if (item.symbol) {
                  navigation.navigate('StockDetail', { symbol: item.symbol });
                }
              }}
            >
              <Text style={styles.newsTitle}>{item.title}</Text>
              {item.details ? (
                <Text style={styles.newsBody} numberOfLines={4}>
                  {item.details}
                </Text>
              ) : null}
              <View style={styles.newsMeta}>
                {item.symbol ? (
                  <View style={styles.symChip}>
                    <Text style={styles.symChipText}>{item.symbol}</Text>
                  </View>
                ) : null}
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {item.category || item.type || 'News'}
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
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No financial news right now.</Text>
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
    },
    title: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      paddingHorizontal: rs(16),
      paddingBottom: rs(8),
    },
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
      flexWrap: 'wrap',
      gap: rs(8),
      marginTop: rs(10),
    },
    symChip: {
      backgroundColor: c.surfaceAlt,
      borderRadius: rs(6),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
    },
    symChipText: { color: c.text, fontSize: rs(9), fontWeight: '800' },
    chip: {
      backgroundColor: c.primarySoft,
      borderRadius: rs(6),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
    },
    chipText: { color: c.primary, fontSize: rs(9), fontWeight: '700' },
    metaDate: { color: c.textMuted, fontSize: rs(10) },
    pdfBtn: { marginLeft: 'auto' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
    },
  });
}
