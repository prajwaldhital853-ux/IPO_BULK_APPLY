import React, { useCallback, useMemo, useState } from 'react';
import {
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

export function BankTrackerScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        (a.bankName ?? '').toLowerCase().includes(q),
    );
  }, [accounts, query]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Bank Tracker</Text>
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

      <Text style={styles.subtitle}>
        Track your bank balance per MeroShare account. Applying an IPO blocks the
        amount + a Rs 5 fee here automatically.
      </Text>

      <FlatList
        data={data}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
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
                navigation.navigate('BankTrackerDetail', { accountId: item.id })
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
                  {item.accountNumber ? ` • ${item.accountNumber}` : ''}
                </Text>
              </View>
              {tracking && balances ? (
                <View style={styles.balanceCol}>
                  <Text style={styles.balanceVal}>
                    {formatRs(balances.available)}
                  </Text>
                  <Text style={styles.balanceLabel}>available</Text>
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

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(10),
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
      marginBottom: rs(6),
      paddingHorizontal: rs(12),
      backgroundColor: c.surface,
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
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      paddingHorizontal: rs(16),
      paddingBottom: rs(10),
    },
    list: { paddingHorizontal: rs(14), paddingBottom: rs(30) },
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
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      marginBottom: rs(10),
    },
    bankIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
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
    },
    setupText: { color: c.primary, fontWeight: '800', fontSize: rs(12) },
    balanceCol: { alignItems: 'flex-end' },
    balanceVal: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    balanceLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
  });
}
