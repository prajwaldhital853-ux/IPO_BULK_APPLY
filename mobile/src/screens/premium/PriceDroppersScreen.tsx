import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
  loadPremiumScreener,
  peekPremiumScreener,
  type PremiumScreenerRow,
  type PremiumScreenerSnapshot,
} from '../../services/nepse/premiumScreeners';
import { fmtNum, iconUri } from '../../services/nepse/screener';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import { useAfterInteractions } from '../../utils/useAfterInteractions';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

const HEADER_TEAL = '#1A5F5A';
const SYM_COL_W = rs(100);
const ROW_H = rs(48);
const LOGO_SZ = rs(22);
const HCOL_LTP = rs(72);
const HCOL_SWING_H = rs(88);
const HCOL_SWING_L = rs(88);
const HCOL_CHG = rs(72);
const HCOL_52H = rs(96);
const HCOL_52L = rs(96);

function fmtPx(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NP', { maximumFractionDigits: 2 });
}

function fmtChg1(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return pct.toFixed(1);
}

function SymLogo({
  symbol,
  iconUrl,
  styles,
}: {
  symbol: string;
  iconUrl: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);
  if (iconUrl && !failed) {
    const uri = iconUri(iconUrl) ?? iconUrl;
    return (
      <Image
        source={{ uri }}
        style={styles.logoImg}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.logo}>
      <Text style={styles.logoText}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

/** Dedicated Price Droppers board — sticky SYM + horizontal/vertical scroll. */
export function PriceDroppersScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const ready = useAfterInteractions();
  // Shell-first — warm wide table during push freezes Services→section.
  const [snap, setSnap] = useState<PremiumScreenerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const hScrollX = useRef(new Animated.Value(0)).current;

  const onHorizScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: hScrollX } } }], {
        useNativeDriver: true,
      }),
    [hScrollX],
  );

  const stickySymStyle = useMemo(
    () => ({ transform: [{ translateX: hScrollX }] }),
    [hScrollX],
  );

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setSnap(await loadPremiumScreener('price-droppers'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const warm = peekPremiumScreener('price-droppers');
    if (warm?.rows.length) {
      setSnap(warm);
      setLoading(false);
      void refresh(true);
    } else {
      void refresh(false);
    }
  }, [ready, refresh]);

  usePollingRefresh(ready ? refresh : async () => undefined, undefined, true, {
    invalidate: false,
  });

  const rows = snap?.rows ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const scrollColsWidth =
    HCOL_LTP +
    HCOL_SWING_H +
    HCOL_SWING_L +
    HCOL_CHG +
    HCOL_52H +
    HCOL_52L;
  const tableWidth = SYM_COL_W + scrollColsWidth;

  const showInfo = () => {
    Alert.alert(
      'Price Droppers',
      [
        snap?.subtitle,
        '% Change = drop from Swing High to LTP.',
        'Scroll right for 52 Week High / Low.',
        'SYM stays pinned while you scroll sideways.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  };

  const renderDataCols = (item: PremiumScreenerRow) => (
    <>
      <Text style={[styles.td, styles.hColLtp]} numberOfLines={1}>
        {fmtPx(item.ltp)}
      </Text>
      <Text style={[styles.td, styles.hColSwingH]} numberOfLines={1}>
        {fmtPx(item.swingHigh)}
      </Text>
      <Text style={[styles.td, styles.hColSwingL]} numberOfLines={1}>
        {fmtPx(item.swingLow)}
      </Text>
      <Text style={[styles.td, styles.hColChg, styles.chgDown]} numberOfLines={1}>
        {fmtChg1(item.dropFromHighPct ?? item.changePct)}
      </Text>
      <Text style={[styles.td, styles.hCol52H]} numberOfLines={1}>
        {fmtPx(item.high52)}
      </Text>
      <Text style={[styles.td, styles.hCol52L]} numberOfLines={1}>
        {fmtPx(item.low52)}
      </Text>
    </>
  );

  const tableHeader = (
    <View style={[styles.tableHeadRow, { width: tableWidth }]}>
      <Animated.View
        style={[styles.symHeadFixed, styles.stickySym, stickySymStyle]}
      >
        <Text style={styles.th}>SYM</Text>
      </Animated.View>
      <Text style={[styles.th, styles.hColLtp]}>LTP</Text>
      <Text style={[styles.th, styles.hColSwingH]}>Swing High</Text>
      <Text style={[styles.th, styles.hColSwingL]}>Swing Low</Text>
      <Text style={[styles.th, styles.hColChg]}>% Change</Text>
      <Text style={[styles.th, styles.hCol52H]}>52 Week High</Text>
      <Text style={[styles.th, styles.hCol52L]}>52 Week Low</Text>
    </View>
  );

  const body =
    loading && rows.length === 0 ? (
      <View style={styles.center}>
        <ActivityIndicator color={HEADER_TEAL} />
        <Text style={styles.loadingHint}>Loading price droppers…</Text>
      </View>
    ) : (
      <View style={styles.body}>
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={rs(15)} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search symbol / company…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="characters"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={rs(16)}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.tableWrap}>
          <Animated.ScrollView
            horizontal
            bounces={false}
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            scrollEventThrottle={16}
            onScroll={onHorizScroll}
            style={styles.hTableScroll}
            contentContainerStyle={styles.hTableContent}
          >
            <View style={[styles.tableInner, { width: tableWidth }]}>
              {tableHeader}
              <FlatList
                data={filtered}
                style={styles.dataList}
                contentContainerStyle={styles.listContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                initialNumToRender={24}
                maxToRenderPerBatch={30}
                windowSize={8}
                removeClippedSubviews={false}
                keyExtractor={(item) => item.symbol}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => {
                      setRefreshing(true);
                      void refresh(true);
                    }}
                    tintColor={HEADER_TEAL}
                  />
                }
                ListEmptyComponent={
                  <Text style={styles.empty}>
                    {query.trim()
                      ? 'No matching symbols.'
                      : 'No price droppers right now.'}
                  </Text>
                }
                ListFooterComponent={<View style={styles.footerPad} />}
                renderItem={({ item, index }) => (
                  <Pressable
                    style={[
                      styles.fullRow,
                      { width: tableWidth },
                      index % 2 === 1 && styles.rowAlt,
                    ]}
                    onPress={() =>
                      navigation.navigate('StockDetail', {
                        symbol: item.symbol,
                      })
                    }
                  >
                    <Animated.View
                      style={[
                        styles.symCell,
                        index % 2 === 1 && styles.rowAlt,
                        styles.stickySym,
                        stickySymStyle,
                      ]}
                    >
                      <SymLogo
                        symbol={item.symbol}
                        iconUrl={item.iconUrl}
                        styles={styles}
                      />
                      <View style={styles.symMeta}>
                        <Text style={styles.symText} numberOfLines={1}>
                          {item.symbol}
                        </Text>
                        <Text style={styles.rankText}>#{item.rank}</Text>
                      </View>
                    </Animated.View>
                    {renderDataCols(item)}
                  </Pressable>
                )}
              />
            </View>
          </Animated.ScrollView>
        </View>
      </View>
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Price Droppers</Text>
        <Pressable onPress={showInfo} hitSlop={12}>
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
      <PremiumGate
        title="Price Droppers"
        subtitle={
          snap?.subtitle ??
          'Stocks under the most pressure — drop from swing high.'
        }
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
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: c.bg,
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    body: { flex: 1 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(12),
    },
    loadingHint: { color: c.textMuted, fontSize: rs(12) },
    searchWrap: {
      paddingHorizontal: rs(14),
      paddingBottom: rs(8),
      backgroundColor: c.bg,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingHorizontal: rs(12),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(10),
    },
    tableWrap: { flex: 1 },
    hTableScroll: { flex: 1 },
    hTableContent: { flexGrow: 1 },
    tableInner: { flex: 1 },
    dataList: { flex: 1 },
    listContent: { paddingBottom: rs(20) },
    tableHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_H,
      backgroundColor: HEADER_TEAL,
    },
    stickySym: {
      zIndex: 4,
      elevation: 4,
    },
    symHeadFixed: {
      width: SYM_COL_W,
      height: ROW_H,
      justifyContent: 'center',
      paddingLeft: rs(10),
      paddingRight: rs(4),
      backgroundColor: HEADER_TEAL,
    },
    fullRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_H,
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    rowAlt: { backgroundColor: isDark ? c.bg : '#F5F7F8' },
    symCell: {
      width: SYM_COL_W,
      height: ROW_H,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingLeft: rs(8),
      paddingRight: rs(4),
      backgroundColor: c.surface,
    },
    symMeta: { flex: 1, minWidth: 0 },
    symText: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(12),
    },
    rankText: {
      color: c.textMuted,
      fontSize: rs(10),
      fontWeight: '600',
      marginTop: rs(1),
    },
    th: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(11),
    },
    td: { color: c.text, fontSize: rs(12), fontWeight: '600' },
    hColLtp: { width: HCOL_LTP, textAlign: 'right', paddingRight: rs(8) },
    hColSwingH: { width: HCOL_SWING_H, textAlign: 'right', paddingRight: rs(8) },
    hColSwingL: { width: HCOL_SWING_L, textAlign: 'right', paddingRight: rs(8) },
    hColChg: { width: HCOL_CHG, textAlign: 'right', paddingRight: rs(8) },
    hCol52H: { width: HCOL_52H, textAlign: 'right', paddingRight: rs(8) },
    hCol52L: { width: HCOL_52L, textAlign: 'right', paddingRight: rs(10) },
    chgDown: { color: '#E5484D', fontWeight: '800' },
    logo: {
      width: LOGO_SZ,
      height: LOGO_SZ,
      borderRadius: LOGO_SZ / 2,
      backgroundColor: '#DCE8E6',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    logoImg: {
      width: LOGO_SZ,
      height: LOGO_SZ,
      borderRadius: LOGO_SZ / 2,
      backgroundColor: '#DCE8E6',
      flexShrink: 0,
    },
    logoText: {
      color: HEADER_TEAL,
      fontWeight: '900',
      fontSize: rs(10),
    },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      paddingHorizontal: rs(20),
      fontSize: rs(13),
    },
    footerPad: { height: rs(24) },
  });
}
