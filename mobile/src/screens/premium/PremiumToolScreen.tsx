import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
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
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { PremiumScreenerRow } from '../../services/nepse/premiumScreeners';
import {
  loadFinancialReportsFeed,
  loadMarketDepthBoard,
  loadPremiumFloorsheet,
  loadStockFilter,
  STOCK_FILTER_PRESETS,
  type FinancialReportFeedRow,
  type MarketDepthRow,
  type PremiumFloorsheetSnapshot,
  type PremiumToolKind,
  type StockFilterPreset,
} from '../../services/nepse/premiumServices';
import { fmtMcap, fmtNum, type FloorsheetRow } from '../../services/nepse/screener';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

const TOOL_COPY: Record<PremiumToolKind, { title: string; subtitle: string }> = {
  'stock-filter': {
    title: 'Stock Filter',
    subtitle:
      'Live multi-criteria screener — switch presets to hunt gainers, value, sector themes and more.',
  },
  'financial-reports': {
    title: 'Financial Reports',
    subtitle:
      'Latest quarterly & annual report announcements across NEPSE — open PDFs instantly.',
  },
  'floor-sheet': {
    title: 'Floor Sheet',
    subtitle:
      'Session trade tape with bulk highlights, broker tags, and live refresh like ShareHub.',
  },
  'market-depth': {
    title: 'Market Depth',
    subtitle:
      'Live bid vs ask board — demand & supply quantities with imbalance signals per symbol.',
  },
};

function fmtAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Live';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 19);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function LiveHeader({
  subtitle,
  summary,
  asOf,
  styles,
}: {
  subtitle: string;
  summary: Array<{ label: string; value: string }>;
  asOf: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Live · refreshed {fmtAsOf(asOf)}</Text>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.summaryRow}>
        {summary.map((s) => (
          <View key={s.label} style={styles.summaryPill}>
            <Text style={styles.summaryVal}>{s.value}</Text>
            <Text style={styles.summaryLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScreenerCard({
  item,
  colors,
  styles,
  onPress,
}: {
  item: PremiumScreenerRow;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const ch = item.changePct ?? 0;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.rank}>{item.rank}</Text>
        {item.iconUrl ? (
          <Image source={{ uri: item.iconUrl }} style={styles.logo} />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoLetter}>{item.symbol.slice(0, 1)}</Text>
          </View>
        )}
        <View style={styles.cardMid}>
          <Text style={styles.sym}>{item.symbol}</Text>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.insight} numberOfLines={1}>
            {item.insight}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.ltp}>{item.ltp != null ? fmtNum(item.ltp) : '—'}</Text>
          <Text
            style={[
              styles.chg,
              { color: ch >= 0 ? colors.accentGreen : colors.danger },
            ]}
          >
            {item.changePct != null
              ? `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(2)}%`
              : '—'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function StockFilterBody({
  colors,
  styles,
  navigation,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [preset, setPreset] = useState<StockFilterPreset>('gainers');
  const [rows, setRows] = useState<PremiumScreenerRow[]>([]);
  const [summary, setSummary] = useState<Array<{ label: string; value: string }>>([]);
  const [asOf, setAsOf] = useState(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadStockFilter(preset);
    setRows(snap.rows);
    setSummary(snap.summary);
    setAsOf(snap.asOf);
    setLoading(false);
  }, [preset]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const activePreset = STOCK_FILTER_PRESETS.find((p) => p.id === preset);

  return (
    <View style={styles.body}>
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: rs(24) }} color={colors.primary} />
      ) : (
        <FlatList
          style={styles.body}
          data={rows}
          keyExtractor={(item) => item.symbol}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true).finally(() => setRefreshing(false));
              }}
            />
          }
          ListHeaderComponent={
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsInline}
              >
                {STOCK_FILTER_PRESETS.map((p) => (
                  <Pressable
                    key={p.id}
                    style={[styles.chip, preset === p.id && styles.chipActive]}
                    onPress={() => setPreset(p.id)}
                  >
                    <Text
                      style={[styles.chipText, preset === p.id && styles.chipTextActive]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {activePreset ? (
                <Text style={styles.presetTitle}>{activePreset.label}</Text>
              ) : null}
              <LiveHeader
                subtitle={activePreset?.hint ?? ''}
                summary={summary}
                asOf={asOf}
                styles={styles}
              />
            </View>
          }
          renderItem={({ item }) => (
            <ScreenerCard
              item={item}
              colors={colors}
              styles={styles}
              onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol })}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function FinancialReportsBody({
  colors,
  styles,
  navigation,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [rows, setRows] = useState<FinancialReportFeedRow[]>([]);
  const [summary, setSummary] = useState<Array<{ label: string; value: string }>>([]);
  const [asOf, setAsOf] = useState(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadFinancialReportsFeed();
    setRows(snap.rows);
    setSummary(snap.summary);
    setAsOf(snap.asOf);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  if (loading && !rows.length) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      ListHeaderComponent={
        <LiveHeader
          subtitle={TOOL_COPY['financial-reports'].subtitle}
          summary={summary}
          asOf={asOf}
          styles={styles}
        />
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          style={styles.reportCard}
          onPress={() => {
            if (item.symbol) {
              navigation.navigate('StockDetail', { symbol: item.symbol });
            }
          }}
        >
          <View style={styles.reportTop}>
            {item.iconUrl ? (
              <Image source={{ uri: item.iconUrl }} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoLetter}>
                  {(item.symbol || '?').slice(0, 1)}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.sym}>{item.symbol || 'NEPSE'}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {item.securityName || item.title}
              </Text>
            </View>
            <Text style={styles.reportDate}>{item.date}</Text>
          </View>
          <Text style={styles.reportTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.attachmentUrl ? (
            <Pressable
              style={styles.pdfBtn}
              onPress={() => void Linking.openURL(item.attachmentUrl!)}
            >
              <Ionicons name="document-text" size={rs(14)} color={colors.primary} />
              <Text style={styles.pdfText}>Open PDF report</Text>
            </Pressable>
          ) : null}
        </Pressable>
      )}
    />
  );
}

function FloorSheetBody({
  colors,
  styles,
  navigation,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [snap, setSnap] = useState<PremiumFloorsheetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setSnap(await loadPremiumFloorsheet(50, 3));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  if (loading && !snap) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  const summary = [
    { label: 'Trades', value: String(snap?.totalTrades ?? 0) },
    { label: 'Volume', value: fmtNum(snap?.totalVolume ?? 0, 0) },
    { label: 'Value', value: fmtMcap(snap?.totalValue ?? null) },
    { label: 'Bulk', value: String(snap?.bulkCount ?? 0) },
  ];

  return (
    <FlatList
      data={snap?.rows ?? []}
      keyExtractor={(item) => String(item.contractId)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      ListHeaderComponent={
        <>
          <LiveHeader
            subtitle={TOOL_COPY['floor-sheet'].subtitle}
            summary={summary}
            asOf={snap?.asOf ?? new Date().toISOString()}
            styles={styles}
          />
          {snap?.topSymbols.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top by value</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {snap.topSymbols.map((s) => (
                  <Pressable
                    key={s.symbol}
                    style={styles.topSymCard}
                    onPress={() =>
                      navigation.navigate('StockDetail', { symbol: s.symbol })
                    }
                  >
                    <Text style={styles.topSym}>{s.symbol}</Text>
                    <Text style={styles.topSymVal}>{fmtMcap(s.value)}</Text>
                    <Text style={styles.topSymMeta}>{s.trades} trades</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {snap?.bulkTrades.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Bulk trades (≥ 50 Lakh)</Text>
              {snap.bulkTrades.slice(0, 5).map((t) => (
                <FloorRow key={`bulk-${t.contractId}`} item={t} colors={colors} styles={styles} />
              ))}
            </View>
          ) : null}
          <Text style={styles.sectionTitle}>Live tape</Text>
        </>
      }
      renderItem={({ item }) => (
        <FloorRow item={item} colors={colors} styles={styles} />
      )}
      contentContainerStyle={styles.list}
    />
  );
}

function FloorRow({
  item,
  colors,
  styles,
}: {
  item: FloorsheetRow;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.floorCard}>
      <View style={styles.floorHead}>
        <Text style={styles.sym}>{item.symbol}</Text>
        <Text style={styles.floorTime}>{fmtTime(item.tradeTime)}</Text>
      </View>
      <View style={styles.brokerRow}>
        <Text style={[styles.brokerTag, { color: colors.accentGreen }]}>
          B {item.buyerBroker}
        </Text>
        <Ionicons name="arrow-forward" size={rs(12)} color={colors.textMuted} />
        <Text style={[styles.brokerTag, { color: colors.danger }]}>
          S {item.sellerBroker}
        </Text>
      </View>
      <Text style={styles.floorMeta}>
        {fmtNum(item.quantity, 0)} @ Rs {fmtNum(item.rate, 0)} · {fmtMcap(item.amount)}
      </Text>
    </View>
  );
}

function MarketDepthBody({
  colors,
  styles,
  navigation,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [rows, setRows] = useState<MarketDepthRow[]>([]);
  const [summary, setSummary] = useState<Array<{ label: string; value: string }>>([]);
  const [asOf, setAsOf] = useState(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadMarketDepthBoard();
    setRows(snap.rows);
    setSummary(snap.summary);
    setAsOf(snap.asOf);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  if (loading && !rows.length) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.symbol}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      ListHeaderComponent={
        <LiveHeader
          subtitle={TOOL_COPY['market-depth'].subtitle}
          summary={summary}
          asOf={asOf}
          styles={styles}
        />
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const imb = item.imbalancePct ?? 0;
        const imbColor =
          imb > 5 ? colors.accentGreen : imb < -5 ? colors.danger : colors.textMuted;
        return (
          <Pressable
            style={styles.depthCard}
            onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol })}
          >
            <View style={styles.depthTop}>
              {item.iconUrl ? (
                <Image source={{ uri: item.iconUrl }} style={styles.logo} />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoLetter}>{item.symbol.slice(0, 1)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.sym}>{item.symbol}</Text>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.ltp}>{item.ltp != null ? fmtNum(item.ltp) : '—'}</Text>
                <Text
                  style={[
                    styles.chg,
                    {
                      color:
                        (item.changePct ?? 0) >= 0
                          ? colors.accentGreen
                          : colors.danger,
                    },
                  ]}
                >
                  {item.changePct != null
                    ? `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(2)}%`
                    : '—'}
                </Text>
              </View>
            </View>
            <View style={styles.depthGrid}>
              <View style={styles.depthSide}>
                <Text style={[styles.depthLabel, { color: colors.accentGreen }]}>BID</Text>
                <Text style={styles.depthQty}>{fmtNum(item.bidQty, 0)}</Text>
                <Text style={styles.depthOrd}>{item.bidOrders ?? 0} orders</Text>
              </View>
              <View style={styles.depthMid}>
                <Text style={[styles.imbLabel, { color: imbColor }]}>
                  {imb >= 0 ? '+' : ''}
                  {imb.toFixed(1)}%
                </Text>
                <Text style={styles.imbHint}>imbalance</Text>
              </View>
              <View style={[styles.depthSide, { alignItems: 'flex-end' }]}>
                <Text style={[styles.depthLabel, { color: colors.danger }]}>ASK</Text>
                <Text style={styles.depthQty}>{fmtNum(item.askQty, 0)}</Text>
                <Text style={styles.depthOrd}>{item.askOrders ?? 0} orders</Text>
              </View>
            </View>
            <View style={styles.depthBar}>
              <View
                style={[
                  styles.depthBarBid,
                  {
                    flex: Math.max(0.05, item.bidQty ?? 0),
                    backgroundColor: colors.accentGreen,
                  },
                ]}
              />
              <View
                style={[
                  styles.depthBarAsk,
                  {
                    flex: Math.max(0.05, item.askQty ?? 0),
                    backgroundColor: colors.danger,
                  },
                ]}
              />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

export function PremiumToolScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'PremiumTool'>>();
  const kind = route.params.kind;
  const copy = TOOL_COPY[kind];
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const body =
    kind === 'stock-filter' ? (
      <StockFilterBody colors={colors} styles={styles} navigation={navigation} />
    ) : kind === 'financial-reports' ? (
      <FinancialReportsBody colors={colors} styles={styles} navigation={navigation} />
    ) : kind === 'floor-sheet' ? (
      <FloorSheetBody colors={colors} styles={styles} navigation={navigation} />
    ) : (
      <MarketDepthBody colors={colors} styles={styles} navigation={navigation} />
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.title}>{copy.title}</Text>
          <View style={styles.premiumTag}>
            <Ionicons name="diamond" size={rs(10)} color="#FFD54F" />
            <Text style={styles.premiumTagText}>PREMIUM</Text>
          </View>
        </View>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate title={copy.title} subtitle={copy.subtitle}>
        <View style={styles.body}>{body}</View>
      </PremiumGate>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    body: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    headerMid: { flex: 1, alignItems: 'center', gap: rs(4) },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    premiumTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: `${c.primary}22`,
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
      borderRadius: rs(10),
    },
    premiumTagText: {
      color: c.primary,
      fontSize: rs(9),
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(32) },
    hero: { paddingVertical: rs(12), gap: rs(10) },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    liveDot: {
      width: rs(8),
      height: rs(8),
      borderRadius: rs(4),
      backgroundColor: c.accentGreen,
    },
    liveText: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    subtitle: { color: c.textSecondary, fontSize: rs(12), lineHeight: rs(17) },
    summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8) },
    summaryPill: {
      backgroundColor: c.surfaceAlt,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      minWidth: rs(72),
      alignItems: 'center',
    },
    summaryVal: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    summaryLabel: {
      color: c.textMuted,
      fontSize: rs(9),
      marginTop: rs(2),
      fontWeight: '600',
    },
    chips: { paddingHorizontal: rs(16), paddingVertical: rs(10), gap: rs(8) },
    chipsInline: { paddingVertical: rs(4), gap: rs(8) },
    presetTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginTop: rs(4),
      marginBottom: rs(2),
    },
    chip: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(20),
      backgroundColor: c.surfaceAlt,
    },
    chipActive: { backgroundColor: c.primarySoft },
    chipText: { color: c.textMuted, fontWeight: '600', fontSize: rs(12) },
    chipTextActive: { color: c.primary, fontWeight: '800' },
    card: {
      marginBottom: rs(8),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      padding: rs(12),
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
    rank: { color: c.textMuted, fontWeight: '800', width: rs(22), fontSize: rs(12) },
    logo: { width: rs(34), height: rs(34), borderRadius: rs(17) },
    logoFallback: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(17),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    cardMid: { flex: 1, minWidth: 0 },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    name: { color: c.textSecondary, fontSize: rs(11), lineHeight: rs(15), marginTop: rs(2) },
    insight: { color: c.primary, fontSize: rs(10), marginTop: rs(3), fontWeight: '600' },
    cardRight: { alignItems: 'flex-end' },
    ltp: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    chg: { fontWeight: '800', fontSize: rs(11), marginTop: rs(2) },
    reportCard: {
      marginBottom: rs(10),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    reportTop: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
    reportDate: { color: c.textMuted, fontSize: rs(10), fontWeight: '600' },
    reportTitle: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '600',
      marginTop: rs(8),
      lineHeight: rs(18),
    },
    pdfBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginTop: rs(10),
      alignSelf: 'flex-start',
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(8),
      backgroundColor: c.primarySoft,
    },
    pdfText: { color: c.primary, fontWeight: '700', fontSize: rs(12) },
    section: { marginBottom: rs(14) },
    sectionTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginBottom: rs(8),
    },
    topSymCard: {
      marginRight: rs(8),
      padding: rs(10),
      borderRadius: rs(10),
      backgroundColor: c.surfaceAlt,
      minWidth: rs(88),
    },
    topSym: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    topSymVal: { color: c.primary, fontWeight: '700', fontSize: rs(12), marginTop: rs(4) },
    topSymMeta: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    floorCard: {
      marginBottom: rs(8),
      padding: rs(10),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    floorHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    floorTime: { color: c.textMuted, fontSize: rs(10) },
    brokerRow: { flexDirection: 'row', alignItems: 'center', gap: rs(8), marginTop: rs(6) },
    brokerTag: { fontWeight: '800', fontSize: rs(11) },
    floorMeta: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(4) },
    depthCard: {
      marginBottom: rs(10),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    depthTop: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
    depthGrid: {
      flexDirection: 'row',
      marginTop: rs(12),
      alignItems: 'center',
    },
    depthSide: { flex: 1 },
    depthLabel: { fontSize: rs(10), fontWeight: '800', letterSpacing: 0.5 },
    depthQty: { color: c.text, fontWeight: '800', fontSize: rs(15), marginTop: rs(2) },
    depthOrd: { color: c.textMuted, fontSize: rs(10) },
    depthMid: { alignItems: 'center', paddingHorizontal: rs(8) },
    imbLabel: { fontWeight: '800', fontSize: rs(13) },
    imbHint: { color: c.textMuted, fontSize: rs(9) },
    depthBar: {
      flexDirection: 'row',
      height: rs(4),
      borderRadius: rs(2),
      overflow: 'hidden',
      marginTop: rs(10),
      backgroundColor: c.surfaceAlt,
    },
    depthBarBid: { height: '100%' },
    depthBarAsk: { height: '100%' },
  });
}
