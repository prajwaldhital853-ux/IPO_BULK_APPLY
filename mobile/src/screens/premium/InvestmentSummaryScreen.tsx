import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  formatRs,
  loadInvestmentSummary,
  type InvestmentSummary,
} from '../../services/nepse/premiumAnalytics';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

export function InvestmentSummaryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<InvestmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setData(await loadInvestmentSummary());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const emptyMessage =
    !data || data.portfolios === 0
      ? 'Investment Summary reads portfolios saved on this device. It does not auto-sync from MeroShare — import or add holdings first.'
      : data.holdings === 0
        ? `You have ${data.portfolios} portfolio${data.portfolios === 1 ? '' : 's'} saved, but no holdings yet. Import from MeroShare or add stocks manually.`
        : '';

  const body = loading ? (
    <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
  ) : !data || data.holdings === 0 ? (
    <View style={styles.emptyWrap}>
      <Ionicons name="pie-chart-outline" size={rs(48)} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No holdings to analyze</Text>
      <Text style={styles.empty}>{emptyMessage}</Text>
      <Pressable
        style={styles.emptyBtnPrimary}
        onPress={() => navigation.navigate('BulkPortfolio')}
      >
        <Ionicons name="cloud-download-outline" size={rs(18)} color="#041018" />
        <Text style={styles.emptyBtnPrimaryText}>Import from MeroShare</Text>
      </Pressable>
      <Pressable
        style={styles.emptyBtnGhost}
        onPress={() => navigation.navigate('Portfolio')}
      >
        <Text style={styles.emptyBtnGhostText}>Manage portfolios</Text>
      </Pressable>
    </View>
  ) : (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.scroll}
    >
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Portfolio value</Text>
        <Text style={styles.heroVal}>{formatRs(data.currentValue)}</Text>
        <Text
          style={[
            styles.pl,
            { color: data.pl >= 0 ? colors.accentGreen : colors.danger },
          ]}
        >
          {data.pl >= 0 ? '+' : ''}
          {formatRs(data.pl)}
          {data.plPct != null ? ` (${data.plPct.toFixed(2)}%)` : ''}
        </Text>
      </View>

      <View style={styles.rowCards}>
        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Invested</Text>
          <Text style={styles.miniVal}>{formatRs(data.invested)}</Text>
        </View>
        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Holdings</Text>
          <Text style={styles.miniVal}>{data.holdings}</Text>
        </View>
        <View style={styles.miniCard}>
          <Text style={styles.miniLabel}>Portfolios</Text>
          <Text style={styles.miniVal}>{data.portfolios}</Text>
        </View>
      </View>

      <Text style={styles.section}>Top gainers</Text>
      {data.topGainers.map((r) => (
        <Pressable
          key={r.symbol}
          style={styles.line}
          onPress={() => navigation.navigate('StockDetail', { symbol: r.symbol })}
        >
          <Text style={styles.sym}>{r.symbol}</Text>
          <Text style={[styles.lineVal, { color: colors.accentGreen }]}>
            +{formatRs(r.pl)} ({r.plPct.toFixed(1)}%)
          </Text>
        </Pressable>
      ))}

      <Text style={styles.section}>Top losers</Text>
      {data.topLosers.map((r) => (
        <Pressable
          key={`l-${r.symbol}`}
          style={styles.line}
          onPress={() => navigation.navigate('StockDetail', { symbol: r.symbol })}
        >
          <Text style={styles.sym}>{r.symbol}</Text>
          <Text style={[styles.lineVal, { color: colors.danger }]}>
            {formatRs(r.pl)} ({r.plPct.toFixed(1)}%)
          </Text>
        </Pressable>
      ))}

      <Text style={styles.section}>Sector allocation</Text>
      {data.sectors.map((s) => (
        <View key={s.sector} style={styles.sectorRow}>
          <Text style={styles.sectorName}>{s.sector}</Text>
          <Text style={styles.sectorPct}>{s.pct.toFixed(1)}%</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, s.pct)}%` }]} />
          </View>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Investment Summary</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate title="Investment Summary" subtitle="Portfolio P/L, sector mix, and top movers — Premium only.">
        {body}
      </PremiumGate>
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
    scroll: { padding: rs(16), paddingBottom: rs(32) },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(28),
      paddingBottom: rs(40),
    },
    emptyTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginTop: rs(14),
      marginBottom: rs(8),
    },
    empty: {
      textAlign: 'center',
      color: c.textSecondary,
      paddingHorizontal: rs(8),
      lineHeight: rs(20),
      fontSize: rs(13),
    },
    emptyBtnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginTop: rs(24),
      paddingVertical: rs(14),
      paddingHorizontal: rs(20),
      borderRadius: rs(12),
      backgroundColor: c.primary,
    },
    emptyBtnPrimaryText: {
      color: '#041018',
      fontWeight: '800',
      fontSize: rs(14),
    },
    emptyBtnGhost: {
      marginTop: rs(12),
      paddingVertical: rs(12),
      paddingHorizontal: rs(16),
    },
    emptyBtnGhostText: {
      color: c.primary,
      fontWeight: '700',
      fontSize: rs(13),
    },
    hero: {
      alignItems: 'center',
      marginBottom: rs(16),
      padding: rs(16),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    heroLabel: { color: c.textMuted, fontSize: rs(12) },
    heroVal: { color: c.text, fontWeight: '800', fontSize: rs(28), marginTop: rs(4) },
    pl: { fontWeight: '700', fontSize: rs(14), marginTop: rs(6) },
    rowCards: { flexDirection: 'row', gap: rs(8), marginBottom: rs(16) },
    miniCard: {
      flex: 1,
      padding: rs(10),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    miniLabel: { color: c.textMuted, fontSize: rs(10) },
    miniVal: { color: c.text, fontWeight: '800', fontSize: rs(13), marginTop: rs(4) },
    section: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginTop: rs(12),
      marginBottom: rs(8),
    },
    line: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    sym: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    lineVal: { fontWeight: '700', fontSize: rs(12) },
    sectorRow: { marginBottom: rs(10) },
    sectorName: { color: c.textSecondary, fontSize: rs(12) },
    sectorPct: { color: c.text, fontWeight: '700', fontSize: rs(11) },
    barTrack: {
      height: rs(6),
      backgroundColor: c.bgElevated,
      borderRadius: rs(4),
      marginTop: rs(4),
      overflow: 'hidden',
    },
    barFill: { height: '100%', backgroundColor: c.tealHeader },
  });
}
