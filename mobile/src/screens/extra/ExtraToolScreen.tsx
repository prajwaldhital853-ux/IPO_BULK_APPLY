import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  EXTRA_TOOL_COPY,
  loadForexRates,
  loadFuelPrices,
  loadGlobalIndices,
  loadGoldSilver,
  loadMarketIndicators,
  type ExtraToolKind,
  type ForexRow,
  type FuelRegionPrice,
  type GlobalIndexRow,
  type GoldSilverRow,
  type MarketIndicatorRow,
} from '../../services/nepse/extraData';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

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

function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtRs(n: number): string {
  return `Rs. ${n.toLocaleString('en-US')}`;
}

function ScreenHeader({
  title,
  navigation,
  colors,
  styles,
}: {
  title: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + rs(8) }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
        <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={{ width: rs(22) }} />
    </View>
  );
}

function LiveBanner({
  subtitle,
  meta,
  styles,
}: {
  subtitle: string;
  meta?: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>
          {meta ? `${meta} · ` : ''}refreshed {fmtAsOf(new Date().toISOString())}
        </Text>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function GlobalIndicesBody({
  colors,
  styles,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [regions, setRegions] = useState<
    Array<{ regionName: string; indices: GlobalIndexRow[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadGlobalIndices();
    setRegions(snap.regions);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePollingRefresh(refresh);

  if (loading && regions.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <SectionList
      sections={regions.map((r) => ({
        title: r.regionName,
        data: r.indices,
      }))}
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
      contentContainerStyle={styles.list}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
        const ch = item.changePercent ?? 0;
        return (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              {item.flagUrl ? (
                <Image source={{ uri: item.flagUrl }} style={styles.flag} />
              ) : (
                <View style={styles.flagFallback}>
                  <Ionicons name="globe-outline" size={rs(16)} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.cardMid}>
                <Text style={styles.sym}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.country} · {item.status}
                </Text>
                {item.technicalRating ? (
                  <Text style={styles.rating}>{item.technicalRating}</Text>
                ) : null}
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.ltp}>{fmtNum(item.currentValue)}</Text>
                <Text
                  style={[
                    styles.chg,
                    { color: ch >= 0 ? colors.accentGreen : colors.danger },
                  ]}
                >
                  {ch >= 0 ? '+' : ''}
                  {fmtNum(item.changePercent)}%
                </Text>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

function IndicatorsBody({
  colors,
  styles,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [rows, setRows] = useState<MarketIndicatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadMarketIndicators();
    setRows(snap.rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePollingRefresh(refresh);

  const groups = useMemo(() => {
    const order: MarketIndicatorRow['group'][] = ['index', 'summary', 'breadth'];
    return order
      .map((g) => ({
        title: g === 'index' ? 'Indices' : g === 'summary' ? 'Session' : 'Breadth',
        data: rows.filter((r) => r.group === g),
      }))
      .filter((s) => s.data.length > 0);
  }, [rows]);

  if (loading && rows.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <SectionList
      sections={groups}
      keyExtractor={(item) => item.label}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.list}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
        const ch = item.changePercent;
        return (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardMid}>
                <Text style={styles.sym}>{item.label}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.ltp}>{item.value}</Text>
                {ch != null ? (
                  <Text
                    style={[
                      styles.chg,
                      { color: ch >= 0 ? colors.accentGreen : colors.danger },
                    ]}
                  >
                    {ch >= 0 ? '+' : ''}
                    {fmtNum(ch)}%
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

function ForexBody({
  colors,
  styles,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [rows, setRows] = useState<ForexRow[]>([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadForexRates();
    setRows(snap.rows);
    setDate(snap.date);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePollingRefresh(refresh, 60_000);

  if (loading && rows.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.iso3}
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
        date ? (
          <Text style={styles.note}>NRB rate date: {date}</Text>
        ) : null
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.fxBadge}>
              <Text style={styles.fxIso}>{item.iso3}</Text>
            </View>
            <View style={styles.cardMid}>
              <Text style={styles.sym}>{item.name}</Text>
              <Text style={styles.meta}>Unit: {item.unit}</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.fxRate}>{fmtNum(item.buy, 2)}</Text>
              <Text style={styles.meta}>Buy</Text>
              <Text style={[styles.fxRate, { marginTop: rs(4) }]}>
                {fmtNum(item.sell, 2)}
              </Text>
              <Text style={styles.meta}>Sell</Text>
            </View>
          </View>
        </View>
      )}
    />
  );
}

function FuelBody({
  colors,
  styles,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [regions, setRegions] = useState<FuelRegionPrice[]>([]);
  const [effectiveDate, setEffectiveDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadFuelPrices();
    setRegions(snap.regions);
    setEffectiveDate(snap.effectiveDate);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && regions.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <FlatList
      data={regions}
      keyExtractor={(item) => item.region}
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
        effectiveDate ? (
          <Text style={styles.note}>Effective: {effectiveDate}</Text>
        ) : (
          <Text style={styles.note}>Source: Nepal Oil Corporation</Text>
        )
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.fuelCard}>
          <Text style={styles.fuelRegion}>{item.region}</Text>
          <View style={styles.fuelGrid}>
            <View style={styles.fuelCell}>
              <Text style={styles.fuelLabel}>Petrol</Text>
              <Text style={styles.fuelVal}>{fmtRs(item.petrol)}/L</Text>
            </View>
            <View style={styles.fuelCell}>
              <Text style={styles.fuelLabel}>Diesel</Text>
              <Text style={styles.fuelVal}>{fmtRs(item.diesel)}/L</Text>
            </View>
            {item.kerosene != null ? (
              <View style={styles.fuelCell}>
                <Text style={styles.fuelLabel}>Kerosene</Text>
                <Text style={styles.fuelVal}>{fmtRs(item.kerosene)}/L</Text>
              </View>
            ) : null}
            {item.lpg != null ? (
              <View style={styles.fuelCell}>
                <Text style={styles.fuelLabel}>LPG</Text>
                <Text style={styles.fuelVal}>{fmtRs(item.lpg)}/cyl</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}
    />
  );
}

function GoldSilverBody({
  colors,
  styles,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [rows, setRows] = useState<GoldSilverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadGoldSilver();
    setRows(snap.rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePollingRefresh(refresh);

  if (loading && rows.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => `${item.name}-${item.unit}`}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const ch = item.changePercent ?? 0;
        return (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              {item.icon ? (
                <Image source={{ uri: item.icon }} style={styles.metalIcon} />
              ) : (
                <View style={styles.flagFallback}>
                  <Ionicons name="diamond-outline" size={rs(16)} color="#FFD54F" />
                </View>
              )}
              <View style={styles.cardMid}>
                <Text style={styles.sym}>{item.name}</Text>
                <Text style={styles.meta}>{item.unit}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.ltp}>{fmtRs(item.price)}</Text>
                <Text
                  style={[
                    styles.chg,
                    { color: ch >= 0 ? colors.accentGreen : colors.danger },
                  ]}
                >
                  {ch >= 0 ? '+' : ''}
                  {fmtNum(item.changePercent)}%
                </Text>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

export function ExtraToolScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ExtraTool'>>();
  const kind = route.params.kind;
  const copy = EXTRA_TOOL_COPY[kind];
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const body =
    kind === 'global-indices' ? (
      <GlobalIndicesBody colors={colors} styles={styles} />
    ) : kind === 'indicators' ? (
      <IndicatorsBody colors={colors} styles={styles} />
    ) : kind === 'forex' ? (
      <ForexBody colors={colors} styles={styles} />
    ) : kind === 'fuel' ? (
      <FuelBody colors={colors} styles={styles} />
    ) : (
      <GoldSilverBody colors={colors} styles={styles} />
    );

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={copy.title}
        navigation={navigation}
        colors={colors}
        styles={styles}
      />
      <LiveBanner subtitle={copy.subtitle} styles={styles} />
      <View style={styles.body}>{body}</View>
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
      paddingBottom: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    hero: { paddingHorizontal: rs(16), paddingVertical: rs(10), gap: rs(6) },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    liveDot: {
      width: rs(8),
      height: rs(8),
      borderRadius: rs(4),
      backgroundColor: c.accentGreen,
    },
    liveText: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    subtitle: { color: c.textSecondary, fontSize: rs(12), lineHeight: rs(17) },
    note: {
      color: c.textMuted,
      fontSize: rs(11),
      marginBottom: rs(8),
      fontWeight: '600',
    },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(32) },
    sectionTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginTop: rs(12),
      marginBottom: rs(8),
    },
    card: {
      marginBottom: rs(8),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      padding: rs(12),
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
    flag: { width: rs(28), height: rs(20), borderRadius: rs(3) },
    flagFallback: {
      width: rs(28),
      height: rs(20),
      borderRadius: rs(3),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metalIcon: { width: rs(32), height: rs(32), borderRadius: rs(16) },
    cardMid: { flex: 1, minWidth: 0 },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    meta: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(2) },
    rating: { color: c.primary, fontSize: rs(10), marginTop: rs(3), fontWeight: '700' },
    cardRight: { alignItems: 'flex-end', flexShrink: 0 },
    ltp: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    chg: { fontWeight: '800', fontSize: rs(11), marginTop: rs(2) },
    fxBadge: {
      backgroundColor: c.primarySoft,
      borderRadius: rs(8),
      paddingHorizontal: rs(8),
      paddingVertical: rs(6),
      alignSelf: 'flex-start',
    },
    fxIso: { color: c.primary, fontWeight: '800', fontSize: rs(12) },
    fxRate: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    fuelCard: {
      marginBottom: rs(10),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    fuelRegion: { color: c.text, fontWeight: '800', fontSize: rs(13), marginBottom: rs(10) },
    fuelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8) },
    fuelCell: {
      minWidth: '45%',
      backgroundColor: c.surfaceAlt,
      borderRadius: rs(10),
      padding: rs(10),
    },
    fuelLabel: { color: c.textMuted, fontSize: rs(10), fontWeight: '700' },
    fuelVal: { color: c.text, fontWeight: '800', fontSize: rs(13), marginTop: rs(4) },
  });
}
