import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumGate } from '../../components/PremiumGate';
import { SwipeTabGesture } from '../../components/SwipeTabGesture';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  formatRs,
  loadInvestmentSummary,
  type HoldingWeight,
  type InvestmentSummary,
  type PortfolioInsight,
} from '../../services/nepse/premiumAnalytics';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TabId = 'overview' | 'holdings' | 'sectors' | 'insights';

const TABS: Array<{ id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'overview', label: 'Overview', icon: 'grid-outline' },
  { id: 'holdings', label: 'Holdings', icon: 'layers-outline' },
  { id: 'sectors', label: 'Sectors', icon: 'pie-chart-outline' },
  { id: 'insights', label: 'Insights', icon: 'bulb-outline' },
];

const SECTOR_COLORS = [
  '#1A5F5A',
  '#2E9E5B',
  '#E8A838',
  '#E5484D',
  '#4C7BE8',
  '#8B5CF6',
  '#0D9488',
  '#F97316',
  '#64748B',
  '#DB2777',
];

function animateSoft() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

function toneColor(
  tone: PortfolioInsight['tone'],
  c: ThemeColors,
): string {
  if (tone === 'good') return c.accentGreen;
  if (tone === 'bad') return c.danger;
  if (tone === 'warn') return '#E8A838';
  return c.tealHeader;
}

function fmtPct(n: number | null | undefined, signed = true): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = signed && n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

function StackedBar({
  parts,
  height = 14,
}: {
  parts: Array<{ pct: number; color: string }>;
  height?: number;
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.pct), 0) || 1;
  return (
    <View style={[stylesShared.stackTrack, { height: rs(height) }]}>
      {parts.map((p, i) => {
        const w = (Math.max(0, p.pct) / total) * 100;
        if (w <= 0) return null;
        return (
          <View
            key={i}
            style={{
              width: `${w}%`,
              height: '100%',
              backgroundColor: p.color,
            }}
          />
        );
      })}
    </View>
  );
}

function WeightBars({
  rows,
  colors,
  onPress,
  mode,
}: {
  rows: HoldingWeight[];
  colors: ThemeColors;
  onPress: (symbol: string) => void;
  mode: 'weight' | 'pl';
}) {
  const max = Math.max(
    ...rows.map((r) => (mode === 'weight' ? r.pct : Math.abs(r.pl))),
    1,
  );
  return (
    <View style={{ gap: rs(10) }}>
      {rows.map((r, i) => {
        const raw = mode === 'weight' ? r.pct : Math.abs(r.pl);
        const w = Math.max(6, (raw / max) * 100);
        const barColor =
          mode === 'weight'
            ? SECTOR_COLORS[i % SECTOR_COLORS.length]!
            : r.pl >= 0
              ? colors.accentGreen
              : colors.danger;
        return (
          <Pressable
            key={r.symbol}
            onPress={() => onPress(r.symbol)}
            style={stylesShared.weightRow}
          >
            <View style={stylesShared.weightHead}>
              <Text style={[stylesShared.weightSym, { color: colors.text }]}>
                {r.symbol}
              </Text>
              <Text style={[stylesShared.weightMeta, { color: colors.textSecondary }]}>
                {mode === 'weight'
                  ? `${r.pct.toFixed(1)}% · ${formatRs(r.value)}`
                  : `${r.pl >= 0 ? '+' : ''}${formatRs(r.pl)} (${fmtPct(r.plPct)})`}
              </Text>
            </View>
            <View style={[stylesShared.weightTrack, { backgroundColor: colors.bgElevated }]}>
              <View
                style={{
                  width: `${Math.min(100, w)}%`,
                  height: '100%',
                  backgroundColor: barColor,
                  borderRadius: rs(4),
                }}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function WinLossMeter({
  winners,
  losers,
  flat,
  colors,
}: {
  winners: number;
  losers: number;
  flat: number;
  colors: ThemeColors;
}) {
  const total = Math.max(winners + losers + flat, 1);
  return (
    <View>
      <StackedBar
        height={12}
        parts={[
          { pct: (winners / total) * 100, color: colors.accentGreen },
          { pct: (flat / total) * 100, color: colors.textMuted },
          { pct: (losers / total) * 100, color: colors.danger },
        ]}
      />
      <View style={stylesShared.meterLegend}>
        <Text style={{ color: colors.accentGreen, fontWeight: '700', fontSize: rs(11) }}>
          {winners} up
        </Text>
        <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: rs(11) }}>
          {flat} flat
        </Text>
        <Text style={{ color: colors.danger, fontWeight: '700', fontSize: rs(11) }}>
          {losers} down
        </Text>
      </View>
    </View>
  );
}

function DiversityRing({
  score,
  colors,
}: {
  score: number;
  colors: ThemeColors;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 70 ? colors.accentGreen : clamped >= 40 ? '#E8A838' : colors.danger;
  return (
    <View style={stylesShared.ringWrap}>
      <View
        style={[
          stylesShared.ringOuter,
          {
            borderColor: color,
            borderTopColor: colors.bgElevated,
            borderRightColor: clamped > 25 ? color : colors.bgElevated,
            borderBottomColor: clamped > 50 ? color : colors.bgElevated,
            borderLeftColor: clamped > 75 ? color : colors.bgElevated,
          },
        ]}
      >
        <View style={[stylesShared.ringInner, { backgroundColor: colors.surface }]}>
          <Text style={[stylesShared.ringScore, { color }]}>{clamped}</Text>
          <Text style={[stylesShared.ringLabel, { color: colors.textMuted }]}>
            Diversity
          </Text>
        </View>
      </View>
    </View>
  );
}

const stylesShared = StyleSheet.create({
  stackTrack: {
    flexDirection: 'row',
    borderRadius: rs(8),
    overflow: 'hidden',
    width: '100%',
  },
  weightRow: { gap: rs(4) },
  weightHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weightSym: { fontWeight: '800', fontSize: rs(12) },
  weightMeta: { fontSize: rs(10), fontWeight: '600' },
  weightTrack: {
    height: rs(8),
    borderRadius: rs(4),
    overflow: 'hidden',
  },
  meterLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: rs(8),
  },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    width: rs(88),
    height: rs(88),
    borderRadius: rs(44),
    borderWidth: rs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: rs(64),
    height: rs(64),
    borderRadius: rs(32),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringScore: { fontWeight: '900', fontSize: rs(20) },
  ringLabel: { fontSize: rs(9), fontWeight: '700', marginTop: rs(1) },
});

export function InvestmentSummaryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [data, setData] = useState<InvestmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [holdingMode, setHoldingMode] = useState<'weight' | 'pl'>('weight');

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const next = await loadInvestmentSummary();
    setData(next);
    setSelectedSector((prev) => prev ?? next.sectors[0]?.sector ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const openStock = (symbol: string) => {
    navigation.navigate('StockDetail', { symbol });
  };

  const switchTab = (id: TabId) => {
    animateSoft();
    setTab(id);
  };

  const tabIndex = Math.max(0, TABS.findIndex((t) => t.id === tab));

  const activeSector =
    data?.sectors.find((s) => s.sector === selectedSector) ?? data?.sectors[0];

  const body = loading ? (
    <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
  ) : !data || data.holdings === 0 ? (
    <View style={styles.emptyWrap}>
      <Ionicons name="pie-chart-outline" size={rs(48)} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No holdings to analyze</Text>
      <Text style={styles.empty}>
        Run Bulk Portfolio Check or import holdings so this page can show live
        value, P/L, allocation and insights.
      </Text>
      <Pressable
        style={styles.emptyBtnPrimary}
        onPress={() => navigation.navigate('BulkPortfolio')}
      >
        <Ionicons name="cloud-download-outline" size={rs(18)} color="#041018" />
        <Text style={styles.emptyBtnPrimaryText}>Bulk Portfolio Check</Text>
      </Pressable>
      <Pressable
        style={styles.emptyBtnGhost}
        onPress={() => navigation.navigate('Portfolio')}
      >
        <Text style={styles.emptyBtnGhostText}>Share Portfolio</Text>
      </Pressable>
    </View>
  ) : (
    <SwipeTabGesture
      index={tabIndex}
      count={TABS.length}
      onIndexChange={(i) => {
        const next = TABS[i];
        if (next) switchTab(next.id);
      }}
    >
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
          tintColor={colors.tealHeader}
        />
      }
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>Total portfolio value</Text>
            <Text style={styles.heroVal}>{formatRs(data.currentValue)}</Text>
          </View>
          <View style={styles.sourcePill}>
            <View
              style={[
                styles.sourceDot,
                {
                  backgroundColor:
                    data.valueSource === 'bulk' ? colors.accentGreen : '#E8A838',
                },
              ]}
            />
            <Text style={styles.sourceText}>
              {data.valueSource === 'bulk' ? 'Live bulk' : 'Saved'}
            </Text>
          </View>
        </View>

        <View style={styles.heroPlRow}>
          <View style={styles.heroPlBlock}>
            <Text style={styles.heroPlLabel}>Unrealized P/L</Text>
            <Text
              style={[
                styles.heroPlVal,
                { color: data.pl >= 0 ? colors.accentGreen : colors.danger },
              ]}
            >
              {data.pl >= 0 ? '+' : ''}
              {formatRs(data.pl)}
            </Text>
            <Text
              style={[
                styles.heroPlPct,
                { color: data.pl >= 0 ? colors.accentGreen : colors.danger },
              ]}
            >
              {fmtPct(data.plPct)}
            </Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroPlBlock}>
            <Text style={styles.heroPlLabel}>Today</Text>
            <Text
              style={[
                styles.heroPlVal,
                {
                  color:
                    (data.dayChange ?? 0) >= 0
                      ? colors.accentGreen
                      : colors.danger,
                },
              ]}
            >
              {data.dayChange == null
                ? '—'
                : `${data.dayChange >= 0 ? '+' : ''}${formatRs(data.dayChange)}`}
            </Text>
            <Text
              style={[
                styles.heroPlPct,
                {
                  color:
                    (data.dayChangePct ?? 0) >= 0
                      ? colors.accentGreen
                      : colors.danger,
                },
              ]}
            >
              {fmtPct(data.dayChangePct)}
            </Text>
          </View>
        </View>

        <WinLossMeter
          winners={data.winners}
          losers={data.losers}
          flat={data.flat}
          colors={colors}
        />
      </View>

      {/* KPI boxes */}
      <View style={styles.kpiGrid}>
        {[
          { label: 'Invested', value: formatRs(data.invested), icon: 'wallet-outline' as const },
          {
            label: 'Symbols',
            value: String(data.uniqueSymbols),
            icon: 'pricetag-outline' as const,
          },
          {
            label: 'Accounts',
            value: String(data.accounts.length || data.portfolios),
            icon: 'people-outline' as const,
          },
          {
            label: 'Top 3 wt',
            value: `${data.top3ConcentrationPct.toFixed(0)}%`,
            icon: 'funnel-outline' as const,
          },
        ].map((k) => (
          <View key={k.label} style={styles.kpiCard}>
            <Ionicons name={k.icon} size={rs(14)} color={colors.tealHeader} />
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={styles.kpiVal}>{k.value}</Text>
          </View>
        ))}
      </View>

      {/* Tabs — swipe content left/right to change */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => switchTab(t.id)}
            >
              <Ionicons
                name={t.icon}
                size={rs(14)}
                color={on ? '#FFF' : colors.textSecondary}
              />
              <Text style={[styles.tabText, on && styles.tabTextOn]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'overview' ? (
        <View style={styles.sectionBlock}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Health snapshot</Text>
              <Text style={styles.cardHint}>Tap Insights for tips</Text>
            </View>
            <View style={styles.healthRow}>
              <DiversityRing score={data.diversityScore} colors={colors} />
              <View style={styles.healthStats}>
                <View style={styles.statLine}>
                  <Text style={styles.statLabel}>Largest name</Text>
                  <Pressable
                    onPress={() =>
                      data.largestHolding &&
                      openStock(data.largestHolding.symbol)
                    }
                  >
                    <Text style={styles.statValLink}>
                      {data.largestHolding
                        ? `${data.largestHolding.symbol} · ${data.largestHolding.pct.toFixed(1)}%`
                        : '—'}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.statLine}>
                  <Text style={styles.statLabel}>Top sector</Text>
                  <Text style={styles.statVal}>
                    {data.sectors[0]
                      ? `${data.sectors[0].sector} · ${data.sectors[0].pct.toFixed(0)}%`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.statLine}>
                  <Text style={styles.statLabel}>Win rate</Text>
                  <Text style={styles.statVal}>
                    {data.uniqueSymbols
                      ? `${((data.winners / data.uniqueSymbols) * 100).toFixed(0)}% names in profit`
                      : '—'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Sector mix</Text>
              <Pressable onPress={() => switchTab('sectors')}>
                <Text style={styles.link}>Full chart</Text>
              </Pressable>
            </View>
            <StackedBar
              height={16}
              parts={data.sectors.map((s, i) => ({
                pct: s.pct,
                color: SECTOR_COLORS[i % SECTOR_COLORS.length]!,
              }))}
            />
            <View style={styles.chipRow}>
              {data.sectors.slice(0, 5).map((s, i) => (
                <Pressable
                  key={s.sector}
                  style={styles.chip}
                  onPress={() => {
                    setSelectedSector(s.sector);
                    switchTab('sectors');
                  }}
                >
                  <View
                    style={[
                      styles.chipDot,
                      { backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] },
                    ]}
                  />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {s.sector} {s.pct.toFixed(0)}%
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.cardTitle}>Top gainers</Text>
              {data.topGainers.length === 0 ? (
                <Text style={styles.muted}>No gainers yet</Text>
              ) : (
                data.topGainers.slice(0, 4).map((r) => (
                  <Pressable
                    key={r.symbol}
                    style={styles.moverLine}
                    onPress={() => openStock(r.symbol)}
                  >
                    <Text style={styles.moverSym}>{r.symbol}</Text>
                    <Text style={[styles.moverVal, { color: colors.accentGreen }]}>
                      +{formatRs(r.pl)}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.cardTitle}>Top losers</Text>
              {data.topLosers.length === 0 ? (
                <Text style={styles.muted}>No losers</Text>
              ) : (
                data.topLosers.slice(0, 4).map((r) => (
                  <Pressable
                    key={`l-${r.symbol}`}
                    style={styles.moverLine}
                    onPress={() => openStock(r.symbol)}
                  >
                    <Text style={styles.moverSym}>{r.symbol}</Text>
                    <Text style={[styles.moverVal, { color: colors.danger }]}>
                      {formatRs(r.pl)}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>

          {data.accounts.length > 1 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>By account</Text>
              <StackedBar
                height={12}
                parts={data.accounts.map((a, i) => ({
                  pct: a.pct,
                  color: SECTOR_COLORS[i % SECTOR_COLORS.length]!,
                }))}
              />
              {data.accounts.map((a, i) => (
                <View key={a.accountId} style={styles.accountRow}>
                  <View style={styles.accountLeft}>
                    <View
                      style={[
                        styles.chipDot,
                        {
                          backgroundColor:
                            SECTOR_COLORS[i % SECTOR_COLORS.length],
                        },
                      ]}
                    />
                    <View>
                      <Text style={styles.accountName} numberOfLines={1}>
                        {a.accountName}
                      </Text>
                      <Text style={styles.accountMeta}>
                        {a.holdings} holdings · {a.pct.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.accountVal}>{formatRs(a.value)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.quickRow}>
            <Pressable
              style={styles.quickBtn}
              onPress={() => navigation.navigate('BulkPortfolio')}
            >
              <Ionicons name="refresh" size={rs(16)} color={colors.tealHeader} />
              <Text style={styles.quickText}>Refresh bulk</Text>
            </Pressable>
            <Pressable
              style={styles.quickBtn}
              onPress={() => navigation.navigate('Portfolio')}
            >
              <Ionicons name="folder-outline" size={rs(16)} color={colors.tealHeader} />
              <Text style={styles.quickText}>Portfolios</Text>
            </Pressable>
            <Pressable
              style={styles.quickBtn}
              onPress={() => navigation.navigate('UserPortfolio')}
            >
              <Ionicons name="person-outline" size={rs(16)} color={colors.tealHeader} />
              <Text style={styles.quickText}>My Portfolio</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {tab === 'holdings' ? (
        <View style={styles.sectionBlock}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Position weights</Text>
              <View style={styles.modeToggle}>
                <Pressable
                  style={[
                    styles.modeBtn,
                    holdingMode === 'weight' && styles.modeBtnOn,
                  ]}
                  onPress={() => {
                    animateSoft();
                    setHoldingMode('weight');
                  }}
                >
                  <Text
                    style={[
                      styles.modeText,
                      holdingMode === 'weight' && styles.modeTextOn,
                    ]}
                  >
                    Weight
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeBtn,
                    holdingMode === 'pl' && styles.modeBtnOn,
                  ]}
                  onPress={() => {
                    animateSoft();
                    setHoldingMode('pl');
                  }}
                >
                  <Text
                    style={[
                      styles.modeText,
                      holdingMode === 'pl' && styles.modeTextOn,
                    ]}
                  >
                    P/L
                  </Text>
                </Pressable>
              </View>
            </View>
            <WeightBars
              rows={
                holdingMode === 'weight'
                  ? data.topHoldings
                  : [...data.topHoldings].sort(
                      (a, b) => Math.abs(b.pl) - Math.abs(a.pl),
                    )
              }
              colors={colors}
              onPress={openStock}
              mode={holdingMode}
            />
          </View>

          <Text style={styles.sectionLabel}>All tracked names</Text>
          {data.topHoldings.map((h) => (
            <Pressable
              key={h.symbol}
              style={styles.holdingCard}
              onPress={() => openStock(h.symbol)}
            >
              <View style={styles.holdingTop}>
                <View>
                  <Text style={styles.holdingSym}>{h.symbol}</Text>
                  <Text style={styles.holdingName} numberOfLines={1}>
                    {h.name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.holdingVal}>{formatRs(h.value)}</Text>
                  <Text
                    style={{
                      color: h.pl >= 0 ? colors.accentGreen : colors.danger,
                      fontWeight: '700',
                      fontSize: rs(11),
                    }}
                  >
                    {h.pl >= 0 ? '+' : ''}
                    {formatRs(h.pl)} · {fmtPct(h.plPct)}
                  </Text>
                </View>
              </View>
              <View style={styles.holdingMeta}>
                <Text style={styles.holdingChip}>{h.sector}</Text>
                <Text style={styles.holdingChip}>Qty {h.qty}</Text>
                <Text style={styles.holdingChip}>{h.pct.toFixed(1)}% wt</Text>
                {h.dayChange != null ? (
                  <Text
                    style={[
                      styles.holdingChip,
                      {
                        color:
                          h.dayChange >= 0 ? colors.accentGreen : colors.danger,
                      },
                    ]}
                  >
                    Day {h.dayChange >= 0 ? '+' : ''}
                    {formatRs(h.dayChange)}
                  </Text>
                ) : h.changePct != null ? (
                  <Text
                    style={[
                      styles.holdingChip,
                      {
                        color:
                          h.changePct >= 0 ? colors.accentGreen : colors.danger,
                      },
                    ]}
                  >
                    Mkt {fmtPct(h.changePct)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {tab === 'sectors' ? (
        <View style={styles.sectionBlock}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Allocation chart</Text>
            <StackedBar
              height={22}
              parts={data.sectors.map((s, i) => ({
                pct: s.pct,
                color: SECTOR_COLORS[i % SECTOR_COLORS.length]!,
              }))}
            />
            <View style={styles.sectorFocus}>
              <Text style={styles.sectorFocusPct}>
                {activeSector ? `${activeSector.pct.toFixed(1)}%` : '—'}
              </Text>
              <Text style={styles.sectorFocusName}>
                {activeSector?.sector ?? 'Select a sector'}
              </Text>
              <Text style={styles.sectorFocusVal}>
                {activeSector ? formatRs(activeSector.value) : ''}
              </Text>
            </View>
          </View>

          {data.sectors.map((s, i) => {
            const on = activeSector?.sector === s.sector;
            return (
              <Pressable
                key={s.sector}
                style={[styles.sectorCard, on && styles.sectorCardOn]}
                onPress={() => {
                  animateSoft();
                  setSelectedSector(s.sector);
                }}
              >
                <View style={styles.sectorCardLeft}>
                  <View
                    style={[
                      styles.sectorSwatch,
                      { backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] },
                    ]}
                  />
                  <View>
                    <Text style={styles.sectorName}>{s.sector}</Text>
                    <Text style={styles.sectorSub}>{formatRs(s.value)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', minWidth: rs(64) }}>
                  <Text style={styles.sectorPct}>{s.pct.toFixed(1)}%</Text>
                  <View style={styles.miniBarTrack}>
                    <View
                      style={[
                        styles.miniBarFill,
                        {
                          width: `${Math.min(100, s.pct)}%`,
                          backgroundColor:
                            SECTOR_COLORS[i % SECTOR_COLORS.length],
                        },
                      ]}
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {tab === 'insights' ? (
        <View style={styles.sectionBlock}>
          {data.insights.map((ins) => (
            <View
              key={ins.id}
              style={[
                styles.insightCard,
                { borderLeftColor: toneColor(ins.tone, colors) },
              ]}
            >
              <View style={styles.insightHead}>
                <Ionicons
                  name={
                    ins.tone === 'good'
                      ? 'checkmark-circle'
                      : ins.tone === 'bad'
                        ? 'alert-circle'
                        : ins.tone === 'warn'
                          ? 'warning'
                          : 'information-circle'
                  }
                  size={rs(18)}
                  color={toneColor(ins.tone, colors)}
                />
                <Text style={styles.insightTitle}>{ins.title}</Text>
              </View>
              <Text style={styles.insightDetail}>{ins.detail}</Text>
            </View>
          ))}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>What this page covers</Text>
            {[
              'Live value from Bulk Portfolio Check when available',
              'Unrealized P/L vs cost (WACC)',
              'Today’s move across all accounts',
              'Sector & position concentration',
              'Per-name weight, P/L and day change',
              'Smart risk / diversification insights',
            ].map((line) => (
              <View key={line} style={styles.coverLine}>
                <Ionicons
                  name="checkmark"
                  size={rs(14)}
                  color={colors.accentGreen}
                />
                <Text style={styles.coverText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
    </SwipeTabGesture>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Investment Summary</Text>
        <Pressable hitSlop={12} onPress={() => void refresh()}>
          <Ionicons
            name="refresh"
            size={rs(20)}
            color={loading ? colors.textMuted : colors.text}
          />
        </Pressable>
      </View>
      <PremiumGate
        title="Investment Summary"
        subtitle="Your full portfolio cockpit — value, P/L, allocation and insights."
      >
        {body}
      </PremiumGate>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      backgroundColor: c.bgElevated,
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    scroll: { padding: rs(14), paddingBottom: rs(40) },
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
      color: '#FFFFFF',
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
      padding: rs(16),
      borderRadius: rs(16),
      backgroundColor: isDark ? c.surface : '#E3F2FD',
      marginBottom: rs(12),
      gap: rs(14),
      borderWidth: 1,
      borderColor: isDark ? c.border : '#BBDEFB',
    },
    heroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    heroLabel: {
      color: isDark ? c.textMuted : '#546E7A',
      fontSize: rs(11),
      fontWeight: '600',
    },
    heroVal: {
      color: isDark ? c.text : '#0D47A1',
      fontWeight: '900',
      fontSize: rs(28),
      marginTop: rs(2),
    },
    sourcePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      backgroundColor: isDark ? c.surfaceAlt : '#FFFFFF',
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
      borderRadius: rs(20),
      borderWidth: 1,
      borderColor: isDark ? c.border : '#BBDEFB',
    },
    sourceDot: { width: rs(7), height: rs(7), borderRadius: rs(4) },
    sourceText: { color: '#1565C0', fontSize: rs(10), fontWeight: '700' },
    heroPlRow: { flexDirection: 'row', alignItems: 'center' },
    heroPlBlock: { flex: 1 },
    heroDivider: {
      width: 1,
      height: rs(44),
      backgroundColor: '#90CAF9',
      marginHorizontal: rs(12),
    },
    heroPlLabel: {
      color: isDark ? c.textMuted : '#546E7A',
      fontSize: rs(10),
      fontWeight: '600',
    },
    heroPlVal: { fontWeight: '800', fontSize: rs(15), marginTop: rs(2), color: isDark ? c.text : '#0D47A1' },
    heroPlPct: { fontWeight: '700', fontSize: rs(11), marginTop: rs(2) },
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(12),
    },
    kpiCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: c.surface,
      borderRadius: rs(12),
      padding: rs(12),
      borderWidth: 1,
      borderColor: '#C5D0B5',
      gap: rs(4),
    },
    kpiLabel: { color: c.textMuted, fontSize: rs(10), fontWeight: '600' },
    kpiVal: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    tabs: { gap: rs(8), paddingBottom: rs(12) },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      borderRadius: rs(20),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: '#C5D0B5',
    },
    tabOn: {
      backgroundColor: '#90CAF9',
      borderColor: '#64B5F6',
    },
    tabText: {
      color: c.textSecondary,
      fontWeight: '700',
      fontSize: rs(12),
    },
    tabTextOn: { color: isDark ? c.accentGreen : '#0D47A1' },
    sectionBlock: { gap: rs(12) },
    card: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(14),
      borderWidth: 1,
      borderColor: '#C5D0B5',
      gap: rs(10),
    },
    cardHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    cardHint: { color: c.textMuted, fontSize: rs(10) },
    link: { color: c.tealHeader, fontWeight: '700', fontSize: rs(11) },
    healthRow: { flexDirection: 'row', gap: rs(14), alignItems: 'center' },
    healthStats: { flex: 1, gap: rs(10) },
    statLine: { gap: rs(2) },
    statLabel: { color: c.textMuted, fontSize: rs(10), fontWeight: '600' },
    statVal: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    statValLink: {
      color: c.tealHeader,
      fontWeight: '800',
      fontSize: rs(12),
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      backgroundColor: c.bg,
      paddingHorizontal: rs(8),
      paddingVertical: rs(5),
      borderRadius: rs(8),
      maxWidth: '48%',
    },
    chipDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
    chipText: { color: c.text, fontSize: rs(10), fontWeight: '700' },
    twoCol: { flexDirection: 'row', gap: rs(8) },
    halfCard: { flex: 1 },
    muted: { color: c.textMuted, fontSize: rs(11) },
    moverLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: rs(6),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#C5D0B5',
    },
    moverSym: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    moverVal: { fontWeight: '700', fontSize: rs(11) },
    accountRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: rs(8),
    },
    accountLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(8), flex: 1 },
    accountName: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    accountMeta: { color: c.textMuted, fontSize: rs(10) },
    accountVal: { color: c.text, fontWeight: '800', fontSize: rs(12) },
    quickRow: { flexDirection: 'row', gap: rs(8) },
    quickBtn: {
      flex: 1,
      alignItems: 'center',
      gap: rs(4),
      paddingVertical: rs(12),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: '#C5D0B5',
    },
    quickText: { color: c.text, fontWeight: '700', fontSize: rs(10) },
    sectionLabel: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginTop: rs(4),
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: c.bg,
      borderRadius: rs(8),
      padding: rs(2),
    },
    modeBtn: {
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
      borderRadius: rs(6),
    },
    modeBtnOn: { backgroundColor: '#90CAF9' },
    modeText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(11) },
    modeTextOn: { color: isDark ? c.accentGreen : '#0D47A1' },
    holdingCard: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      padding: rs(12),
      borderWidth: 1,
      borderColor: '#C5D0B5',
      gap: rs(8),
    },
    holdingTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    holdingSym: { color: c.text, fontWeight: '900', fontSize: rs(14) },
    holdingName: {
      color: c.textMuted,
      fontSize: rs(10),
      maxWidth: rs(140),
      marginTop: rs(2),
    },
    holdingVal: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    holdingMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
    holdingChip: {
      color: c.textSecondary,
      fontSize: rs(10),
      fontWeight: '600',
      backgroundColor: c.bg,
      paddingHorizontal: rs(7),
      paddingVertical: rs(3),
      borderRadius: rs(6),
      overflow: 'hidden',
    },
    sectorFocus: {
      alignItems: 'center',
      paddingVertical: rs(10),
      gap: rs(2),
    },
    sectorFocusPct: {
      color: c.text,
      fontWeight: '900',
      fontSize: rs(32),
    },
    sectorFocusName: {
      color: c.textSecondary,
      fontWeight: '700',
      fontSize: rs(13),
    },
    sectorFocusVal: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '600',
    },
    sectorCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: rs(12),
      padding: rs(12),
      borderWidth: 1,
      borderColor: '#C5D0B5',
    },
    sectorCardOn: {
      borderColor: '#1A5F5A',
      backgroundColor: '#DCE5D0',
    },
    sectorCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      flex: 1,
    },
    sectorSwatch: {
      width: rs(12),
      height: rs(36),
      borderRadius: rs(4),
    },
    sectorName: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    sectorSub: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    sectorPct: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    miniBarTrack: {
      width: rs(56),
      height: rs(5),
      backgroundColor: c.bg,
      borderRadius: rs(3),
      marginTop: rs(4),
      overflow: 'hidden',
    },
    miniBarFill: { height: '100%', borderRadius: rs(3) },
    insightCard: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      padding: rs(14),
      borderWidth: 1,
      borderColor: '#C5D0B5',
      borderLeftWidth: rs(4),
      gap: rs(6),
    },
    insightHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    insightTitle: { color: c.text, fontWeight: '800', fontSize: rs(13), flex: 1 },
    insightDetail: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(18),
    },
    coverLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
    },
    coverText: {
      color: c.textSecondary,
      fontSize: rs(12),
      flex: 1,
      lineHeight: rs(17),
    },
  });
}
