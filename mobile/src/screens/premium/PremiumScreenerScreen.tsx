import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
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
import {
  loadPremiumScreener,
  peekPremiumScreener,
  premiumScreenerMeta,
  type PremiumScreenerKind,
  type PremiumScreenerRow,
  type PremiumScreenerSnapshot,
} from '../../services/nepse/premiumScreeners';
import { fmtMcap, fmtNum } from '../../services/nepse/screener';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import { useAfterInteractions } from '../../utils/useAfterInteractions';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';
import { PriceDroppersScreen } from './PriceDroppersScreen';

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

function accentForKind(kind: PremiumScreenerKind, colors: ThemeColors): string {
  if (kind === 'price-droppers') return colors.danger;
  if (
    kind === 'rising-stocks' ||
    kind === 'small-caps' ||
    kind === 'high-earners'
  ) {
    return colors.accentGreen;
  }
  if (
    kind === 'value-pick' ||
    kind === 'unlock-period' ||
    kind === 'strong-reserves'
  ) {
    return '#AB47BC';
  }
  return colors.primary;
}

export function PremiumScreenerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'PremiumScreener'>>();
  const kind = route.params.kind;

  // Dedicated wide table UI (sticky SYM + H/V scroll) like Acc/Dis.
  if (kind === 'price-droppers') {
    return <PriceDroppersScreen />;
  }

  return <PremiumScreenerBody kind={kind} />;
}

function PremiumScreenerBody({ kind }: { kind: PremiumScreenerKind }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(
    () => makeStyles(colors, accentForKind(kind, colors)),
    [colors, kind],
  );
  const meta = premiumScreenerMeta(kind);
  const ready = useAfterInteractions();

  // Shell-first: never mount a warm FlatList during the stack push.
  const [snap, setSnap] = useState<PremiumScreenerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setSnap(await loadPremiumScreener(kind));
    setLoading(false);
  }, [kind]);

  // Hydrate after the transition finishes — warm peek is free, lists are not.
  useEffect(() => {
    if (!ready) return;
    const warm = peekPremiumScreener(kind);
    if (warm?.rows.length) {
      setSnap(warm);
      setLoading(false);
      void refresh(true);
    } else {
      void refresh(false);
    }
  }, [ready, kind, refresh]);

  usePollingRefresh(ready ? refresh : async () => undefined);

  const body =
    loading && !snap ? (
      <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
    ) : (
      <FlatList
        data={snap?.rows ?? []}
        keyExtractor={(item) => item.symbol}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
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
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                Live · refreshed {fmtAsOf(snap?.asOf ?? new Date().toISOString())}
              </Text>
            </View>
            <Text style={styles.subtitle}>{snap?.subtitle ?? meta.subtitle}</Text>
            <View style={styles.summaryRow}>
              {(snap?.summary ?? []).map((s) => (
                <View key={s.label} style={styles.summaryPill}>
                  <Text style={styles.summaryVal}>{s.value}</Text>
                  <Text style={styles.summaryLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ScreenerCard
            item={item}
            colors={colors}
            styles={styles}
            onPress={() =>
              navigation.navigate('StockDetail', { symbol: item.symbol })
            }
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No stocks match this screener right now.</Text>
        }
      />
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.title}>{snap?.title ?? meta.title}</Text>
          <View style={styles.premiumTag}>
            <Ionicons name="diamond" size={rs(10)} color="#FFD54F" />
            <Text style={styles.premiumTagText}>PREMIUM</Text>
          </View>
        </View>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate title={meta.title} subtitle={meta.subtitle}>
        {body}
      </PremiumGate>
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
  const chColor = ch >= 0 ? colors.accentGreen : colors.danger;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{item.rank}</Text>
        </View>
        {item.iconUrl ? (
          <Image source={{ uri: item.iconUrl }} style={styles.logo} />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoLetter}>{item.symbol.slice(0, 1)}</Text>
          </View>
        )}
        <View style={styles.cardMid}>
          <Text style={styles.sym}>{item.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.insight} numberOfLines={1}>
            {item.insight}
          </Text>
          {item.tags.length ? (
            <View style={styles.tagRow}>
              {item.tags.slice(0, 2).map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.ltp}>{item.ltp != null ? fmtNum(item.ltp) : '—'}</Text>
          <Text style={[styles.chg, { color: chColor }]}>
            {item.changePct != null
              ? `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(2)}%`
              : '—'}
          </Text>
          <Text style={styles.meta}>
            {item.pe != null ? `PE ${fmtNum(item.pe)}` : fmtMcap(item.mcap)}
          </Text>
        </View>
      </View>
      <View style={styles.scoreBar}>
        <View style={[styles.scoreFill, { width: `${Math.min(100, item.score * 12)}%` }]} />
      </View>
    </Pressable>
  );
}

function makeStyles(c: ThemeColors, accent: string) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
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
      backgroundColor: `${accent}22`,
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
      borderRadius: rs(10),
    },
    premiumTagText: {
      color: accent,
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
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
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
    card: {
      marginBottom: rs(10),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      padding: rs(12),
      overflow: 'hidden',
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
    rankBadge: {
      width: rs(26),
      height: rs(26),
      borderRadius: rs(8),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: { color: c.textMuted, fontWeight: '800', fontSize: rs(11) },
    logo: { width: rs(36), height: rs(36), borderRadius: rs(18) },
    logoFallback: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    cardMid: { flex: 1, minWidth: 0 },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    name: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(1) },
    insight: { color: accent, fontSize: rs(10), marginTop: rs(4), fontWeight: '600' },
    tagRow: { flexDirection: 'row', gap: rs(4), marginTop: rs(6), flexWrap: 'wrap' },
    tag: {
      backgroundColor: c.primarySoft,
      paddingHorizontal: rs(6),
      paddingVertical: rs(2),
      borderRadius: rs(6),
    },
    tagText: { color: c.primary, fontSize: rs(9), fontWeight: '700' },
    cardRight: { alignItems: 'flex-end' },
    ltp: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    chg: { fontWeight: '800', fontSize: rs(12), marginTop: rs(2) },
    meta: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    scoreBar: {
      height: rs(3),
      backgroundColor: c.surfaceAlt,
      borderRadius: rs(2),
      marginTop: rs(10),
      overflow: 'hidden',
    },
    scoreFill: {
      height: '100%',
      backgroundColor: accent,
      borderRadius: rs(2),
    },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
      fontSize: rs(13),
    },
  });
}
