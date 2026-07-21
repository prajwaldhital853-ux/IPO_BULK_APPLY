import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import { lightColors, type ThemeColors } from '../theme/colors';
import {
  fetchAccountExpiryInfo,
  formatExpiryDisplay,
  type AccountExpiryInfo,
  type ExpiryPill,
} from '../services/meroshare/accountExpiry';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type TabId = 'users' | 'expiry';

type ExpiryPalette = {
  okBg: string;
  okBorder: string;
  okText: string;
  badBg: string;
  badBorder: string;
  badText: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
};

function makePalette(c: ThemeColors, isDark: boolean): ExpiryPalette {
  if (isDark) {
    return {
      okBg: '#1B3A2A',
      okBorder: '#2E5C40',
      okText: '#7CDB6E',
      badBg: '#3A1B1B',
      badBorder: '#5C2E2E',
      badText: '#EF5350',
      cardBg: '#1A1F1A',
      cardBorder: '#3A5A44',
      accent: '#84C47F',
    };
  }
  return {
    okBg: '#E8F7EE',
    okBorder: '#BCE6C7',
    okText: '#159B47',
    badBg: '#FCEAEA',
    badBorder: '#F3C5C5',
    badText: '#DB3B3B',
    cardBg: '#FFFFFF',
    cardBorder: '#CFE9D6',
    accent: '#159B47',
  };
}

function PillBox({
  pill,
  pal,
  styles,
}: {
  pill: ExpiryPill;
  pal: ExpiryPalette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const bad = pill.expired === true;
  const bg = bad ? pal.badBg : pal.okBg;
  const border = bad ? pal.badBorder : pal.okBorder;
  const tint = bad ? pal.badText : pal.okText;
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.pillLabel, { color: tint }]}>{pill.label}</Text>
      <View style={styles.pillMid}>
        <Ionicons
          name={bad ? 'alert-circle' : 'checkmark-circle'}
          size={rs(13)}
          color={tint}
        />
        <Text style={[styles.pillStatus, { color: tint }]} numberOfLines={2}>
          {pill.statusLine}
        </Text>
      </View>
      <Text style={[styles.pillDate, { color: tint }]}>
        {formatExpiryDisplay(pill.expiryDate)}
      </Text>
    </View>
  );
}

export function AccountExpiryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts, loadSecrets } = useAccounts();
  // This screen intentionally always uses the light green palette to match the
  // reference design, regardless of the app's dark/light theme.
  useTheme();
  const colors = lightColors;
  const pal = useMemo(() => makePalette(colors, false), [colors]);
  const styles = useMemo(() => makeStyles(colors, pal), [colors, pal]);

  const [tab, setTab] = useState<TabId>('users');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<AccountExpiryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSelected(new Set(accounts.map((a) => a.id)));
  }, [accounts]);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      if (!accounts.length) {
        setRows([]);
        setLoading(false);
        return;
      }
      const targets = accounts.filter((a) => selected.has(a.id));
      const out: AccountExpiryInfo[] = [];
      for (const account of targets) {
        const secrets = await loadSecrets(account.id);
        if (!secrets?.password) {
          out.push({
            accountId: account.id,
            accountName: account.name,
            username: account.username,
            dpName: account.dpName,
            demat: account.demat ?? null,
            meroshareExpired: null,
            dematExpired: null,
            passwordExpired: null,
            meroshareExpiryDate: null,
            dematExpiryDate: null,
            passwordExpiryDate: null,
            status: 'error',
            detail: 'Password not saved — re-add account',
            pills: [],
          });
          continue;
        }
        out.push(await fetchAccountExpiryInfo(account, secrets.password));
      }
      setRows(out);
      setLoading(false);
    },
    [accounts, loadSecrets, selected],
  );

  useEffect(() => {
    if (tab === 'expiry') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  usePollingRefresh(
    useCallback(async () => {
      if (tab === 'expiry') await refresh(true);
    }, [tab, refresh]),
  );

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bankLine = (accountId: string): string => {
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.bankName || acc?.dpName || '—';
  };

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!selected.has(r.accountId)) return false;
      if (!q) return true;
      return (
        r.accountName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q)
      );
    });
  }, [rows, selected, query]);

  const openRenew = (kind: 'password' | 'demat' | 'meroshare') => {
    if (kind === 'password') {
      navigation.navigate('ChangePassword');
      return;
    }
    void Linking.openURL('https://meroshare.cdsc.com.np/#/');
  };

  const renewLabel = (item: AccountExpiryInfo): string | null => {
    const bad = item.pills.find((p) => p.expired === true);
    if (!bad) return null;
    if (bad.kind === 'demat') return 'Renew Demat';
    if (bad.kind === 'password') return 'Renew Password';
    return 'Renew MeroShare';
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Account Expiry Information
        </Text>
        <Pressable onPress={() => setSearchOpen((v) => !v)} hitSlop={10}>
          <Ionicons name="search" size={rs(22)} color={colors.text} />
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search user…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      ) : null}

      <View style={styles.tabs}>
        <Pressable style={styles.tab} onPress={() => setTab('users')}>
          <Text
            style={[styles.tabText, tab === 'users' && styles.tabTextActive]}
          >
            Select Users
          </Text>
          {tab === 'users' ? <View style={styles.tabLine} /> : null}
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('expiry')}>
          <Text
            style={[styles.tabText, tab === 'expiry' && styles.tabTextActive]}
          >
            Expiry Status
          </Text>
          {tab === 'expiry' ? <View style={styles.tabLine} /> : null}
        </Pressable>
      </View>

      {tab === 'users' ? (
        <View style={styles.usersWrap}>
          <View style={styles.selectRow}>
            <Text style={styles.selectCount}>{selected.size} selected</Text>
            <View style={styles.selectActions}>
              <Pressable
                onPress={() =>
                  setSelected(new Set(accounts.map((a) => a.id)))
                }
                hitSlop={8}
              >
                <Text style={styles.selectAction}>Select All</Text>
              </Pressable>
              <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
                <Text style={[styles.selectAction, { color: pal.badText }]}>
                  Clear
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {filteredAccounts.map((a, idx) => {
              const on = selected.has(a.id);
              return (
                <Pressable
                  key={a.id}
                  style={styles.userCard}
                  onPress={() => toggleUser(a.id)}
                >
                  <View style={styles.userIconWrap}>
                    <Ionicons
                      name="person"
                      size={rs(15)}
                      color={colors.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {idx + 1}. {a.name.toUpperCase()}
                    </Text>
                    <Text style={styles.userMeta}>
                      USERNAME : {a.username}
                    </Text>
                    <Text style={styles.userMeta} numberOfLines={1}>
                      BANK : {(a.bankName || a.dpName || '—').toUpperCase()}
                    </Text>
                  </View>
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={rs(22)}
                    color={on ? pal.accent : colors.textMuted}
                  />
                </Pressable>
              );
            })}
            {!accounts.length ? (
              <Text style={styles.empty}>
                No accounts saved. Add from Apply → Add capital.
              </Text>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Pressable
              style={styles.fetchBtn}
              disabled={!selected.size}
              onPress={() => setTab('expiry')}
            >
              <Text style={styles.fetchText}>Fetch Expiry Info</Text>
            </Pressable>
          </View>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={pal.accent} />
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={(item) => item.accountId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true).finally(() => setRefreshing(false));
              }}
              tintColor={pal.accent}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {accounts.length
                ? 'No accounts selected. Switch to Select Users.'
                : 'No MeroShare accounts saved. Add from Apply → Add capital.'}
            </Text>
          }
          renderItem={({ item }) => {
            const renew = renewLabel(item);
            const badPill = item.pills.find((p) => p.expired === true);
            const pills = item.pills.length
              ? item.pills
              : ([
                  {
                    kind: 'password' as const,
                    label: 'Password',
                    expired: null,
                    expiryDate: null,
                    daysLeft: null,
                    statusLine: 'Unknown',
                  },
                  {
                    kind: 'demat' as const,
                    label: 'Demat',
                    expired: null,
                    expiryDate: null,
                    daysLeft: null,
                    statusLine: 'Unknown',
                  },
                  {
                    kind: 'meroshare' as const,
                    label: 'MeroShare',
                    expired: null,
                    expiryDate: null,
                    daysLeft: null,
                    statusLine: 'Unknown',
                  },
                ] as ExpiryPill[]);
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Ionicons
                    name="person"
                    size={rs(15)}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.accountName.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.pillRow}>
                  {pills.map((p) => (
                    <PillBox key={p.kind} pill={p} pal={pal} styles={styles} />
                  ))}
                </View>

                {renew && badPill ? (
                  <Pressable
                    style={styles.renewBtn}
                    onPress={() => openRenew(badPill.kind)}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={rs(14)}
                      color={pal.badText}
                    />
                    <Text style={styles.renewText}>{renew}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors, pal: ExpiryPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      backgroundColor: c.bgElevated,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '700',
      fontSize: rs(15),
      marginHorizontal: rs(8),
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
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
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: rs(12),
    },
    tabText: { color: c.textMuted, fontSize: rs(13), fontWeight: '600' },
    tabTextActive: { color: pal.accent, fontWeight: '800' },
    tabLine: {
      marginTop: rs(8),
      height: rs(2),
      width: '55%',
      backgroundColor: pal.accent,
      borderRadius: 1,
    },
    usersWrap: { flex: 1 },
    selectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingTop: rs(12),
      paddingBottom: rs(4),
    },
    selectCount: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    selectActions: { flexDirection: 'row', gap: rs(18) },
    selectAction: { color: pal.accent, fontWeight: '700', fontSize: rs(13) },
    list: { padding: rs(14), paddingBottom: rs(24) },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: rs(32),
      fontSize: rs(13),
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      padding: rs(14),
      marginBottom: rs(10),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: pal.cardBorder,
      backgroundColor: pal.cardBg,
    },
    userIconWrap: {
      width: rs(26),
      height: rs(26),
      borderRadius: rs(13),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceAlt,
    },
    userName: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    userMeta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(3) },
    footer: {
      paddingHorizontal: rs(16),
      paddingTop: rs(10),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.bgElevated,
    },
    fetchBtn: {
      borderWidth: 1,
      borderColor: pal.accent,
      borderRadius: rs(24),
      paddingVertical: rs(13),
      alignItems: 'center',
    },
    fetchText: { color: pal.accent, fontWeight: '800', fontSize: rs(14) },
    card: {
      borderWidth: 1,
      borderColor: pal.cardBorder,
      borderRadius: rs(16),
      padding: rs(14),
      backgroundColor: pal.cardBg,
      marginBottom: rs(14),
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(12),
    },
    cardName: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      letterSpacing: 0.3,
    },
    pillRow: { flexDirection: 'row', gap: rs(8), alignItems: 'stretch' },
    pill: {
      flex: 1,
      borderRadius: rs(10),
      borderWidth: 1,
      paddingHorizontal: rs(9),
      paddingVertical: rs(9),
      minHeight: rs(74),
      justifyContent: 'flex-start',
    },
    pillLabel: { fontSize: rs(11), fontWeight: '800', marginBottom: rs(5) },
    pillMid: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(4),
      marginBottom: rs(5),
    },
    pillStatus: { fontSize: rs(10.5), fontWeight: '700', flex: 1 },
    pillDate: { fontSize: rs(10), fontWeight: '600', opacity: 0.85 },
    renewBtn: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      marginTop: rs(14),
      borderWidth: 1.5,
      borderColor: pal.badText,
      borderRadius: rs(24),
      paddingHorizontal: rs(22),
      paddingVertical: rs(10),
      minWidth: rs(150),
    },
    renewText: { color: pal.badText, fontWeight: '800', fontSize: rs(13) },
  });
}
