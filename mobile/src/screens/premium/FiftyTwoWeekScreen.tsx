import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  fmtNum,
  loadFiftyTwoWeekRows,
  type FiftyTwoWeekRow,
} from '../../services/nepse/brokerAnalytics';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

export type FiftyTwoWeekMode = 'high' | 'low';

const COPY: Record<FiftyTwoWeekMode, { title: string; subtitle: string }> = {
  high: {
    title: '52 Week High',
    subtitle:
      'Stocks closest to their 52-week high — breakout momentum, range position, turnover and market cap.',
  },
  low: {
    title: '52 Week Low',
    subtitle:
      'Stocks closest to their 52-week low — weakness, support tests, and recovery potential.',
  },
};

export function FiftyTwoWeekScreen({ mode }: { mode: FiftyTwoWeekMode }) {
  const copy = COPY[mode];
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors, mode), [colors, mode]);
  const [rows, setRows] = useState<FiftyTwoWeekRow[]>([]);
  const [summary, setSummary] = useState<Array<{ label: string; value: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await loadFiftyTwoWeekRows(mode);
    setRows(res.rows);
    setSummary(res.summary);
    setLoading(false);
  }, [mode]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const body = loading ? (
    <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
  ) : (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.symbol}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons
              name={mode === 'high' ? 'arrow-up' : 'arrow-down'}
              size={rs(22)}
              color={mode === 'high' ? colors.accentGreen : colors.danger}
            />
          </View>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
          <View style={styles.summaryRow}>
            {summary.map((s) => (
              <View key={s.label} style={styles.summaryPill}>
                <Text style={styles.summaryVal}>{s.value}</Text>
                <Text style={styles.summaryLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const dist =
          mode === 'high' ? item.pctFromHigh : item.pctFromLow;
        const barPct =
          mode === 'high'
            ? Math.max(0, Math.min(100, 100 + (item.pctFromHigh ?? -100)))
            : Math.max(0, Math.min(100, 100 - (item.pctFromLow ?? 100)));

        return (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol })}
          >
            <View style={styles.cardTop}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{item.rank}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sym}>{item.symbol}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.sector ? (
                  <Text style={styles.sector}>{item.sector}</Text>
                ) : null}
              </View>
              <View style={styles.ltpBox}>
                <Text style={styles.ltp}>{item.ltp != null ? fmtNum(item.ltp) : '—'}</Text>
                {item.changePct != null ? (
                  <Text
                    style={[
                      styles.chg,
                      {
                        color:
                          item.changePct >= 0 ? colors.accentGreen : colors.danger,
                      },
                    ]}
                  >
                    {item.changePct >= 0 ? '+' : ''}
                    {item.changePct.toFixed(2)}%
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.rangeTrack}>
              <View style={[styles.rangeFill, { width: `${barPct}%` }]} />
            </View>
            <View style={styles.rangeLabels}>
              <Text style={styles.rangeLow}>
                {item.low52 != null ? fmtNum(item.low52) : '—'}
              </Text>
              <Text style={styles.rangeDist}>
                {dist != null
                  ? `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}% from 52W ${mode}`
                  : '—'}
              </Text>
              <Text style={styles.rangeHigh}>
                {item.high52 != null ? fmtNum(item.high52) : '—'}
              </Text>
            </View>

            <Text style={styles.signal}>{item.signal}</Text>

            <View style={styles.metricGrid}>
              {item.metrics.map((m) => (
                <View key={m.label} style={styles.metricCell}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <Text style={styles.metricVal}>{m.value}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        );
      }}
    />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{copy.title}</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate title={copy.title} subtitle={copy.subtitle}>
        {body}
      </PremiumGate>
    </View>
  );
}

export function FiftyTwoWeekHighScreen() {
  return <FiftyTwoWeekScreen mode="high" />;
}

export function FiftyTwoWeekLowScreen() {
  return <FiftyTwoWeekScreen mode="low" />;
}

function makeStyles(c: ThemeColors, mode: FiftyTwoWeekMode) {
  const accent = mode === 'high' ? c.accentGreen : c.danger;
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
    list: { paddingHorizontal: rs(16), paddingBottom: rs(28) },
    hero: {
      marginBottom: rs(14),
      padding: rs(14),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    heroIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(12),
      backgroundColor: c.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(10),
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginBottom: rs(12),
    },
    summaryRow: { flexDirection: 'row', gap: rs(8) },
    summaryPill: {
      flex: 1,
      padding: rs(8),
      borderRadius: rs(10),
      backgroundColor: c.bgElevated,
    },
    summaryVal: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    summaryLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    card: {
      marginBottom: rs(10),
      padding: rs(12),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    cardTop: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start' },
    rankBadge: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(8),
      backgroundColor: accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: { color: '#041018', fontWeight: '900', fontSize: rs(12) },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    name: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(2) },
    sector: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    ltpBox: { alignItems: 'flex-end' },
    ltp: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    chg: { fontWeight: '700', fontSize: rs(11), marginTop: rs(2) },
    rangeTrack: {
      height: rs(6),
      backgroundColor: c.bgElevated,
      borderRadius: rs(4),
      marginTop: rs(12),
      overflow: 'hidden',
    },
    rangeFill: { height: '100%', backgroundColor: accent },
    rangeLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: rs(6),
    },
    rangeLow: { color: c.textMuted, fontSize: rs(9) },
    rangeDist: { color: c.text, fontWeight: '700', fontSize: rs(10) },
    rangeHigh: { color: c.textMuted, fontSize: rs(9) },
    signal: { color: c.tealHeader, fontSize: rs(10), marginTop: rs(8) },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: rs(10),
      gap: rs(6),
    },
    metricCell: {
      width: '31%',
      padding: rs(6),
      borderRadius: rs(8),
      backgroundColor: c.bgElevated,
    },
    metricLabel: { color: c.textMuted, fontSize: rs(9) },
    metricVal: { color: c.text, fontWeight: '700', fontSize: rs(11), marginTop: rs(2) },
  });
}
