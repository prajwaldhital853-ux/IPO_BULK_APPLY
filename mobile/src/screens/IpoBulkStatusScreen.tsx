import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { isMockAccountId } from '../data/mockAccounts';
import {
  humanizeApplicationStatus,
  loadCheckableIssuesForUi,
  refreshAccountStatusRow,
  runBulkApply,
  runBulkResultCheck,
  type ApplicationReportRow,
  type OpenIssue,
  type ResultAccountStatus,
} from '../services/meroshare';
import { DEMO_OPENINGS } from '../services/meroshare/client';
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
import { shareIpoBulkStatusExcel } from '../utils/ipoBulkStatusExport';
import { ACCOUNT_LIST_FLAT_PROPS } from '../utils/flatListPerf';
import { useAfterInteractions } from '../utils/useAfterInteractions';
import { usePullToRefresh } from '../utils/usePullToRefresh';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import {
  applicationPhaseRemarks,
  applicationPhaseStatusLine,
  classifyApplicationPhase,
  isStatusCheckFailed,
  shouldUseApplicationPhaseStatus,
} from '../utils/ipoApplicationPhase';
import {
  buildStatusCardStyle,
  CHIP_BLUE,
  CHIP_GREEN,
  CHIP_ORANGE,
  CHIP_PURPLE,
  CHIP_RED,
  chipTint,
  STATUS_REJECTED,
  STATUS_VERIFIED,
} from '../utils/statusCardStyle';

const ACCENT = '#2D5A27';
/** Deep forest green for check CTAs in dark mode */
const ACCENT_DARK = '#0A3A14';
const BODY_BG = '#F6F8F2';
/** Pure status colors — high contrast on light (and dark) backgrounds */
const GREEN = '#43A047';
const RED = '#EF5350';
const REJECT_RED = STATUS_REJECTED;
const VERIFIED_GREEN = STATUS_VERIFIED;
/** Blue for unverified application rows. */
const STATUS_BLUE = '#42A5F5';

function badgeType(shareTypeName: string): string {
  const s = (shareTypeName || 'IPO').toUpperCase();
  if (s.includes('FPO')) return 'FPO';
  if (s.includes('RIGHT')) return 'RIGHT';
  return 'IPO';
}

function classify(row: ResultAccountStatus): 'allotted' | 'not' | 'rejected' | 'not_applied' {
  if (isStatusCheckFailed(row)) return 'rejected';

  if (
    row.status === 'NOT_APPLIED' ||
    /no application found|not applied|have not applied/i.test(row.message)
  ) {
    return 'not_applied';
  }
  if (!row.ok) return 'rejected';
  const { code } = humanizeApplicationStatus(row.status, row.allotmentStatus);
  if (code === 'ALLOTTED') return 'allotted';
  if (code === 'NOT_APPLIED') return 'not_applied';
  if (code === 'NOT_ALLOTTED' || /NOT.?ALLOT/i.test(row.message)) return 'not';
  if (/REJECT|FAIL|ERROR|CANCEL/i.test(row.status + row.message)) return 'rejected';
  return 'not';
}

type AllotmentFilter = 'all' | 'allotted' | 'not' | 'rejected' | 'others';
type ApplicationFilter =
  | 'all'
  | 'verified'
  | 'unverified'
  | 'rejected'
  | 'not_applied'
  | 'others';
type StatusFilter = AllotmentFilter | ApplicationFilter;

function resultText(row: ResultAccountStatus): string {
  return `${row.status} ${row.allotmentStatus ?? ''} ${row.remarks ?? ''} ${row.message}`;
}

function isNotAppliedRow(row: ResultAccountStatus): boolean {
  return classify(row) === 'not_applied';
}

function isInsufficientBalanceRow(row: ResultAccountStatus): boolean {
  const text = resultText(row);
  return (
    /insufficient|not enough|low balance|insufficen|balance.?not.?available|insufficient.?fund/i.test(
      text,
    ) ||
    /block[_\s-]?fail|amount.?block.?fail|block.?amount.?fail/i.test(text)
  );
}

/** UI filter bucket — Rejected = insufficient balance only; Others = rest. */
function resolveFilterBucket(
  row: ResultAccountStatus,
): Exclude<StatusFilter, 'all'> {
  if (isNotAppliedRow(row)) return 'others';
  const kind = classify(row);
  if (kind === 'allotted') return 'allotted';
  if (kind === 'not') return 'not';
  if (isInsufficientBalanceRow(row)) return 'rejected';
  return 'others';
}

function statusLine(row: ResultAccountStatus): string {
  if (isStatusCheckFailed(row)) {
    return row.message.trim() || 'Could not verify status';
  }
  if (
    row.status === 'NOT_APPLIED' ||
    /no application found|not applied|have not applied/i.test(row.message)
  ) {
    return 'You have not applied for this IPO';
  }
  if (row.message && /quantity\s*:/i.test(row.message)) {
    return row.message;
  }
  const kind = classify(row);
  const qty = row.appliedKitta;
  if (kind === 'allotted') {
    return qty != null ? `Alloted ( quantity : ${qty} )` : 'Alloted';
  }
  if (kind === 'not_applied') {
    return 'You have not applied for this IPO';
  }
  if (kind === 'rejected') {
    return row.message || 'Rejected';
  }
  return qty != null ? `Not Alloted ( quantity : ${qty} )` : 'Not Alloted';
}

function applicationPhaseDisplayLine(row: ResultAccountStatus): string {
  const kind = classifyApplicationPhase(row);
  const base = applicationPhaseStatusLine(row);
  const qty = row.appliedKitta;
  if (qty == null || /quantity\s*:/i.test(base)) return base;
  if (kind === 'verified') return `Verified ( quantity : ${qty} )`;
  if (kind === 'unverified') return `Unverified ( quantity : ${qty} )`;
  if (kind === 'rejected') return `Rejected ( quantity : ${qty} )`;
  return base;
}

function amountStatusLine(row: ResultAccountStatus): string {
  const raw = (row.remarks || row.allotmentStatus || '').trim();
  if (/release/i.test(raw)) {
    return raw.includes('Block')
      ? raw
      : 'Block Amount Status - Amount Released';
  }
  if (/block|hold|lock/i.test(raw) && !/release/i.test(raw)) {
    return raw.includes('Block')
      ? raw
      : 'Block Amount Status - Amount Blocked';
  }
  if (raw && !/scheme|fetched/i.test(raw)) {
    return raw.startsWith('Block')
      ? raw
      : `Block Amount Status - ${raw}`;
  }
  if (classify(row) === 'rejected') {
    return row.message || 'Block Amount Status - Unknown';
  }
  return 'Block Amount Status - Amount Released';
}

export function IpoBulkStatusScreen() {
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
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companies, setCompanies] = useState<ApplicationReportRow[]>([]);
  const [selected, setSelected] = useState<ApplicationReportRow | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultAccountStatus[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [openCompanyShareIds, setOpenCompanyShareIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [reapplying, setReapplying] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryBusyLabel, setRetryBusyLabel] = useState('Retrying…');
  const [applyBusyLabel, setApplyBusyLabel] = useState('Applying…');
  const [toast, setToast] = useState<{
    text: string;
    kind: 'success' | 'error';
  } | null>(null);
  const loadGenRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applicationPhase = useMemo(
    () => shouldUseApplicationPhaseStatus(selected, openCompanyShareIds),
    [selected, openCompanyShareIds],
  );

  const ipoStillOpen = Boolean(
    selected && openCompanyShareIds.has(selected.companyShareId),
  );

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

  const checkAccountKey = useMemo(
    () =>
      checkAccounts
        .map((a) => a.id)
        .sort()
        .join('|'),
    [checkAccounts],
  );

  const loadCompanies = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const selectedAccounts = accounts.filter((a) => {
      if (!checkAccountKey) return true;
      const ids = new Set(checkAccountKey.split('|').filter(Boolean));
      return ids.has(a.id);
    });
    const queue =
      selectedAccounts.length > 0
        ? selectedAccounts
        : accounts;

    if (!queue.length) {
      if (gen === loadGenRef.current) {
        setCompanies([]);
        setSelected(null);
        setLoadingList(false);
      }
      return;
    }

    setLoadingList(true);
    try {
      const map = new Map<number, ApplicationReportRow>();
      const openIds = new Set<number>();
      const realAccounts = queue.filter(
        (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
      );
      const targets = (realAccounts.length ? realAccounts : queue).slice(0, 5);
      let lastError: string | null = null;

      const loadedSets = await Promise.all(
        targets.map(async (acc) => {
          if (acc.id.startsWith('demo_') || isMockAccountId(acc.id)) {
            return null;
          }
          try {
            return await loadCheckableIssuesForUi(acc);
          } catch (e) {
            lastError = e instanceof Error ? e.message : 'Failed to load';
            return null;
          }
        }),
      );
      if (gen !== loadGenRef.current) return;

      for (const loaded of loadedSets) {
        if (!loaded) continue;
        for (const id of loaded.openCompanyShareIds) {
          openIds.add(id);
        }
        for (const r of loaded.reports) {
          if (r.companyShareId > 0 && !map.has(r.companyShareId)) {
            map.set(r.companyShareId, r);
          }
        }
        for (const issue of loaded.issues) {
          if (issue.companyShareId <= 0 || map.has(issue.companyShareId)) {
            continue;
          }
          map.set(issue.companyShareId, {
            companyShareId: issue.companyShareId,
            companyName: issue.companyName,
            scrip: issue.scrip,
            shareTypeName: issue.shareTypeName ?? 'IPO',
            statusName: issue.alreadyApplied
              ? 'TRANSACTION_SUCCESS'
              : 'OPEN',
            appliedDate: issue.issueOpenDate,
          });
        }
      }

      if (gen !== loadGenRef.current) return;

      const list = Array.from(map.values()).sort((a, b) =>
        a.companyName.localeCompare(b.companyName),
      );

      if (
        queue.some(
          (a) => a.id.startsWith('demo_') || isMockAccountId(a.id),
        )
      ) {
        const demo = DEMO_OPENINGS[0];
        if (demo && !list.some((c) => c.companyShareId === demo.companyShareId)) {
          list.unshift({
            companyShareId: demo.companyShareId,
            companyName: demo.companyName,
            scrip: demo.scrip,
            shareTypeName: demo.shareTypeName ?? 'IPO',
            statusName: 'CREATE_APPROVE',
          });
        }
      }

      if (!list.length) {
        // Keep prior list if we already had one; only blank when first load fails.
        setCompanies((prev) => {
          if (prev.length) return prev;
          return [];
        });
        if (lastError && gen === loadGenRef.current) {
          Alert.alert('Could not load', lastError);
        }
        return;
      }

      setCompanies(list);
      setOpenCompanyShareIds(openIds);
      setSelected((prev) =>
        prev && list.some((c) => c.companyShareId === prev.companyShareId)
          ? prev
          : list[0] ?? null,
      );
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Failed to load listed IPOs',
      );
    } finally {
      if (gen === loadGenRef.current) setLoadingList(false);
    }
  }, [accounts, checkAccountKey]);

  // Shell paints first; MeroShare company list waits for the stack transition.
  useEffect(() => {
    if (!ready) return;
    void loadCompanies();
  }, [ready, loadCompanies]);

  const { refreshing, onRefresh } = usePullToRefresh(loadCompanies);
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
  }, [selected?.companyShareId, applicationPhase]);

  const toggleAccount = useCallback(
    (account: AccountMeta) => {
      setCheckAccountIds((prev) =>
        toggleCheckAccountId(accounts, prev, account.id),
      );
    },
    [accounts],
  );

  const checkLabel =
    allAccountsSelected
      ? 'Select Category (All Accounts)'
      : checkAccounts.length === 1
        ? `${checkAccounts[0].name.toUpperCase()} - ${checkAccounts[0].username}`
        : `Select Category (${checkAccounts.length} accounts)`;

  const runCheck = () => {
    if (!selected) {
      Alert.alert('No IPO', 'Select a listed IPO/FPO first.');
      return;
    }
    if (!checkAccounts.length) {
      Alert.alert('No accounts', 'Select at least one account.');
      return;
    }
    const issue: OpenIssue = {
      id: selected.companyShareId,
      companyShareId: selected.companyShareId,
      companyName: selected.companyName,
      scrip: selected.scrip,
      shareTypeName: selected.shareTypeName,
      alreadyApplied: true,
    };
    void sensitive.requestSensitiveAction(
      async () => {
        setRunning(true);
        setResults([]);
        setProgress({ done: 0, total: checkAccounts.length });
        const useApplicationPhase = shouldUseApplicationPhaseStatus(
          selected,
          openCompanyShareIds,
        );
        try {
          await runBulkResultCheck({
            accounts: checkAccounts,
            issue,
            applicationPhase: useApplicationPhase,
            // Render each account as soon as it resolves so the user sees
            // 1, 2, 3… appear instead of staring at a blank screen.
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

  const allotmentFilterCounts = useMemo(() => {
    const counts = {
      all: results.length,
      allotted: 0,
      not: 0,
      rejected: 0,
      others: 0,
    };
    for (const row of results) {
      counts[resolveFilterBucket(row)] += 1;
    }
    return counts;
  }, [results]);

  const applicationFilterCounts = useMemo(() => {
    const counts = {
      all: results.length,
      verified: 0,
      unverified: 0,
      rejected: 0,
      not_applied: 0,
      others: 0,
    };
    for (const row of results) {
      counts[classifyApplicationPhase(row)] += 1;
    }
    return counts;
  }, [results]);

  const applicationChips = useMemo(() => {
    const kinds = (
      [
        { key: 'verified' as const, label: 'Verified', color: CHIP_GREEN },
        { key: 'unverified' as const, label: 'Unverified', color: CHIP_BLUE },
        { key: 'rejected' as const, label: 'Rejected', color: CHIP_RED },
        { key: 'not_applied' as const, label: 'Not Applied', color: CHIP_ORANGE },
        { key: 'others' as const, label: 'Others', color: CHIP_PURPLE },
      ] as const
    )
      .map((chip) => ({ ...chip, count: applicationFilterCounts[chip.key] }))
      .filter((chip) => chip.count > 0);
    if (kinds.length <= 1) return kinds;
    return [
      { key: 'all' as const, label: 'All', color: ACCENT, count: results.length },
      ...kinds,
    ];
  }, [applicationFilterCounts, results.length]);

  const allotmentChips = useMemo(() => {
    const kinds = (
      [
        { key: 'allotted' as const, label: 'Alloted', color: CHIP_GREEN },
        { key: 'not' as const, label: 'Not Allot', color: CHIP_RED },
        { key: 'rejected' as const, label: 'Rejected', color: CHIP_BLUE },
        { key: 'others' as const, label: 'Others', color: CHIP_PURPLE },
      ] as const
    )
      .map((chip) => ({ ...chip, count: allotmentFilterCounts[chip.key] }))
      .filter((chip) => chip.count > 0);
    if (kinds.length <= 1) return kinds;
    return [
      { key: 'all' as const, label: 'All', color: colors.text, count: results.length },
      ...kinds,
    ];
  }, [allotmentFilterCounts, colors.text, results.length]);

  const statusChips = applicationPhase ? applicationChips : allotmentChips;

  const visibleResults = useMemo(() => {
    if (filter === 'all') return results;
    if (applicationPhase) {
      return results.filter((row) => classifyApplicationPhase(row) === filter);
    }
    return results.filter((row) => resolveFilterBucket(row) === filter);
  }, [results, filter, applicationPhase]);

  const bulkApplyEligible = useMemo(() => {
    if (!applicationPhase || !ipoStillOpen) return [];
    if (filter === 'rejected') {
      return results.filter((row) => classifyApplicationPhase(row) === 'rejected');
    }
    if (filter === 'not_applied') {
      return results.filter(
        (row) => classifyApplicationPhase(row) === 'not_applied',
      );
    }
    return [];
  }, [applicationPhase, filter, ipoStillOpen, results]);

  const bulkApplyLabel =
    filter === 'not_applied'
      ? `Apply All Not Applied (${bulkApplyEligible.length})`
      : `Re-apply All Rejected (${bulkApplyEligible.length})`;

  const bulkApplyBtnColor =
    filter === 'not_applied' ? CHIP_ORANGE : REJECT_RED;

  const bulkRetryEligible = useMemo(() => {
    if (!applicationPhase || !selected) return [];
    if (filter === 'others') {
      return results.filter((row) => classifyApplicationPhase(row) === 'others');
    }
    return [];
  }, [applicationPhase, filter, results, selected]);

  const retryStatusRows = useCallback(
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

      void (async () => {
        setRetrying(true);
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
            setRetryBusyLabel(
              `Retrying ${account.name} (${i + 1}/${queue.length})…`,
            );
            try {
              const fresh = await refreshAccountStatusRow(
                account,
                issue,
                applicationPhase,
              );
              setResults((prev) =>
                prev.map((r) => (r.accountId === row.accountId ? fresh : r)),
              );
              if (isStatusCheckFailed(fresh)) {
                showToast(`${fresh.accountName}: Still could not verify status`, 'error');
              } else {
                showToast(`${fresh.accountName}: Status updated`, 'success');
              }
            } catch (e) {
              showToast(
                `${row.accountName}: ${
                  e instanceof Error ? e.message : 'Retry failed'
                }`,
                'error',
              );
            }
            if (i < queue.length - 1) {
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        } finally {
          setRetrying(false);
          setRetryBusyLabel('Retrying…');
        }
      })();
    },
    [accounts, applicationPhase, checkAccounts, selected, showToast],
  );

  const applyRows = useCallback(
    (targetRows: ResultAccountStatus[]) => {
      if (!selected || !targetRows.length || !ipoStillOpen) return;
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
          setReapplying(true);
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
              const reapply = classifyApplicationPhase(row) === 'rejected';
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
            setReapplying(false);
            setApplyBusyLabel('Applying…');
          }
        },
        { pinPolicy: 'skipIfUnlocked' },
      );
    },
    [
      accounts,
      checkAccounts,
      ipoStillOpen,
      selected,
      sensitive,
      showToast,
    ],
  );

  const shareToExcel = async () => {
    if (!results.length) {
      Alert.alert('No results', 'Run IPO Bulk Status first.');
      return;
    }
    const company = selected?.companyName ?? results[0]?.companyName ?? 'IPO';
    const symbol = selected?.scrip ?? '';
    try {
      await shareIpoBulkStatusExcel({
        results,
        accounts: checkAccounts,
        companyName: company,
        symbol,
      });
    } catch (e) {
      Alert.alert(
        'Share failed',
        e instanceof Error ? e.message : 'Could not share Excel file',
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.title}>IPO Bulk Status</Text>
        <View style={styles.headerSide}>
          <Pressable
            hitSlop={10}
            onPress={() =>
              Alert.alert(
                'IPO Bulk Status',
                'Open IPOs (result not out) show Verified / Unverified / Rejected like Current IPO Status. Closed IPOs with published results show Alloted / Not Allot filters. Rejected accounts can be re-applied while the IPO is still open.',
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
              checkAccounts.length === accounts.length && styles.dropdownPlaceholder,
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
            color={isDark ? colors.text : '#1B2E1B'}
          />
          <Text style={styles.label}>Listed IPO/FPO</Text>
        </View>

        <Pressable
          style={styles.dropdown}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingList || companies.length === 0}
        >
          <Text
            style={[
              styles.dropdownText,
              styles.dropdownValue,
              !selected && styles.dropdownPlaceholder,
            ]}
            numberOfLines={1}
          >
            {selected
              ? `${selected.companyName}${selected.scrip ? ` (${selected.scrip})` : ''}`
              : loadingList
                ? 'Loading…'
                : 'No listed IPO/FPO'}
          </Text>
          {loadingList ? (
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
          style={[styles.actionBtn, running && { opacity: 0.6 }]}
          onPress={runCheck}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color={isDark ? '#FFFFFF' : ACCENT} />
          ) : (
            <Text style={styles.actionText}>IPO Bulk Status</Text>
          )}
        </Pressable>

        {running && progress ? (
          <View style={styles.progressWrap}>
            <ActivityIndicator size="small" color={isDark ? ACCENT : '#1B5E20'} />
            <Text style={styles.progressText}>
              Checking account {progress.done}/{progress.total}…
            </Text>
          </View>
        ) : null}
      </View>

      {results.length > 0 ? (
        <View style={styles.resultsPane}>
          <View style={styles.updatesBox}>
            <View style={styles.updatesHead}>
              <Text style={styles.updatesTitle}>
                IPO/FPO Status Updates{' '}
                <Text style={{ color: GREEN }}>
                  ({results.length}
                  {progress ? `/${progress.total}` : ''})
                </Text>
              </Text>
              <View style={styles.headActions}>
                <Pressable onPress={() => void shareToExcel()} hitSlop={8}>
                  <Text style={styles.shareText}>Share Excel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setResults([]);
                    setFilter('all');
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.clearText}>clear</Text>
                </Pressable>
              </View>
            </View>

            {statusChips.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
              >
                {statusChips.map((chip) => {
                  const active =
                    filter === chip.key ||
                    (filter === 'all' && statusChips.length === 1);
                  return (
                    <Pressable
                      key={chip.key}
                      onPress={() => setFilter(chip.key)}
                      style={[
                        styles.chip,
                        active && {
                          borderColor: chip.color,
                          backgroundColor: chipTint(chip.color, isDark),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? chip.color : colors.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {chip.label} ({chip.count})
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {applicationPhase &&
            filter === 'others' &&
            bulkRetryEligible.length > 0 ? (
              <Pressable
                style={[
                  styles.reapplyAllBtn,
                  { backgroundColor: CHIP_PURPLE },
                  retrying && { opacity: 0.65 },
                ]}
                onPress={() => retryStatusRows(bulkRetryEligible)}
                disabled={retrying || reapplying}
              >
                {retrying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Ionicons name="refresh" size={rs(18)} color="#FFFFFF" />
                )}
                <Text style={styles.reapplyAllText}>
                  Retry All ({bulkRetryEligible.length})
                </Text>
              </Pressable>
            ) : null}

            {applicationPhase &&
            (filter === 'rejected' || filter === 'not_applied') &&
            bulkApplyEligible.length > 0 ? (
              <Pressable
                style={[
                  styles.reapplyAllBtn,
                  { backgroundColor: bulkApplyBtnColor },
                  reapplying && { opacity: 0.65 },
                ]}
                onPress={() => applyRows(bulkApplyEligible)}
                disabled={reapplying || retrying}
              >
                {reapplying ? (
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

                if (applicationPhase) {
                  const appKind = classifyApplicationPhase(row);
                  const color =
                    appKind === 'verified'
                      ? VERIFIED_GREEN
                      : appKind === 'unverified'
                        ? STATUS_BLUE
                        : appKind === 'rejected'
                          ? REJECT_RED
                          : appKind === 'others'
                            ? CHIP_PURPLE
                            : CHIP_ORANGE;
                  const card = buildStatusCardStyle(color, isDark);
                  const remarks = applicationPhaseRemarks(row);
                  const mciIcon =
                    appKind === 'verified'
                      ? 'check-bold'
                      : appKind === 'unverified'
                        ? 'clock-outline'
                        : appKind === 'rejected'
                          ? 'alert-octagon'
                          : appKind === 'others'
                            ? 'help-circle-outline'
                            : 'cancel';
                  const showReapply =
                    (appKind === 'rejected' || appKind === 'not_applied') &&
                    ipoStillOpen &&
                    !reapplying &&
                    !retrying;
                  const showRetry =
                    appKind === 'others' && !reapplying && !retrying;
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
                          {applicationPhaseDisplayLine(row)}
                        </Text>
                        {remarks ? (
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
                              {remarks}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {showReapply ? (
                        <Pressable
                          style={[
                            styles.rowApplyBtn,
                            {
                              borderColor: `${card.accent}66`,
                              backgroundColor: isDark ? card.accent : '#FFFFFF',
                            },
                          ]}
                          onPress={() => applyRows([row])}
                        >
                          <Text
                            style={[
                              styles.rowApplyText,
                              { color: isDark ? '#FFFFFF' : card.accent },
                            ]}
                          >
                            Apply
                          </Text>
                        </Pressable>
                      ) : null}
                      {showRetry ? (
                        <Pressable
                          style={[
                            styles.rowApplyBtn,
                            {
                              borderColor: `${CHIP_PURPLE}66`,
                              backgroundColor: isDark ? CHIP_PURPLE : '#FFFFFF',
                            },
                          ]}
                          onPress={() => retryStatusRows([row])}
                        >
                          <Text
                            style={[
                              styles.rowApplyText,
                              { color: isDark ? '#FFFFFF' : CHIP_PURPLE },
                            ]}
                          >
                            Retry
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                }

                const kind = classify(row);
                const bucket = resolveFilterBucket(row);
                const color =
                  kind === 'allotted'
                    ? CHIP_GREEN
                    : bucket === 'rejected'
                      ? CHIP_BLUE
                      : bucket === 'others'
                        ? CHIP_PURPLE
                        : CHIP_RED;
                const card = buildStatusCardStyle(color, isDark);
                const icon =
                  kind === 'allotted'
                    ? 'checkmark'
                    : bucket === 'rejected'
                      ? 'alert'
                      : bucket === 'others'
                        ? 'ellipsis-horizontal'
                        : 'close';
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
                        { backgroundColor: card.iconBackground },
                      ]}
                    >
                      <Ionicons
                        name={icon}
                        size={rs(20)}
                        color={card.iconColor}
                      />
                    </View>
                    <View style={styles.resultBody}>
                      <Text style={[styles.resultName, { color: card.textColor }]}>
                        {idx + 1}. {row.accountName.toUpperCase()}
                      </Text>
                      <Text style={[styles.resultStatus, { color: card.textColor }]}>
                        {statusLine(row)}
                      </Text>
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
                        >
                          {amountStatusLine(row)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>
      ) : null}

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

      <Modal
        visible={companyPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCompanyPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Text style={styles.modalTitle}>Listed IPO/FPO</Text>
            <FlatList
              data={companies}
              keyExtractor={(item) => String(item.companyShareId)}
              ListEmptyComponent={
                <Text style={styles.empty}>No listed applications found.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelected(item);
                    setCompanyPickerOpen(false);
                  }}
                >
                  <View style={styles.companyRow}>
                    <View style={styles.ipoBadge}>
                      <Text style={styles.ipoBadgeText}>
                        {badgeType(item.shareTypeName)}
                      </Text>
                    </View>
                    <Text style={styles.modalRowTitle} numberOfLines={2}>
                      {item.companyName}
                      {item.scrip ? ` (${item.scrip})` : ''}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
            <Pressable
              style={[styles.modalDone, styles.actionBtn]}
              onPress={() => setCompanyPickerOpen(false)}
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

      <BusyOverlay
        visible={reapplying || retrying}
        message={retrying ? retryBusyLabel : applyBusyLabel}
      />

      <SensitiveActionModals action={sensitive} />
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const fieldBg = isDark ? c.surface : BODY_BG;
  const fieldBorder = isDark ? c.border : '#8E968E';
  const fieldText = isDark ? c.text : '#1B2E1B';
  const boxBorder = isDark ? c.border : '#C5CBC5';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? c.bg : BODY_BG },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(14),
      paddingTop: rs(8),
      paddingBottom: rs(10),
      backgroundColor: isDark ? c.bg : BODY_BG,
    },
    title: {
      flex: 1,
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      textAlign: 'center',
    },
    headerSide: {
      width: rs(32),
      alignItems: 'center',
      justifyContent: 'center',
    },
    controls: {
      paddingHorizontal: rs(18),
      paddingTop: rs(18),
      paddingBottom: rs(4),
    },
    resultsPane: {
      flex: 1,
      paddingHorizontal: rs(16),
      paddingBottom: rs(12),
      minHeight: 0,
    },
    resultsList: { flex: 1 },
    resultsListBody: { paddingBottom: rs(16) },
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
      color: isDark ? c.text : '#1B2E1B',
      fontSize: rs(13),
      fontWeight: '700',
    },
    companyRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    ipoBadge: {
      backgroundColor: isDark ? GREEN : ACCENT,
      borderRadius: rs(4),
      paddingHorizontal: rs(6),
      paddingVertical: rs(2),
    },
    ipoBadgeText: { color: '#FFF', fontWeight: '800', fontSize: rs(10) },
    companyText: {
      flex: 1,
      color: isDark ? c.text : '#1B2E1B',
      fontSize: rs(13),
      fontWeight: '600',
    },
    actionBtn: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: isDark ? ACCENT_DARK : '#C5D0C5',
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      marginTop: rs(10),
      marginBottom: rs(10),
      minWidth: rs(168),
      alignItems: 'center',
      backgroundColor: isDark ? ACCENT_DARK : BODY_BG,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: isDark ? 0 : 1,
    },
    actionText: {
      color: isDark ? '#FFFFFF' : ACCENT,
      fontWeight: '700',
      fontSize: rs(14),
    },
    progressWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(8),
      marginBottom: rs(4),
    },
    progressText: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    chipScroll: {
      flexGrow: 0,
      flexShrink: 0,
      paddingBottom: rs(12),
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
      borderWidth: isDark ? 1 : 1.5,
      borderColor: isDark ? c.border : '#5F6B5F',
      borderRadius: rs(16),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      minHeight: rs(32),
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: { fontSize: rs(11), fontWeight: '700', textAlign: 'center' },
    updatesBox: {
      flex: 1,
      borderWidth: isDark ? 1 : 1.5,
      borderColor: boxBorder,
      borderRadius: rs(14),
      padding: rs(12),
      minHeight: 0,
      backgroundColor: isDark ? 'transparent' : '#FFFFFF',
    },
    updatesHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: rs(12),
      gap: rs(8),
    },
    updatesTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
      flex: 1,
    },
    headActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
    },
    shareText: {
      color: isDark ? ACCENT : '#1B5E20',
      fontSize: rs(12),
      fontWeight: '800',
    },
    clearText: { color: c.textMuted, fontSize: rs(12) },
    reapplyAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: REJECT_RED,
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
    resultStatus: { fontSize: rs(11), fontWeight: '700', marginBottom: rs(6) },
    remarkPill: {
      alignSelf: 'stretch',
      borderRadius: rs(8),
      paddingHorizontal: rs(8),
      paddingVertical: rs(4),
      marginTop: rs(2),
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
      backgroundColor: '#2E7D32',
    },
    toastError: {
      backgroundColor: '#C62828',
    },
    toastText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: rs(13),
      textAlign: 'center',
    },
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
  });
}
