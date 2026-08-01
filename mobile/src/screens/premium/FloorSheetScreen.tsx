import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { nepalTodayIso } from '../../services/nepse/holidays';
import {
  loadFloorsheet,
  type FloorsheetRow,
} from '../../services/nepse/screener';
import { rs } from '../../utils/responsive';
import { safeGoBack } from '../../utils/safeGoBack';
import type { RootStackParamList } from '../../navigation/types';

const GREEN = '#2E7D32';
const PAGE_SIZE = 50;
const ROW_H = rs(36);

function brokerId(raw: string | null | undefined): string {
  if (!raw) return '—';
  const m = String(raw).match(/\d+/);
  // Prefer number only — never show a firm name in BB/SB.
  return m ? m[0] : '—';
}

function fmtAmtShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} Lkh`;
  return n.toLocaleString('en-NP', { maximumFractionDigits: 0 });
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-NP');
}

function fmtRate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NP', { maximumFractionDigits: 2 });
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Already a display string or HH:mm:ss
    if (/am|pm/i.test(iso)) return iso;
    const t = iso.slice(11, 19);
    return t || iso;
  }
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** Floor Sheet — filters + footer fixed; only trade rows scroll. */
export function FloorSheetScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [symbolDraft, setSymbolDraft] = useState('');
  const [dateDraft, setDateDraft] = useState(nepalTodayIso());
  const [buyerDraft, setBuyerDraft] = useState('');
  const [sellerDraft, setSellerDraft] = useState('');

  const [symbol, setSymbol] = useState('');
  const [businessDate, setBusinessDate] = useState(nepalTodayIso());
  const [buyerId, setBuyerId] = useState('');
  const [sellerId, setSellerId] = useState('');

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<FloorsheetRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);
  const [sessionAmt, setSessionAmt] = useState<number | null>(null);
  const [sessionQty, setSessionQty] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const pageTotals = useMemo(() => {
    let amt = 0;
    let qty = 0;
    for (const r of rows) {
      amt += r.amount ?? 0;
      qty += r.quantity ?? 0;
    }
    return { amt, qty };
  }, [rows]);

  const loadSessionSummary = useCallback(async () => {
    try {
      const res = await fetch(
        `https://sharehubnepal.com/live/api/v1/nepselive/market-summary?_=${Date.now()}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return;
      const json = (await res.json()) as
        | Array<{ detail?: string; value?: number }>
        | { data?: Array<{ detail?: string; value?: number }> };
      const rowsArr = Array.isArray(json) ? json : json.data ?? [];
      const find = (needle: string) =>
        rowsArr.find((r) =>
          String(r.detail ?? '')
            .toLowerCase()
            .includes(needle),
        )?.value ?? null;
      const turnover = find('turnover');
      const shares = find('traded shares');
      const tx = find('transactions');
      if (turnover != null) setSessionAmt(turnover);
      if (shares != null) setSessionQty(shares);
      if (tx != null) setTotalTrades(tx);
    } catch {
      // keep floorsheet totals
    }
  }, []);

  const fetchPage = useCallback(
    async (pageNum: number, filters: {
      symbol: string;
      businessDate: string;
      buyerId: string;
      sellerId: string;
    }) => {
      setBusy(true);
      try {
        const res = await loadFloorsheet(pageNum, PAGE_SIZE, {
          symbol: filters.symbol || undefined,
          businessDate: filters.businessDate || undefined,
          buyerMemberId: filters.buyerId || undefined,
          sellerMemberId: filters.sellerId || undefined,
        });
        setRows(res.rows);
        setPage(pageNum);
        setTotalPages(Math.max(1, res.totalPages ?? 1));
        if (res.totalItems != null) setTotalTrades(res.totalItems);
        if (pageNum === 1) void loadSessionSummary();
      } finally {
        setBusy(false);
        setLoading(false);
      }
    },
    [loadSessionSummary],
  );

  useEffect(() => {
    void fetchPage(1, {
      symbol,
      businessDate,
      buyerId,
      sellerId,
    });
  }, [fetchPage, symbol, businessDate, buyerId, sellerId]);

  const applyFilter = () => {
    setSymbol(symbolDraft.trim().toUpperCase());
    setBusinessDate(dateDraft.trim() || nepalTodayIso());
    setBuyerId(buyerDraft.trim().replace(/\D/g, ''));
    setSellerId(sellerDraft.trim().replace(/\D/g, ''));
    setPage(1);
  };

  const onRefresh = () => {
    void fetchPage(page, { symbol, businessDate, buyerId, sellerId });
  };

  const goPrev = () => {
    if (page <= 1 || busy) return;
    void fetchPage(page - 1, { symbol, businessDate, buyerId, sellerId });
  };

  const goNext = () => {
    if (page >= totalPages || busy) return;
    void fetchPage(page + 1, { symbol, businessDate, buyerId, sellerId });
  };

  const snBase = (page - 1) * PAGE_SIZE;

  const body = loading && rows.length === 0 ? (
    <View style={styles.center}>
      <ActivityIndicator color={GREEN} />
      <Text style={styles.loadingHint}>Loading floor sheet…</Text>
    </View>
  ) : (
    <View style={styles.body}>
      {/* Fixed filters */}
      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <View style={styles.inputBox}>
            <Ionicons name="search" size={rs(15)} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Select stock"
              placeholderTextColor={colors.textMuted}
              value={symbolDraft}
              onChangeText={setSymbolDraft}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <View style={styles.inputBox}>
            <Ionicons name="calendar-outline" size={rs(15)} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Business date"
              placeholderTextColor={colors.textMuted}
              value={dateDraft}
              onChangeText={setDateDraft}
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={styles.filterRow}>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="Buyer broker id"
              placeholderTextColor={colors.textMuted}
              value={buyerDraft}
              onChangeText={setBuyerDraft}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="Seller broker id"
              placeholderTextColor={colors.textMuted}
              value={sellerDraft}
              onChangeText={setSellerDraft}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.filterBtn} onPress={applyFilter}>
            <Ionicons name="options-outline" size={rs(16)} color="#FFF" />
            <Text style={styles.filterBtnText}>Filter</Text>
          </Pressable>
          <Pressable
            style={styles.refreshBtn}
            onPress={onRefresh}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="refresh" size={rs(18)} color="#FFF" />
            )}
          </Pressable>
        </View>
      </View>

      {/* Fixed column header */}
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colSn]}>SN</Text>
        <Text style={[styles.th, styles.colSym]}>SYM</Text>
        <Text style={[styles.th, styles.colBb]}>BB</Text>
        <Text style={[styles.th, styles.colSb]}>SB</Text>
        <Text style={[styles.th, styles.colQty]}>QTY</Text>
        <Text style={[styles.th, styles.colRate]}>RATE</Text>
        <Text style={[styles.th, styles.colAmt]}>AMT</Text>
        <Text style={[styles.th, styles.colTime]}>TIME</Text>
      </View>

      {/* Scrollable data only */}
      <FlatList
        data={rows}
        style={styles.list}
        keyExtractor={(item, i) => `${item.contractId}-${i}`}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
        maxToRenderPerBatch={30}
        windowSize={8}
        ListEmptyComponent={
          <Text style={styles.empty}>No trades for this filter.</Text>
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={[styles.row, index % 2 === 1 && styles.rowAlt]}
            onPress={() =>
              navigation.navigate('StockDetail', { symbol: item.symbol })
            }
          >
            <Text style={[styles.td, styles.colSn]} numberOfLines={1}>
              {snBase + index + 1}
            </Text>
            <Text
              style={[styles.td, styles.colSym, styles.symText]}
              numberOfLines={1}
            >
              {item.symbol}
            </Text>
            <Text style={[styles.td, styles.colBb]} numberOfLines={1}>
              {brokerId(item.buyerBroker)}
            </Text>
            <Text style={[styles.td, styles.colSb]} numberOfLines={1}>
              {brokerId(item.sellerBroker)}
            </Text>
            <Text style={[styles.td, styles.colQty]} numberOfLines={1}>
              {fmtQty(item.quantity)}
            </Text>
            <Text style={[styles.td, styles.colRate]} numberOfLines={1}>
              {fmtRate(item.rate)}
            </Text>
            <Text style={[styles.td, styles.colAmt]} numberOfLines={1}>
              {fmtAmtShort(item.amount)}
            </Text>
            <Text style={[styles.td, styles.colTime]} numberOfLines={1}>
              {fmtTime(item.tradeTime)}
            </Text>
          </Pressable>
        )}
      />

      {/* Fixed footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, rs(8)) }]}>
        <View style={styles.pager}>
          <Pressable
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
            onPress={goPrev}
            disabled={page <= 1 || busy}
          >
            <Ionicons name="chevron-back" size={rs(18)} color="#FFF" />
          </Pressable>
          <Text style={styles.pageText}>
            {page} / {totalPages}
          </Text>
          <Pressable
            style={[
              styles.pageBtn,
              page >= totalPages && styles.pageBtnDisabled,
            ]}
            onPress={goNext}
            disabled={page >= totalPages || busy}
          >
            <Ionicons name="chevron-forward" size={rs(18)} color="#FFF" />
          </Pressable>
        </View>
        <View style={styles.summaryBar}>
          <Text style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Amt: </Text>
            {fmtAmtShort(sessionAmt ?? pageTotals.amt)}
          </Text>
          <Text style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Qty: </Text>
            {fmtQty(sessionQty ?? pageTotals.qty)}
          </Text>
          <Text style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Trades: </Text>
            {totalTrades.toLocaleString('en-NP')}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(navigation)} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Floor Sheet</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate
        title="Floor Sheet"
        subtitle="Session trade tape — filter by stock, date, and broker."
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
      gap: rs(10),
    },
    loadingHint: { color: c.textMuted, fontSize: rs(12) },
    filters: {
      paddingHorizontal: rs(12),
      paddingBottom: rs(8),
      gap: rs(8),
      backgroundColor: c.bg,
    },
    filterRow: { flexDirection: 'row', gap: rs(8) },
    inputBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(10),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: isDark ? c.surface : '#F4F6F4',
    },
    input: {
      flex: 1,
      color: c.text,
      fontSize: rs(12.5),
      paddingVertical: rs(9),
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
    },
    filterBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: GREEN,
      borderRadius: rs(22),
      paddingVertical: rs(11),
    },
    filterBtnText: {
      color: '#FFF',
      fontWeight: '800',
      fontSize: rs(14),
    },
    refreshBtn: {
      width: rs(42),
      height: rs(42),
      borderRadius: rs(21),
      backgroundColor: GREEN,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      backgroundColor: c.bg,
    },
    th: {
      color: c.textMuted,
      fontWeight: '800',
      fontSize: rs(10),
      letterSpacing: 0.2,
    },
    list: { flex: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_H,
      paddingHorizontal: rs(8),
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    rowAlt: { backgroundColor: isDark ? c.bg : '#F7F9F7' },
    td: { color: c.text, fontSize: rs(10.5), fontWeight: '600' },
    symText: { fontWeight: '800' },
    colSn: { width: rs(32) },
    colSym: { width: rs(52) },
    colBb: { width: rs(34), textAlign: 'center' },
    colSb: { width: rs(34), textAlign: 'center' },
    colQty: { width: rs(48), textAlign: 'right' },
    colRate: { width: rs(48), textAlign: 'right' },
    colAmt: { width: rs(56), textAlign: 'right' },
    colTime: { flex: 1, textAlign: 'right', paddingLeft: rs(4) },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: rs(40),
      fontSize: rs(13),
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
      backgroundColor: c.bg,
      paddingTop: rs(8),
    },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(18),
      paddingBottom: rs(8),
    },
    pageBtn: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      backgroundColor: GREEN,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageBtnDisabled: { opacity: 0.35 },
    pageText: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      minWidth: rs(72),
      textAlign: 'center',
    },
    summaryBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
      backgroundColor: isDark ? c.surfaceAlt : '#EEF1EE',
    },
    summaryItem: {
      color: c.text,
      fontSize: rs(11),
      fontWeight: '700',
    },
    summaryLabel: {
      color: c.textMuted,
      fontWeight: '700',
    },
  });
}
