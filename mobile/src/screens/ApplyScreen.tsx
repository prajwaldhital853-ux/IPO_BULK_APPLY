import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import {
  ApplyModalAccountRow,
  ApplySingleAccountRow,
} from '../components/AccountListRows';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import {
  formatRs,
  loadInvestmentSummary,
  type InvestmentSummary,
} from '../services/nepse/premiumAnalytics';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import {
  ensureGoogleSignedInForAddAccount,
  guardAddAccountAsync,
} from '../utils/accountLimits';
import { showLockedAccountAlert } from '../utils/lockedAccountAlert';
import { isUserInactive } from '../utils/accountOperational';
import {
  loadOpenIssuesForUi,
  runBulkApply,
  type ApplyAccountResult,
  type BulkApplySummary,
  type OpenIssue,
} from '../services/meroshare';
import {
  applyDisplayMessage,
  applyOutcomeLabel,
  applyOutcomeNeedsUpdate,
  countApplyOutcomes,
  isApplySuccessOutcome,
  resolveApplyOutcome,
  type ApplyOutcome,
} from '../utils/applyResultUi';
import {
  isAppliedInMap,
  loadApplyHistory,
  markAppliedMany,
} from '../storage/applyHistory';
import {
  daysLeftForIssue,
  enrichIssuesWithClosingDates,
  parseIssueDate,
} from '../utils/ipoIssues';
import { rs } from '../utils/responsive';
import { isMockAccountId } from '../data/mockAccounts';
import { filterAccountsByQuery } from '../utils/filterAccounts';
import { ACCOUNT_LIST_FLAT_PROPS } from '../utils/flatListPerf';
import type { RootStackParamList, MainTabParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ApplyRoute = RouteProp<MainTabParamList, 'Apply'>;

/** @deprecated use daysLeftForIssue — kept for hot-reload compatibility */
function daysLeftLabel(closeDate?: string): string | null {
  if (!closeDate) return null;
  return daysLeftForIssue({ issueCloseDate: closeDate } as OpenIssue);
}

function mergeApplyResult(
  prev: ApplyAccountResult[],
  row: ApplyAccountResult,
): ApplyAccountResult[] {
  const idx = prev.findIndex((r) => r.accountId === row.accountId);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = row;
    return next;
  }
  return [...prev, row];
}

function csvEscape(v: string): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type ApplySinglePaneProps = {
  accounts: AccountMeta[];
  applyingAccountId: string | null;
  isAccountActive: (id: string) => boolean;
  onApply: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  listBoxStyle: object;
};

/** Virtualized account list — only visible rows mount (safe for 200–500 accounts). */
const ApplySingleAccountsPane = React.memo(function ApplySingleAccountsPane({
  accounts,
  applyingAccountId,
  isAccountActive,
  onApply,
  styles,
  colors,
  listBoxStyle,
}: ApplySinglePaneProps) {
  const renderItem = useCallback(
    ({ item, index }: { item: AccountMeta; index: number }) => (
      <ApplySingleAccountRow
        account={item}
        index={index}
        locked={!isAccountActive(item.id) || isUserInactive(item)}
        applying={applyingAccountId === item.id}
        onApply={onApply}
        styles={styles}
        colors={colors}
      />
    ),
    [applyingAccountId, colors, isAccountActive, onApply, styles],
  );

  return (
    <View style={listBoxStyle}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        renderItem={renderItem}
        extraData={applyingAccountId}
        {...ACCOUNT_LIST_FLAT_PROPS}
      />
    </View>
  );
});

type BulkUpdatesPaneProps = {
  results: ApplyAccountResult[];
  applyingAccountId: string | null;
  processingAccountId: string | null;
  accounts: AccountMeta[];
  onRetry: (accountId: string) => void;
  onEditAccount: (accountId: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  listBoxStyle: object;
};

/** Virtualized bulk apply result cards — safe for 300–400 accounts. */
const BulkApplyUpdatesPane = React.memo(function BulkApplyUpdatesPane({
  results,
  applyingAccountId,
  processingAccountId,
  accounts,
  onRetry,
  onEditAccount,
  styles,
  colors,
  listBoxStyle,
}: BulkUpdatesPaneProps) {
  const renderItem = useCallback(
    ({ item, index }: { item: ApplyAccountResult; index: number }) => {
      const outcome = resolveApplyOutcome(item);
      const success = isApplySuccessOutcome(outcome);
      const cardStyle = success ? styles.updateCardOk : styles.updateCardFail;
      const acc = accounts.find((a) => a.id === item.accountId);
      const label = (acc?.name || item.accountName || item.username || '').trim();
      const rowTitle = `IPO@${label.toUpperCase()}`;
      const needsUpdate = applyOutcomeNeedsUpdate(outcome);
      const isApplying =
        applyingAccountId === item.accountId ||
        processingAccountId === item.accountId;
      return (
        <View style={cardStyle}>
          <Ionicons
            name={success ? 'checkmark-circle' : 'alert-circle'}
            size={rs(22)}
            color={success ? APPLY_GREEN_LIGHT : colors.danger}
          />
          <View style={styles.updateBody}>
            <Text style={styles.updateName}>
              {index + 1}. {rowTitle}
            </Text>
            <Text
              style={[
                styles.updateMsg,
                success ? styles.updateMsgOkGreen : styles.updateMsgFail,
              ]}
              numberOfLines={3}
            >
              {applyDisplayMessage(item)}
            </Text>
          </View>
          {isApplying ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : outcome === 'already_applied' ? (
            <View style={styles.appliedBadge}>
              <Text style={styles.appliedBadgeText}>Applied</Text>
            </View>
          ) : needsUpdate ? (
            <Pressable
              onPress={() => onEditAccount(item.accountId)}
              hitSlop={8}
              style={styles.updateBlueBtn}
            >
              <Text style={styles.updateBlueText}>Update</Text>
            </Pressable>
          ) : !success ? (
            <Pressable
              style={styles.updateApplyBtn}
              onPress={() => onRetry(item.accountId)}
            >
              <Text style={styles.updateApplyText}>Apply</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [
      accounts,
      applyingAccountId,
      colors,
      onEditAccount,
      onRetry,
      processingAccountId,
      styles,
    ],
  );

  return (
    <View style={listBoxStyle}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.accountId}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        renderItem={renderItem}
        extraData={{ applyingAccountId, processingAccountId, results }}
        {...ACCOUNT_LIST_FLAT_PROPS}
      />
    </View>
  );
});

export function ApplyScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ApplyRoute>();
  const highlightSymbol = route.params?.highlightSymbol?.trim().toUpperCase();
  const highlightName = route.params?.highlightName?.trim();
  const openDrawer = useOpenDrawer();
  const { accounts, markCrnPinVerifiedMany } = useAccounts();
  const { isAccountActive, operationalAccounts } = useActiveAccounts();
  const { user, isAuthenticated, signInWithGoogle } = useAuth();
  const { isPremium, maxAccounts } = useSubscription();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const goAddCapital = useCallback(() => {
    void (async () => {
      if (
        !(await ensureGoogleSignedInForAddAccount(
          isAuthenticated,
          signInWithGoogle,
        ))
      ) {
        return;
      }
      if (
        !(await guardAddAccountAsync({
          currentCount: accounts.length,
          isPremium,
          maxAccounts,
          onUpgrade: () => navigation.navigate('Subscription'),
        }))
      ) {
        return;
      }
      navigation.navigate('AddCapital');
    })();
  }, [
    accounts.length,
    isAuthenticated,
    isPremium,
    maxAccounts,
    navigation,
    signInWithGoogle,
  ]);
  const [mode, setMode] = useState<'Bulk' | 'Single'>('Bulk');
  const [hideValues, setHideValues] = useState(false);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [accountModalFilter, setAccountModalFilter] = useState('');
  const [investment, setInvestment] = useState<InvestmentSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qty, setQty] = useState('10');
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [selected, setSelected] = useState<OpenIssue | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [applyingAccountId, setApplyingAccountId] = useState<string | null>(null);
  const [processingAccountId, setProcessingAccountId] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<{
    text: string;
    kind: 'success' | 'error';
    variant: 'single-bar' | 'default';
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<BulkApplySummary | null>(null);
  const [applyResults, setApplyResults] = useState<ApplyAccountResult[]>([]);
  const [applyProgress, setApplyProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const resultModalBatchKeyRef = useRef<string | null>(null);
  /** Bulk: which accounts are checked to include */
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [historyTick, setHistoryTick] = useState(0);
  const [historyMap, setHistoryMap] = useState<
    Awaited<ReturnType<typeof loadApplyHistory>>
  >({});
  const [loadingIssues, setLoadingIssues] = useState(false);
  /** Pause IPO dropdown reload during/after bulk apply (avoids MeroShare login spam). */
  const issuesRefreshPausedRef = useRef(false);

  const kitta = Math.max(1, parseInt(qty.replace(/\D/g, ''), 10) || 10);
  const companyShareId = selected?.companyShareId;

  const displayName = useMemo(() => {
    const raw =
      user?.name?.trim() ||
      accounts[0]?.name?.trim() ||
      (accounts.length > 1
        ? `${accounts.length} Accounts`
        : accounts.length === 1
          ? accounts[0].name
          : 'Guest');
    return raw.toUpperCase();
  }, [accounts, user?.name]);

  const refreshIssues = useCallback(async () => {
    if (issuesRefreshPausedRef.current) return;
    setLoadingIssues(true);
    try {
      const list = await enrichIssuesWithClosingDates(
        await loadOpenIssuesForUi(accounts),
      );
      setIssues(list);
      setSelected((prev) => {
        if (!list.length) return null;
        if (highlightSymbol || highlightName) {
          const fromPush = list.find((i) => {
            const sym = (i.scrip || '').toUpperCase();
            const name = (i.companyName || '').toUpperCase();
            if (highlightSymbol && sym === highlightSymbol) return true;
            if (highlightName && name.includes(highlightName.toUpperCase())) {
              return true;
            }
            return false;
          });
          if (fromPush) return fromPush;
        }
        const still = prev
          ? list.find((i) => i.companyShareId === prev.companyShareId)
          : null;
        return still ?? list[0];
      });
    } finally {
      setLoadingIssues(false);
    }
  }, [accounts, highlightName, highlightSymbol]);

  const refreshInvestment = useCallback(async () => {
    setInvestment(
      await loadInvestmentSummary(operationalAccounts.map((a) => a.id)),
    );
  }, [operationalAccounts]);

  const refreshAll = useCallback(async () => {
    issuesRefreshPausedRef.current = false;
    setRefreshing(true);
    try {
      await Promise.all([refreshIssues(), refreshInvestment()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshInvestment, refreshIssues]);

  // MeroShare login is expensive — never start it mid tab-switch animation.
  const issuesStartedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        void refreshInvestment();
        if (!issuesStartedRef.current) {
          issuesStartedRef.current = true;
          void refreshIssues();
        }
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [refreshInvestment, refreshIssues]),
  );

  useEffect(() => {
    if (issuesStartedRef.current && !issuesRefreshPausedRef.current) {
      void refreshIssues();
    }
  }, [refreshIssues]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next: Record<string, boolean> = {};
      for (const a of operationalAccounts) {
        next[a.id] = isAccountActive(a.id) ? (prev[a.id] ?? true) : false;
      }
      return next;
    });
  }, [operationalAccounts, isAccountActive]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const map = await loadApplyHistory();
      if (mounted) setHistoryMap(map);
    })();
    return () => {
      mounted = false;
    };
  }, [historyTick, companyShareId]);

  const appliedAccountIds = useMemo(() => {
    if (companyShareId == null) return new Set<string>();
    const ids = new Set<string>();
    for (const a of operationalAccounts) {
      if (isAppliedInMap(historyMap, a.id, companyShareId)) ids.add(a.id);
    }
    return ids;
  }, [companyShareId, historyMap, operationalAccounts]);

  const alreadyApplied = useCallback(
    (accountId: string) => appliedAccountIds.has(accountId),
    [appliedAccountIds],
  );

  const checkedEligible = useMemo(() => {
    if (!selected) return [];
    return operationalAccounts.filter((a) => selectedIds[a.id]);
  }, [operationalAccounts, selectedIds, selected]);

  const openResultModal = useCallback((result: BulkApplySummary) => {
    const batchKey = `${result.companyShareId}-${result.kitta}-${result.results.length}`;
    if (resultModalBatchKeyRef.current === batchKey) return;
    resultModalBatchKeyRef.current = batchKey;
    setResultModalOpen(true);
  }, []);

  const clearApplyingState = useCallback(() => {
    setApplyingAccountId(null);
  }, []);

  const promptLocked = useCallback(() => {
    showLockedAccountAlert(() => navigation.navigate('Subscription'));
  }, [navigation]);

  const filteredModalAccounts = useMemo(
    () => filterAccountsByQuery(operationalAccounts, accountModalFilter),
    [operationalAccounts, accountModalFilter],
  );

  const toggleAccount = useCallback(
    (id: string) => {
      const acc = accounts.find((a) => a.id === id);
      if (!acc || !isAccountActive(id) || isUserInactive(acc)) {
        promptLocked();
        return;
      }
      setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    },
    [accounts, isAccountActive, promptLocked],
  );

  const selectAllEligible = () => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const a of operationalAccounts) {
        if (isAccountActive(a.id) && !isUserInactive(a)) next[a.id] = true;
      }
      return next;
    });
  };

  const clearEligible = () => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const a of operationalAccounts) {
        next[a.id] = false;
      }
      return next;
    });
  };

  const persistSuccessful = async (
    result: BulkApplySummary,
    companyId: number,
  ) => {
    // Only lock accounts after a real live apply
    const rows = result.results
      .filter((r) => r.ok && !r.dryRun)
      .map((r) => ({
        accountId: r.accountId,
        companyShareId: companyId,
        kitta: result.kitta,
        dryRun: false,
      }));
    if (rows.length) {
      await markAppliedMany(rows);
      await markCrnPinVerifiedMany(rows.map((r) => r.accountId));
      setHistoryTick((t) => t + 1);
    }
  };

  const persistSuccessfulRow = async (
    row: ApplyAccountResult,
    companyId: number,
    kittaValue: number,
  ) => {
    if (!row.ok || row.dryRun) return;
    await markAppliedMany([
      {
        accountId: row.accountId,
        companyShareId: companyId,
        kitta: kittaValue,
        dryRun: false,
      },
    ]);
    await markCrnPinVerifiedMany([row.accountId]);
    setHistoryTick((t) => t + 1);
  };

  const showApplyToast = useCallback(
    (row: ApplyAccountResult, mode: 'single' | 'bulk') => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      const outcome = resolveApplyOutcome(row);
      let kind: 'success' | 'error';
      if (mode === 'single') {
        kind = outcome === 'applied' && row.ok ? 'success' : 'error';
      } else {
        kind = isApplySuccessOutcome(outcome) ? 'success' : 'error';
      }
      const variant =
        mode === 'single' && kind === 'error' ? 'single-bar' : 'default';
      setToast({ text: applyDisplayMessage(row), kind, variant });
      const durationMs = mode === 'single' ? 2000 : 5000;
      toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const confirmBulkApply = useCallback(() => {
    if (!selected) {
      Alert.alert('No IPO', 'Select a Current Opening IPO first.');
      return;
    }
    if (
      selected.companyShareId === 9001 &&
      !checkedEligible.every((a) => isMockAccountId(a.id))
    ) {
      Alert.alert(
        'No open IPO',
        'No live opening is available right now. Pull to refresh after MeroShare login, or check allotment on the Check tab.',
      );
      return;
    }
    if (checkedEligible.length === 0) {
      Alert.alert(
        'No accounts selected',
        'Check at least one account to apply.',
      );
      return;
    }

    const execute = () => {
      void (async () => {
        issuesRefreshPausedRef.current = true;
        setRunning(true);
        resultModalBatchKeyRef.current = null;
        setSummary(null);
        setApplyResults([]);
        setApplyProgress({ done: 0, total: checkedEligible.length });
        setProcessingAccountId(checkedEligible[0]?.id ?? null);
        try {
          const result = await runBulkApply({
            accounts: checkedEligible,
            issue: selected,
            kitta,
            dryRun: false,
            simulateLogin: false,
            onProgress: (_msg, index, total) => {
              setApplyProgress({ done: index, total });
              setProcessingAccountId(checkedEligible[index]?.id ?? null);
            },
            onAccountResult: (row, index, total) => {
              setApplyResults((prev) => mergeApplyResult(prev, row));
              setApplyProgress({ done: index + 1, total });
              setProcessingAccountId(
                index + 1 < total
                  ? (checkedEligible[index + 1]?.id ?? null)
                  : null,
              );
            },
          });
          setSummary(result);
          await persistSuccessful(result, selected.companyShareId);
        } catch (e) {
          Alert.alert(
            'Bulk apply failed',
            e instanceof Error ? e.message : 'Unknown error',
          );
        } finally {
          setRunning(false);
          setApplyProgress(null);
          setProcessingAccountId(null);
        }
      })();
    };
    void sensitive.requestSensitiveAction(execute);
  }, [checkedEligible, kitta, selected, sensitive]);

  const applyOneAccount = useCallback(
    async (accountId: string): Promise<ApplyAccountResult | null> => {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc || !selected) return null;
      const result = await runBulkApply({
        accounts: [acc],
        issue: selected,
        kitta,
        dryRun: false,
        simulateLogin: false,
      });
      return result.results[0] ?? null;
    },
    [accounts, kitta, selected],
  );

  const retryBulkAccount = useCallback(
    (accountId: string) => {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc || !isAccountActive(accountId) || isUserInactive(acc)) {
        promptLocked();
        return;
      }
      if (!selected) {
        Alert.alert('No IPO', 'Select a Current Opening IPO first.');
        return;
      }
      if (selected.companyShareId === 9001 && !isMockAccountId(accountId)) {
        Alert.alert(
          'No open IPO',
          'No live opening is available right now. Refresh openings after login.',
        );
        return;
      }

      setApplyingAccountId(accountId);

      const execute = () => {
        void (async () => {
          try {
            const row = await applyOneAccount(accountId);
            if (row) {
              setApplyResults((prev) => mergeApplyResult(prev, row));
              showApplyToast(row, 'bulk');
              if (row.ok) {
                void persistSuccessfulRow(
                  row,
                  selected.companyShareId,
                  kitta,
                );
              }
            }
          } catch {
            showApplyToast(
              {
                accountId,
                accountName: acc.name,
                username: acc.username,
                ok: false,
                dryRun: false,
                message: 'Apply failed. Try again.',
                companyName: selected.companyName,
                kitta,
              },
              'bulk',
            );
          } finally {
            setApplyingAccountId(null);
          }
        })();
      };
      void sensitive.requestSensitiveAction(execute, {
        pinPolicy: 'skipIfUnlocked',
      });
    },
    [
      accounts,
      applyOneAccount,
      isAccountActive,
      kitta,
      promptLocked,
      selected,
      sensitive,
      showApplyToast,
    ],
  );

  const runSingle = useCallback(
    (accountId: string) => {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc || !isAccountActive(accountId) || isUserInactive(acc)) {
        promptLocked();
        return;
      }
      if (!selected) {
        Alert.alert('No IPO', 'Select a Current Opening IPO first.');
        return;
      }
      if (selected.companyShareId === 9001 && !isMockAccountId(accountId)) {
        Alert.alert(
          'No open IPO',
          'No live opening is available right now. Refresh openings after login.',
        );
        return;
      }

      setApplyingAccountId(accountId);

      const execute = () => {
        void (async () => {
          issuesRefreshPausedRef.current = true;
          try {
            const row = await applyOneAccount(accountId);
            if (row) {
              showApplyToast(row, 'single');
              if (row.ok) {
                await persistSuccessfulRow(
                  row,
                  selected.companyShareId,
                  kitta,
                );
              }
            }
          } catch {
            showApplyToast(
              {
                accountId,
                accountName: acc.name,
                username: acc.username,
                ok: false,
                dryRun: false,
                message: 'Apply failed. Try again.',
                companyName: selected.companyName,
                kitta,
              },
              'single',
            );
          } finally {
            setApplyingAccountId(null);
            setTimeout(() => {
              issuesRefreshPausedRef.current = false;
            }, 600);
          }
        })();
      };
      void sensitive.requestSensitiveAction(execute, {
        pinPolicy: 'skipIfUnlocked',
      });
    },
    [
      accounts,
      applyOneAccount,
      isAccountActive,
      kitta,
      promptLocked,
      selected,
      sensitive,
      showApplyToast,
    ],
  );

  const hasMockAccounts = useMemo(
    () => accounts.some((a) => isMockAccountId(a.id)),
    [accounts],
  );

  const openingLabel = useMemo(() => {
    if (loadingIssues) return 'Loading openings…';
    if (!selected) return 'No Any Opening';
    if (selected.companyShareId === 9001 && !hasMockAccounts) {
      return 'No Any Opening';
    }
    const suffix = selected.scrip ? ` (${selected.scrip})` : '';
    return `${selected.companyName}${suffix}`;
  }, [hasMockAccounts, loadingIssues, selected]);

  const hasRealOpening =
    Boolean(selected) &&
    (selected!.companyShareId !== 9001 || hasMockAccounts);

  const currentValueText = hideValues
    ? 'Rs. ••••'
    : formatRs(investment?.currentValue ?? 0);

  const plValue = investment?.pl ?? 0;
  const plText = hideValues
    ? '••••'
    : `${plValue >= 0 ? '+' : '-'} ${formatRs(Math.abs(plValue))}`;

  const eligibleCount = operationalAccounts.filter((a) => !alreadyApplied(a.id)).length;

  const outcomeCounts = useMemo(
    () => countApplyOutcomes(applyResults),
    [applyResults],
  );

  const modalSuccessCount =
    outcomeCounts.applied + outcomeCounts.already_applied;
  const failedApplyCount = applyResults.length - modalSuccessCount;
  const showBulkUpdates = running || applyResults.length > 0;
  const daysLeft = daysLeftForIssue(selected);

  useEffect(() => {
    setApplyingAccountId(null);
  }, [companyShareId]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void enrichIssuesWithClosingDates([selected]).then((enriched) => {
      if (cancelled) return;
      const row = enriched[0];
      const close = row?.issueCloseDate;
      if (!close || !parseIssueDate(close)) return;
      if (close === selected.issueCloseDate) return;
      setIssues((prev) =>
        prev.map((i) =>
          i.companyShareId === selected.companyShareId
            ? { ...i, issueCloseDate: close }
            : i,
        ),
      );
      setSelected((prev) =>
        prev?.companyShareId === selected.companyShareId
          ? { ...prev, issueCloseDate: close }
          : prev,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.companyShareId]);
  const modalTotal = applyResults.length;
  const modalSuccess = modalSuccessCount;
  const modalIssues = failedApplyCount;
  const modalPct =
    modalTotal > 0 ? Math.round((modalSuccess / modalTotal) * 100) : 0;
  const modalNeedsAttention = modalIssues > 0;
  const modalAttentionOutcomes = useMemo(
    () =>
      (
        [
          'invalid_crn',
          'invalid_pin',
          'invalid_login',
          'insufficient_balance',
          'missing_secrets',
          'other',
        ] as ApplyOutcome[]
      ).filter((o) => outcomeCounts[o] > 0),
    [outcomeCounts],
  );

  const goEditAccount = useCallback(
    (accountId: string) => {
      setResultModalOpen(false);
      navigation.navigate('EditAccount', { accountId });
    },
    [navigation],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void refreshAll()}
      tintColor={colors.primary}
    />
  );

  const clearUpdates = useCallback(() => {
    setApplyResults([]);
    setSummary(null);
    setApplyProgress(null);
  }, []);

  const renderBulkUpdatesHeader = () => {
    const total = applyResults.length || applyProgress?.total || 0;
    return (
      <View style={styles.updatesSection}>
        <View style={styles.updatesHead}>
          <Text style={styles.updatesTitleLine} numberOfLines={2}>
            <Text style={styles.updatesTitleLabel}>Bulk Apply Updates </Text>
            <Text style={styles.updatesParen}>(</Text>
            <Text style={styles.updatesCountOk}>{modalSuccessCount}</Text>
            <Text style={styles.updatesParen}>/</Text>
            <Text style={styles.updatesCountTotal}>{total}</Text>
            <Text style={styles.updatesParen}>)</Text>
            {failedApplyCount > 0 ? (
              <Text style={styles.updatesCountFailed}>
                {' '}
                · {failedApplyCount} failed
              </Text>
            ) : null}
          </Text>
          <Pressable onPress={clearUpdates} hitSlop={8}>
            <Text style={styles.updatesClear}>clear</Text>
          </Pressable>
        </View>
        <View style={styles.updatesDivider} />
      </View>
    );
  };

  const renderBulkUpdatesWaiting = () =>
    running && applyResults.length === 0 ? (
      <View style={styles.updatesWaiting}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    ) : null;

  const renderBulkAutoApply = () =>
    mode === 'Bulk' ? (
      <Pressable
        style={[styles.autoApply, running && styles.autoApplyDisabled]}
        onPress={confirmBulkApply}
        disabled={running}
      >
        {running ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.autoApplyText}>Auto Apply</Text>
        )}
      </Pressable>
    ) : null;

  const renderFormTopSection = () => (
    <>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryName}>{displayName}</Text>
        <View style={styles.summaryValueRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>Total current value</Text>
            <Text style={styles.summaryValue}>{currentValueText}</Text>
          </View>
          <View style={styles.summarySide}>
            <View style={styles.plPill}>
              <Text style={styles.plPillText}>{plText}</Text>
              <Pressable onPress={() => setHideValues((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={hideValues ? 'eye-off-outline' : 'eye-outline'}
                  size={rs(14)}
                  color={colors.text}
                />
              </Pressable>
            </View>
          </View>
        </View>
        <Pressable
          style={styles.summaryBtn}
          onPress={() => navigation.navigate('InvestmentSummary')}
        >
          <Text style={styles.summaryBtnText}>Current Investment Summary</Text>
        </Pressable>
      </View>

      <View style={styles.modeBar}>
        <Pressable
          onPress={() => {
            if (mode === 'Bulk') setAccountsModalOpen(true);
            else goAddCapital();
          }}
          hitSlop={8}
          style={styles.modeSideBtn}
        >
          <MaterialCommunityIcons
            name={mode === 'Bulk' ? 'tray-arrow-up' : 'account-plus-outline'}
            size={rs(18)}
            color={colors.textSecondary}
          />
        </Pressable>
        <View style={styles.modeToggle}>
          {(['Bulk', 'Single'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === m && styles.modeTextActive,
                ]}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Bulk apply',
              'Pick an open IPO, set kitta quantity, choose accounts, then tap Auto Apply. Each account can apply once per IPO.',
            )
          }
          hitSlop={8}
          style={styles.modeSideBtn}
        >
          <Ionicons
            name="information-circle-outline"
            size={rs(18)}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </>
  );

  const renderCategoryDropdown = () =>
    mode === 'Bulk' ? (
      <Pressable
        style={styles.dropdown}
        onPress={() => setAccountsModalOpen(true)}
      >
        <Text style={styles.dropdownText} numberOfLines={1}>
          {checkedEligible.length === operationalAccounts.length ||
          checkedEligible.length === eligibleCount
            ? 'Select Category (All Accounts)'
            : checkedEligible.length === 1
              ? `${checkedEligible[0].name.toUpperCase()} - ${checkedEligible[0].username}`
              : `Select Category (${checkedEligible.length} accounts)`}
        </Text>
        <Ionicons
          name="chevron-down"
          size={rs(18)}
          color={colors.textMuted}
        />
      </Pressable>
    ) : null;

  const renderDaysLeftBadge = () =>
    daysLeft ? (
      <View style={styles.daysBadge}>
        <Ionicons
          name="time-outline"
          size={rs(12)}
          color={isDark ? '#FFB74D' : '#C45C00'}
        />
        <Text style={styles.daysBadgeText}>{daysLeft}</Text>
      </View>
    ) : null;

  const renderIpoFieldSection = () => (
    <View style={styles.fieldBlock}>
      <View style={styles.labelRowBetween}>
        <View style={styles.labelRowLeftInline}>
          <MaterialCommunityIcons
            name="bank-outline"
            size={rs(16)}
            color={colors.text}
          />
          <Text style={styles.fieldLabel}>Current Opening IPO/FPO/Right</Text>
        </View>
        {renderDaysLeftBadge()}
      </View>
      <Pressable
        style={styles.dropdown}
        onPress={() => setPickerOpen(true)}
        disabled={loadingIssues}
      >
        <Text
          style={[
            styles.dropdownValueText,
            !hasRealOpening && styles.dropdownPlaceholder,
          ]}
          numberOfLines={1}
        >
          {openingLabel}
        </Text>
        {loadingIssues ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons
            name="chevron-down"
            size={rs(18)}
            color={colors.textMuted}
          />
        )}
      </Pressable>
    </View>
  );

  const renderQuantityField = () => (
    <View style={styles.fieldBlock}>
      <View style={styles.labelRowLeftInline}>
        <Text style={styles.hash}>#</Text>
        <Text style={styles.fieldLabel}>Quantity</Text>
      </View>
      <View style={styles.dropdown}>
        <TextInput
          value={qty}
          onChangeText={setQty}
          keyboardType="number-pad"
          style={styles.qtyInput}
          placeholder="10"
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </View>
  );

  useEffect(() => {
    if (mode !== 'Bulk') return;
    if (!running && summary && applyResults.length > 0) {
      openResultModal(summary);
    }
  }, [mode, openResultModal, running, summary, applyResults.length]);

  const shareApplyExcel = useCallback(async () => {
    const company = summary?.companyName ?? selected?.companyName ?? 'IPO';
    const header = 'Index,Account,Username,Status,Message';
    const lines = applyResults.map((r, i) =>
      [
        i + 1,
        csvEscape(r.accountName),
        csvEscape(r.username),
        csvEscape(applyOutcomeLabel(resolveApplyOutcome(r))),
        csvEscape(applyDisplayMessage(r)),
      ].join(','),
    );
    const csv = `\uFEFF${header}\n${lines.join('\n')}`;
    try {
      await Share.share({
        title: `${company}_apply_results.csv`,
        message: csv,
      });
    } catch (e) {
      Alert.alert(
        'Share failed',
        e instanceof Error ? e.message : 'Could not share file',
      );
    }
  }, [applyResults, selected?.companyName, summary?.companyName]);

  const renderApplyFormHeader = () => (
    <>
      <OverQuotaBanner />
      {renderFormTopSection()}
      {renderCategoryDropdown()}
      {renderIpoFieldSection()}
      {renderQuantityField()}
      {mode === 'Bulk' ? renderBulkAutoApply() : null}
    </>
  );

  const headerActions = (
    <View style={styles.headerActions}>
      <Pressable
        onPress={() => navigation.navigate('NepseCalendar')}
        hitSlop={8}
        style={[styles.headerIconBtn, { backgroundColor: colors.primary }]}
      >
        <MaterialCommunityIcons name="calendar-month" size={rs(20)} color="#FFFFFF" />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('FinancialNews')}
        hitSlop={8}
        style={[
          styles.headerIconBtn,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Ionicons name="newspaper-outline" size={rs(18)} color={colors.text} />
        <View style={[styles.headerDot, { backgroundColor: colors.badgeNew }]} />
      </Pressable>
    </View>
  );

  return (
    <ProtectedPersonalScreen
      title="Sign in to bulk apply"
      subtitle="Sign in with Google to add accounts and sync them across your phones."
    >
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AppHeader
        onMenuPress={openDrawer}
        title="IPO Bulk Apply"
        showLogo={false}
        right={headerActions}
      />
      <AdminPromoBanner page="apply" />

      {accounts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyArt}>
            <View style={styles.emptyCircle}>
              <MaterialCommunityIcons
                name="file-document-outline"
                size={rs(48)}
                color="#90CAF9"
              />
            </View>
            <View style={styles.plusBubble}>
              <Ionicons name="add" size={rs(28)} color={colors.text} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>No accounts added</Text>
          <Text style={styles.emptySub}>
            Add at least one MeroShare account to apply for IPOs.
          </Text>
          <Pressable
            style={styles.addDataBtn}
            onPress={goAddCapital}
          >
            <Text style={styles.addDataText}>Add account</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {renderApplyFormHeader()}
          {mode === 'Bulk' ? (
            showBulkUpdates ? (
              <>
                {renderBulkUpdatesHeader()}
                {renderBulkUpdatesWaiting()}
                <BulkApplyUpdatesPane
                  results={applyResults}
                  applyingAccountId={applyingAccountId}
                  processingAccountId={processingAccountId}
                  accounts={accounts}
                  onRetry={retryBulkAccount}
                  onEditAccount={goEditAccount}
                  styles={styles}
                  colors={colors}
                  listBoxStyle={styles.resultsBox}
                />
              </>
            ) : null
          ) : (
            <ApplySingleAccountsPane
              accounts={operationalAccounts}
              applyingAccountId={applyingAccountId}
              isAccountActive={isAccountActive}
              onApply={runSingle}
              styles={styles}
              colors={colors}
              listBoxStyle={styles.resultsBox}
            />
          )}
        </ScrollView>
      )}

      <Modal
        visible={accountsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setAccountsModalOpen(false);
          setAccountModalFilter('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Select accounts to apply</Text>
            <View style={styles.selectActions}>
              <Pressable onPress={selectAllEligible} hitSlop={8}>
                <Text style={styles.linkAction}>All</Text>
              </Pressable>
              <Pressable onPress={clearEligible} hitSlop={8}>
                <Text style={styles.linkAction}>None</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Select accounts to include in bulk apply. Already-applied accounts
              can be selected to verify again. Over-limit accounts stay saved but
              cannot apply until you include them in the active set.
            </Text>
            {accounts.length > 40 ? (
              <TextInput
                style={styles.modalSearch}
                placeholder="Search accounts…"
                placeholderTextColor={colors.textMuted}
                value={accountModalFilter}
                onChangeText={setAccountModalFilter}
                autoCorrect={false}
                autoCapitalize="none"
              />
            ) : null}
            <FlatList
              data={filteredModalAccounts}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: rs(360) }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              {...ACCOUNT_LIST_FLAT_PROPS}
              renderItem={({ item, index: idx }) => (
                <ApplyModalAccountRow
                  account={item}
                  index={idx}
                  applied={false}
                  locked={!isAccountActive(item.id) || isUserInactive(item)}
                  checked={
                    Boolean(selectedIds[item.id]) &&
                    isAccountActive(item.id) &&
                    !isUserInactive(item)
                  }
                  onToggle={toggleAccount}
                  styles={styles}
                  colors={colors}
                />
              )}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => {
                setAccountsModalOpen(false);
                setAccountModalFilter('');
              }}
            >
              <Text style={styles.addDataText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Select Opening</Text>
            <FlatList
              data={issues}
              keyExtractor={(item) => String(item.companyShareId)}
              ListEmptyComponent={
                <Text style={styles.emptySub}>No openings available</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelected(item);
                    setPickerOpen(false);
                    setSummary(null);
                  }}
                >
                  <Text style={styles.accName}>{item.companyName}</Text>
                  <Text style={styles.accBank}>
                    {item.shareTypeName}
                    {item.scrip ? ` · ${item.scrip}` : ''}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.addDataText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={resultModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setResultModalOpen(false)}
      >
        <View style={styles.resultModalOverlay}>
          <Pressable
            style={styles.resultModalBackdrop}
            onPress={() => setResultModalOpen(false)}
          />
          <View style={styles.resultModalSheet}>
            <View style={styles.resultModalTop}>
              <View style={styles.resultModalHead}>
                <View style={styles.resultModalRing}>
                  <Text style={styles.resultModalPct}>{modalPct}%</Text>
                  <Text style={styles.resultModalFrac}>
                    {modalSuccess}/{modalTotal}
                  </Text>
                </View>
                <View style={styles.resultModalHeadText}>
                  <Text
                    style={[
                      styles.resultModalTitle,
                      modalNeedsAttention
                        ? styles.resultModalTitleWarn
                        : styles.resultModalTitleOk,
                    ]}
                  >
                    {modalNeedsAttention
                      ? 'Apply Needs Attention'
                      : 'Bulk Apply Complete'}
                  </Text>
                  <Text style={styles.resultModalSub} numberOfLines={2}>
                    {summary?.companyName ?? selected?.companyName ?? 'IPO'} ·{' '}
                    {summary?.kitta ?? kitta} kitta
                  </Text>
                </View>
              </View>

              <View style={styles.statRow}>
                <View style={[styles.statCard, styles.statTotal]}>
                  <Ionicons name="people-outline" size={rs(18)} color="#42A5F5" />
                  <Text style={[styles.statNum, { color: '#42A5F5' }]}>
                    {modalTotal}
                  </Text>
                  <Text style={[styles.statLabel, { color: '#42A5F5' }]}>
                    Total
                  </Text>
                </View>
                <View style={[styles.statCard, styles.statSuccess]}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={rs(18)}
                    color={colors.accentGreen}
                  />
                  <Text style={[styles.statNum, { color: colors.accentGreen }]}>
                    {modalSuccess}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: colors.accentGreen }]}
                  >
                    Success
                  </Text>
                </View>
                <View style={[styles.statCard, styles.statIssues]}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={rs(18)}
                    color={colors.danger}
                  />
                  <Text style={[styles.statNum, { color: colors.danger }]}>
                    {modalIssues}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.danger }]}>
                    Issues
                  </Text>
                </View>
              </View>
            </View>

            {outcomeCounts.already_applied > 0 ? (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionLabel}>SUCCESSFUL</Text>
                <View style={styles.modalCategoryChipOk}>
                  <Ionicons
                    name="checkmark-circle"
                    size={rs(20)}
                    color={colors.accentGreen}
                  />
                  <Text style={styles.modalCategoryChipTextOk}>
                    Already Applied
                  </Text>
                  <View style={styles.modalCategoryCountOk}>
                    <Text style={styles.modalCategoryCountTextOk}>
                      {outcomeCounts.already_applied}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {modalAttentionOutcomes.length > 0 ? (
              <ScrollView
                style={styles.attentionScroll}
                contentContainerStyle={styles.attentionScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.attentionLabel}>NEEDS ATTENTION</Text>
                {modalAttentionOutcomes.map((outcome) => {
                  const count = outcomeCounts[outcome];
                  return (
                    <View key={outcome} style={styles.modalCategoryChipFail}>
                      <Ionicons
                        name={
                          outcome === 'invalid_crn' || outcome === 'invalid_pin'
                            ? 'key-outline'
                            : 'alert-circle'
                        }
                        size={rs(20)}
                        color={colors.danger}
                      />
                      <Text style={styles.modalCategoryChipTextFail}>
                        {applyOutcomeLabel(outcome)}
                      </Text>
                      <View style={styles.modalCategoryCountFail}>
                        <Text style={styles.modalCategoryCountTextFail}>
                          {count}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.resultModalActions}>
              <Pressable
                style={styles.resultModalCloseBtn}
                onPress={() => setResultModalOpen(false)}
              >
                <Text style={styles.resultModalCloseText}>Close</Text>
              </Pressable>
              <Pressable
                style={styles.resultModalShareBtn}
                onPress={() => void shareApplyExcel()}
              >
                <Ionicons name="share-outline" size={rs(18)} color="#FFFFFF" />
                <Text style={styles.resultModalShareText}>Share Excel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View
          style={[
            toast.variant === 'single-bar' ? styles.toastSingleBar : styles.toast,
            toast.kind === 'success' ? styles.toastSuccess : styles.toastError,
            toast.variant === 'single-bar' && toast.kind === 'error'
              ? styles.toastErrorSingle
              : null,
            toast.variant === 'single-bar'
              ? { paddingBottom: insets.bottom + rs(14) }
              : { bottom: insets.bottom + rs(16) },
          ]}
        >
          <Text
            style={
              toast.variant === 'single-bar'
                ? styles.toastSingleBarText
                : styles.toastText
            }
          >
            {toast.text}
          </Text>
        </View>
      ) : null}

      <SensitiveActionModals
        action={sensitive}
        onDismiss={clearApplyingState}
      />
    </View>
    </ProtectedPersonalScreen>
  );
}

const APPLY_GREEN_LIGHT = '#81C784';
const APPLY_GREEN_TEXT = '#66BB6A';

function makeStyles(c: ThemeColors, isDark: boolean) {
  const cardBg = c.bg;
  const fieldBg = c.bg;
  const fieldBorder = isDark ? c.borderMuted : '#B8B8B8';
  const ink = isDark ? c.text : '#1B1B1B';
  const inkMuted = isDark ? c.textSecondary : '#5A6556';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    scrollContent: {
      padding: rs(16),
      paddingBottom: rs(32),
    },
    resultsBox: {
      height: rs(400),
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(28),
    },
    emptyArt: {
      width: rs(160),
      height: rs(160),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(16),
    },
    emptyCircle: {
      width: rs(120),
      height: rs(120),
      borderRadius: rs(60),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plusBubble: {
      position: 'absolute',
      width: rs(52),
      height: rs(52),
      borderRadius: rs(26),
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      color: c.text,
      fontSize: rs(20),
      fontWeight: '700',
      marginBottom: rs(8),
    },
    emptySub: {
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: rs(20),
      fontSize: rs(14),
    },
    addDataBtn: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(10),
    },
    addDataText: {
      color: c.primary,
      fontWeight: '600',
      fontSize: rs(15),
    },
    content: { padding: rs(16), paddingBottom: rs(40) },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      minWidth: rs(88),
      justifyContent: 'flex-end',
      paddingBottom: rs(6),
    },
    headerIconBtn: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(8),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    headerDot: {
      position: 'absolute',
      top: rs(4),
      right: rs(4),
      width: rs(8),
      height: rs(8),
      borderRadius: rs(4),
    },
    summaryCard: {
      borderWidth: 1,
      borderColor: isDark ? c.borderMuted : '#D8D6CF',
      borderRadius: rs(11),
      paddingHorizontal: rs(12),
      paddingTop: rs(10),
      paddingBottom: rs(10),
      backgroundColor: cardBg,
      marginBottom: rs(10),
    },
    summaryName: {
      color: ink,
      fontWeight: '800',
      fontSize: rs(12),
      letterSpacing: 0.3,
      marginBottom: rs(5),
    },
    summaryValueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: rs(6),
      marginBottom: rs(7),
    },
    summaryLabel: {
      color: inkMuted,
      fontSize: rs(10),
      marginBottom: rs(1),
    },
    summaryValue: {
      color: ink,
      fontWeight: '800',
      fontSize: rs(19),
      letterSpacing: -0.2,
    },
    summarySide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingBottom: rs(1),
    },
    plPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: isDark ? c.surface : c.surfaceAlt,
      borderRadius: rs(12),
      paddingHorizontal: rs(7),
      paddingVertical: rs(3),
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: c.borderMuted,
    },
    plPillText: {
      color: ink,
      fontWeight: '600',
      fontSize: rs(10),
    },
    eyeBtn: {
      padding: rs(3),
    },
    summaryBtn: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(12),
      paddingVertical: rs(6),
      paddingHorizontal: rs(14),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg,
    },
    summaryBtnText: {
      color: isDark ? c.sage : c.primary,
      fontWeight: '700',
      fontSize: rs(11),
      textAlign: 'center',
      includeFontPadding: false,
    },
    modeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(12),
      gap: rs(8),
    },
    modeSideBtn: {
      width: rs(28),
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(12),
    },
    modeToggle: {
      flexGrow: 0,
      flexShrink: 1,
      width: rs(180),
      flexDirection: 'row',
      backgroundColor: isDark ? c.surface : c.primarySoft,
      borderRadius: rs(16),
      padding: rs(3),
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: c.borderMuted,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: rs(6),
      borderRadius: rs(13),
      alignItems: 'center',
    },
    modeBtnActive: { backgroundColor: c.primary },
    modeText: {
      color: isDark ? c.sage : c.primary,
      fontWeight: '700',
      fontSize: rs(12),
    },
    modeTextActive: { color: '#FFFFFF' },
    fieldBlock: { marginBottom: rs(12) },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      marginBottom: rs(6),
      flexWrap: 'wrap',
    },
    labelRowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(6),
      gap: rs(6),
    },
    labelRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      flexShrink: 1,
      marginBottom: rs(6),
    },
    labelRowLeftInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      flexShrink: 1,
    },
    label: { color: c.textSecondary, fontSize: rs(12) },
    fieldLabel: {
      color: ink,
      fontSize: rs(12),
      fontWeight: '600',
    },
    hash: { color: ink, fontWeight: '700', fontSize: rs(12) },
    dropdown: {
      minHeight: rs(36),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: fieldBorder,
      paddingHorizontal: rs(10),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: fieldBg,
      marginBottom: rs(8),
    },
    dropdownText: {
      flex: 1,
      color: isDark ? c.textMuted : '#6B7280',
      fontSize: rs(12),
      marginRight: rs(6),
    },
    dropdownValueText: {
      flex: 1,
      color: ink,
      fontSize: rs(12),
      fontWeight: '700',
      marginRight: rs(6),
    },
    dropdownPlaceholder: {
      color: c.textMuted,
      fontWeight: '500',
    },
    hint: {
      color: c.textMuted,
      fontSize: rs(10),
      marginBottom: rs(6),
      lineHeight: rs(14),
    },
    qtyInput: {
      flex: 1,
      color: ink,
      fontSize: rs(14),
      fontWeight: '700',
      paddingVertical: rs(7),
    },
    selectActions: {
      flexDirection: 'row',
      gap: rs(12),
      marginBottom: rs(6),
    },
    linkAction: { color: c.primary, fontWeight: '700', fontSize: rs(12) },
    autoApply: {
      alignSelf: 'stretch',
      marginTop: rs(8),
      backgroundColor: c.promoBanner,
      borderRadius: rs(16),
      paddingVertical: rs(8),
      paddingHorizontal: rs(16),
      alignItems: 'center',
      minHeight: rs(36),
      justifyContent: 'center',
    },
    autoApplyDisabled: { opacity: 0.7 },
    autoApplyText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(13),
    },
    daysBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(3),
      backgroundColor: isDark ? 'rgba(255,183,77,0.12)' : '#FFF8F0',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,183,77,0.35)' : '#E8C9A8',
      borderRadius: rs(12),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
      flexShrink: 0,
    },
    daysBadgeText: {
      color: isDark ? '#FFB74D' : '#C45C00',
      fontSize: rs(10),
      fontWeight: '600',
    },
    updatesSection: {
      marginTop: rs(16),
    },
    updatesHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(8),
    },
    updatesTitleLine: {
      flex: 1,
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    updatesTitleLabel: {
      color: ink,
      fontWeight: '700',
    },
    updatesParen: {
      color: ink,
      fontWeight: '700',
    },
    updatesCountOk: {
      color: isDark ? '#81C784' : '#2E7D32',
      fontWeight: '700',
    },
    updatesCountTotal: {
      color: '#42A5F5',
      fontWeight: '700',
    },
    updatesCountFailed: {
      color: '#E57373',
      fontWeight: '600',
    },
    updatesClear: {
      color: c.primary,
      fontWeight: '700',
      fontSize: rs(13),
    },
    updatesDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginBottom: rs(10),
    },
    updatesWaiting: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingVertical: rs(8),
    },
    updateCardFail: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(10),
      borderWidth: 1,
      borderColor: isDark ? 'rgba(229,115,115,0.4)' : '#F0C4B8',
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(8),
      backgroundColor: cardBg,
    },
    updateCardOk: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(10),
      borderWidth: 1,
      borderColor: 'rgba(129,199,132,0.4)',
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(8),
      backgroundColor: isDark ? 'rgba(129,199,132,0.08)' : '#F6FBF6',
    },
    updateBody: { flex: 1, minWidth: 0 },
    updateName: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
    },
    updateMsg: {
      fontSize: rs(12),
      marginTop: rs(4),
      lineHeight: rs(16),
    },
    updateMsgFail: { color: c.danger },
    updateMsgOk: { color: c.textSecondary },
    updateMsgOkGreen: { color: APPLY_GREEN_TEXT, fontWeight: '600' },
    appliedBadge: {
      borderRadius: rs(14),
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
      backgroundColor: isDark ? 'rgba(129,199,132,0.22)' : 'rgba(129,199,132,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(129,199,132,0.45)',
      alignSelf: 'center',
    },
    appliedBadgeText: {
      color: APPLY_GREEN_TEXT,
      fontWeight: '800',
      fontSize: rs(11),
    },
    updateBlueBtn: {
      borderRadius: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      backgroundColor: isDark ? 'rgba(100,181,246,0.18)' : '#E8F4FD',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(100,181,246,0.45)' : '#BBDEFB',
      alignSelf: 'center',
    },
    updateBlueText: {
      color: isDark ? '#90CAF9' : '#42A5F5',
      fontWeight: '700',
      fontSize: rs(12),
    },
    updateApplyBtn: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(129,199,132,0.5)' : '#A5D6A7',
      borderRadius: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      backgroundColor: isDark ? 'rgba(129,199,132,0.15)' : '#F1F8F2',
    },
    updateApplyText: {
      color: APPLY_GREEN_TEXT,
      fontWeight: '700',
      fontSize: rs(12),
    },
    accountRow: {
      marginTop: rs(10),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      padding: rs(12),
      backgroundColor: c.surface,
    },
    accountRowDisabled: { opacity: 0.75 },
    indexBadge: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indexText: { color: c.text, fontWeight: '700' },
    accName: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    accBank: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
    accBankApplying: {
      color: APPLY_GREEN_TEXT,
      fontWeight: '700',
    },
    applyBtn: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(10),
      backgroundColor: isDark ? 'rgba(129,199,132,0.2)' : '#E8F5E9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(129,199,132,0.4)' : '#C8E6C9',
    },
    applyBtnSingle: {
      paddingHorizontal: rs(12),
      paddingVertical: rs(7),
      borderRadius: rs(9),
      minWidth: rs(62),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#388E3C' : '#43A047',
      borderWidth: 1,
      borderColor: isDark ? '#2E7D32' : '#388E3C',
    },
    applyBtnSingleApplying: {
      backgroundColor: isDark ? '#388E3C' : '#43A047',
      borderColor: isDark ? '#2E7D32' : '#388E3C',
      opacity: 0.92,
    },
    applyBtnDisabled: { backgroundColor: c.surfaceAlt, borderColor: c.border },
    applyBtnText: { color: APPLY_GREEN_TEXT, fontWeight: '700', fontSize: rs(12) },
    applyBtnSingleText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: rs(11),
    },
    statRow: {
      flexDirection: 'row',
      gap: rs(8),
      marginBottom: rs(14),
    },
    statCard: {
      flex: 1,
      borderRadius: rs(10),
      borderWidth: 1,
      paddingVertical: rs(10),
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: cardBg,
    },
    statTotal: { borderColor: 'rgba(66,165,245,0.4)' },
    statSuccess: { borderColor: 'rgba(76,175,80,0.4)' },
    statIssues: { borderColor: 'rgba(229,57,53,0.35)' },
    statNum: { fontWeight: '800', fontSize: rs(18) },
    statLabel: { fontSize: rs(11), fontWeight: '600' },
    resultModalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    resultModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    resultModalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(20),
      borderTopRightRadius: rs(20),
      paddingHorizontal: rs(20),
      paddingTop: rs(20),
      paddingBottom: rs(28),
      maxHeight: '88%',
    },
    resultModalTop: {
      marginBottom: rs(12),
    },
    resultModalHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(14),
      marginBottom: rs(16),
    },
    resultModalRing: {
      width: rs(64),
      height: rs(64),
      borderRadius: rs(32),
      borderWidth: 3,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultModalPct: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
    },
    resultModalFrac: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
    },
    resultModalHeadText: { flex: 1, minWidth: 0 },
    resultModalTitle: {
      fontWeight: '800',
      fontSize: rs(16),
    },
    resultModalTitleWarn: { color: c.danger },
    resultModalTitleOk: { color: c.accentGreen },
    resultModalSub: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
      lineHeight: rs(17),
    },
    attentionScroll: {
      flexGrow: 0,
      flexShrink: 1,
      maxHeight: rs(320),
      marginBottom: rs(16),
    },
    attentionScrollContent: {
      paddingBottom: rs(4),
    },
    attentionBlock: {
      marginBottom: rs(16),
    },
    attentionLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: rs(8),
    },
    modalSection: {
      marginBottom: rs(12),
    },
    modalSectionLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: rs(8),
    },
    modalCategoryChipOk: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: 'rgba(76,175,80,0.35)',
      backgroundColor: isDark ? 'rgba(76,175,80,0.12)' : '#E8F5E9',
      padding: rs(12),
    },
    modalCategoryChipTextOk: {
      flex: 1,
      color: c.accentGreen,
      fontWeight: '700',
      fontSize: rs(14),
    },
    modalCategoryCountOk: {
      minWidth: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.accentGreen,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(6),
    },
    modalCategoryCountTextOk: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(12),
    },
    modalCategoryChipFail: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: isDark ? 'rgba(229,57,53,0.35)' : '#FFCDD2',
      backgroundColor: isDark ? 'rgba(229,57,53,0.12)' : '#FFEBEE',
      padding: rs(12),
      marginBottom: rs(8),
    },
    modalCategoryChipTextFail: {
      flex: 1,
      color: c.danger,
      fontWeight: '700',
      fontSize: rs(14),
    },
    modalCategoryCountFail: {
      minWidth: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(6),
    },
    modalCategoryCountTextFail: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(12),
    },
    toast: {
      position: 'absolute',
      left: rs(12),
      right: rs(12),
      borderRadius: rs(12),
      paddingVertical: rs(18),
      paddingHorizontal: rs(18),
      minHeight: rs(64),
      justifyContent: 'center',
      zIndex: 20,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
    },
    toastSingleBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: rs(6),
      borderTopRightRadius: rs(6),
      paddingTop: rs(14),
      paddingHorizontal: rs(16),
      minHeight: rs(58),
      justifyContent: 'center',
      zIndex: 20,
      elevation: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    toastSuccess: {
      backgroundColor: '#43A047',
    },
    toastError: {
      backgroundColor: '#D32F2F',
    },
    toastErrorSingle: {
      backgroundColor: '#EF5350',
    },
    toastText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: rs(15),
      lineHeight: rs(22),
      textAlign: 'center',
    },
    toastSingleBarText: {
      color: '#FFFFFF',
      fontWeight: '600',
      fontSize: rs(13),
      lineHeight: rs(18),
      textAlign: 'center',
    },
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
      backgroundColor: isDark ? 'rgba(229,57,53,0.15)' : '#FFEBEE',
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(8),
    },
    attentionText: {
      flex: 1,
      color: c.text,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    resultModalActions: {
      flexDirection: 'row',
      gap: rs(10),
    },
    resultModalCloseBtn: {
      flex: 1,
      borderRadius: rs(24),
      paddingVertical: rs(14),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? c.bgElevated : cardBg,
      borderWidth: 1,
      borderColor: c.border,
    },
    resultModalCloseText: {
      color: c.primary,
      fontWeight: '800',
      fontSize: rs(14),
    },
    resultModalShareBtn: {
      flex: 1.4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      borderRadius: rs(24),
      paddingVertical: rs(14),
      backgroundColor: c.danger,
    },
    resultModalShareText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(14),
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      maxHeight: '70%',
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      padding: rs(16),
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginBottom: rs(12),
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
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    modalClose: {
      marginTop: rs(12),
      alignItems: 'center',
      paddingVertical: rs(12),
    },
  });
}
