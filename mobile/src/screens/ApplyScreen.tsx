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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import {
  formatRs,
  loadInvestmentSummary,
  type InvestmentSummary,
} from '../services/nepse/premiumAnalytics';
import type { ThemeColors } from '../theme/colors';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { guardAddAccount } from '../utils/accountLimits';
import {
  loadOpenIssuesForUi,
  runBulkApply,
  sanitizeMeroshareMessage,
  type ApplyAccountResult,
  type BulkApplySummary,
  type OpenIssue,
} from '../services/meroshare';
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
import type { RootStackParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

type ApplyFilter =
  | 'all'
  | 'applied'
  | 'auth'
  | 'balance'
  | 'missing'
  | 'other';

function classifyApplyResult(r: ApplyAccountResult): Exclude<ApplyFilter, 'all'> {
  if (r.ok) return 'applied';
  const m = r.message.toLowerCase();
  if (
    /invalid username|password|credential|unauthorized|wrong depository|auth/i.test(
      m,
    )
  ) {
    return 'auth';
  }
  if (/missing password|crn|pin/i.test(m)) return 'missing';
  if (/insufficient|balance|block.?fail/i.test(m)) return 'balance';
  return 'other';
}

function reasonLabel(r: ApplyAccountResult): string {
  const kind = classifyApplyResult(r);
  if (kind === 'applied') return 'Applied';
  if (kind === 'auth') return 'Invalid login';
  if (kind === 'missing') return 'Missing CRN/PIN';
  if (kind === 'balance') return 'Insufficient balance';
  return 'Not applied';
}

function applyDisplayMessage(r: ApplyAccountResult): string {
  return sanitizeMeroshareMessage(r.message);
}

/** @deprecated use daysLeftForIssue — kept for hot-reload compatibility */
function daysLeftLabel(closeDate?: string): string | null {
  if (!closeDate) return null;
  return daysLeftForIssue({ issueCloseDate: closeDate } as OpenIssue);
}

function csvEscape(v: string): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ApplyScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const { accounts, updateAccountMeta } = useAccounts();
  const { user } = useAuth();
  const { isPremium, maxAccounts } = useSubscription();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const goAddCapital = useCallback(() => {
    if (
      !guardAddAccount({
        currentCount: accounts.length,
        isPremium,
        maxAccounts,
        onUpgrade: () => navigation.navigate('Subscription'),
      })
    ) {
      return;
    }
    navigation.navigate('AddCapital');
  }, [accounts.length, isPremium, maxAccounts, navigation]);
  const [mode, setMode] = useState<'Bulk' | 'Single'>('Bulk');
  const [hideValues, setHideValues] = useState(false);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [investment, setInvestment] = useState<InvestmentSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qty, setQty] = useState('10');
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [selected, setSelected] = useState<OpenIssue | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
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
    setLoadingIssues(true);
    try {
      const list = await enrichIssuesWithClosingDates(
        await loadOpenIssuesForUi(accounts),
      );
      setIssues(list);
      setSelected((prev) => {
        if (!list.length) return null;
        const still = prev
          ? list.find((i) => i.companyShareId === prev.companyShareId)
          : null;
        return still ?? list[0];
      });
    } finally {
      setLoadingIssues(false);
    }
  }, [accounts]);

  const refreshInvestment = useCallback(async () => {
    setInvestment(await loadInvestmentSummary());
  }, []);

  const refreshAll = useCallback(async () => {
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
    if (issuesStartedRef.current) void refreshIssues();
  }, [refreshIssues]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next: Record<string, boolean> = {};
      for (const a of accounts) {
        next[a.id] = prev[a.id] ?? true;
      }
      return next;
    });
  }, [accounts]);

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

  const alreadyApplied = useCallback(
    (accountId: string) => {
      if (companyShareId == null) return false;
      return isAppliedInMap(historyMap, accountId, companyShareId);
    },
    [companyShareId, historyMap],
  );

  const checkedEligible = useMemo(() => {
    if (!selected) return [];
    return accounts.filter(
      (a) => selectedIds[a.id] && !alreadyApplied(a.id),
    );
  }, [accounts, selectedIds, selected, alreadyApplied]);

  const toggleAccount = (id: string) => {
    if (alreadyApplied(id)) return;
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllEligible = () => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const a of accounts) {
        if (!alreadyApplied(a.id)) next[a.id] = true;
      }
      return next;
    });
  };

  const clearEligible = () => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const a of accounts) {
        if (!alreadyApplied(a.id)) next[a.id] = false;
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
      // Successful live apply means CRN+PIN were accepted by MeroShare
      for (const row of rows) {
        await updateAccountMeta(row.accountId, { crnPinVerified: true });
      }
      setHistoryTick((t) => t + 1);
    }
  };

  const confirmBulkApply = useCallback(() => {
    if (!selected) {
      Alert.alert('No IPO', 'Select a Current Opening IPO first.');
      return;
    }
    if (selected.companyShareId === 9001) {
      Alert.alert(
        'No open IPO',
        'No live opening is available right now. Pull to refresh after MeroShare login, or check allotment on the Check tab.',
      );
      return;
    }
    if (checkedEligible.length === 0) {
      Alert.alert(
        'No accounts selected',
        'Check at least one account that has not already applied for this IPO.',
      );
      return;
    }

    const title = 'Confirm bulk apply';
    const body = `${selected.companyName} (${selected.scrip || '—'})\nKitta: ${kitta}\nAccounts: ${checkedEligible.length}\n\nThis submits real applications to MeroShare. Start with one account if you are unsure.`;

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Apply',
        style: 'destructive',
        onPress: () => {
          const execute = () => {
            void (async () => {
              setRunning(true);
              resultModalBatchKeyRef.current = null;
              setSummary(null);
              setApplyResults([]);
              setApplyProgress({ done: 0, total: checkedEligible.length });
              try {
                const result = await runBulkApply({
                  accounts: checkedEligible,
                  issue: selected,
                  kitta,
                  dryRun: false,
                  simulateLogin: false,
                  onProgress: (_msg, index, total) => {
                    setApplyProgress({ done: index, total });
                  },
                  onAccountResult: (row, index, total) => {
                    setApplyResults((prev) => [...prev, row]);
                    setApplyProgress({ done: index + 1, total });
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
              }
            })();
          };
          void sensitive.requestSensitiveAction(execute);
        },
      },
    ]);
  }, [checkedEligible, kitta, selected, sensitive]);

  const runSingle = useCallback(
    (accountId: string) => {
      if (!selected) {
        Alert.alert('No IPO', 'Select a Current Opening IPO first.');
        return;
      }
      if (selected.companyShareId === 9001) {
        Alert.alert(
          'No open IPO',
          'No live opening is available right now. Refresh openings after login.',
        );
        return;
      }
      if (alreadyApplied(accountId)) {
        Alert.alert(
          'Already applied',
          'This account already applied for this IPO (one apply per account per IPO).',
        );
        return;
      }
      const one = accounts.filter((a) => a.id === accountId);
      if (!one.length) return;
      Alert.alert(
        'Confirm apply',
        `${selected.companyName}\nKitta: ${kitta}\nAccount: ${one[0].name}\n\nSubmits a real MeroShare application.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Apply',
            style: 'destructive',
            onPress: () => {
              const execute = () => {
                void (async () => {
                  setRunning(true);
                  resultModalBatchKeyRef.current = null;
                  setApplyResults([]);
                  setApplyProgress({ done: 0, total: 1 });
                  try {
                    const result = await runBulkApply({
                      accounts: one,
                      issue: selected,
                      kitta,
                      dryRun: false,
                      simulateLogin: false,
                      onAccountResult: (row, index, total) => {
                        setApplyResults((prev) => [...prev, row]);
                        setApplyProgress({ done: index + 1, total });
                      },
                    });
                    setSummary(result);
                    await persistSuccessful(result, selected.companyShareId);
                  } finally {
                    setRunning(false);
                    setApplyProgress(null);
                  }
                })();
              };
              void sensitive.requestSensitiveAction(execute);
            },
          },
        ],
      );
    },
    [accounts, alreadyApplied, kitta, selected, sensitive],
  );

  const openingLabel = useMemo(() => {
    if (loadingIssues) return 'Loading openings…';
    if (!selected || selected.companyShareId === 9001) return 'No Any Opening';
    const suffix = selected.scrip ? ` (${selected.scrip})` : '';
    return `${selected.companyName}${suffix}`;
  }, [loadingIssues, selected]);

  const hasRealOpening =
    Boolean(selected) && selected!.companyShareId !== 9001;

  const currentValueText = hideValues
    ? 'Rs. ••••'
    : formatRs(investment?.currentValue ?? 0);

  const plValue = investment?.pl ?? 0;
  const plText = hideValues
    ? '••••'
    : `${plValue >= 0 ? '+' : '-'} ${formatRs(Math.abs(plValue))}`;

  const eligibleCount = accounts.filter((a) => !alreadyApplied(a.id)).length;

  const applyCounts = useMemo(() => {
    const counts = {
      all: applyResults.length,
      applied: 0,
      auth: 0,
      balance: 0,
      missing: 0,
      other: 0,
    };
    for (const r of applyResults) {
      counts[classifyApplyResult(r)] += 1;
    }
    return counts;
  }, [applyResults]);

  const failedApplyCount = applyResults.length - applyCounts.applied;
  const showBulkUpdates = running || applyResults.length > 0;
  const daysLeft = daysLeftForIssue(selected);

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
  const modalSuccess = applyCounts.applied;
  const modalIssues = failedApplyCount;
  const modalPct =
    modalTotal > 0 ? Math.round((modalSuccess / modalTotal) * 100) : 0;
  const modalNeedsAttention = modalIssues > 0;
  const modalIssueRows = useMemo(
    () => applyResults.filter((r) => !r.ok),
    [applyResults],
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

  const renderSingleAccountRows = () =>
    accounts.map((acc, idx) => {
      const applied = alreadyApplied(acc.id);
      return (
        <View key={acc.id} style={styles.accountRow}>
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>{idx + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accName}>{acc.name}</Text>
            <Text style={styles.accBank}>
              {applied
                ? 'Already applied for this IPO'
                : acc.bankName || acc.dpName}
            </Text>
          </View>
          <Pressable
            style={[styles.applyBtn, applied && styles.applyBtnDisabled]}
            onPress={() => runSingle(acc.id)}
            disabled={running || applied}
          >
            <Text
              style={[
                styles.applyBtnText,
                applied && { color: colors.textMuted },
              ]}
            >
              {applied ? 'Done' : 'Apply'}
            </Text>
          </Pressable>
        </View>
      );
    });

  const renderUpdateCard = (r: ApplyAccountResult, index: number) => {
    const ok = r.ok;
    const cardStyle = ok ? styles.updateCardOk : styles.updateCardFail;
    const acc = accounts.find((a) => a.id === r.accountId);
    const label = (acc?.name || r.accountName || r.username || '').trim();
    const rowTitle = `IPO@${label.toUpperCase()}`;
    return (
      <View key={r.accountId} style={cardStyle}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'alert-circle'}
          size={rs(22)}
          color={ok ? colors.accentGreen : colors.danger}
        />
        <View style={styles.updateBody}>
          <Text style={styles.updateName}>
            {index + 1}. {rowTitle}
          </Text>
          <Text
            style={[
              styles.updateMsg,
              ok ? styles.updateMsgOk : styles.updateMsgFail,
            ]}
            numberOfLines={3}
          >
            {ok ? reasonLabel(r) : applyDisplayMessage(r)}
          </Text>
        </View>
        {!ok && !running ? (
          <Pressable
            style={styles.updateApplyBtn}
            onPress={() => runSingle(r.accountId)}
          >
            <Text style={styles.updateApplyText}>Apply</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderBulkUpdatesHeader = () => {
    const total = applyResults.length || applyProgress?.total || 0;
    return (
      <View style={styles.updatesSection}>
        <View style={styles.updatesHead}>
          <Text style={styles.updatesTitleLine} numberOfLines={2}>
            <Text style={styles.updatesTitleLabel}>Bulk Apply Updates </Text>
            <Text style={styles.updatesParen}>(</Text>
            <Text style={styles.updatesCountOk}>{applyCounts.applied}</Text>
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

  const renderBulkUpdateCards = () =>
    applyResults.map((r, index) => renderUpdateCard(r, index));

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
          {checkedEligible.length === accounts.length ||
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
    if (!running && summary && applyResults.length > 0) {
      const batchKey = `${summary.companyShareId}-${summary.kitta}-${applyResults.length}`;
      if (resultModalBatchKeyRef.current !== batchKey) {
        resultModalBatchKeyRef.current = batchKey;
        setResultModalOpen(true);
      }
    }
  }, [running, summary, applyResults.length]);

  const shareApplyExcel = useCallback(async () => {
    const company = summary?.companyName ?? selected?.companyName ?? 'IPO';
    const header = 'Index,Account,Username,Status,Message';
    const lines = applyResults.map((r, i) =>
      [
        i + 1,
        csvEscape(r.accountName),
        csvEscape(r.username),
        csvEscape(reasonLabel(r)),
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
      subtitle="Google sign-in keeps your MeroShare accounts separate per user on this device."
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
          {renderFormTopSection()}
          {renderCategoryDropdown()}
          {renderIpoFieldSection()}
          {renderQuantityField()}
          {mode === 'Bulk' ? renderBulkAutoApply() : null}
          {mode === 'Bulk' ? (
            showBulkUpdates ? (
              <>
                {renderBulkUpdatesHeader()}
                {renderBulkUpdatesWaiting()}
                {applyResults.length > 5 ? (
                  <View style={styles.resultsBox}>
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                    >
                      {renderBulkUpdateCards()}
                    </ScrollView>
                  </View>
                ) : (
                  renderBulkUpdateCards()
                )}
              </>
            ) : null
          ) : accounts.length > 5 ? (
            <View style={styles.resultsBox}>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {renderSingleAccountRows()}
              </ScrollView>
            </View>
          ) : (
            renderSingleAccountRows()
          )}
        </ScrollView>
      )}

      <Modal visible={accountsModalOpen} animationType="slide" transparent>
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
              Already-applied accounts are locked (1 apply / account / IPO).
            </Text>
            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: rs(360) }}
              renderItem={({ item, index: idx }) => {
                const applied = alreadyApplied(item.id);
                const checked = Boolean(selectedIds[item.id]) && !applied;
                return (
                  <Pressable
                    style={[
                      styles.accountRow,
                      applied && styles.accountRowDisabled,
                    ]}
                    onPress={() => toggleAccount(item.id)}
                    disabled={applied}
                  >
                    <Ionicons
                      name={
                        applied
                          ? 'checkmark-done-circle'
                          : checked
                            ? 'checkbox'
                            : 'square-outline'
                      }
                      size={rs(22)}
                      color={
                        applied
                          ? colors.accentGreen
                          : checked
                            ? colors.primary
                            : colors.textMuted
                      }
                    />
                    <View style={styles.indexBadge}>
                      <Text style={styles.indexText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accName}>{item.name}</Text>
                      <Text style={styles.accBank}>
                        {applied
                          ? 'Already applied for this IPO'
                          : item.bankName || item.dpName}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setAccountsModalOpen(false)}
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
                      : 'Apply Complete'}
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

            {modalNeedsAttention ? (
              <ScrollView
                style={styles.attentionScroll}
                contentContainerStyle={styles.attentionScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.attentionLabel}>NEEDS ATTENTION</Text>
                {modalIssueRows.map((r) => (
                  <View key={r.accountId} style={styles.attentionRow}>
                    <Ionicons
                      name="alert-circle"
                      size={rs(18)}
                      color={colors.danger}
                    />
                    <Text style={styles.attentionText}>
                      {r.accountName || r.username}: {applyDisplayMessage(r)}
                    </Text>
                  </View>
                ))}
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

      <SensitiveActionModals action={sensitive} />
    </View>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? c.bgElevated : '#F9F8F4';
  const fieldBg = isDark ? c.surface : '#F9F8F4';
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
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(12),
      paddingVertical: rs(6),
      paddingHorizontal: rs(14),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? c.surface : cardBg,
      maxWidth: '82%',
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
      alignSelf: 'center',
      marginTop: rs(2),
      backgroundColor: c.promoBanner,
      borderRadius: rs(18),
      paddingVertical: rs(10),
      paddingHorizontal: rs(28),
      alignItems: 'center',
      minHeight: rs(40),
      minWidth: rs(160),
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
      borderColor: 'rgba(76,175,80,0.35)',
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(8),
      backgroundColor: cardBg,
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
    updateApplyBtn: {
      borderWidth: 1,
      borderColor: isDark ? '#FFB74D' : '#FB8C00',
      borderRadius: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      backgroundColor: isDark ? 'rgba(255,183,77,0.12)' : '#FFF8F0',
    },
    updateApplyText: {
      color: isDark ? '#FFB74D' : '#E65100',
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
    applyBtn: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(8),
      backgroundColor: c.primarySoft,
    },
    applyBtnDisabled: { backgroundColor: c.surfaceAlt },
    applyBtnText: { color: c.primary, fontWeight: '700' },
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
