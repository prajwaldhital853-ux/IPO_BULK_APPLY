import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AccountCheckboxPickerRow } from '../components/AccountListRows';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { floatingTabBarClearance } from '../components/AppTabBar';
import { GlassClusterBackground } from '../components/GlassClusterBackground';
import { GlassIpoPickerField } from '../components/GlassIpoPickerField';
import { GlassPrimaryButton } from '../components/GlassPrimaryButton';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  loadCurrentOpenIssuesForUi,
  runBulkResultCheck,
  type OpenIssue,
  type ResultAccountStatus,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import {
  buildCheckAccountIdSet,
  isAllAccountsSelected,
  isCheckAccountSelected,
  resolveCheckAccounts,
  toggleCheckAccountId,
} from '../utils/checkAccountSelection';
import { filterAccountsByQuery } from '../utils/filterAccounts';
import { ACCOUNT_LIST_FLAT_PROPS } from '../utils/flatListPerf';
import { useAfterInteractions } from '../utils/useAfterInteractions';
import { usePullToRefresh } from '../utils/usePullToRefresh';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import {
  buildStatusCardStyle,
  chipActiveBackground,
  STATUS_NOT_APPLIED,
  STATUS_REJECTED,
  STATUS_VERIFIED,
} from '../utils/statusCardStyle';

const ACCENT = '#2D5A27';
/** Deep forest green for check CTAs in dark mode */
const ACCENT_DARK = '#0A3A14';
const GREEN = '#2E7D32';
/** Blue for unverified application status on this screen only. */
const UNVERIFIED_BLUE = '#1976D2';

type ResultKind = 'verified' | 'unverified' | 'rejected' | 'not_applied';
type StatusFilter = 'all' | ResultKind;

function classify(row: ResultAccountStatus): ResultKind {
  if (
    row.status === 'NOT_APPLIED' ||
    /no application found|not applied|have not applied/i.test(row.message)
  ) {
    return 'not_applied';
  }

  // Prefer MeroShare Status field (same as website) for filter buckets.
  const meroshareStatus = (row.allotmentStatus || row.message || '').trim();
  if (/^verified$/i.test(meroshareStatus)) return 'verified';
  if (/^rejected$/i.test(meroshareStatus)) return 'rejected';
  if (/^unverified$/i.test(meroshareStatus)) return 'unverified';

  if (row.status === 'VERIFIED') return 'verified';
  if (row.status === 'REJECTED' || !row.ok) return 'rejected';
  if (row.status === 'UNVERIFIED') return 'unverified';

  const raw = `${row.status} ${row.allotmentStatus ?? ''} ${row.message}`.toUpperCase();
  if (/REJECT|FAIL|ERROR|CANCEL/i.test(raw)) return 'rejected';
  if (/VERIF/.test(raw) && !/UNVERIF|NOT.?VERIF/.test(raw)) return 'verified';
  if (/UNVERIF|NOT.?VERIF|PENDING|APPLIED|PROCESS/i.test(raw)) return 'unverified';
  return 'unverified';
}

function statusLine(row: ResultAccountStatus): string {
  const kind = classify(row);
  if (kind === 'not_applied') return 'NOT APPLIED';
  const label = (row.allotmentStatus || row.message || '').trim();
  if (label) return label;
  if (kind === 'rejected') return 'Rejected';
  if (kind === 'verified') return 'Verified';
  return 'Unverified';
}

/** Full MeroShare remarks line (Block Amount Status - …). */
function statusRemarks(row: ResultAccountStatus): string | null {
  const kind = classify(row);
  if (kind === 'not_applied') return null;
  const text = (row.remarks ?? '').trim();
  if (!text) return null;
  if (text.toLowerCase() === statusLine(row).toLowerCase()) return null;
  return text;
}

function kindColor(kind: ResultKind): string {
  if (kind === 'verified') return STATUS_VERIFIED;
  if (kind === 'unverified') return UNVERIFIED_BLUE;
  if (kind === 'rejected') return STATUS_REJECTED;
  if (kind === 'not_applied') return STATUS_NOT_APPLIED;
  return STATUS_REJECTED;
}

function kindCardTheme(kind: ResultKind, isDark: boolean) {
  return buildStatusCardStyle(kindColor(kind), isDark);
}

export function CurrentIpoStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { operationalAccounts: accounts, overQuota } = useActiveAccounts();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const tabClearance = floatingTabBarClearance(insets.bottom);
  const ready = useAfterInteractions();
  const modalListHeight = useMemo(
    () => Math.max(rs(160), Dimensions.get('window').height * 0.38),
    [],
  );

  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [accountPickerFilter, setAccountPickerFilter] = useState('');
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [selected, setSelected] = useState<OpenIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultAccountStatus[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const counts = useMemo(() => {
    const base: Record<ResultKind, number> = {
      verified: 0,
      unverified: 0,
      rejected: 0,
      not_applied: 0,
    };
    for (const row of results) base[classify(row)] += 1;
    return base;
  }, [results]);

  const chips = useMemo(() => {
    const kinds = (
      [
        { key: 'verified', label: 'Verified', color: STATUS_VERIFIED },
        { key: 'unverified', label: 'Unverified', color: UNVERIFIED_BLUE },
        { key: 'rejected', label: 'Rejected', color: STATUS_REJECTED },
        { key: 'not_applied', label: 'Not Applied', color: STATUS_NOT_APPLIED },
      ] as const
    )
      .map((chip) => ({ ...chip, count: counts[chip.key] }))
      .filter((chip) => chip.count > 0);
    if (kinds.length <= 1) return kinds;
    return [
      { key: 'all' as const, label: 'All', color: ACCENT, count: results.length },
      ...kinds,
    ];
  }, [counts, results.length]);

  const visibleResults = useMemo(
    () =>
      filter === 'all'
        ? results
        : results.filter((row) => classify(row) === filter),
    [filter, results],
  );

  const checkAccounts = useMemo(
    () => resolveCheckAccounts(accounts, checkAccountIds),
    [accounts, checkAccountIds],
  );

  const checkAccountIdSet = useMemo(
    () => buildCheckAccountIdSet(accounts, checkAccountIds),
    [accounts, checkAccountIds],
  );

  const allAccountsSelected = useMemo(
    () => isAllAccountsSelected(accounts, checkAccountIds),
    [accounts, checkAccountIds],
  );

  const filteredPickerAccounts = useMemo(
    () => filterAccountsByQuery(accounts, accountPickerFilter),
    [accounts, accountPickerFilter],
  );

  const resultIndexByAccountId = useMemo(() => {
    const m = new Map<string, number>();
    results.forEach((r, i) => m.set(r.accountId, i));
    return m;
  }, [results]);

  useEffect(() => {
    if (!accounts.length) {
      setCheckAccountIds([]);
      return;
    }
    setCheckAccountIds((prev) => {
      const valid = prev.filter((id) => accounts.some((a) => a.id === id));
      return valid.length ? valid : [];
    });
  }, [accounts]);

  const toggleAccount = useCallback(
    (account: AccountMeta) => {
      setCheckAccountIds((prev) =>
        toggleCheckAccountId(accounts, prev, account.id),
      );
    },
    [accounts],
  );

  const refreshIssues = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadCurrentOpenIssuesForUi(accounts);
      const real = list.filter((i) => i.companyShareId !== 9001);
      setIssues((prev) => (real.length ? real : prev));
      setSelected((prev) => {
        if (!real.length) return prev;
        const still = prev
          ? real.find((i) => i.companyShareId === prev.companyShareId)
          : null;
        return still ?? real[0];
      });
    } finally {
      setLoading(false);
    }
  }, [accounts]);

  // Shell paints first; MeroShare issue fetch waits for the stack transition.
  useEffect(() => {
    if (!ready) return;
    void refreshIssues();
  }, [ready, refreshIssues]);

  const { refreshing, onRefresh } = usePullToRefresh(refreshIssues);
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  useEffect(() => {
    setResults([]);
    setFilter('all');
    setProgress(null);
  }, [selected?.companyShareId]);

  const checkLabel =
    allAccountsSelected
      ? 'Select Category (All Accounts)'
      : checkAccounts.length === 1
        ? `${checkAccounts[0].name.toUpperCase()} - ${checkAccounts[0].username}`
        : `Select Category (${checkAccounts.length} accounts)`;

  const openingLabel = loading
    ? 'Loading openings…'
    : selected
      ? `${selected.companyName}${selected.scrip ? ` (${selected.scrip})` : ''}`
      : 'No Any Opening';

  const runCheck = () => {
    if (!selected) {
      Alert.alert('No Any Opening', 'There is no current opening IPO/FPO/Right.');
      return;
    }
    if (!checkAccounts.length) {
      Alert.alert('No accounts', 'Select at least one account.');
      return;
    }
    void sensitive.requestSensitiveAction(
      async () => {
        setRunning(true);
        setResults([]);
        setFilter('all');
        setProgress({ done: 0, total: checkAccounts.length });
        try {
          await runBulkResultCheck({
            accounts: checkAccounts,
            issue: selected,
            applicationPhase: true,
            onProgress: (msg, index, total) => {
              setProgress({ done: index, total });
            },
            // Show each account as soon as it finishes (same as IPO Bulk Status).
            onAccountResult: (row, index, total) => {
              setResults((prev) => {
                const i = prev.findIndex((r) => r.accountId === row.accountId);
                if (i < 0) return [...prev, row];
                const next = prev.slice();
                next[i] = row;
                return next;
              });
              setProgress({ done: index + 1, total });
            },
          });
        } catch (e) {
          Alert.alert(
            'Check failed',
            e instanceof Error ? e.message : 'Unknown error',
          );
        } finally {
          setRunning(false);
          setProgress(null);
        }
      },
      { pinPolicy: 'skipIfUnlocked' },
    );
  };

  return (
    <GlassClusterBackground variant="default" style={{ paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons
            name="chart-donut"
            size={rs(20)}
            color={isDark ? '#67E8F9' : '#1565C0'}
          />
          <Text style={styles.title}>Current IPO Status</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() =>
            Alert.alert(
              'Current IPO Status',
              'Shows MeroShare application status (Verified, Unverified, or Rejected) for currently open IPO/FPO/Right issues — not allotment results.',
            )
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={isDark ? '#67E8F9' : '#1565C0'}
          />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
        {overQuota && accounts.length > 0 ? (
          <Text style={styles.quotaHint}>
            Status checks use every saved account on this phone, including locked
            ones.
          </Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        <GlassIpoPickerField
          icon="accounts"
          label={checkLabel}
          placeholder={checkAccounts.length === accounts.length}
          onPress={() => setCheckPickerOpen(true)}
        />
        <GlassIpoPickerField
          icon="ipo"
          label={openingLabel}
          placeholder={!selected || loading}
          onPress={() => setPickerOpen(true)}
          disabled={loading}
          loading={loading}
        />
        <GlassPrimaryButton
          label="Check Bulk Status"
          onPress={runCheck}
          disabled={!selected}
          loading={running}
        />
      </View>

      {results.length > 0 ? (
        <View style={styles.resultsPane}>
          <View style={styles.updatesBox}>
            <View style={styles.updatesHead}>
              <Text style={styles.updatesTitle}>
                IPO/FPO Status Updates{' '}
                <Text style={styles.updatesCount}>
                  ({results.length}/{counts.verified})
                </Text>
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setResults([]);
                  setFilter('all');
                }}
              >
                <Text style={styles.clearText}>clear</Text>
              </Pressable>
            </View>

            {chips.length > 0 ? (
              <View style={styles.chipRow}>
                {chips.map((chip) => {
                  const active =
                    filter === chip.key ||
                    (filter === 'all' && chips.length === 1);
                  return (
                    <Pressable
                      key={chip.key}
                      onPress={() => setFilter(chip.key)}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? chip.color : colors.borderMuted,
                          backgroundColor: active
                            ? chipActiveBackground(chip.color, isDark)
                            : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? chip.color : colors.textMuted },
                        ]}
                      >
                        {chip.label} ({chip.count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <FlatList
              style={styles.resultsList}
              data={visibleResults}
              keyExtractor={(row) => row.accountId}
              contentContainerStyle={[
                styles.resultsListBody,
                { paddingBottom: tabClearance },
              ]}
              refreshControl={refreshControl}
              {...ACCOUNT_LIST_FLAT_PROPS}
              ListEmptyComponent={
                <Text style={styles.empty}>No accounts in this category.</Text>
              }
              renderItem={({ item: row }) => {
                const idx = resultIndexByAccountId.get(row.accountId) ?? 0;
                const kind = classify(row);
                const card = kindCardTheme(kind, isDark);
                const reason = statusRemarks(row);
                const showApply = kind === 'not_applied' || kind === 'rejected';
                const applyBtnColor =
                  kind === 'not_applied' ? STATUS_NOT_APPLIED : card.accent;
                const mciIcon =
                  kind === 'verified'
                    ? 'check-bold'
                    : kind === 'unverified'
                      ? 'clock-outline'
                      : kind === 'rejected'
                        ? 'alert-octagon'
                        : 'cancel';
                return (
                  <View
                    style={[
                      styles.resultCard,
                      {
                        borderColor: card.borderColor,
                        backgroundColor: card.backgroundColor,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.resultIcon,
                        styles.resultIconSquare,
                        { backgroundColor: card.iconBackground },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={mciIcon}
                        size={rs(19)}
                        color={card.iconColor}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: card.textColor }]}>
                        {idx + 1}. {row.accountName.toUpperCase()}
                      </Text>
                      <Text style={[styles.resultStatus, { color: card.textColor }]}>
                        {statusLine(row)}
                      </Text>
                      {reason ? (
                        <View
                          style={[
                            styles.reasonPill,
                            { backgroundColor: card.pillBackground },
                          ]}
                        >
                          <Text
                            style={[styles.reasonPillText, { color: card.textColor }]}
                            numberOfLines={4}
                          >
                            {reason}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {showApply ? (
                      <Pressable
                        style={[
                          styles.rowApplyBtn,
                          {
                            borderColor: `${applyBtnColor}66`,
                            backgroundColor: applyBtnColor,
                          },
                        ]}
                        onPress={() =>
                          navigation.navigate('MainTabs', { screen: 'Apply' })
                        }
                      >
                        <Text style={styles.rowApplyText}>Apply</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              }}
            />
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.emptyScroll}
          contentContainerStyle={styles.emptyWrap}
          refreshControl={refreshControl}
        >
          <Text style={styles.empty}>
            {running && progress
              ? `Checking ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : 'Run Check Bulk Status to see account results here.'}
          </Text>
        </ScrollView>
      )}

      <Modal
        visible={checkPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setCheckPickerOpen(false);
          setAccountPickerFilter('');
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Text style={styles.modalTitle}>Select Category</Text>
            {accounts.length > 40 ? (
              <TextInput
                style={styles.modalSearch}
                placeholder="Search accounts…"
                placeholderTextColor={colors.textMuted}
                value={accountPickerFilter}
                onChangeText={setAccountPickerFilter}
                autoCorrect={false}
                autoCapitalize="none"
              />
            ) : null}
            <Pressable
              style={styles.modalRow}
              onPress={() => {
                setCheckAccountIds([]);
                setCheckPickerOpen(false);
                setAccountPickerFilter('');
              }}
            >
              <Text style={styles.modalRowTitle}>All Accounts</Text>
              {allAccountsSelected ? (
                <Ionicons name="checkmark" size={rs(20)} color={ACCENT} />
              ) : null}
            </Pressable>
            <FlatList
              style={[styles.modalList, { maxHeight: modalListHeight }]}
              data={filteredPickerAccounts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              {...ACCOUNT_LIST_FLAT_PROPS}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {accountPickerFilter.trim()
                    ? 'No accounts match your search.'
                    : 'No saved accounts yet. Add capital from Apply first.'}
                </Text>
              }
              renderItem={({ item }) => (
                <AccountCheckboxPickerRow
                  account={item}
                  selected={isCheckAccountSelected(item.id, checkAccountIdSet)}
                  onPress={() => toggleAccount(item)}
                  accentColor={ACCENT}
                  mutedColor={colors.textMuted}
                  rowStyle={styles.modalRow}
                  titleStyle={styles.modalRowTitle}
                />
              )}
            />
            <Pressable
              style={styles.modalDone}
              onPress={() => {
                setCheckPickerOpen(false);
                setAccountPickerFilter('');
              }}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Text style={styles.modalTitle}>Current Opening</Text>
            <FlatList
              data={issues}
              keyExtractor={(item) => String(item.companyShareId)}
              ListEmptyComponent={
                <Text style={styles.empty}>No Any Opening</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelected(item);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowTitle}>{item.companyName}</Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalDone}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.modalDoneText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SensitiveActionModals action={sensitive} />
    </GlassClusterBackground>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const boxBorder = isDark ? c.borderMuted : 'rgba(186,230,253,0.55)';

  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      backgroundColor: 'transparent',
    },
    headerTitleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      marginHorizontal: rs(8),
    },
    title: {
      color: isDark ? c.text : '#1B2A4A',
      fontSize: rs(17),
      fontWeight: '800',
    },
    controls: {
      paddingHorizontal: rs(16),
      paddingTop: rs(6),
      paddingBottom: rs(4),
    },
    resultsList: { flex: 1, minHeight: 0 },
    resultsListBody: {},
    resultsPane: { flex: 1, paddingHorizontal: rs(16) },
    updatesBox: {
      flex: 1,
      minHeight: 0,
      borderWidth: 1,
      borderColor: boxBorder,
      borderRadius: rs(16),
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.35)',
      paddingHorizontal: rs(10),
      paddingTop: rs(10),
    },
    updatesHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(10),
    },
    updatesTitle: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    updatesCount: { color: GREEN, fontWeight: '800' },
    clearText: { color: c.textMuted, fontSize: rs(12), fontWeight: '600' },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginTop: rs(10),
      marginBottom: rs(10),
    },
    chip: {
      borderWidth: 1,
      borderRadius: rs(14),
      paddingHorizontal: rs(12),
      paddingVertical: rs(5),
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)',
    },
    chipText: { fontSize: rs(11), fontWeight: '700' },
    resultCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(12),
      borderWidth: 1.5,
      borderRadius: rs(12),
      padding: rs(13),
      marginBottom: rs(10),
    },
    resultIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: rs(2),
    },
    resultIconSquare: {
      borderRadius: rs(8),
      width: rs(34),
      height: rs(34),
    },
    resultName: { fontWeight: '800', fontSize: rs(13), marginBottom: rs(4) },
    resultStatus: {
      fontSize: rs(12),
      fontWeight: '600',
      marginBottom: rs(8),
    },
    reasonPill: {
      alignSelf: 'flex-start',
      marginTop: rs(6),
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
    },
    reasonPillText: {
      fontSize: rs(11),
      fontWeight: '700',
    },
    rowApplyBtn: {
      borderWidth: 1,
      borderRadius: rs(14),
      paddingHorizontal: rs(14),
      paddingVertical: rs(6),
      backgroundColor: isDark ? 'transparent' : '#FFFFFF',
    },
    rowApplyText: { fontSize: rs(11), fontWeight: '700', color: '#FFFFFF' },
    emptyScroll: { flex: 1 },
    emptyWrap: { flexGrow: 1, justifyContent: 'flex-start', paddingTop: rs(24) },
    empty: { color: c.textMuted, textAlign: 'center', padding: rs(20) },
    modalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      maxHeight: '75%',
      backgroundColor: isDark ? c.bgElevated : '#FFFFFF',
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(16),
      paddingTop: rs(14),
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginBottom: rs(10),
    },
    modalList: { flexGrow: 0 },
    quotaHint: {
      color: c.textMuted,
      fontSize: rs(11),
      marginBottom: rs(8),
      lineHeight: rs(15),
    },
    modalSearch: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      marginBottom: rs(8),
      color: c.text,
      fontSize: rs(14),
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      gap: rs(10),
    },
    modalRowTitle: { flex: 1, color: c.text, fontWeight: '600', fontSize: rs(13) },
    modalDone: { alignItems: 'center', paddingVertical: rs(14) },
    modalDoneText: {
      color: c.primary,
      fontWeight: '800',
      fontSize: rs(15),
    },
  });
}
