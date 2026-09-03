import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
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
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { AccountUserSelectRow } from '../components/AccountListRows';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
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
import { filterAccountsByQuery, pruneAccountIdSet } from '../utils/filterAccounts';
import { ACCOUNT_LIST_FLAT_PROPS } from '../utils/flatListPerf';
import type { RootStackParamList } from '../navigation/types';

type TabId = 'users' | 'expiry';
type Styles = ReturnType<typeof makeStyles>;

const FETCH_CONCURRENCY = 5;
const PROGRESS_FLUSH_MS = 120;

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

/** Stronger contrast for light-mode cards (sage page bg washes out soft greens). */
const STATUS_LIGHT = {
  okBg: '#FFFFFF',
  okBorder: '#1B5E20',
  okText: '#1B5E20',
  badBg: '#FFEBEE',
  badBorder: '#B71C1C',
  badText: '#B71C1C',
  neutralBg: '#FFFFFF',
  neutralBorder: '#6B7A60',
  neutralText: '#3D4A38',
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
    calendar: 'AD',
    daysLeft: null,
    statusLine: 'Unknown',
  },
  {
    kind: 'demat',
    label: 'Demat',
    expired: null,
    expiryDate: null,
    calendar: 'BS',
    daysLeft: null,
    statusLine: 'Unknown',
  },
  {
    kind: 'meroshare',
    label: 'MeroShare',
    expired: null,
    expiryDate: null,
    calendar: 'AD',
    daysLeft: null,
    statusLine: 'Unknown',
  },
];

type StatusPalette = typeof STATUS;

function statusPalette(isDark: boolean): StatusPalette {
  return isDark ? STATUS : STATUS_LIGHT;
}

function PillBox({
  pill,
  styles,
  palette,
}: {
  pill: ExpiryPill;
  styles: Styles;
  palette: StatusPalette;
}) {
  const bad = pill.expired === true;
  const neutral = pill.expired == null;
  const bg = bad ? palette.badBg : neutral ? palette.neutralBg : palette.okBg;
  const border = bad
    ? palette.badBorder
    : neutral
      ? palette.neutralBorder
      : palette.okBorder;
  const tint = bad
    ? palette.badText
    : neutral
      ? palette.neutralText
      : palette.okText;
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
        {formatExpiryDisplay(pill.expiryDate, pill.calendar)}
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
  const palette = useMemo(() => statusPalette(isDark), [isDark]);
  const { loadSecrets } = useAccounts();
  const { usableAccounts: accounts } = useActiveAccounts();

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
  const refreshRunRef = useRef(0);

  useEffect(() => {
    setSelected((prev) => pruneAccountIdSet(accounts, prev));
  }, [accounts]);

  const refresh = useCallback(
    async (silent = false) => {
      const runId = ++refreshRunRef.current;
      const isStale = () => refreshRunRef.current !== runId;

      if (!silent) {
        setLoading(true);
        setRows([]);
      }
      if (!accounts.length) {
        if (!isStale()) {
          setRows([]);
          setFetchProgress(null);
          setLoading(false);
        }
        return;
      }
      const targets = accounts.filter((a) => selected.has(a.id));
      if (!targets.length) {
        if (!isStale()) {
          setRows([]);
          setFetchProgress(null);
          setLoading(false);
        }
        return;
      }

      const total = targets.length;
      const orderIds = targets.map((a) => a.id);
      if (!isStale()) {
        setFetchProgress({ done: 0, total });
      }

      const byId = new Map<string, AccountExpiryInfo>();
      let done = 0;
      let lastProgressFlush = 0;

      const flushRows = () => {
        if (isStale()) return;
        setRows(
          orderIds
            .map((id) => byId.get(id))
            .filter((row): row is AccountExpiryInfo => row != null),
        );
      };

      const bumpProgress = (force = false) => {
        if (isStale()) return;
        const now = Date.now();
        if (!force && now - lastProgressFlush < PROGRESS_FLUSH_MS) return;
        lastProgressFlush = now;
        setFetchProgress({ done, total });
      };

      const onAccountDone = (info: AccountExpiryInfo) => {
        if (isStale()) return;
        byId.set(info.accountId, info);
        done += 1;
        flushRows();
        bumpProgress(done === total);
      };

      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < targets.length) {
          if (isStale()) return;
          const i = nextIndex;
          nextIndex += 1;
          const account = targets[i]!;
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
          onAccountDone(info);
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(FETCH_CONCURRENCY, targets.length) }, () =>
          worker(),
        ),
      );

      if (isStale()) return;
      flushRows();
      setFetchProgress(null);
      setLoading(false);
    },
    [accounts, loadSecrets, selected],
  );

  useEffect(() => {
    if (tab === 'expiry') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const toggleUser = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredAccounts = useMemo(
    () => filterAccountsByQuery(accounts, query),
    [accounts, query],
  );

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

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
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
                <Text style={[styles.selectAction, { color: palette.badText }]}>
                  Unselect All
                </Text>
              </Pressable>
            </View>
          </View>

          <FlatList
            style={styles.flex}
            data={filteredAccounts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            {...ACCOUNT_LIST_FLAT_PROPS}
            ListEmptyComponent={
              <Text style={styles.empty}>
                No accounts saved. Add from Apply → Add capital.
              </Text>
            }
            renderItem={({ item, index }) => (
              <AccountUserSelectRow
                account={item}
                index={index}
                selected={selected.has(item.id)}
                onPress={() => toggleUser(item.id)}
                styles={styles}
                colors={colors}
              />
            )}
          />

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
        <View style={styles.flex}>
          {fetchProgress ? (
            <View style={styles.progressSticky}>
              <View style={styles.progressBanner}>
                <ActivityIndicator size="small" color={palette.okText} />
                <Text style={styles.progressText}>
                  Fetching {fetchProgress.done}/{fetchProgress.total}…
                </Text>
              </View>
            </View>
          ) : null}
          <FlatList
            style={styles.flex}
            data={visibleRows}
            keyExtractor={(item) => item.accountId}
            {...ACCOUNT_LIST_FLAT_PROPS}
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
            ListEmptyComponent={
            loading || fetchProgress ? (
              <View style={styles.loadingEmpty}>
                <ActivityIndicator color={palette.okText} />
                <Text style={styles.empty}>
                  Checking selected accounts…
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
            const accent = invalid ? palette.badText : palette.okText;
            const border = invalid ? palette.badBorder : palette.okBorder;
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
                        backgroundColor: invalid ? palette.badBg : palette.okBg,
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
                    <PillBox
                      key={p.kind}
                      pill={p}
                      styles={styles}
                      palette={palette}
                    />
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
                      color={palette.badText}
                    />
                    <Text style={[styles.renewText, { color: palette.badText }]}>
                      {renewLabel(bad.kind)}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const headerBg = c.bgElevated;
  const cardBg = isDark ? c.surface : '#FFFFFF';
  const avatarBg = isDark ? c.surfaceAlt : STATUS_LIGHT.okBg;
  const tone = isDark ? STATUS : STATUS_LIGHT;

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
      borderWidth: isDark ? 1 : 1.5,
      borderColor: isDark ? c.border : '#7A8F6A',
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
    tabTextActive: { color: tone.okText, fontWeight: '800' },
    tabLine: {
      marginTop: rs(9),
      height: rs(2.5),
      width: '60%',
      backgroundColor: 'transparent',
      borderTopLeftRadius: rs(2),
      borderTopRightRadius: rs(2),
    },
    tabLineActive: { backgroundColor: tone.okBorder },
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
    selectAction: { color: tone.okText, fontWeight: '700', fontSize: rs(13) },
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
      borderWidth: isDark ? 1 : 1.5,
      borderColor: isDark ? c.border : '#8FA07A',
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
      borderWidth: 2,
      borderColor: tone.okBorder,
      borderRadius: rs(26),
      paddingVertical: rs(13),
      alignItems: 'center',
      backgroundColor: isDark ? 'transparent' : '#E8F5E9',
    },
    fetchBtnOff: { opacity: 0.4 },
    fetchText: { color: tone.okText, fontWeight: '800', fontSize: rs(14) },
    card: {
      borderWidth: isDark ? 1.5 : 2,
      borderColor: isDark ? c.border : '#1B5E20',
      borderRadius: rs(18),
      padding: rs(18),
      backgroundColor: cardBg,
      marginBottom: rs(16),
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.2 : 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: isDark ? 2 : 4,
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
      borderWidth: 1.5,
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
    },
    statusBadgeText: {
      fontSize: rs(11),
      fontWeight: '800',
    },
    progressSticky: {
      paddingHorizontal: rs(14),
      paddingTop: rs(4),
      paddingBottom: rs(8),
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      zIndex: 2,
      elevation: 2,
    },
    progressBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingVertical: rs(10),
      paddingHorizontal: rs(12),
      borderRadius: rs(12),
      backgroundColor: isDark ? c.surfaceAlt : '#E8F5E9',
      borderWidth: isDark ? 1 : 1.5,
      borderColor: tone.okBorder,
    },
    progressText: {
      color: tone.okText,
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
      borderWidth: isDark ? 1 : 1.5,
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
    pillDate: { fontSize: rs(11), fontWeight: '700', opacity: 1 },
    renewBtn: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      marginTop: rs(14),
      borderWidth: 1.5,
      borderColor: tone.badText,
      borderRadius: rs(24),
      paddingHorizontal: rs(22),
      paddingVertical: rs(10),
      minWidth: rs(150),
    },
    renewText: { color: tone.badText, fontWeight: '800', fontSize: rs(13) },
  });
}
