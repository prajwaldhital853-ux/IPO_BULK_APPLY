import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import { type ThemeColors } from '../theme/colors';
import { importPortfolioFromMeroshare } from '../services/meroshare';
import type { AccountMeta } from '../types/account';
import {
  saveBulkPortfolioSnapshot,
  type BulkHoldingSnap,
} from '../storage/bulkPortfolioStorage';
import { SwipeTabGesture } from '../components/SwipeTabGesture';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type RowStatus = 'pending' | 'running' | 'done' | 'error';

type PortfolioRow = {
  account: AccountMeta;
  status: RowStatus;
  value: number;
  change: number;
  holdings: number;
  message?: string;
};

function holdingValue(h: {
  qty: number;
  ltp: number | null;
  wacc: number;
  previousClosingPrice?: number | null;
}): number {
  if (h.ltp != null) return h.qty * h.ltp;
  if (h.previousClosingPrice != null) return h.qty * h.previousClosingPrice;
  return h.qty * (h.wacc ?? 0);
}

function holdingChange(h: {
  qty: number;
  ltp: number | null;
  previousClosingPrice?: number | null;
}): number {
  if (h.ltp == null || h.previousClosingPrice == null) return 0;
  return h.qty * (h.ltp - h.previousClosingPrice);
}

function formatRs(n: number, hidden: boolean): string {
  if (hidden) return 'Rs. •••••';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-NP', {
    maximumFractionDigits: 0,
  });
  return `Rs. ${formatted}`;
}

function formatChange(n: number, hidden: boolean): string {
  if (hidden) return '••••';
  const abs = Math.abs(n).toLocaleString('en-NP', {
    maximumFractionDigits: 0,
  });
  if (n > 0) return `▲ Rs. ${abs}`;
  if (n < 0) return `▼ Rs. ${abs}`;
  return `— Rs. 0`;
}

/** Tinted pill colors for the white account cards (light theme). */
function changeTint(n: number): { bg: string; fg: string } {
  if (n > 0) return { bg: 'rgba(46,158,91,0.12)', fg: '#2E9E5B' };
  if (n < 0) return { bg: 'rgba(229,72,77,0.12)', fg: '#E5484D' };
  return { bg: 'rgba(0,0,0,0.05)', fg: '#8A948A' };
}

type ChangeFilter = 'all' | 'gained' | 'loss' | 'unch';

const FILTER_ORDER: ChangeFilter[] = ['all', 'gained', 'loss', 'unch'];

export function BulkPortfolioScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { usableAccounts: accounts } = useActiveAccounts();

  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [running, setRunning] = useState(false);
  const [fetched, setFetched] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChangeFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const fetchAll = useCallback(async (list: AccountMeta[]) => {
    if (!list.length) {
      setRows([]);
      setFetched(0);
      setRunning(false);
      return;
    }
    setRunning(true);
    setFetched(0);
    setRows(
      list.map((account) => ({
        account,
        status: 'pending',
        value: 0,
        change: 0,
        holdings: 0,
      })),
    );

    let done = 0;
    const snapRows: BulkHoldingSnap[] = [];
    for (const account of list) {
      setRows((prev) =>
        prev.map((r) =>
          r.account.id === account.id ? { ...r, status: 'running' } : r,
        ),
      );
      try {
        const result = await importPortfolioFromMeroshare(account);
        const value = result.holdings.reduce(
          (sum, h) => sum + holdingValue(h),
          0,
        );
        const change = result.holdings.reduce(
          (sum, h) => sum + holdingChange(h),
          0,
        );
        for (const h of result.holdings) {
          snapRows.push({
            accountId: account.id,
            accountName: account.name,
            symbol: h.symbol,
            name: h.name,
            qty: h.qty,
            wacc: h.wacc,
            ltp: h.ltp,
            previousClosingPrice: h.previousClosingPrice ?? null,
            value: holdingValue(h),
            dayChange: holdingChange(h),
          });
        }
        setRows((prev) =>
          prev.map((r) =>
            r.account.id === account.id
              ? {
                  ...r,
                  status: 'done',
                  value,
                  change,
                  holdings: result.holdings.length,
                  message: undefined,
                }
              : r,
          ),
        );
      } catch (e) {
        setRows((prev) =>
          prev.map((r) =>
            r.account.id === account.id
              ? {
                  ...r,
                  status: 'error',
                  value: 0,
                  change: 0,
                  holdings: 0,
                  message:
                    e instanceof Error ? e.message : 'Could not fetch portfolio',
                }
              : r,
          ),
        );
      }
      done += 1;
      setFetched(done);
    }
    const totalValue = snapRows.reduce((s, r) => s + r.value, 0);
    const dayChange = snapRows.reduce((s, r) => s + r.dayChange, 0);
    await saveBulkPortfolioSnapshot({
      updatedAt: new Date().toISOString(),
      totalValue,
      dayChange,
      accounts: list.length,
      holdings: snapRows.length,
      rows: snapRows,
    });
    setRunning(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchAll(accounts);
    }, [accounts, fetchAll]),
  );

  const counts = useMemo(() => {
    const done = rows.filter((r) => r.status === 'done');
    return {
      all: rows.length,
      gained: done.filter((r) => r.change > 0).length,
      loss: done.filter((r) => r.change < 0).length,
      unch: done.filter((r) => r.change === 0).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.account.name.toLowerCase().includes(q)) return false;
      if (filter === 'gained') return r.status === 'done' && r.change > 0;
      if (filter === 'loss') return r.status === 'done' && r.change < 0;
      if (filter === 'unch') return r.status === 'done' && r.change === 0;
      return true;
    });
  }, [rows, query, filter]);

  const totals = useMemo(() => {
    const ok = rows.filter((r) => r.status === 'done');
    return {
      value: ok.reduce((s, r) => s + r.value, 0),
      change: ok.reduce((s, r) => s + r.change, 0),
      holdings: ok.reduce((s, r) => s + r.holdings, 0),
      accounts: rows.length,
    };
  }, [rows]);

  const progress =
    rows.length === 0 ? 0 : Math.min(1, fetched / Math.max(rows.length, 1));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Bulk Portfolio Check
        </Text>
        <Pressable
          onPress={() => void fetchAll(accounts)}
          hitSlop={10}
          style={styles.iconBtn}
          disabled={running}
        >
          <Ionicons
            name="refresh"
            size={rs(22)}
            color={running ? colors.textDim : colors.text}
          />
        </Pressable>
        <Pressable
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={rs(22)}
            color={colors.text}
          />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search account…"
            placeholderTextColor={colors.textDim}
            style={styles.searchInput}
            autoFocus
          />
        </View>
      ) : null}

      {(running || fetched > 0) && rows.length > 0 ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(4, progress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {running
              ? `Fetching portfolios… ${fetched} fetched`
              : `Fetched ${fetched} of ${rows.length}`}
          </Text>
        </View>
      ) : null}

      <View style={styles.stickyTop}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryLabelRow}>
              <Ionicons name="wallet-outline" size={rs(16)} color="#2E7D32" />
              <Text style={styles.summaryLabel}>Total Portfolio Value</Text>
            </View>
            <View style={styles.allUsersPill}>
              <Text style={styles.allUsersText}>ALL USERS</Text>
            </View>
          </View>

          <View style={styles.summaryValueRow}>
            <Text style={styles.summaryValue}>
              {formatRs(totals.value, hidden)}
            </Text>
            <View
              style={[
                styles.changePill,
                { backgroundColor: changeTint(totals.change).bg },
              ]}
            >
              <Text
                style={[
                  styles.changePillText,
                  { color: changeTint(totals.change).fg },
                ]}
              >
                {formatChange(totals.change, hidden)}
              </Text>
            </View>
            <Pressable
              onPress={() => setHidden((v) => !v)}
              hitSlop={10}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={rs(18)}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          <View style={styles.summaryFooter}>
            <Ionicons
              name="information-circle-outline"
              size={rs(14)}
              color={colors.textMuted}
            />
            <Text style={styles.summaryFooterText}>
              {totals.accounts} accounts · {totals.holdings} holdings
            </Text>
            {running ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={{ marginLeft: rs(8) }}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.chipRow}>
          {(
            [
              { key: 'all', label: 'All', count: counts.all, icon: null, tint: colors.textMuted },
              { key: 'gained', label: 'Gained', count: counts.gained, icon: 'caret-up', tint: '#2E9E5B' },
              { key: 'loss', label: 'Loss', count: counts.loss, icon: 'caret-down', tint: '#E5484D' },
              { key: 'unch', label: 'Unch', count: counts.unch, icon: 'remove', tint: colors.textMuted },
            ] as const
          ).map((chip) => {
            const active = filter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                {chip.icon ? (
                  <Ionicons name={chip.icon} size={rs(12)} color={chip.tint} />
                ) : (
                  <View style={[styles.chipDot, { backgroundColor: chip.tint }]} />
                )}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {chip.label} {chip.count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SwipeTabGesture
        index={Math.max(0, FILTER_ORDER.indexOf(filter))}
        count={FILTER_ORDER.length}
        onIndexChange={(i) => {
          const next = FILTER_ORDER[i];
          if (next) setFilter(next);
        }}
      >
      <FlatList
        style={styles.accountList}
        data={filtered}
        keyExtractor={(item) => item.account.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, rs(40)) },
        ]}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {accounts.length === 0
              ? 'No MeroShare accounts saved. Add capital from the Apply tab.'
              : running
                ? 'Fetching…'
                : 'No matching accounts.'}
          </Text>
        }
        renderItem={({ item, index }) => {
          const isBusy = item.status === 'running' || item.status === 'pending';
          const isOpen = expanded.has(item.account.id);
          const tint = changeTint(item.change);
          return (
            <Pressable
              style={styles.card}
              onPress={() => toggleExpanded(item.account.id)}
            >
              <View style={styles.cardTop}>
                <View style={styles.indexBadge}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.account.name.toUpperCase()}
                </Text>
                {item.status === 'done' && item.holdings > 0 ? (
                  <View style={styles.holdingBadge}>
                    <Ionicons name="leaf" size={rs(11)} color="#2E9E5B" />
                    <Text style={styles.holdingBadgeText}>
                      {item.holdings} holding{item.holdings > 1 ? 's' : ''}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.cardLabel}>Total current value</Text>

              <View style={styles.cardValueRow}>
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : item.status === 'error' ? (
                  <Text style={styles.errorText} numberOfLines={2}>
                    {item.message ?? 'Failed'}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.cardValue}>
                      {formatRs(item.value, hidden)}
                    </Text>
                    <View style={[styles.changePill, { backgroundColor: tint.bg }]}>
                      <Text style={[styles.changePillText, { color: tint.fg }]}>
                        {formatChange(item.change, hidden)}
                      </Text>
                    </View>
                  </>
                )}
                <Pressable
                  onPress={() => setHidden((v) => !v)}
                  hitSlop={10}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={hidden ? 'eye-off-outline' : 'eye-outline'}
                    size={rs(18)}
                    color={colors.textMuted}
                  />
                </Pressable>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={rs(18)}
                  color={colors.textMuted}
                  style={{ marginLeft: rs(4) }}
                />
              </View>

              {isOpen && item.status === 'done' ? (
                <View style={styles.expandBox}>
                  <View style={styles.expandRow}>
                    <Text style={styles.expandLabel}>Holdings</Text>
                    <Text style={styles.expandVal}>{item.holdings}</Text>
                  </View>
                  <View style={styles.expandRow}>
                    <Text style={styles.expandLabel}>Day change</Text>
                    <Text style={[styles.expandVal, { color: tint.fg }]}>
                      {formatChange(item.change, hidden)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
      </SwipeTabGesture>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(10),
      paddingVertical: rs(10),
      gap: rs(4),
    },
    iconBtn: {
      width: rs(40),
      height: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(14),
      marginBottom: rs(8),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(14),
      padding: 0,
    },
    progressBlock: {
      paddingHorizontal: rs(16),
      marginBottom: rs(10),
    },
    progressTrack: {
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: c.surfaceAlt,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#66BB6A',
      borderRadius: rs(2),
    },
    progressText: {
      color: c.textMuted,
      fontSize: rs(11),
      textAlign: 'center',
      marginTop: rs(6),
    },
    list: {
      paddingHorizontal: rs(14),
      paddingTop: rs(4),
      paddingBottom: rs(40),
    },
    stickyTop: {
      paddingHorizontal: rs(14),
      paddingBottom: rs(4),
      backgroundColor: c.bg,
    },
    accountList: {
      flex: 1,
    },
    summaryCard: {
      backgroundColor: c.primarySoft,
      borderRadius: rs(16),
      padding: rs(14),
      marginBottom: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    summaryTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(10),
    },
    summaryLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      flex: 1,
    },
    summaryLabel: {
      color: '#2E3D2E',
      fontSize: rs(13),
      fontWeight: '600',
    },
    allUsersPill: {
      backgroundColor: '#D4EDD8',
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
      borderRadius: rs(10),
    },
    allUsersText: {
      color: '#2E7D32',
      fontSize: rs(10),
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    summaryValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(10),
    },
    summaryValue: {
      color: c.text,
      fontSize: rs(28),
      fontWeight: '800',
      flexShrink: 1,
    },
    changePill: {
      backgroundColor: 'rgba(229,72,77,0.12)',
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(12),
    },
    changePillText: {
      color: '#E5484D',
      fontSize: rs(12),
      fontWeight: '700',
    },
    eyeBtn: {
      marginLeft: 'auto',
      padding: rs(4),
    },
    summaryFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
    },
    summaryFooterText: {
      color: c.textMuted,
      fontSize: rs(12),
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(10),
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(10),
    },
    indexBadge: {
      minWidth: rs(26),
      height: rs(26),
      borderRadius: rs(13),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(6),
    },
    indexText: {
      color: '#2E9E5B',
      fontWeight: '800',
      fontSize: rs(12),
    },
    holdingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: c.primarySoft,
      borderRadius: rs(10),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
    },
    holdingBadgeText: {
      color: '#2E9E5B',
      fontSize: rs(11),
      fontWeight: '700',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(12),
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(16),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      backgroundColor: c.surface,
    },
    chipActive: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    chipDot: {
      width: rs(7),
      height: rs(7),
      borderRadius: rs(4),
    },
    chipText: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '700',
    },
    chipTextActive: {
      color: c.primary,
    },
    expandBox: {
      marginTop: rs(10),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingTop: rs(8),
      gap: rs(6),
    },
    expandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    expandLabel: { color: c.textMuted, fontSize: rs(12) },
    expandVal: { color: c.text, fontSize: rs(12), fontWeight: '700' },
    cardName: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      letterSpacing: 0.2,
    },
    cardLabel: {
      color: c.textMuted,
      fontSize: rs(12),
      marginBottom: rs(4),
    },
    cardValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      minHeight: rs(28),
    },
    cardValue: {
      color: c.text,
      fontSize: rs(18),
      fontWeight: '800',
    },
    errorText: {
      flex: 1,
      color: c.danger,
      fontSize: rs(12),
    },
    empty: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(24),
      fontSize: rs(13),
      lineHeight: rs(18),
    },
  });
}
