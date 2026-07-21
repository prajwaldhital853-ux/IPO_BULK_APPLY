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
} from '../services/meroshare/accountExpiry';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

const OK_BG = '#1B3A2A';
const OK_BORDER = '#2E5C40';
const OK_TEXT = '#7CDB6E';
const BAD_BG = '#3A1B1B';
const BAD_BORDER = '#5C2E2E';
const BAD_TEXT = '#EF5350';
const CARD_BORDER = '#3A5A44';
const ACCENT = '#84C47F';

type TabId = 'users' | 'expiry';

function PillBox({ pill }: { pill: ExpiryPill }) {
  const bad = pill.expired === true;
  const bg = bad ? BAD_BG : OK_BG;
  const border = bad ? BAD_BORDER : OK_BORDER;
  const tint = bad ? BAD_TEXT : OK_TEXT;
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.pillLabel, { color: tint }]}>{pill.label}</Text>
      <View style={styles.pillMid}>
        <Ionicons
          name={bad ? 'alert-circle' : 'checkmark-circle'}
          size={rs(14)}
          color={tint}
        />
        <Text style={[styles.pillStatus, { color: tint }]} numberOfLines={1}>
          {pill.statusLine}
        </Text>
      </View>
      <Text style={[styles.pillDate, { color: bad ? BAD_TEXT : '#FFFFFF' }]}>
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

  const [tab, setTab] = useState<TabId>('expiry');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<AccountExpiryInfo[]>([]);
  const [loading, setLoading] = useState(true);
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
      const out: AccountExpiryInfo[] = [];
      for (const account of accounts) {
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
    [accounts, loadSecrets],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
          <Ionicons name="arrow-back" size={rs(22)} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Account Expiry Information
        </Text>
        <Pressable onPress={() => setSearchOpen((v) => !v)} hitSlop={10}>
          <Ionicons name="search" size={rs(22)} color="#FFFFFF" />
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={rs(16)} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search user…"
            placeholderTextColor="#666"
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
            Select Accounts
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
        <ScrollView contentContainerStyle={styles.list}>
          {accounts.map((a) => {
            const on = selected.has(a.id);
            return (
              <Pressable
                key={a.id}
                style={styles.userRow}
                onPress={() => toggleUser(a.id)}
              >
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={rs(22)}
                  color={on ? ACCENT : '#888'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>
                    {a.name.toUpperCase()}
                  </Text>
                  <Text style={styles.userMeta}>
                    {a.dpName} · {a.username}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {!accounts.length ? (
            <Text style={styles.empty}>
              No accounts saved. Add from Apply → Add capital.
            </Text>
          ) : null}
          <Pressable
            style={styles.continueBtn}
            onPress={() => setTab('expiry')}
          >
            <Text style={styles.continueText}>View Expiry Status</Text>
          </Pressable>
        </ScrollView>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={ACCENT} />
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
              tintColor={ACCENT}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {accounts.length
                ? 'No accounts selected. Switch to Select Accounts.'
                : 'No MeroShare accounts saved. Add from Apply → Add capital.'}
            </Text>
          }
          renderItem={({ item }) => {
            const renew = renewLabel(item);
            const badPill = item.pills.find((p) => p.expired === true);
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Ionicons name="person" size={rs(16)} color="#FFFFFF" />
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.accountName.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.pillRow}>
                  {(item.pills.length
                    ? item.pills
                    : [
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
                      ]
                  ).map((p) => (
                    <PillBox key={p.kind} pill={p} />
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
                      color={BAD_TEXT}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    backgroundColor: '#1A1A1A',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
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
    backgroundColor: '#1E1E1E',
    borderRadius: rs(10),
    borderWidth: 1,
    borderColor: '#333',
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: rs(13),
    paddingVertical: rs(9),
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: rs(12),
  },
  tabText: { color: '#888', fontSize: rs(13), fontWeight: '600' },
  tabTextActive: { color: ACCENT, fontWeight: '800' },
  tabLine: {
    marginTop: rs(8),
    height: rs(2),
    width: '55%',
    backgroundColor: ACCENT,
    borderRadius: 1,
  },
  list: { padding: rs(14), paddingBottom: rs(40) },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: rs(32),
    fontSize: rs(13),
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    paddingVertical: rs(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
  },
  userName: { color: '#FFF', fontWeight: '800', fontSize: rs(13) },
  userMeta: { color: '#888', fontSize: rs(11), marginTop: rs(2) },
  continueBtn: {
    marginTop: rs(20),
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: rs(22),
    paddingVertical: rs(12),
    alignItems: 'center',
  },
  continueText: { color: ACCENT, fontWeight: '700', fontSize: rs(13) },
  card: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: rs(12),
    padding: rs(12),
    backgroundColor: '#1A1F1A',
    marginBottom: rs(12),
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    marginBottom: rs(12),
  },
  cardName: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: rs(13),
    letterSpacing: 0.3,
  },
  pillRow: { flexDirection: 'row', gap: rs(8) },
  pill: {
    flex: 1,
    borderRadius: rs(8),
    borderWidth: 1,
    padding: rs(8),
    minHeight: rs(78),
  },
  pillLabel: { fontSize: rs(11), fontWeight: '700', marginBottom: rs(4) },
  pillMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    marginBottom: rs(4),
  },
  pillStatus: { fontSize: rs(10), fontWeight: '700', flex: 1 },
  pillDate: { fontSize: rs(10), fontWeight: '600' },
  renewBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    marginTop: rs(12),
    borderWidth: 1,
    borderColor: BAD_TEXT,
    borderRadius: rs(8),
    paddingHorizontal: rs(12),
    paddingVertical: rs(7),
  },
  renewText: { color: BAD_TEXT, fontWeight: '700', fontSize: rs(12) },
});
