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
import {
  fetchAccountExpiryInfo,
  formatExpiryDisplay,
  type AccountExpiryInfo,
  type ExpiryPill,
  type PillKind,
} from '../services/meroshare/expiryTracker';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type TabId = 'users' | 'expiry';
type Styles = ReturnType<typeof makeStyles>;

/** Pure green / red accents for valid vs invalid. */
const STATUS = {
  okBg: '#E8F8EE',
  okBorder: '#00C853',
  okText: '#00C853',
  badBg: '#FDECEA',
  badBorder: '#E53935',
  badText: '#E53935',
  neutralBg: '#EFF3EF',
  neutralBorder: '#DFE6DF',
  neutralText: '#8A948A',
} as const;

function isInvalidAccount(item: AccountExpiryInfo): boolean {
  if (item.status === 'expired' || item.status === 'error') return true;
  return item.pills.some((p) => p.expired === true);
}

const PLACEHOLDER_PILLS: ExpiryPill[] = [
  {
    kind: 'password',
    label: 'Password',
    expired: null,
    expiryDate: null,
    daysLeft: null,
    statusLine: 'Unknown',
  },
  {
    kind: 'demat',
    label: 'Demat',
    expired: null,
    expiryDate: null,
    daysLeft: null,
    statusLine: 'Unknown',
  },
  {
    kind: 'meroshare',
    label: 'MeroShare',
    expired: null,
    expiryDate: null,
    daysLeft: null,
    statusLine: 'Unknown',
  },
];

function PillBox({ pill, styles }: { pill: ExpiryPill; styles: Styles }) {
  const bad = pill.expired === true;
  const neutral = pill.expired == null;
  const bg = bad ? STATUS.badBg : neutral ? STATUS.neutralBg : STATUS.okBg;
  const border = bad
    ? STATUS.badBorder
    : neutral
      ? STATUS.neutralBorder
      : STATUS.okBorder;
  const tint = bad
    ? STATUS.badText
    : neutral
      ? STATUS.neutralText
      : STATUS.okText;
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.pillLabel, { color: tint }]}>{pill.label}</Text>
      <View style={styles.pillMid}>
        <Ionicons
          name={
            bad ? 'alert-circle' : neutral ? 'help-circle' : 'checkmark-circle'
          }
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

export function TrackAccountExpiryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { accounts, loadSecrets } = useAccounts();

  const [tab, setTab] = useState<TabId>('users');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<AccountExpiryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  /** Keep selection in sync when accounts are removed — never auto-select. */
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(accounts.map((a) => a.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      return next;
    });
  }, [accounts]);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setRows([]);
      }
      if (!accounts.length) {
        setRows([]);
        setFetchProgress(null);
        setLoading(false);
        return;
      }
      const targets = accounts.filter((a) => selected.has(a.id));
      if (!targets.length) {
        setRows([]);
        setFetchProgress(null);
        setLoading(false);
        return;
      }

      setFetchProgress({ done: 0, total: targets.length });

      for (let i = 0; i < targets.length; i++) {
        const account = targets[i];
        const secrets = await loadSecrets(account.id);
        let info: AccountExpiryInfo;
        if (!secrets?.password) {
          info = {
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
          };
        } else {
          info = await fetchAccountExpiryInfo(account, secrets.password);
        }

        setRows((prev) => {
          const idx = prev.findIndex((r) => r.accountId === info.accountId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = info;
            return next;
          }
          return [...prev, info];
        });
        setFetchProgress({ done: i + 1, total: targets.length });
      }

      setFetchProgress(null);
      setLoading(false);
    },
    [accounts, loadSecrets, selected],
  );

  useEffect(() => {
    if (tab === 'expiry') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  const renewFor = (item: AccountExpiryInfo): ExpiryPill | null =>
    item.pills.find((p) => p.expired === true) ?? null;

  const renewLabel = (kind: PillKind): string => {
    if (kind === 'demat') return 'Renew Demat';
    if (kind === 'password') return 'Renew Password';
    return 'Renew MeroShare';
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerIcon}
        >
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Account Expiry Information
        </Text>
        <Pressable
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={10}
          style={styles.headerIcon}
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
            placeholder="Search user…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      ) : null}

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={styles.tab} onPress={() => setTab('users')}>
          <Text
            style={[styles.tabText, tab === 'users' && styles.tabTextActive]}
          >
            Select Users
          </Text>
          <View
            style={[styles.tabLine, tab === 'users' && styles.tabLineActive]}
          />
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('expiry')}>
          <Text
            style={[styles.tabText, tab === 'expiry' && styles.tabTextActive]}
          >
            Expiry Status
          </Text>
          <View
            style={[styles.tabLine, tab === 'expiry' && styles.tabLineActive]}
          />
        </Pressable>
      </View>

      {tab === 'users' ? (
        <View style={styles.flex}>
          <View style={styles.selectRow}>
            <Text style={styles.selectCount}>{selected.size} selected</Text>
            <View style={styles.selectActions}>
              <Pressable
                onPress={() => setSelected(new Set(accounts.map((a) => a.id)))}
                hitSlop={8}
              >
                <Text style={styles.selectAction}>Select All</Text>
              </Pressable>
              <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
                <Text style={[styles.selectAction, { color: STATUS.badText }]}>
                  Unselect All
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
                  <View style={styles.avatar}>
                    <Ionicons
                      name="person"
                      size={rs(15)}
                      color={colors.textMuted}
                    />
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
                    color={on ? colors.accentGreen : colors.textMuted}
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
              style={[styles.fetchBtn, !selected.size && styles.fetchBtnOff]}
              disabled={!selected.size}
              onPress={() => setTab('expiry')}
            >
              <Text style={styles.fetchText}>Fetch Expiry Info</Text>
            </Pressable>
          </View>
        </View>
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
              tintColor={colors.accentGreen}
            />
          }
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            fetchProgress ? (
              <View style={styles.progressBanner}>
                <ActivityIndicator size="small" color={STATUS.okText} />
                <Text style={styles.progressText}>
                  Fetching {fetchProgress.done}/{fetchProgress.total}…
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading || fetchProgress ? (
              <View style={styles.loadingEmpty}>
                <ActivityIndicator color={STATUS.okText} />
                <Text style={styles.empty}>
                  Checking selected accounts one by one…
                </Text>
              </View>
            ) : (
              <Text style={styles.empty}>
                {accounts.length
                  ? 'No accounts selected. Switch to Select Users.'
                  : 'No MeroShare accounts saved. Add from Apply → Add capital.'}
              </Text>
            )
          }
          renderItem={({ item }) => {
            const pills = item.pills.length ? item.pills : PLACEHOLDER_PILLS;
            const bad = renewFor(item);
            const invalid = isInvalidAccount(item);
            const accent = invalid ? STATUS.badText : STATUS.okText;
            const border = invalid ? STATUS.badBorder : STATUS.okBorder;
            return (
              <View style={[styles.card, { borderColor: border }]}>
                <View style={styles.cardHead}>
                  <Ionicons name="person" size={rs(15)} color={accent} />
                  <Text
                    style={[styles.cardName, { color: accent }]}
                    numberOfLines={1}
                  >
                    {item.accountName.toUpperCase()}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: invalid ? STATUS.badBg : STATUS.okBg,
                        borderColor: border,
                      },
                    ]}
                  >
                    <Text style={[styles.statusBadgeText, { color: accent }]}>
                      {invalid ? 'Invalid' : 'Valid'}
                    </Text>
                  </View>
                </View>

                <View style={styles.pillRow}>
                  {pills.map((p) => (
                    <PillBox key={p.kind} pill={p} styles={styles} />
                  ))}
                </View>

                {bad ? (
                  <Pressable
                    style={styles.renewBtn}
                    onPress={() => openRenew(bad.kind)}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={rs(14)}
                      color={STATUS.badText}
                    />
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

function makeStyles(c: ThemeColors, isDark: boolean) {
  const headerBg = c.bgElevated;
  const cardBg = c.surface;
  const avatarBg = isDark ? c.surfaceAlt : STATUS.okBg;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(10),
      backgroundColor: headerBg,
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
      color: c.text,
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
      backgroundColor: cardBg,
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
      backgroundColor: headerBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingTop: rs(12),
    },
    tabText: { color: c.textMuted, fontSize: rs(13), fontWeight: '600' },
    tabTextActive: { color: c.accentGreen, fontWeight: '800' },
    tabLine: {
      marginTop: rs(9),
      height: rs(2.5),
      width: '60%',
      backgroundColor: 'transparent',
      borderTopLeftRadius: rs(2),
      borderTopRightRadius: rs(2),
    },
    tabLineActive: { backgroundColor: c.accentGreen },
    selectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingTop: rs(12),
      paddingBottom: rs(2),
    },
    selectCount: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    selectActions: { flexDirection: 'row', gap: rs(18) },
    selectAction: { color: c.accentGreen, fontWeight: '700', fontSize: rs(13) },
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
      borderColor: c.border,
      backgroundColor: cardBg,
    },
    avatar: {
      width: rs(26),
      height: rs(26),
      borderRadius: rs(13),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: avatarBg,
    },
    userName: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    userMeta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(3) },
    footer: {
      paddingHorizontal: rs(16),
      paddingTop: rs(10),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: headerBg,
    },
    fetchBtn: {
      borderWidth: 1.5,
      borderColor: c.accentGreen,
      borderRadius: rs(26),
      paddingVertical: rs(13),
      alignItems: 'center',
    },
    fetchBtnOff: { opacity: 0.4 },
    fetchText: { color: c.accentGreen, fontWeight: '800', fontSize: rs(14) },
    card: {
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: rs(18),
      padding: rs(18),
      backgroundColor: cardBg,
      marginBottom: rs(16),
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(9),
      marginBottom: rs(15),
    },
    cardName: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14.5),
      letterSpacing: 0.3,
    },
    statusBadge: {
      borderWidth: 1,
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
    },
    statusBadgeText: {
      fontSize: rs(11),
      fontWeight: '800',
    },
    progressBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(12),
      paddingVertical: rs(10),
      paddingHorizontal: rs(12),
      borderRadius: rs(12),
      backgroundColor: isDark ? c.surfaceAlt : STATUS.okBg,
      borderWidth: 1,
      borderColor: STATUS.okBorder,
    },
    progressText: {
      color: STATUS.okText,
      fontWeight: '700',
      fontSize: rs(13),
    },
    loadingEmpty: {
      alignItems: 'center',
      gap: rs(12),
      marginTop: rs(24),
    },
    pillRow: { flexDirection: 'row', gap: rs(9), alignItems: 'stretch' },
    pill: {
      flex: 1,
      borderRadius: rs(12),
      borderWidth: 1,
      paddingHorizontal: rs(11),
      paddingVertical: rs(12),
      minHeight: rs(92),
      justifyContent: 'flex-start',
    },
    pillLabel: { fontSize: rs(12), fontWeight: '800', marginBottom: rs(6) },
    pillMid: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(4),
      marginBottom: rs(6),
    },
    pillStatus: { fontSize: rs(11.5), fontWeight: '700', flex: 1 },
    pillDate: { fontSize: rs(11), fontWeight: '600', opacity: 0.85 },
    renewBtn: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      marginTop: rs(14),
      borderWidth: 1.5,
      borderColor: STATUS.badText,
      borderRadius: rs(24),
      paddingHorizontal: rs(22),
      paddingVertical: rs(10),
      minWidth: rs(150),
    },
    renewText: { color: STATUS.badText, fontWeight: '800', fontSize: rs(13) },
  });
}
