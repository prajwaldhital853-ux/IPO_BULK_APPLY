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
  loadPremiumIntel,
  type PremiumIntelKind,
  type PremiumIntelRow,
  type PremiumIntelSnapshot,
} from '../../services/nepse/brokerAnalytics';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

function toneColor(
  tone: 'up' | 'down' | 'neutral' | undefined,
  colors: ThemeColors,
): string {
  if (tone === 'up') return colors.accentGreen;
  if (tone === 'down') return colors.danger;
  return colors.textSecondary;
}

function MetricGrid({
  metrics,
  colors,
  styles,
}: {
  metrics: PremiumIntelRow['metrics'];
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.metricGrid}>
      {metrics.slice(0, 6).map((m) => (
        <View key={m.label} style={styles.metricCell}>
          <Text style={styles.metricLabel}>{m.label}</Text>
          <Text style={[styles.metricVal, { color: toneColor(m.tone, colors) }]}>
            {m.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PremiumIntelScreen({ kind }: { kind: PremiumIntelKind }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [snap, setSnap] = useState<PremiumIntelSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setSnap(await loadPremiumIntel(kind));
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const openRow = (item: PremiumIntelRow) => {
    if (item.symbol === 'MARKET' || item.symbol.includes(' stocks')) return;
    navigation.navigate('StockDetail', { symbol: item.symbol.split(' ')[0] });
  };

  const body = loading ? (
    <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
  ) : (
    <FlatList
      data={snap?.rows ?? []}
      keyExtractor={(item) =>
        `${item.rank}-${item.symbol}-${item.brokerCode ?? 'x'}`
      }
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
        snap ? (
          <View style={styles.hero}>
            <Text style={styles.subtitle}>{snap.subtitle}</Text>
            <View style={styles.summaryRow}>
              {snap.summary.map((s) => (
                <View key={s.label} style={styles.summaryPill}>
                  <Text style={styles.summaryVal}>{s.value}</Text>
                  <Text style={styles.summaryLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            {snap.sessionDate ? (
              <Text style={styles.meta}>
                Session {snap.sessionDate}
                {snap.brokerBreakdown ? ' · Broker breakdown live' : ' · Symbol-level proxy'}
              </Text>
            ) : null}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No ranked data for this session yet.</Text>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => openRow(item)}>
          <View style={styles.cardTop}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{item.rank}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.sym}>{item.symbol}</Text>
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
              <Text style={styles.name} numberOfLines={1}>
                {item.brokerName ?? item.name}
              </Text>
              <Text style={styles.signal}>{item.signal}</Text>
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreVal}>{item.score.toFixed(0)}</Text>
            </View>
          </View>

          {item.tags.length > 0 ? (
            <View style={styles.tags}>
              {item.tags.slice(0, 4).map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <MetricGrid metrics={item.metrics} colors={colors} styles={styles} />

          {item.brokerCode && item.symbol !== 'MARKET' ? (
            <Text style={styles.brokerLine}>
              Broker {item.brokerCode}
              {item.netAmount != null
                ? ` · Net ${fmtNum(item.netAmount, 0)}`
                : ''}
            </Text>
          ) : null}
        </Pressable>
      )}
    />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{snap?.title ?? 'Premium Intel'}</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate
        title={snap?.title ?? 'Premium Intel'}
        subtitle={snap?.subtitle ?? 'Advanced market intelligence — Premium only.'}
      >
        {body}
      </PremiumGate>
    </View>
  );
}

export function BrokerFavoritesScreen() {
  return <PremiumIntelScreen kind="broker-favorites" />;
}

export { BrokerTopBuySellScreen } from './BrokerTopBuySellScreen';

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
    list: { paddingHorizontal: rs(16), paddingBottom: rs(28) },
    hero: {
      marginBottom: rs(14),
      padding: rs(14),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginBottom: rs(12),
    },
    summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8) },
    summaryPill: {
      flex: 1,
      minWidth: '28%',
      padding: rs(8),
      borderRadius: rs(10),
      backgroundColor: c.bgElevated,
    },
    summaryVal: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    summaryLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    meta: { color: c.textMuted, fontSize: rs(10), marginTop: rs(10) },
    empty: {
      textAlign: 'center',
      color: c.textSecondary,
      marginTop: rs(40),
    },
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
      backgroundColor: c.tealHeader,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: { color: '#041018', fontWeight: '900', fontSize: rs(12) },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    chg: { fontWeight: '700', fontSize: rs(11) },
    name: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(2) },
    signal: { color: c.tealHeader, fontSize: rs(10), marginTop: rs(4) },
    scoreBox: { alignItems: 'flex-end' },
    scoreLabel: { color: c.textMuted, fontSize: rs(9) },
    scoreVal: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6), marginTop: rs(10) },
    tag: {
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
      borderRadius: rs(99),
      backgroundColor: c.bgElevated,
    },
    tagText: { color: c.textSecondary, fontSize: rs(9), fontWeight: '600' },
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
    brokerLine: { color: c.textMuted, fontSize: rs(10), marginTop: rs(8) },
  });
}
