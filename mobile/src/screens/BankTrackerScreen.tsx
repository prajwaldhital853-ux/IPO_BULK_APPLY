import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  computeBalances,
  getAllTrackers,
  type BankTrackerAccount,
} from '../storage/bankTrackerStorage';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function formatRs(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n)).toLocaleString('en-IN');
  return `${sign}Rs ${abs}`;
}

/** Deposited / withdrawn / CASBA totals from tracker ledger. */
function ledgerTotals(acc: BankTrackerAccount): {
  deposited: number;
  withdrawn: number;
  casba: number;
  available: number;
  hold: number;
  total: number;
} {
  let deposited = Math.max(0, acc.openingBalance);
  let withdrawn = 0;
  let casba = 0;
  for (const t of acc.transactions) {
    if (t.group === 'casba') {
      casba += Math.abs(t.availableDelta);
      continue;
    }
    if (t.group === 'manual') {
      if (/deposit/i.test(t.label) && t.availableDelta > 0) {
        deposited += t.availableDelta;
      } else if (/withdraw/i.test(t.label) && t.availableDelta < 0) {
        withdrawn += Math.abs(t.availableDelta);
      } else if (/adjust/i.test(t.label) && t.availableDelta > 0) {
        deposited += t.availableDelta;
      } else if (/adjust/i.test(t.label) && t.availableDelta < 0) {
        withdrawn += Math.abs(t.availableDelta);
      }
    }
  }
  const bal = computeBalances(acc);
  return {
    deposited,
    withdrawn,
    casba,
    available: bal.available,
    hold: bal.hold,
    total: bal.total,
  };
}

export function BankTrackerScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { accounts } = useAccounts();

  const [trackers, setTrackers] = useState<Record<string, BankTrackerAccount>>(
    {},
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getAllTrackers().then((s) => {
        if (alive) setTrackers(s);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.bankName ?? '').toLowerCase().includes(q) ||
        (a.accountNumber ?? '').toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const summary = useMemo(() => {
    let tracked = 0;
    let totalAvailable = 0;
    for (const a of accounts) {
      const t = trackers[a.id];
      if (!t?.tracking) continue;
      tracked += 1;
      totalAvailable += computeBalances(t).available;
    }
    return { tracked, totalAvailable };
  }, [accounts, trackers]);

  const downloadExcel = useCallback(async () => {
    const rows = accounts.map((a: AccountMeta, idx: number) => {
      const t = trackers[a.id];
      const tracking = Boolean(t?.tracking);
      const ledger = t && tracking ? ledgerTotals(t) : null;
      return {
        sn: idx + 1,
        name: a.name,
        bank: a.bankName || a.dpName || '',
        accountNumber: a.accountNumber || '',
        tracking,
        available: ledger?.available ?? 0,
        deposited: ledger?.deposited ?? 0,
        withdrawn: ledger?.withdrawn ?? 0,
        casba: ledger?.casba ?? 0,
        hold: ledger?.hold ?? 0,
      };
    });

    if (!rows.length) {
      Alert.alert('No accounts', 'Add a MeroShare account first.');
      return;
    }

    const aoa: (string | number)[][] = [
      [
        'S.N.',
        'Account Name',
        'Bank',
        'Account Number',
        'Tracking',
        'Total Amount (Available)',
        'On Hold',
        'Deposited',
        'Withdrawal',
        'CASBA',
      ],
      ...rows.map((r) => [
        r.sn,
        r.name,
        r.bank,
        r.accountNumber,
        r.tracking ? 'Yes' : 'No',
        r.tracking ? Math.round(r.available) : '',
        r.tracking ? Math.round(r.hold) : '',
        r.tracking ? Math.round(r.deposited) : '',
        r.tracking ? Math.round(r.withdrawn) : '',
        r.tracking ? Math.round(r.casba) : '',
      ]),
    ];

    const tracked = rows.filter((r) => r.tracking);
    aoa.push([
      '',
      'TOTAL',
      '',
      '',
      '',
      Math.round(tracked.reduce((s, r) => s + r.available, 0)),
      Math.round(tracked.reduce((s, r) => s + r.hold, 0)),
      Math.round(tracked.reduce((s, r) => s + r.deposited, 0)),
      Math.round(tracked.reduce((s, r) => s + r.withdrawn, 0)),
      Math.round(tracked.reduce((s, r) => s + r.casba, 0)),
    ]);

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 28 },
        { wch: 28 },
        { wch: 22 },
        { wch: 10 },
        { wch: 22 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Bank Tracker');

      const base64 = XLSX.write(wb, {
        type: 'base64',
        bookType: 'xlsx',
      }) as string;

      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!dir) {
        Alert.alert('Download failed', 'Storage is not available on this device.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const fileUri = `${dir}Bank_Tracker_${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Saved', `Excel file created at:\n${fileUri}`);
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Download Bank Tracker Excel',
        UTI: 'com.microsoft.excel.xlsx',
      });
    } catch (e) {
      Alert.alert(
        'Download failed',
        e instanceof Error ? e.message : 'Could not create Excel file',
      );
    }
  }, [accounts, trackers]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Bank Tracker</Text>
        <Pressable
          onPress={() => void downloadExcel()}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <Ionicons name="download-outline" size={rs(22)} color={colors.text} />
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

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search account…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      ) : null}

      <View style={styles.summaryBlock}>
        <Text style={styles.summaryLabel}>
          Total Available ({summary.tracked} tracked)
        </Text>
        <Text style={styles.summaryValue}>
          {formatRs(summary.totalAvailable)}
        </Text>
        <Text style={styles.subtitle}>
          Track your bank balance per MeroShare account. Applying an IPO blocks
          the amount + a Rs 5 fee here automatically.
        </Text>
      </View>

      <FlatList
        style={styles.listFlex}
        data={data}
        keyExtractor={(a) => a.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, rs(30)) },
        ]}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No MeroShare accounts saved yet. Add one from Apply → Add capital.
          </Text>
        }
        renderItem={({ item }) => {
          const tracker = trackers[item.id];
          const tracking = tracker?.tracking ?? false;
          const balances = tracker ? computeBalances(tracker) : null;
          return (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate('BankTrackerDetail', {
                  accountId: item.id,
                })
              }
            >
              <View style={styles.bankIcon}>
                <Ionicons name="business" size={rs(18)} color={colors.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.name.toUpperCase()}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {(item.bankName || item.dpName || '—').toUpperCase()}
                  {item.accountNumber
                    ? ` • ${maskAccount(item.accountNumber)}`
                    : ''}
                </Text>
              </View>
              {tracking && balances ? (
                <View style={styles.balanceCol}>
                  <Text style={styles.balanceVal}>
                    {formatRs(balances.available)}
                  </Text>
                  <Text style={styles.balanceLabel}>Available</Text>
                </View>
              ) : (
                <View style={styles.setupBtn}>
                  <Text style={styles.setupText}>Set up</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function maskAccount(n: string): string {
  const s = n.trim();
  if (s.length <= 6) return s;
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(10),
      backgroundColor: isDark ? c.bgElevated : '#FFFFFF',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
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
      marginHorizontal: rs(4),
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(14),
      marginTop: rs(8),
      marginBottom: rs(4),
      paddingHorizontal: rs(12),
      backgroundColor: isDark ? c.surface : '#F3F5F0',
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(9),
    },
    summaryBlock: {
      paddingHorizontal: rs(16),
      paddingTop: rs(14),
      paddingBottom: rs(10),
      backgroundColor: isDark ? c.bg : '#FFFFFF',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    summaryLabel: {
      color: isDark ? c.textSecondary : '#5F6B5F',
      fontSize: rs(14),
      fontWeight: '600',
      marginBottom: rs(6),
    },
    summaryValue: {
      color: c.text,
      fontSize: rs(28),
      fontWeight: '800',
      marginBottom: rs(10),
      letterSpacing: -0.3,
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    listFlex: { flex: 1 },
    list: { paddingHorizontal: rs(14), paddingTop: rs(12) },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      fontSize: rs(13),
      lineHeight: rs(19),
      paddingHorizontal: rs(20),
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: isDark ? c.borderMuted : '#E0E6D8',
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      marginBottom: rs(10),
    },
    bankIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? c.primarySoft : '#E8F5E9',
    },
    cardBody: { flex: 1 },
    cardName: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    cardMeta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(3) },
    setupBtn: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(18),
      paddingHorizontal: rs(16),
      paddingVertical: rs(7),
      backgroundColor: isDark ? 'transparent' : '#E8F5E9',
    },
    setupText: { color: c.primary, fontWeight: '800', fontSize: rs(12) },
    balanceCol: { alignItems: 'flex-end' },
    balanceVal: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    balanceLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
  });
}
