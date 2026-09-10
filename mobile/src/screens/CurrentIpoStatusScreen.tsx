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
import { BusyOverlay } from '../components/BusyOverlay';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  loadCurrentOpenIssuesForUi,
  refreshAccountStatusRow,
  runBulkApply,
  runBulkResultCheck,
  type OpenIssue,
  type ResultAccountStatus,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import {
  applyDisplayMessage,
  resolveApplyOutcome,
} from '../utils/applyResultUi';
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
  CHIP_BLUE,
  CHIP_GREEN,
  CHIP_ORANGE,
  CHIP_RED,
  chipTint,
  STATUS_NOT_APPLIED,
  STATUS_REJECTED,
  STATUS_VERIFIED,
} from '../utils/statusCardStyle';

const ACCENT = '#2D5A27';
/** Deep forest green for check CTAs in dark mode */
const ACCENT_DARK = '#0A3A14';
const HEADER_BG = '#E8F0E6';
const BODY_BG = '#F6F8F2';
const GREEN = '#2E7D32';
/** Blue for unverified application status (glass-era semantic color). */
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

function statusDisplayLine(row: ResultAccountStatus): string {
  const kind = classify(row);
  const base = statusLine(row);
  const qty = row.appliedKitta;
  if (qty == null || /quantity\s*:/i.test(base)) return base;
  if (kind === 'verified') return `Verified ( quantity : ${qty} )`;
  if (kind === 'unverified') return `Unverified ( quantity : ${qty} )`;
  if (kind === 'rejected') return `Rejected ( quantity : ${qty} )`;
  return base;
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
  const [applying, setApplying] = useState(false);
  const [applyBusyLabel, setApplyBusyLabel] = useState('Applying…');
  const [toast, setToast] = useState<{
    text: string;
    kind: 'success' | 'error';
  } | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, kind: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
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
        { key: 'verified', label: 'Verified', color: CHIP_GREEN },
        { key: 'unverified', label: 'Unverified', color: CHIP_BLUE },
        { key: 'rejected', label: 'Rejected', color: CHIP_RED },
        { key: 'not_applied', label: 'Not Applied', color: CHIP_ORANGE },
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
      setIssues(real);
      setSelected((prev) => {
        if (!real.length) return null;
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

  const bulkApplyEligible = useMemo(() => {
    if (!selected) return [];
    if (filter === 'rejected') {
      return results.filter((row) => classify(row) === 'rejected');
    }
    if (filter === 'not_applied') {
      return results.filter((row) => classify(row) === 'not_applied');
    }
    return [];
  }, [filter, results, selected]);

  const bulkApplyLabel =
    filter === 'not_applied'
      ? `Apply All Not Applied (${bulkApplyEligible.length})`
      : `Re-apply All Rejected (${bulkApplyEligible.length})`;

  const bulkApplyBtnColor =
    filter === 'not_applied' ? STATUS_NOT_APPLIED : STATUS_REJECTED;

  const applyRows = useCallback(
    (targetRows: ResultAccountStatus[]) => {
      if (!selected || !targetRows.length) return;
      const issue: OpenIssue = {
        id: selected.companyShareId,
        companyShareId: selected.companyShareId,
        companyName: selected.companyName,
        scrip: selected.scrip,
        shareTypeName: selected.shareTypeName,
      };
      const queue = [...targetRows];

      void sensitive.requestSensitiveAction(
        async () => {
          setApplying(true);
          try {
            for (let i = 0; i < queue.length; i++) {
              const row = queue[i];
              const account =
                checkAccounts.find((a) => a.id === row.accountId) ??
                accounts.find((a) => a.id === row.accountId);
              if (!account) {
                showToast(`${row.accountName}: Account not found`, 'error');
                continue;
              }
              const kitta = row.appliedKitta ?? 10;
              const reapply = classify(row) === 'rejected';
              setApplyBusyLabel(
                `Applying ${account.name} (${i + 1}/${queue.length})…`,
              );
              try {
                const summary = await runBulkApply({
                  accounts: [account],
                  issue,
                  kitta,
                  reapply,
                });
                const applyResult = summary.results[0];
                const outcome = applyResult
                  ? resolveApplyOutcome(applyResult)
                  : 'other';
                if (outcome === 'already_applied') {
                  const fresh = await refreshAccountStatusRow(account, issue, true);
                  setResults((prev) =>
                    prev.map((r) =>
                      r.accountId === row.accountId ? fresh : r,
                    ),
                  );
                  showToast(
                    `${applyResult.accountName}: ${applyDisplayMessage(applyResult)}`,
                    'success',
                  );
                } else if (applyResult?.ok) {
                  setApplyBusyLabel(`Verifying ${account.name}…`);
                  const fresh = await refreshAccountStatusRow(account, issue, true);
                  setResults((prev) =>
                    prev.map((r) =>
                      r.accountId === row.accountId ? fresh : r,
                    ),
                  );
                  const verified =
                    fresh.ok &&
                    fresh.status !== 'REJECTED' &&
                    fresh.status !== 'NOT_APPLIED';
                  if (verified) {
                    showToast(
                      `${applyResult.accountName}: ${applyDisplayMessage(applyResult)}`,
                      'success',
                    );
                  } else {
                    showToast(
                      `${applyResult.accountName}: ${
                        fresh.remarks ??
                        fresh.message ??
                        'Still rejected on MeroShare'
                      }`,
                      'error',
                    );
                  }
                } else {
                  showToast(
                    `${applyResult?.accountName ?? row.accountName}: ${
                      applyResult?.message ?? 'Apply failed'
                    }`,
                    'error',
                  );
                }
              } catch (e) {
                showToast(
                  `${row.accountName}: ${
                    e instanceof Error ? e.message : 'Apply failed'
                  }`,
                  'error',
                );
              }
              if (i < queue.length - 1) {
                await new Promise((r) => setTimeout(r, 200));
              }
            }
          } finally {
            setApplying(false);
            setApplyBusyLabel('Applying…');
          }
        },
        { pinPolicy: 'skipIfUnlocked' },
      );
    },
    [accounts, checkAccounts, selected, sensitive, showToast],
  );

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
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Current IPO Status</Text>
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
            color={isDark ? colors.text : ACCENT}
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
        <Pressable
          style={styles.dropdown}
          onPress={() => setCheckPickerOpen(true)}
        >
          <Text
            style={[
              styles.dropdownText,
              checkAccounts.length === accounts.length &&
                styles.dropdownPlaceholder,
            ]}
            numberOfLines={1}
          >
            {checkLabel}
          </Text>
          <Ionicons
            name="caret-down"
            size={rs(14)}
            color={isDark ? colors.textMuted : '#6B726B'}
          />
        </Pressable>

        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="bank"
            size={rs(16)}
            color={isDark ? colors.textSecondary : '#1B2E1B'}
          />
          <Text style={styles.label}>Current Opening IPO/FPO/Right</Text>
        </View>

        <Pressable
          style={styles.dropdown}
          onPress={() => setPickerOpen(true)}
          disabled={loading}
        >
          <Text
            style={[
              styles.dropdownText,
              styles.dropdownValue,
              (!selected || loading) && styles.dropdownPlaceholder,
            ]}
            numberOfLines={1}
          >
            {openingLabel}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Ionicons
              name="caret-down"
              size={rs(14)}
              color={isDark ? colors.textMuted : '#6B726B'}
            />
          )}
        </Pressable>

        <Pressable
          style={[styles.actionBtn, running && styles.actionBtnLoading]}
          onPress={runCheck}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color={isDark ? '#FFFFFF' : ACCENT} />
          ) : (
            <Text style={styles.actionText}>Check Bulk Status</Text>
          )}
        </Pressable>
      </View>

      {results.length > 0 ? (
        <View
          style={[
            styles.resultsPane,
            { paddingBottom: Math.max(insets.bottom, rs(12)) },
          ]}
        >
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              {chips.map((chip) => {
                const active =
                  filter === chip.key || (filter === 'all' && chips.length === 1);
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? chip.color : colors.borderMuted,
                        backgroundColor: active
                          ? chipTint(chip.color, isDark)
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
            </ScrollView>

            {(filter === 'rejected' || filter === 'not_applied') &&
            bulkApplyEligible.length > 0 ? (
              <Pressable
                style={[
                  styles.reapplyAllBtn,
                  { backgroundColor: bulkApplyBtnColor },
                  applying && { opacity: 0.65 },
                ]}
                onPress={() => applyRows(bulkApplyEligible)}
                disabled={applying}
              >
                {applying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Ionicons name="refresh" size={rs(18)} color="#FFFFFF" />
                )}
                <Text style={styles.reapplyAllText}>{bulkApplyLabel}</Text>
              </Pressable>
            ) : null}

            <FlatList
              style={styles.resultsList}
              data={visibleResults}
              keyExtractor={(row) => row.accountId}
              contentContainerStyle={styles.resultsListBody}
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
                const showApply =
                  (kind === 'not_applied' || kind === 'rejected') && !applying;
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
                    <View style={styles.resultBody}>
                      <Text style={[styles.resultName, { color: card.textColor }]}>
                        {idx + 1}. {row.accountName.toUpperCase()}
                      </Text>
                      <Text style={[styles.resultStatus, { color: card.textColor }]}>
                        {statusDisplayLine(row)}
                      </Text>
                      {reason ? (
                        <View
                          style={[
                            styles.remarkPill,
                            { backgroundColor: card.pillBackground },
                          ]}
                        >
                          <Text
                            style={[
                              styles.remarkText,
                              { color: card.pillTextColor },
                            ]}
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
                            backgroundColor: isDark ? applyBtnColor : '#FFFFFF',
                          },
                        ]}
                        onPress={() => applyRows([row])}
                      >
                        <Text
                          style={[
                            styles.rowApplyText,
                            { color: isDark ? '#FFFFFF' : applyBtnColor },
                          ]}
                        >
                          Apply
                        </Text>
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
              style={[styles.modalDone, styles.actionBtn]}
              onPress={() => {
                setCheckPickerOpen(false);
                setAccountPickerFilter('');
              }}
            >
              <Text style={styles.actionText}>Done</Text>
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
              style={[styles.modalDone, styles.actionBtn]}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.actionText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View
          style={[
            styles.toast,
            toast.kind === 'success' ? styles.toastSuccess : styles.toastError,
            { marginBottom: Math.max(insets.bottom, rs(12)) },
          ]}
        >
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      ) : null}

      <BusyOverlay visible={applying} message={applyBusyLabel} />

      <SensitiveActionModals action={sensitive} />
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const fieldBg = isDark ? c.surface : BODY_BG;
  const fieldBorder = isDark ? c.border : '#8E968E';
  const fieldText = isDark ? c.text : '#1B2E1B';
  const cardBg = isDark ? c.bgElevated : '#FFFFFF';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? c.bg : BODY_BG },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: isDark ? c.bgElevated : HEADER_BG,
    },
    title: {
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
    },
    body: { padding: rs(16), paddingBottom: rs(40) },
    controls: {
      paddingHorizontal: rs(18),
      paddingTop: rs(18),
      paddingBottom: rs(4),
    },
    resultsList: { flex: 1, minHeight: 0 },
    resultsListBody: { paddingBottom: rs(8) },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: fieldBorder,
      borderRadius: rs(22),
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      minHeight: rs(46),
      backgroundColor: fieldBg,
      marginBottom: rs(14),
      gap: rs(8),
    },
    dropdownText: {
      flex: 1,
      color: fieldText,
      fontSize: rs(13),
      fontWeight: '500',
    },
    dropdownPlaceholder: {
      color: isDark ? c.textMuted : '#8A938A',
      fontWeight: '500',
    },
    dropdownValue: {
      color: isDark ? c.text : '#1B2E1B',
      fontWeight: '600',
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(10),
    },
    label: {
      color: isDark ? c.textSecondary : '#1B2E1B',
      fontSize: rs(13),
      fontWeight: '700',
    },
    actionBtn: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: isDark ? ACCENT_DARK : '#C5D0C5',
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      marginTop: rs(10),
      marginBottom: rs(14),
      minWidth: rs(180),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? ACCENT_DARK : BODY_BG,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: isDark ? 0 : 1,
    },
    actionBtnLoading: {
      backgroundColor: isDark ? ACCENT_DARK : BODY_BG,
      minWidth: rs(92),
      paddingHorizontal: rs(24),
    },
    actionText: {
      color: isDark ? '#FFFFFF' : ACCENT,
      fontWeight: '700',
      fontSize: rs(14),
    },
    resultsPane: { flex: 1, paddingHorizontal: rs(14) },
    updatesBox: {
      flex: 1,
      minHeight: 0,
      borderWidth: 1,
      borderColor: isDark ? c.border : '#E2E6E2',
      borderRadius: rs(12),
      backgroundColor: cardBg,
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
    chipScroll: {
      flexGrow: 0,
      flexShrink: 0,
      marginTop: rs(10),
      marginBottom: rs(10),
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingRight: rs(4),
    },
    chip: {
      flexShrink: 0,
      alignSelf: 'center',
      borderWidth: 1,
      borderRadius: rs(16),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      minHeight: rs(32),
      justifyContent: 'center',
    },
    chipText: { fontSize: rs(11), fontWeight: '700' },
    resultCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderWidth: 1,
      borderRadius: rs(18),
      paddingVertical: rs(12),
      paddingHorizontal: rs(12),
      marginBottom: rs(10),
      marginHorizontal: rs(2),
      alignSelf: 'stretch',
    },
    resultBody: { flex: 1, minWidth: 0 },
    resultIcon: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultIconSquare: {
      borderRadius: rs(10),
    },
    resultName: { fontWeight: '800', fontSize: rs(12), marginBottom: rs(3) },
    resultStatus: {
      fontSize: rs(11),
      fontWeight: '700',
      marginBottom: rs(6),
    },
    remarkPill: {
      alignSelf: 'stretch',
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
    },
    remarkText: {
      fontSize: rs(11),
      fontWeight: '600',
      lineHeight: rs(16),
    },
    rowApplyBtn: {
      borderWidth: 1,
      borderRadius: rs(14),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      alignSelf: 'center',
    },
    rowApplyText: { fontSize: rs(11), fontWeight: '800' },
    reapplyAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      borderRadius: rs(22),
      paddingVertical: rs(12),
      paddingHorizontal: rs(16),
      marginBottom: rs(12),
    },
    reapplyAllText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(13),
    },
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
    toast: {
      position: 'absolute',
      left: rs(16),
      right: rs(16),
      bottom: 0,
      borderRadius: rs(10),
      paddingVertical: rs(12),
      paddingHorizontal: rs(14),
      zIndex: 20,
    },
    toastSuccess: {
      backgroundColor: '#43A047',
    },
    toastError: {
      backgroundColor: '#EF5350',
    },
    toastText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: rs(13),
      textAlign: 'center',
    },
  });
}
