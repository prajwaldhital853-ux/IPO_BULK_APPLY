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
import {
  fetchAccountExpiryInfo,
  formatExpiryDisplay,
  type AccountExpiryInfo,
  type ExpiryPill,
  type PillKind,
} from '../services/meroshare/accountExpiry';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type TabId = 'users' | 'expiry';

/**
 * Fixed light-green palette. This screen matches a specific reference design,
 * so it uses these tokens directly instead of the app theme.
 */
const C = {
  bg: '#F6FAF6',
  headerBg: '#FFFFFF',
  text: '#17331F',
  textMuted: '#7C8A7C',
  border: '#E1EDE3',

  accent: '#159B47',

  cardBg: '#FFFFFF',
  cardBorder: '#CFE9D6',

  okBg: '#E9F8EF',
  okBorder: '#BEE6C9',
  okText: '#14934A',

  badBg: '#FDECEC',
  badBorder: '#F3C6C6',
  badText: '#DA3B3B',
} as const;

const PLACEHOLDER_PILLS: ExpiryPill[] = [
  { kind: 'password', label: 'Password', expired: null, expiryDate: null, daysLeft: null, statusLine: 'Unknown' },
  { kind: 'demat', label: 'Demat', expired: null, expiryDate: null, daysLeft: null, statusLine: 'Unknown' },
  { kind: 'meroshare', label: 'MeroShare', expired: null, expiryDate: null, daysLeft: null, statusLine: 'Unknown' },
];

function PillBox({ pill }: { pill: ExpiryPill }) {
  const bad = pill.expired === true;
  const bg = bad ? C.badBg : C.okBg;
  const border = bad ? C.badBorder : C.okBorder;
  const tint = bad ? C.badText : C.okText;
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

  const openRenew = (kind: PillKind) => {
    if (kind === 'password') {
      navigation.navigate('ChangePassword');
      return;
    }
    void Linking.openURL('https://meroshare.cdsc.com.np/#/');
  };

  const renewFor = (item: AccountExpiryInfo): ExpiryPill | null => {
    return item.pills.find((p) => p.expired === true) ?? null;
  };

  const renewLabel = (kind: PillKind): string => {
    if (kind === 'demat') return 'Renew Demat';
    if (kind === 'password') return 'Renew Password';
    return 'Renew MeroShare';
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerIcon}>
          <Ionicons name="arrow-back" size={rs(22)} color={C.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Account Expiry Information
        </Text>
        <Pressable onPress={() => setSearchOpen((v) => !v)} hitSlop={10} style={styles.headerIcon}>
          <Ionicons name={searchOpen ? 'close' : 'search'} size={rs(22)} color={C.text} />
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={rs(16)} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search user…"
            placeholderTextColor={C.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      ) : null}

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={styles.tab} onPress={() => setTab('users')}>
          <Text style={[styles.tabText, tab === 'users' && styles.tabTextActive]}>
            Select Users
          </Text>
          <View style={[styles.tabLine, tab === 'users' && styles.tabLineActive]} />
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('expiry')}>
          <Text style={[styles.tabText, tab === 'expiry' && styles.tabTextActive]}>
            Expiry Status
          </Text>
          <View style={[styles.tabLine, tab === 'expiry' && styles.tabLineActive]} />
        </Pressable>
      </View>

      {tab === 'users' ? (
        <View style={styles.flex}>
          <View style={styles.selectRow}>
            <Text style={styles.selectCount}>{selected.size} selected</Text>
            <View style={styles.selectActions}>
              <Pressable onPress={() => setSelected(new Set(accounts.map((a) => a.id)))} hitSlop={8}>
                <Text style={styles.selectAction}>Select All</Text>
              </Pressable>
              <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
                <Text style={[styles.selectAction, { color: C.badText }]}>Clear</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {filteredAccounts.map((a, idx) => {
              const on = selected.has(a.id);
              return (
                <Pressable key={a.id} style={styles.userCard} onPress={() => toggleUser(a.id)}>
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={rs(15)} color={C.textMuted} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {idx + 1}. {a.name.toUpperCase()}
                    </Text>
                    <Text style={styles.userMeta}>USERNAME : {a.username}</Text>
                    <Text style={styles.userMeta} numberOfLines={1}>
                      BANK : {(a.bankName || a.dpName || '—').toUpperCase()}
                    </Text>
                  </View>
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={rs(22)}
                    color={on ? C.accent : C.textMuted}
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

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, rs(12)) }]}>
            <Pressable
              style={[styles.fetchBtn, !selected.size && styles.fetchBtnOff]}
              disabled={!selected.size}
              onPress={() => setTab('expiry')}
            >
              <Text style={styles.fetchText}>Fetch Expiry Info</Text>
            </Pressable>
          </View>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={C.accent} />
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
              tintColor={C.accent}
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
            const pills = item.pills.length ? item.pills : PLACEHOLDER_PILLS;
            const bad = renewFor(item);
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Ionicons name="person" size={rs(15)} color={C.textMuted} />
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.accountName.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.pillRow}>
                  {pills.map((p) => (
                    <PillBox key={p.kind} pill={p} />
                  ))}
                </View>

                {bad ? (
                  <Pressable style={styles.renewBtn} onPress={() => openRenew(bad.kind)}>
                    <Ionicons name="alert-circle-outline" size={rs(14)} color={C.badText} />
                    <Text style={styles.renewText}>{renewLabel(bad.kind)}</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(8),
    paddingVertical: rs(10),
    backgroundColor: C.headerBg,
  },
  headerIcon: {
    width: rs(40),
    height: rs(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: C.text,
    fontWeight: '800',
    fontSize: rs(15),
    marginHorizontal: rs(4),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    marginHorizontal: rs(12),
    marginTop: rs(4),
    marginBottom: rs(6),
    paddingHorizontal: rs(12),
    backgroundColor: C.cardBg,
    borderRadius: rs(10),
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: rs(13),
    paddingVertical: rs(9),
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: C.headerBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: rs(12),
  },
  tabText: { color: C.textMuted, fontSize: rs(13), fontWeight: '600' },
  tabTextActive: { color: C.accent, fontWeight: '800' },
  tabLine: {
    marginTop: rs(9),
    height: rs(2.5),
    width: '60%',
    backgroundColor: 'transparent',
    borderTopLeftRadius: rs(2),
    borderTopRightRadius: rs(2),
  },
  tabLineActive: { backgroundColor: C.accent },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(16),
    paddingTop: rs(12),
    paddingBottom: rs(2),
  },
  selectCount: { color: C.text, fontWeight: '700', fontSize: rs(13) },
  selectActions: { flexDirection: 'row', gap: rs(18) },
  selectAction: { color: C.accent, fontWeight: '700', fontSize: rs(13) },
  list: { padding: rs(14), paddingBottom: rs(24) },
  empty: {
    textAlign: 'center',
    color: C.textMuted,
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
    borderColor: C.cardBorder,
    backgroundColor: C.cardBg,
  },
  avatar: {
    width: rs(26),
    height: rs(26),
    borderRadius: rs(13),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.okBg,
  },
  userName: { color: C.text, fontWeight: '800', fontSize: rs(13) },
  userMeta: { color: C.textMuted, fontSize: rs(11), marginTop: rs(3) },
  footer: {
    paddingHorizontal: rs(16),
    paddingTop: rs(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: C.headerBg,
  },
  fetchBtn: {
    borderWidth: 1.5,
    borderColor: C.accent,
    borderRadius: rs(26),
    paddingVertical: rs(13),
    alignItems: 'center',
  },
  fetchBtnOff: { opacity: 0.4 },
  fetchText: { color: C.accent, fontWeight: '800', fontSize: rs(14) },
  card: {
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: rs(16),
    padding: rs(14),
    backgroundColor: C.cardBg,
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
    color: C.text,
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
    borderColor: C.badText,
    borderRadius: rs(24),
    paddingHorizontal: rs(22),
    paddingVertical: rs(10),
    minWidth: rs(150),
  },
  renewText: { color: C.badText, fontWeight: '800', fontSize: rs(13) },
});
