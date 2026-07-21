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
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { importPortfolioFromMeroshare } from '../services/meroshare';
import type { AccountMeta } from '../types/account';
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
  if (hidden) return '— •••';
  const abs = Math.abs(n).toLocaleString('en-NP', {
    maximumFractionDigits: 0,
  });
  if (n > 0) return `+ Rs. ${abs}`;
  if (n < 0) return `− Rs. ${abs}`;
  return `— Rs. 0`;
}

export function BulkPortfolioScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts } = useAccounts();

  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [running, setRunning] = useState(false);
  const [fetched, setFetched] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

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
    setRunning(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchAll(accounts);
    }, [accounts, fetchAll]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.account.name.toLowerCase().includes(q));
  }, [rows, query]);

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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.account.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryLabelRow}>
                <Ionicons name="wallet-outline" size={rs(16)} color="#A5D6A7" />
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
              <View style={styles.changePill}>
                <Text style={styles.changePillText}>
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
                  color="#CFD8DC"
                />
              </Pressable>
            </View>

            <View style={styles.summaryFooter}>
              <Ionicons
                name="information-circle-outline"
                size={rs(14)}
                color="#A5D6A7"
              />
              <Text style={styles.summaryFooterText}>
                {totals.accounts} accounts · {totals.holdings} holdings
              </Text>
              {running ? (
                <ActivityIndicator
                  size="small"
                  color="#A5D6A7"
                  style={{ marginLeft: rs(8) }}
                />
              ) : (
                <Pressable
                  onPress={() => void fetchAll(accounts)}
                  hitSlop={8}
                  style={{ marginLeft: 'auto' }}
                >
                  <Ionicons name="refresh" size={rs(16)} color="#A5D6A7" />
                </Pressable>
              )}
            </View>
          </View>
        }
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
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.indexBadge}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.account.name.toUpperCase()}
                </Text>
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
                    <View style={styles.changePill}>
                      <Text style={styles.changePillText}>
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
                    color="#CFD8DC"
                  />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
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
      paddingBottom: rs(40),
    },
    summaryCard: {
      backgroundColor: '#1B3D1F',
      borderRadius: rs(16),
      padding: rs(14),
      marginBottom: rs(14),
      borderWidth: 1,
      borderColor: '#2E5A32',
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
      color: '#E8F5E9',
      fontSize: rs(13),
      fontWeight: '600',
    },
    allUsersPill: {
      backgroundColor: '#C8E6C9',
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
      borderRadius: rs(10),
    },
    allUsersText: {
      color: '#1B5E20',
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
      color: '#FFF',
      fontSize: rs(28),
      fontWeight: '800',
      flexShrink: 1,
    },
    changePill: {
      backgroundColor: 'rgba(0,0,0,0.35)',
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(12),
    },
    changePillText: {
      color: '#ECEFF1',
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
      color: '#A5D6A7',
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
      borderRadius: rs(6),
      backgroundColor: '#1B5E20',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(6),
    },
    indexText: {
      color: '#FFF',
      fontWeight: '800',
      fontSize: rs(12),
    },
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
