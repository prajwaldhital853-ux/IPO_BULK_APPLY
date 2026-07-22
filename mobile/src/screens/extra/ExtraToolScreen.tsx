import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

function fmtRsMetal(n: number): string {
  return `Rs ${n.toLocaleString('en-NP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
}

function fmtMetalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtChangePill(change: number, pct: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toLocaleString('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} (${sign}${pct.toFixed(2)}%)`;
}

function buildSparkSeries(price: number, change: number): number[] {
  const base = Math.max(price - change * 8, price * 0.85);
  const pts: number[] = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const wave = Math.sin(t * Math.PI * 2.2) * Math.abs(change || price * 0.01);
    const drift = (price - base) * t;
    pts.push(base + drift + wave * (1 - t * 0.3));
  }
  pts[pts.length - 1] = price;
  return pts;
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

function MiniBars({
  values,
  colors,
  height = 72,
  positiveIsUp = true,
}: {
  values: number[];
  colors: ThemeColors;
  height?: number;
  positiveIsUp?: boolean;
}) {
  if (!values.length) return null;
  const max = Math.max(...values.map((v) => Math.abs(v)), 0.01);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: rs(height) }}>
      {values.map((v, i) => {
        const h = Math.max((Math.abs(v) / max) * (height - 4), 4);
        const up = positiveIsUp ? v >= 0 : v < 0;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: rs(h),
              borderRadius: rs(3),
              backgroundColor: up ? colors.accentGreen : colors.danger,
              opacity: 0.85,
            }}
          />
        );
      })}
    </View>
  );
}

function SparkLine({
  values,
  color,
  height = 40,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: rs(height) }}>
      {values.map((v, i) => {
        const h = Math.max(((v - min) / range) * (height - 2), 3);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: rs(h),
              borderRadius: rs(2),
              backgroundColor: color,
              opacity: 0.35 + (i / values.length) * 0.65,
            }}
          />
        );
      })}
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
  const [regionTab, setRegionTab] = useState<string>('All');
  const [sort, setSort] = useState<'move' | 'name' | 'value'>('move');
  const [selected, setSelected] = useState<GlobalIndexRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'up' | 'down'>('all');

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

  const allIndices = useMemo(
    () => regions.flatMap((r) => r.indices),
    [regions],
  );

  const tabs = useMemo(
    () => ['All', ...regions.map((r) => r.regionName)],
    [regions],
  );

  const visible = useMemo(() => {
    let list =
      regionTab === 'All'
        ? allIndices
        : regions.find((r) => r.regionName === regionTab)?.indices ?? [];
    if (filter === 'up') list = list.filter((i) => i.changePercent >= 0);
    if (filter === 'down') list = list.filter((i) => i.changePercent < 0);
    const sorted = [...list];
    if (sort === 'move') {
      sorted.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    } else if (sort === 'value') {
      sorted.sort((a, b) => b.currentValue - a.currentValue);
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [allIndices, regions, regionTab, filter, sort]);

  const movers = useMemo(() => {
    const ranked = [...allIndices].sort(
      (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
    );
    return ranked.slice(0, 8);
  }, [allIndices]);

  const breadth = useMemo(() => {
    const up = allIndices.filter((i) => i.changePercent > 0).length;
    const down = allIndices.filter((i) => i.changePercent < 0).length;
    const flat = allIndices.length - up - down;
    return { up, down, flat };
  }, [allIndices]);

  const focus = selected ?? visible[0] ?? null;

  if (loading && regions.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.ixWrap}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.ixHero}>
        <Text style={styles.ixHeroTitle}>World markets pulse</Text>
        <Text style={styles.ixHeroSub}>
          {breadth.up} up · {breadth.down} down · {breadth.flat} flat
        </Text>
        <MiniBars
          values={movers.map((m) => m.changePercent)}
          colors={colors}
          height={64}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {tabs.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, regionTab === t && styles.chipOn]}
            onPress={() => setRegionTab(t)}
          >
            <Text style={[styles.chipText, regionTab === t && styles.chipTextOn]}>
              {t.replace(' Market', '')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.chipRow}>
        {([
          ['all', 'All'],
          ['up', 'Gainers'],
          ['down', 'Losers'],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.chipSm, filter === id && styles.chipOn]}
            onPress={() => setFilter(id)}
          >
            <Text style={[styles.chipText, filter === id && styles.chipTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
        {([
          ['move', 'By move'],
          ['value', 'By value'],
          ['name', 'A–Z'],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.chipSm, sort === id && styles.chipOn]}
            onPress={() => setSort(id)}
          >
            <Text style={[styles.chipText, sort === id && styles.chipTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {focus ? (
        <View style={styles.ixFocus}>
          <View style={styles.ixFocusTop}>
            {focus.flagUrl ? (
              <Image source={{ uri: focus.flagUrl }} style={styles.flagLg} />
            ) : (
              <View style={styles.flagFallbackLg}>
                <Ionicons name="globe-outline" size={rs(22)} color={colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.ixFocusName}>{focus.name}</Text>
              <Text style={styles.meta}>
                {focus.country} · {focus.status}
                {focus.technicalRating ? ` · ${focus.technicalRating}` : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.ixFocusVal}>
            {fmtNum(focus.currentValue)}
          </Text>
          <Text
            style={{
              color: focus.changePercent >= 0 ? colors.accentGreen : colors.danger,
              fontWeight: '800',
              fontSize: rs(14),
            }}
          >
            {focus.changePercent >= 0 ? '+' : ''}
            {fmtNum(focus.change)} ({focus.changePercent >= 0 ? '+' : ''}
            {fmtNum(focus.changePercent)}%)
          </Text>
          <SparkLine
            values={buildSparkSeries(focus.currentValue, focus.change)}
            color={focus.changePercent >= 0 ? colors.accentGreen : colors.danger}
            height={48}
          />
        </View>
      ) : null}

      {visible.map((item) => {
        const ch = item.changePercent ?? 0;
        const on = focus?.symbol === item.symbol;
        return (
          <Pressable
            key={item.symbol}
            style={[styles.card, on && styles.cardSelected]}
            onPress={() => setSelected(item)}
          >
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
                  {fmtNum(ch)}%
                </Text>
              </View>
            </View>
            <View style={{ marginTop: rs(8) }}>
              <SparkLine
                values={buildSparkSeries(item.currentValue, item.change)}
                color={ch >= 0 ? colors.accentGreen : colors.danger}
                height={28}
              />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
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
  const [tab, setTab] = useState<'index' | 'summary' | 'breadth'>('index');
  const [picked, setPicked] = useState<string | null>(null);

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

  const indices = useMemo(() => rows.filter((r) => r.group === 'index'), [rows]);
  const summary = useMemo(() => rows.filter((r) => r.group === 'summary'), [rows]);
  const breadth = useMemo(() => rows.filter((r) => r.group === 'breadth'), [rows]);

  const chartRows = useMemo(() => {
    return indices
      .filter((r) => r.changePercent != null)
      .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
      .slice(0, 10);
  }, [indices]);

  const advanced = Number(breadth.find((b) => b.label === 'Advanced')?.value ?? 0);
  const declined = Number(breadth.find((b) => b.label === 'Declined')?.value ?? 0);
  const unchanged = Number(breadth.find((b) => b.label === 'Unchanged')?.value ?? 0);
  const breadthTotal = Math.max(advanced + declined + unchanged, 1);

  const list =
    tab === 'index' ? indices : tab === 'summary' ? summary : breadth;
  const focus =
    indices.find((r) => r.label === picked) ?? chartRows[0] ?? indices[0] ?? null;

  if (loading && rows.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.ixWrap}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.ixHero}>
        <Text style={styles.ixHeroTitle}>NEPSE session board</Text>
        <Text style={styles.ixHeroSub}>Live indices · breadth · turnover</Text>
        {focus ? (
          <>
            <Text style={styles.ixHeroName}>{focus.label}</Text>
            <Text style={styles.ixHeroVal}>{focus.value}</Text>
            {focus.changePercent != null ? (
              <Text
                style={{
                  color:
                    focus.changePercent >= 0 ? colors.accentGreen : colors.danger,
                  fontWeight: '800',
                }}
              >
                {focus.changePercent >= 0 ? '+' : ''}
                {fmtNum(focus.changePercent)}%
              </Text>
            ) : null}
          </>
        ) : null}
        <View style={{ marginTop: rs(10) }}>
          <MiniBars
            values={chartRows.map((r) => r.changePercent ?? 0)}
            colors={colors}
            height={70}
          />
        </View>
      </View>

      <View style={styles.breadthCard}>
        <Text style={styles.sectionTitleInline}>Market breadth</Text>
        <View style={styles.breadthTrack}>
          <View
            style={{
              width: `${(advanced / breadthTotal) * 100}%`,
              backgroundColor: colors.accentGreen,
              height: '100%',
            }}
          />
          <View
            style={{
              width: `${(unchanged / breadthTotal) * 100}%`,
              backgroundColor: colors.textMuted,
              height: '100%',
            }}
          />
          <View
            style={{
              width: `${(declined / breadthTotal) * 100}%`,
              backgroundColor: colors.danger,
              height: '100%',
            }}
          />
        </View>
        <View style={styles.breadthLegend}>
          <Text style={{ color: colors.accentGreen, fontWeight: '700' }}>
            {advanced} adv
          </Text>
          <Text style={{ color: colors.textMuted, fontWeight: '700' }}>
            {unchanged} flat
          </Text>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>
            {declined} dec
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {([
          ['index', 'Indices'],
          ['summary', 'Session'],
          ['breadth', 'Breadth'],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.chip, tab === id && styles.chipOn]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.chipText, tab === id && styles.chipTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {list.map((item) => {
        const ch = item.changePercent;
        const on = picked === item.label;
        return (
          <Pressable
            key={item.label}
            style={[styles.card, on && styles.cardSelected]}
            onPress={() => setPicked(item.label)}
          >
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
            {ch != null ? (
              <View style={styles.indBarTrack}>
                <View
                  style={[
                    styles.indBarFill,
                    {
                      width: `${Math.min(100, Math.abs(ch) * 12)}%`,
                      backgroundColor:
                        ch >= 0 ? colors.accentGreen : colors.danger,
                    },
                  ]}
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
  const [selected, setSelected] = useState<string>('USD');
  const [mode, setMode] = useState<'buy' | 'sell' | 'mid'>('mid');
  const [amount, setAmount] = useState('100');
  const [sort, setSort] = useState<'name' | 'move' | 'spread'>('move');

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadForexRates();
    setRows(snap.rows);
    setDate(snap.date);
    setSelected((prev) =>
      snap.rows.some((r) => r.iso3 === prev)
        ? prev
        : snap.rows[0]?.iso3 ?? prev,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePollingRefresh(refresh, 60_000);

  const focus = rows.find((r) => r.iso3 === selected) ?? rows[0] ?? null;

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === 'move') {
      list.sort(
        (a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0),
      );
    } else if (sort === 'spread') {
      list.sort((a, b) => b.sell - b.buy - (a.sell - a.buy));
    } else {
      list.sort((a, b) => a.iso3.localeCompare(b.iso3));
    }
    return list;
  }, [rows, sort]);

  const qty = Math.max(0, parseFloat(amount) || 0);
  const rate =
    focus == null
      ? 0
      : mode === 'buy'
        ? focus.buy
        : mode === 'sell'
          ? focus.sell
          : focus.mid;
  const converted = focus ? (qty / focus.unit) * rate : 0;

  if (loading && rows.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.ixWrap}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {date ? <Text style={styles.note}>NRB official · {date}</Text> : null}

      {focus ? (
        <View style={styles.ixHero}>
          <View style={styles.fxHeroHead}>
            <View style={styles.fxBadgeLg}>
              <Text style={styles.fxIsoLg}>{focus.iso3}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ixHeroName}>{focus.name}</Text>
              <Text style={[styles.meta, { color: '#546E7A' }]}>
                Unit {focus.unit}
              </Text>
            </View>
            {focus.changePct != null ? (
              <Text
                style={{
                  color: focus.changePct >= 0 ? colors.accentGreen : colors.danger,
                  fontWeight: '800',
                }}
              >
                {focus.changePct >= 0 ? '+' : ''}
                {fmtNum(focus.changePct)}%
              </Text>
            ) : null}
          </View>
          <View style={styles.fxRateRow}>
            <View style={styles.fxRateBox}>
              <Text style={styles.meta}>Buy</Text>
              <Text style={styles.fxRateBig}>{fmtNum(focus.buy)}</Text>
            </View>
            <View style={styles.fxRateBox}>
              <Text style={styles.meta}>Mid</Text>
              <Text style={styles.fxRateBig}>{fmtNum(focus.mid)}</Text>
            </View>
            <View style={styles.fxRateBox}>
              <Text style={styles.meta}>Sell</Text>
              <Text style={styles.fxRateBig}>{fmtNum(focus.sell)}</Text>
            </View>
          </View>
          <Text style={[styles.meta, { marginBottom: rs(6) }]}>
            Mid trend (NRB days)
          </Text>
          <SparkLine
            values={focus.history}
            color={
              (focus.changePct ?? 0) >= 0 ? colors.accentGreen : colors.danger
            }
            height={56}
          />
        </View>
      ) : null}

      <View style={styles.calcCard}>
        <Text style={styles.sectionTitleInline}>Quick convert to NPR</Text>
        <View style={styles.chipRow}>
          {(['buy', 'mid', 'sell'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.chipSm, mode === m && styles.chipOn]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.chipText, mode === m && styles.chipTextOn]}>
                {m.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.amountRow}>
          {['50', '100', '500', '1000'].map((v) => (
            <Pressable
              key={v}
              style={[styles.chipSm, amount === v && styles.chipOn]}
              onPress={() => setAmount(v)}
            >
              <Text style={[styles.chipText, amount === v && styles.chipTextOn]}>
                {v}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.calcResult}>
          {qty} {focus?.iso3 ?? ''} → Rs {fmtNum(converted, 2)}
        </Text>
        <Text style={styles.meta}>
          Using {mode} rate {fmtNum(rate)} per {focus?.unit ?? 1} {focus?.iso3}
        </Text>
      </View>

      <View style={styles.chipRow}>
        {([
          ['move', 'Movers'],
          ['spread', 'Spread'],
          ['name', 'A–Z'],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.chipSm, sort === id && styles.chipOn]}
            onPress={() => setSort(id)}
          >
            <Text style={[styles.chipText, sort === id && styles.chipTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {sorted.map((item) => {
        const on = focus?.iso3 === item.iso3;
        const ch = item.changePct;
        return (
          <Pressable
            key={item.iso3}
            style={[styles.card, on && styles.cardSelected]}
            onPress={() => setSelected(item.iso3)}
          >
            <View style={styles.cardTop}>
              <View style={styles.fxBadge}>
                <Text style={styles.fxIso}>{item.iso3}</Text>
              </View>
              <View style={styles.cardMid}>
                <Text style={styles.sym}>{item.name}</Text>
                <Text style={styles.meta}>
                  Spread {fmtNum(item.sell - item.buy, 2)}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.fxRate}>{fmtNum(item.mid, 2)}</Text>
                <Text style={styles.meta}>Mid</Text>
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
            {item.history.length > 1 ? (
              <View style={{ marginTop: rs(8) }}>
                <SparkLine
                  values={item.history}
                  color={
                    (ch ?? 0) >= 0 ? colors.accentGreen : colors.danger
                  }
                  height={26}
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
  const [source, setSource] = useState<'noc' | 'fallback'>('noc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fuel, setFuel] = useState<'petrol' | 'diesel' | 'kerosene' | 'lpg'>(
    'petrol',
  );
  const [regionIdx, setRegionIdx] = useState(0);
  const [liters, setLiters] = useState('10');

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadFuelPrices();
    setRegions(snap.regions);
    setEffectiveDate(snap.effectiveDate);
    setSource(snap.source);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = regions[regionIdx] ?? regions[0] ?? null;
  const price =
    active == null
      ? 0
      : fuel === 'petrol'
        ? active.petrol
        : fuel === 'diesel'
          ? active.diesel
          : fuel === 'kerosene'
            ? active.kerosene ?? 0
            : active.lpg ?? 0;
  const qty = Math.max(0, parseFloat(liters) || 0);
  const total = fuel === 'lpg' ? price * Math.max(1, Math.round(qty / 10) || 1) : price * qty;

  const compareValues = regions.map((r) =>
    fuel === 'petrol'
      ? r.petrol
      : fuel === 'diesel'
        ? r.diesel
        : fuel === 'kerosene'
          ? r.kerosene ?? 0
          : r.lpg ?? 0,
  );

  if (loading && regions.length === 0) {
    return <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />;
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.ixWrap}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.note}>
        {source === 'noc'
          ? `Nepal Oil Corporation${effectiveDate ? ` · ${effectiveDate}` : ''}`
          : 'Cached sample — NOC site unreachable'}
      </Text>

      <View style={styles.ixHero}>
        <Text style={styles.ixHeroTitle}>
          {fuel === 'lpg' ? 'LP Gas' : fuel[0]!.toUpperCase() + fuel.slice(1)}
        </Text>
        <Text style={styles.ixHeroSub} numberOfLines={2}>
          {active?.region ?? '—'}
        </Text>
        <Text style={styles.ixHeroVal}>
          {fuel === 'lpg' ? fmtRs(price) + '/cyl' : fmtRs(price) + '/L'}
        </Text>
        <Text style={[styles.meta, { marginTop: rs(8), marginBottom: rs(6) }]}>
          Regional compare
        </Text>
        <MiniBars values={compareValues} colors={colors} height={70} positiveIsUp />
      </View>

      <View style={styles.chipRow}>
        {([
          ['petrol', 'Petrol'],
          ['diesel', 'Diesel'],
          ['kerosene', 'Kerosene'],
          ['lpg', 'LPG'],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.chip, fuel === id && styles.chipOn]}
            onPress={() => setFuel(id)}
          >
            <Text style={[styles.chipText, fuel === id && styles.chipTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.calcCard}>
        <Text style={styles.sectionTitleInline}>
          {fuel === 'lpg' ? 'Cylinder cost' : 'Fill-up calculator'}
        </Text>
        <View style={styles.amountRow}>
          {(fuel === 'lpg' ? ['1', '2', '3'] : ['5', '10', '20', '40']).map((v) => (
            <Pressable
              key={v}
              style={[styles.chipSm, liters === v && styles.chipOn]}
              onPress={() => setLiters(v)}
            >
              <Text style={[styles.chipText, liters === v && styles.chipTextOn]}>
                {fuel === 'lpg' ? `${v} cyl` : `${v} L`}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.calcResult}>
          ≈ {fmtRs(Math.round(total * 100) / 100)}
        </Text>
      </View>

      {regions.map((item, i) => {
        const on = i === regionIdx;
        const p =
          fuel === 'petrol'
            ? item.petrol
            : fuel === 'diesel'
              ? item.diesel
              : fuel === 'kerosene'
                ? item.kerosene
                : item.lpg;
        return (
          <Pressable
            key={item.region}
            style={[styles.fuelCard, on && styles.cardSelected]}
            onPress={() => setRegionIdx(i)}
          >
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
            {p != null ? (
              <Text style={[styles.meta, { marginTop: rs(8) }]}>
                Selected fuel here: {fuel === 'lpg' ? fmtRs(p) + '/cyl' : fmtRs(p) + '/L'}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MetalSparkChart({
  values,
  styles,
}: {
  values: number[];
  styles: ReturnType<typeof makeStyles>;
}) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const plotH = rs(150);
  const yTicks = [0, 0.33, 0.66, 1].map((t) => min + range * (1 - t));
  const xLabels = ['Wed, 5/13', 'Wed, 5/20', 'Wed, 5/27', 'Wed, 6/3'];

  return (
    <View style={styles.chartCard}>
      <View style={[styles.chartBody, { height: plotH }]}>
        <View style={styles.chartYAxis}>
          {yTicks.map((v, i) => (
            <Text key={i} style={styles.chartYLabel}>
              {v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0)}
            </Text>
          ))}
        </View>
        <View style={styles.chartPlot}>
          {[0.25, 0.5, 0.75].map((p) => (
            <View
              key={p}
              style={[styles.chartGridLine, { top: plotH * p }]}
            />
          ))}
          <View style={styles.chartBars}>
            {values.map((v, i) => {
              const h = Math.max(((v - min) / range) * (plotH - 8), 6);
              return (
                <View key={i} style={styles.chartCol}>
                  <View style={[styles.chartBar, { height: h }]} />
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.chartXAxis}>
        {xLabels.map((l) => (
          <Text key={l} style={styles.chartXLabel}>
            {l}
          </Text>
        ))}
      </View>
    </View>
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
  const [asOf, setAsOf] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const snap = await loadGoldSilver();
    setRows(snap.rows);
    setAsOf(snap.asOf);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePollingRefresh(refresh);

  const featured = useMemo(() => {
    if (!rows.length) return null;
    if (selectedId) {
      const hit = rows.find(
        (r) => `${r.symbol}-${r.unit}-${r.name}` === selectedId,
      );
      if (hit) return hit;
    }
    return (
      rows.find((r) => /silver/i.test(r.name) && /tola/i.test(r.unit)) ??
      rows.find((r) => /silver/i.test(r.name)) ??
      rows[0]!
    );
  }, [rows, selectedId]);

  const gridRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          !featured ||
          `${r.symbol}-${r.unit}-${r.name}` !==
            `${featured.symbol}-${featured.unit}-${featured.name}`,
      ),
    [rows, featured],
  );

  if (loading && rows.length === 0) {
    return (
      <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
    );
  }

  const spark = featured
    ? buildSparkSeries(featured.price, featured.change)
    : [];

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh(true).finally(() => setRefreshing(false));
          }}
          tintColor={colors.accentGreen}
        />
      }
      contentContainerStyle={styles.gsWrap}
      showsVerticalScrollIndicator={false}
    >
      {featured ? (
        <View style={styles.gsHero}>
          <View style={styles.gsHeroTop}>
            <View style={styles.gsHeroLeft}>
              {featured.icon ? (
                <Image
                  source={{ uri: featured.icon }}
                  style={styles.gsHeroIcon}
                />
              ) : (
                <View
                  style={[
                    styles.gsHeroIconFallback,
                    {
                      backgroundColor: /gold/i.test(featured.name)
                        ? '#FFF3C4'
                        : '#E8EBEF',
                    },
                  ]}
                >
                  <Ionicons
                    name="diamond"
                    size={rs(18)}
                    color={/gold/i.test(featured.name) ? '#F9A825' : '#90A4AE'}
                  />
                </View>
              )}
              <View>
                <Text style={styles.gsHeroName}>
                  {featured.name.toUpperCase()}
                </Text>
                <Text style={styles.gsHeroUnit}>
                  {featured.unit.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.gsHeroUpdated}>
              <Text style={styles.gsUpdatedLabel}>Updated</Text>
              <Text style={styles.gsUpdatedVal}>
                {fmtMetalDate(featured.lastUpdated || asOf)}
              </Text>
            </View>
          </View>
          <View style={styles.gsHeroBottom}>
            <View style={{ flex: 1 }}>
              <Text style={styles.gsFieldLabel}>Current Price</Text>
              <Text style={styles.gsPrice}>{fmtRsMetal(featured.price)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gsFieldLabel}>Daily Change</Text>
              <Text
                style={[
                  styles.gsChange,
                  {
                    color:
                      featured.change >= 0 ? '#1B8E3D' : colors.danger,
                  },
                ]}
              >
                {fmtChangePill(featured.change, featured.changePercent)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.gsGrid}>
        {gridRows.map((item) => {
          const isGold = /gold/i.test(item.name);
          const up = item.change >= 0;
          return (
            <Pressable
              key={`${item.symbol}-${item.unit}-${item.name}`}
              style={styles.gsTile}
              onPress={() => setSelectedId(`${item.symbol}-${item.unit}-${item.name}`)}
            >
              <View style={styles.gsTileHead}>
                {item.icon ? (
                  <Image source={{ uri: item.icon }} style={styles.gsTileIcon} />
                ) : (
                  <View
                    style={[
                      styles.gsTileIconFallback,
                      { backgroundColor: isGold ? '#FFF3C4' : '#E8EBEF' },
                    ]}
                  >
                    <Ionicons
                      name="ellipse"
                      size={rs(14)}
                      color={isGold ? '#F9A825' : '#B0BEC5'}
                    />
                  </View>
                )}
                <Text style={styles.gsTileName} numberOfLines={1}>
                  {item.name.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.gsTilePrice}>{fmtRsMetal(item.price)}</Text>
              <Text style={styles.gsTileUnit}>
                per {item.unit.toUpperCase()}
              </Text>
              <View
                style={[
                  styles.gsPill,
                  {
                    backgroundColor: up
                      ? 'rgba(27,142,61,0.12)'
                      : 'rgba(198,40,40,0.12)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.gsPillText,
                    { color: up ? '#1B8E3D' : colors.danger },
                  ]}
                  numberOfLines={1}
                >
                  {fmtChangePill(item.change, item.changePercent)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {spark.length > 0 ? (
        <MetalSparkChart values={spark} styles={styles} />
      ) : null}
    </ScrollView>
  );
}

export function ExtraToolScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ExtraTool'>>();
  const kind = route.params.kind;
  const copy = EXTRA_TOOL_COPY[kind];
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const isGold = kind === 'gold-silver';

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
    <View style={[styles.root, isGold && styles.gsRoot]}>
      <ScreenHeader
        title={copy.title}
        navigation={navigation}
        colors={colors}
        styles={styles}
      />
      {!isGold ? (
        <LiveBanner subtitle={copy.subtitle} styles={styles} />
      ) : null}
      <View style={styles.body}>{body}</View>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const accentBlue = isDark ? c.text : '#0D47A1';
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
      backgroundColor: c.bgElevated,
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
    cardSelected: {
      borderColor: '#64B5F6',
      backgroundColor: isDark ? c.surfaceAlt : '#E3F2FD',
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
    flag: { width: rs(28), height: rs(20), borderRadius: rs(3) },
    flagLg: { width: rs(40), height: rs(28), borderRadius: rs(4) },
    flagFallback: {
      width: rs(28),
      height: rs(20),
      borderRadius: rs(3),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flagFallbackLg: {
      width: rs(40),
      height: rs(28),
      borderRadius: rs(4),
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
    ixWrap: {
      paddingHorizontal: rs(14),
      paddingBottom: rs(36),
      gap: rs(10),
    },
    ixHero: {
      backgroundColor: isDark ? c.surface : '#E3F2FD',
      borderRadius: rs(16),
      padding: rs(14),
      gap: rs(6),
      borderWidth: 1,
      borderColor: isDark ? c.border : '#BBDEFB',
    },
    ixHeroTitle: { color: accentBlue, fontWeight: '900', fontSize: rs(16) },
    ixHeroSub: { color: '#546E7A', fontSize: rs(11), fontWeight: '600' },
    ixFocus: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(14),
      borderWidth: 1,
      borderColor: '#C5D0B5',
      gap: rs(4),
    },
    ixFocusTop: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
    ixFocusName: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    ixFocusVal: { color: accentBlue, fontWeight: '900', fontSize: rs(26), marginTop: rs(4) },
    ixHeroVal: { color: accentBlue, fontWeight: '900', fontSize: rs(26), marginTop: rs(4) },
    ixHeroName: { color: accentBlue, fontWeight: '800', fontSize: rs(14) },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      alignItems: 'center',
    },
    chip: {
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      borderRadius: rs(18),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: '#C5D0B5',
    },
    chipSm: {
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: '#C5D0B5',
    },
    chipOn: { backgroundColor: '#90CAF9', borderColor: '#64B5F6' },
    chipText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(11) },
    chipTextOn: { color: accentBlue },
    breadthCard: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      padding: rs(12),
      borderWidth: 1,
      borderColor: '#C5D0B5',
      gap: rs(8),
    },
    sectionTitleInline: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
    },
    breadthTrack: {
      height: rs(12),
      borderRadius: rs(8),
      overflow: 'hidden',
      flexDirection: 'row',
      backgroundColor: c.bg,
    },
    breadthLegend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    indBarTrack: {
      marginTop: rs(8),
      height: rs(6),
      borderRadius: rs(3),
      backgroundColor: c.bg,
      overflow: 'hidden',
    },
    indBarFill: { height: '100%', borderRadius: rs(3) },
    fxHeroHead: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
    fxBadgeLg: {
      backgroundColor: isDark ? c.surfaceAlt : '#BBDEFB',
      borderRadius: rs(10),
      paddingHorizontal: rs(10),
      paddingVertical: rs(8),
    },
    fxIsoLg: { color: accentBlue, fontWeight: '900', fontSize: rs(14) },
    fxRateRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(8) },
    fxRateBox: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      borderRadius: rs(10),
      padding: rs(8),
      borderWidth: 1,
      borderColor: isDark ? c.border : '#BBDEFB',
    },
    fxRateBig: { color: accentBlue, fontWeight: '900', fontSize: rs(14), marginTop: rs(2) },
    calcCard: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(12),
      borderWidth: 1,
      borderColor: '#C5D0B5',
      gap: rs(8),
    },
    amountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8) },
    calcResult: { color: c.text, fontWeight: '900', fontSize: rs(18) },
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

    gsRoot: { backgroundColor: c.bg },
    gsWrap: {
      paddingHorizontal: rs(14),
      paddingTop: rs(8),
      paddingBottom: rs(32),
      gap: rs(12),
    },
    gsHero: {
      backgroundColor: c.surface,
      borderRadius: rs(20),
      padding: rs(16),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    gsHeroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: rs(16),
    },
    gsHeroLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10), flex: 1 },
    gsHeroIcon: { width: rs(42), height: rs(42), borderRadius: rs(21) },
    gsHeroIconFallback: {
      width: rs(42),
      height: rs(42),
      borderRadius: rs(21),
      alignItems: 'center',
      justifyContent: 'center',
    },
    gsHeroName: { color: '#1B1B1B', fontWeight: '900', fontSize: rs(15) },
    gsHeroUnit: { color: '#8A948A', fontWeight: '600', fontSize: rs(12), marginTop: rs(2) },
    gsHeroUpdated: { alignItems: 'flex-end' },
    gsUpdatedLabel: { color: '#8A948A', fontSize: rs(11), fontWeight: '600' },
    gsUpdatedVal: { color: '#1B1B1B', fontWeight: '800', fontSize: rs(12), marginTop: rs(2) },
    gsHeroBottom: { flexDirection: 'row', gap: rs(12) },
    gsFieldLabel: { color: '#8A948A', fontSize: rs(12), fontWeight: '600', marginBottom: rs(4) },
    gsPrice: { color: '#1B1B1B', fontWeight: '900', fontSize: rs(22) },
    gsChange: { fontWeight: '800', fontSize: rs(15) },
    gsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(10),
    },
    gsTile: {
      width: '48%',
      flexGrow: 1,
      maxWidth: '48.5%',
      backgroundColor: c.surface,
      borderRadius: rs(18),
      padding: rs(12),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
      minHeight: rs(150),
    },
    gsTileHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(10),
    },
    gsTileIcon: { width: rs(28), height: rs(28), borderRadius: rs(14) },
    gsTileIconFallback: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      alignItems: 'center',
      justifyContent: 'center',
    },
    gsTileName: {
      flex: 1,
      color: '#1B1B1B',
      fontWeight: '900',
      fontSize: rs(11),
      letterSpacing: 0.2,
    },
    gsTilePrice: {
      color: '#1B1B1B',
      fontWeight: '900',
      fontSize: rs(16),
      marginBottom: rs(2),
    },
    gsTileUnit: {
      color: '#8A948A',
      fontSize: rs(11),
      fontWeight: '600',
      marginBottom: rs(10),
    },
    gsPill: {
      alignSelf: 'flex-start',
      borderRadius: rs(14),
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
      maxWidth: '100%',
    },
    gsPillText: { fontWeight: '800', fontSize: rs(11) },
    chartCard: {
      backgroundColor: c.surface,
      borderRadius: rs(20),
      padding: rs(14),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    chartBody: { flexDirection: 'row' },
    chartYAxis: {
      width: rs(34),
      justifyContent: 'space-between',
      paddingVertical: rs(2),
    },
    chartYLabel: { color: '#9AA39A', fontSize: rs(10), fontWeight: '600' },
    chartPlot: {
      flex: 1,
      marginLeft: rs(4),
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: '#E6EBE6',
      position: 'relative',
      overflow: 'hidden',
    },
    chartGridLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderTopColor: '#DDE3DD',
    },
    chartBars: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: rs(2),
      gap: 1,
    },
    chartCol: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    chartBar: {
      width: '100%',
      backgroundColor: 'rgba(120, 140, 160, 0.28)',
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
    },
    chartXAxis: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: rs(8),
      paddingLeft: rs(34),
    },
    chartXLabel: { color: '#9AA39A', fontSize: rs(10), fontWeight: '600' },
  });
}
