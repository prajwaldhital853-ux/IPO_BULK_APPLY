import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  ISSUE_MANAGERS,
  buildManagerAliasSet,
  filterCdscOnlyCompanies,
  isCdscBackendConfigured,
  loadIssueManagerCompanies,
  loadCdscFallbackCompanies,
  runIssueManagerBulkCheck,
  type CompanyLoadResult,
  type IssueManagerBulkRow,
  type IssueManagerBulkSummary,
  type IssueManagerCompany,
} from '../services/issuemanager';
import {
  detectNewlyPublishedCompanies,
  mergeIpoCompanyLists,
  pickNewestIpoCompany,
} from '../services/issuemanager/companySort';
import { maskBoid, resolveBoidSync } from '../utils/boid';
import {
  buildCheckAccountIdSet,
  isAllAccountsSelected,
  isCheckAccountSelected,
  resolveCheckAccounts,
  toggleCheckAccountId,
} from '../utils/checkAccountSelection';
import { ACCOUNT_LIST_FLAT_PROPS } from '../utils/flatListPerf';
import { rs } from '../utils/responsive';
import { useAfterInteractions } from '../utils/useAfterInteractions';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import {
  CaptchaOcrBridge,
  type CaptchaOcrHandle,
} from '../components/CaptchaOcrBridge';
import {
  IpoResultWebBridge,
  type IpoResultWebBridgeHandle,
} from '../components/IpoResultWebBridge';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import {
  isRetriableCdscError,
  loadPublicHomeViaBridge,
  runPublicBulkResultCheck,
  type PublicBulkResultRow,
  type PublicBulkResultSummary,
} from '../services/iporesult/bulkEngine';

type ProviderLoadError = { provider: string; label: string; message: string };
type ResultRow = IssueManagerBulkRow | PublicBulkResultRow;
type BulkSummary = IssueManagerBulkSummary | PublicBulkResultSummary;

/** Pending-state hourglass — top outline, bottom filled (matches reference SS). */
function PendingHourglass({
  size = 22,
  color = '#5A5A5A',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7 3h10l-3.5 5H10.5L7 3z"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Line
        x1={9}
        y1={12}
        x2={15}
        y2={12}
        stroke={color}
        strokeWidth={1.6}
      />
      <Path d="M7 21h10l-3.5-5H10.5L7 21z" fill={color} />
    </Svg>
  );
}

type ResultCardStyles = ReturnType<typeof makeStyles>;

type AccountResultRowProps = {
  account: AccountMeta;
  index: number;
  result?: ResultRow;
  isChecking: boolean;
  hideBoids: boolean;
  running: boolean;
  hasSelected: boolean;
  onCheckOne: (account: AccountMeta) => void;
  styles: ResultCardStyles;
  colors: ThemeColors;
};

const AccountResultRow = React.memo(function AccountResultRow({
  account,
  index,
  result,
  isChecking,
  hideBoids,
  running,
  hasSelected,
  onCheckOne,
  styles,
  colors,
}: AccountResultRowProps) {
  const boidRaw =
    result?.boidMasked ?? resolveBoidSync(account) ?? account.demat;
  const boidText = hideBoids
    ? '••••••••••••••••'
    : boidRaw
      ? maskBoid(boidRaw)
      : 'BOID missing';
  const isAllotted = Boolean(result?.ok && result.allotted);
  const isError = Boolean(result && !result.ok);
  const isNotAllotted = Boolean(result?.ok && !result.allotted);
  const statusColor = isChecking
    ? colors.primary
    : isAllotted
      ? '#66BB6A'
      : isError
        ? '#FB8C00'
        : isNotAllotted
          ? '#E57373'
          : colors.textMuted;
  const statusMessage = isChecking
    ? 'Checking…'
    : result
      ? result.message
      : null;
  const showHourglass =
    !isChecking && !result && !isAllotted && !isError && !isNotAllotted;
  const showStatusLine = Boolean(statusMessage);

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultIconWrap}>
        {isChecking ? (
          <ActivityIndicator size="small" color="#9E9E9E" />
        ) : isAllotted ? (
          <Ionicons name="checkmark-circle" size={rs(18)} color="#4CAF50" />
        ) : isError ? (
          <Ionicons name="warning" size={rs(18)} color="#FB8C00" />
        ) : isNotAllotted ? (
          <Ionicons name="close-circle" size={rs(18)} color="#E57373" />
        ) : showHourglass ? (
          <PendingHourglass size={rs(18)} color="#5A5A5A" />
        ) : null}
      </View>
      <View style={styles.resultBody}>
        <Text style={styles.resultName} numberOfLines={1}>
          {index}. {account.name.toUpperCase()}
        </Text>
        <Text style={styles.resultBoid} numberOfLines={1}>
          {boidText}
        </Text>
        {showStatusLine && statusMessage ? (
          <Text
            style={[
              styles.resultMsg,
              {
                color: isChecking ? colors.textMuted : statusColor,
              },
            ]}
            numberOfLines={2}
          >
            {statusMessage}
          </Text>
        ) : null}
      </View>
      <Pressable
        style={styles.resultCheckBtn}
        onPress={() => onCheckOne(account)}
        disabled={running || !hasSelected}
      >
        <Text style={styles.resultCheckText}>Check</Text>
      </Pressable>
    </View>
  );
});

type AccountPickerRowProps = {
  account: AccountMeta;
  selected: boolean;
  onToggle: (account: AccountMeta) => void;
  styles: ResultCardStyles;
  colors: ThemeColors;
};

const AccountPickerRow = React.memo(function AccountPickerRow({
  account,
  selected,
  onToggle,
  styles,
  colors,
}: AccountPickerRowProps) {
  const boid = resolveBoidSync(account) ?? account.demat;
  return (
    <Pressable style={styles.modalRow} onPress={() => onToggle(account)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.modalRowTitle}>{account.name.toUpperCase()}</Text>
        <Text style={styles.modalRowSub}>
          {boid ? maskBoid(boid) : account.username}
        </Text>
      </View>
      <Ionicons
        name={selected ? 'checkbox' : 'square-outline'}
        size={rs(22)}
        color={selected ? colors.primary : colors.textMuted}
      />
    </Pressable>
  );
});

export function PublicIpoResultScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { updateAccountMeta } = useAccounts();
  const { usableAccounts: accounts } = useActiveAccounts();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const ready = useAfterInteractions();
  const bridgeRef = useRef<IpoResultWebBridgeHandle | null>(null);
  const ocrRef = useRef<CaptchaOcrHandle | null>(null);

  const [companies, setCompanies] = useState<IssueManagerCompany[]>([]);
  const [selected, setSelected] = useState<IssueManagerCompany | null>(null);
  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingCdsc, setLoadingCdsc] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [checkingIds, setCheckingIds] = useState<Set<string>>(() => new Set());
  const [checkComplete, setCheckComplete] = useState(false);
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partialWarn, setPartialWarn] = useState<string | null>(null);
  const [providerErrors, setProviderErrors] = useState<ProviderLoadError[]>([]);
  const [hideBoids, setHideBoids] = useState(false);
  const [resultsMap, setResultsMap] = useState<Record<string, ResultRow>>({});
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [accountPickerFilter, setAccountPickerFilter] = useState('');
  const managerCompaniesRef = useRef<IssueManagerCompany[]>([]);
  const companyKeysRef = useRef<Set<string>>(new Set());
  const userPickedCompanyRef = useRef(false);
  const lastCdscPollRef = useRef(0);

  const resolvePickerSelection = useCallback(
    (
      merged: IssueManagerCompany[],
      prev: IssueManagerCompany | null,
      preferNewest: boolean,
    ): IssueManagerCompany | null => {
      if (!merged.length) return null;
      const newest = pickNewestIpoCompany(merged);
      if ((preferNewest || !userPickedCompanyRef.current) && newest) {
        return newest;
      }
      if (prev) {
        const still = merged.find((c) => c.key === prev.key);
        if (still) return still;
      }
      return newest;
    },
    [],
  );

  const applyMergedCompanies = useCallback(
    (
      managers: IssueManagerCompany[],
      cdscExtras: IssueManagerCompany[],
      phoneExtras: IssueManagerCompany[],
      preferNewest: boolean,
    ) => {
      const merged = mergeIpoCompanyLists(managers, cdscExtras, phoneExtras);
      const newPublished = detectNewlyPublishedCompanies(
        companyKeysRef.current,
        merged,
      );
      const pickNew =
        preferNewest ||
        newPublished.length > 0 ||
        !userPickedCompanyRef.current;

      setCompanies(merged);
      setSelected((prev) => resolvePickerSelection(merged, prev, pickNew));
      companyKeysRef.current = new Set(merged.map((c) => c.key));
      return merged;
    },
    [resolvePickerSelection],
  );

  const addChecking = useCallback((id: string) => {
    setCheckingIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const removeChecking = useCallback((id: string) => {
    setCheckingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

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

  const filteredPickerAccounts = useMemo(() => {
    const q = accountPickerFilter.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (a.demat && a.demat.includes(q)),
    );
  }, [accounts, accountPickerFilter]);

  const hasCdscCompanies = useMemo(
    () => companies.some((c) => c.provider === 'cdsc'),
    [companies],
  );

  const loadCdscPhoneCompanies = useCallback(
    async (managerCompanies: IssueManagerCompany[]) => {
      const bridge = bridgeRef.current;
      if (!bridge) {
        throw new Error('CDSC phone bridge is not ready yet.');
      }
      const home = await loadPublicHomeViaBridge(bridge);
      const phoneCompanies: IssueManagerCompany[] = home.companies.map((c) => {
        const listedAt =
          typeof c.listedAt === 'number'
            ? Math.floor(Date.now() / 1000) + c.listedAt
            : undefined;
        return {
          key: `cdsc:${c.id}`,
          provider: 'cdsc',
          rawId: String(c.id),
          name: c.name.trim(),
          providerLabel: 'CDSC portal (this phone)',
          scrip: c.scrip?.trim() || undefined,
          listedAt,
        };
      });
      const managerAliases = buildManagerAliasSet(managerCompanies);
      return filterCdscOnlyCompanies(phoneCompanies, managerAliases);
    },
    [],
  );

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

  const refreshCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    setLoadingCdsc(false);
    setLoadError(null);
    setPartialWarn(null);
    setProviderErrors([]);
    setProgress('Loading from 11 issue managers…');

    let primary: CompanyLoadResult | undefined;
    try {
      primary = await loadIssueManagerCompanies();
      managerCompaniesRef.current = primary.companies;
      applyMergedCompanies(primary.companies, [], [], false);
      setProviderErrors(primary.errors);

      if (!primary.companies.length) {
        const detail = primary.errors
          .map((e) => `${e.label}: ${e.message}`)
          .join('\n');
        setLoadError(
          detail ||
            `No IPO results listed yet on the ${ISSUE_MANAGERS.length} live issue managers.`,
        );
      } else if (primary.errors.length) {
        setPartialWarn('Some issue-manager sources are temporarily offline.');
      }
    } catch (e) {
      setCompanies([]);
      setSelected(null);
      setProviderErrors([]);
      setLoadError(
        e instanceof Error ? e.message : 'Failed to load company list',
      );
      setProgress('');
      setLoadingCompanies(false);
      return;
    }

    setLoadingCompanies(false);

    if (!isCdscBackendConfigured()) {
      setProgress('');
      return;
    }

    setLoadingCdsc(true);
    setProgress('Loading latest CDSC results from cache…');
    let cdscExtras: IssueManagerCompany[] = [];
    try {
      const fallback = await loadCdscFallbackCompanies(primary!.companies);
      setProviderErrors((prev) => [...prev, ...fallback.errors]);
      cdscExtras = fallback.companies;
      if (fallback.companies.length) {
        applyMergedCompanies(primary!.companies, fallback.companies, [], false);
        setPartialWarn(
          `${fallback.companies.length} CDSC IPO(s) merged (newest shown first).`,
        );
      } else if (fallback.errors.length) {
        setPartialWarn('CDSC cache unavailable, trying this phone instead.');
      }
    } catch {
      setPartialWarn('CDSC cache unavailable, trying this phone instead.');
    }

    const tryPhoneCdsc = !cdscExtras.length && bridgeReady;
    if (tryPhoneCdsc) {
      try {
        const phoneFallback = await loadCdscPhoneCompanies(primary!.companies);
        if (phoneFallback.length) {
          applyMergedCompanies(
            primary!.companies,
            cdscExtras,
            phoneFallback,
            false,
          );
          setPartialWarn(
            `${phoneFallback.length} CDSC-only IPO(s) loaded from this phone.`,
          );
        }
      } catch (e) {
        setPartialWarn(
          `CDSC on this phone is not ready yet: ${e instanceof Error ? e.message : 'unknown error'}.`,
        );
      }
    }

    setLoadingCdsc(false);
    setProgress('');
  }, [applyMergedCompanies, bridgeReady, loadCdscPhoneCompanies]);

  /** Light poll: VPS cache only (no phone WebView) — picks up newly published CDSC results. */
  const refreshCdscFromCache = useCallback(async () => {
    if (!isCdscBackendConfigured() || running) return;
    const managers = managerCompaniesRef.current;
    if (!managers.length) return;

    try {
      const fallback = await loadCdscFallbackCompanies(managers);
      if (!fallback.companies.length && !fallback.errors.length) return;
      applyMergedCompanies(managers, fallback.companies, [], true);
      if (fallback.companies.length) {
        setPartialWarn('IPO list updated with the latest CDSC results.');
      }
    } catch {
      // Keep current list — never force a phone CDSC pull from background poll.
    }
  }, [applyMergedCompanies, running]);

  // Shell paints first; issue-manager fan-out waits for the stack transition.
  useEffect(() => {
    if (!ready) return;
    void refreshCompanies();
  }, [ready, refreshCompanies]);

  useFocusEffect(
    useCallback(() => {
      if (!ready || running) return;
      const now = Date.now();
      if (now - lastCdscPollRef.current < 5 * 60 * 1000) return;
      lastCdscPollRef.current = now;
      void refreshCdscFromCache();
    }, [ready, running, refreshCdscFromCache]),
  );

  useEffect(() => {
    if (!ready || !bridgeReady || running) return;
    if (hasCdscCompanies) return;
    const managers = managerCompaniesRef.current;
    if (!managers.length) return;
    void (async () => {
      try {
        const phoneFallback = await loadCdscPhoneCompanies(managers);
        if (!phoneFallback.length) return;
        applyMergedCompanies(managers, [], phoneFallback, true);
        setPartialWarn(
          `${phoneFallback.length} CDSC IPO(s) loaded from this phone.`,
        );
      } catch (e) {
        setPartialWarn(
          `CDSC on this phone is not ready yet: ${e instanceof Error ? e.message : 'unknown error'}.`,
        );
      }
    })();
  }, [
    applyMergedCompanies,
    bridgeReady,
    hasCdscCompanies,
    loadCdscPhoneCompanies,
    ready,
    running,
  ]);

  useEffect(() => {
    setResultsMap({});
    setSummary(null);
    setResultModalOpen(false);
    setCheckComplete(false);
    setCheckingIds(new Set());
  }, [selected?.key]);

  const runCdscBridgeCheck = useCallback(
    async (
      queue: AccountMeta[],
      opts?: { resetSessionFirst?: boolean },
    ) => {
      const bridge = bridgeRef.current;
      const ocr = ocrRef.current;
      if (!selected) {
        throw new Error('Select a CDSC company first.');
      }
      if (!bridge || !ocr) {
        throw new Error('CDSC in-app checker is not ready yet. Retry in a moment.');
      }

      if (opts?.resetSessionFirst && bridge.resetSession) {
        setProgress('Refreshing CDSC session before retry…');
        await bridge.resetSession(90000);
        await new Promise((r) => setTimeout(r, 3000));
      }

      setProgress('Preparing CDSC in-app session…');
      const home = await loadPublicHomeViaBridge(bridge);
      const liveCompany = home.companies.find(
        (c) => String(c.id) === String(selected.rawId),
      );
      if (!liveCompany) {
        throw new Error(
          'This CDSC company is not visible in the current phone session yet. Refresh and try again.',
        );
      }

      return runPublicBulkResultCheck({
        bridge,
        ocr,
        accounts: queue,
        company: liveCompany,
        captcha: home.captcha,
        onProgress: (msg) => {
          setProgress(msg);
        },
        onAccountStart: (accountId) => {
          addChecking(accountId);
        },
        onAccountResult: (row) => {
          removeChecking(row.accountId);
          setResultsMap((prev) => ({ ...prev, [row.accountId]: row }));
        },
      });
    },
    [selected, addChecking, removeChecking],
  );

  const toggleCheckAccount = useCallback(
    (account: AccountMeta) => {
      setCheckAccountIds((prev) =>
        toggleCheckAccountId(accounts, prev, account.id),
      );
    },
    [accounts],
  );

  const runCheck = useCallback(
    (
      targets: AccountMeta[],
      openModal: boolean,
      opts?: { resetSessionFirst?: boolean },
    ) => {
      if (!selected) {
        Alert.alert(
          'Not ready',
          loadError ?? 'Wait for the company list to load, then retry.',
        );
        return;
      }
      if (targets.length === 0) {
        Alert.alert('No accounts', 'Select at least one account to check.');
        return;
      }

      const queue = targets.slice();
      void sensitive.requestSensitiveAction(
        async () => {
          setRunning(true);
          setCheckComplete(false);
          setProgress('Starting…');
          setCheckingIds(new Set());
          // Clear only the accounts we're about to re-check.
          setResultsMap((prev) => {
            const next = { ...prev };
            for (const a of queue) delete next[a.id];
            return next;
          });
          try {
            void Promise.all(
              queue.map(async (a) => {
                const built = resolveBoidSync(a);
                if (built && a.demat !== built) {
                  await updateAccountMeta(a.id, {
                    demat: built,
                    boidHint: built.slice(-4),
                  });
                }
              }),
            );

            const result =
              selected.provider === 'cdsc'
                ? await runCdscBridgeCheck(queue, {
                    resetSessionFirst: opts?.resetSessionFirst,
                  })
                : await runIssueManagerBulkCheck({
                    accounts: queue,
                    company: selected,
                    onProgress: (msg) => {
                      setProgress(msg);
                    },
                    onAccountStart: (accountId) => {
                      addChecking(accountId);
                    },
                    onAccountResult: (row) => {
                      removeChecking(row.accountId);
                      setResultsMap((prev) => ({
                        ...prev,
                        [row.accountId]: row,
                      }));
                    },
                  });
            setSummary(result);
            setCheckComplete(true);
            if (openModal) setResultModalOpen(true);
          } catch (e) {
            Alert.alert(
              'Check failed',
              e instanceof Error ? e.message : 'Unknown error',
            );
          } finally {
            setRunning(false);
            setProgress('');
            setCheckingIds(new Set());
          }
        },
        { pinPolicy: 'skipIfUnlocked' },
      );
    },
    [
      loadError,
      selected,
      sensitive,
      updateAccountMeta,
      addChecking,
      removeChecking,
      runCdscBridgeCheck,
    ],
  );

  const onCheckAll = useCallback(() => {
    runCheck(checkAccounts, true);
  }, [checkAccounts, runCheck]);

  const onCheckOne = useCallback(
    (account: AccountMeta) => {
      runCheck([account], true);
    },
    [runCheck],
  );

  const retriableFailedAccounts = useMemo(
    () =>
      checkAccounts.filter((account) => {
        const row = resultsMap[account.id];
        return row && !row.ok && isRetriableCdscError(row.message);
      }),
    [checkAccounts, resultsMap],
  );

  const onRecheckFailed = useCallback(() => {
    if (retriableFailedAccounts.length === 0) {
      Alert.alert(
        'No retryable errors',
        'Failed accounts need manual review, or errors are not from CDSC session limits.',
      );
      return;
    }
    runCheck(retriableFailedAccounts, false, {
      resetSessionFirst: selected?.provider === 'cdsc',
    });
  }, [retriableFailedAccounts, runCheck, selected?.provider]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCompanies();
    } finally {
      setRefreshing(false);
    }
  }, [refreshCompanies]);

  const displayRows = useMemo(
    () =>
      checkAccounts.map((account, idx) => ({
        account,
        index: idx + 1,
        result: resultsMap[account.id],
      })),
    [checkAccounts, resultsMap],
  );

  const allottedCount = useMemo(
    () => displayRows.filter((row) => row.result?.ok && row.result.allotted).length,
    [displayRows],
  );
  const notAllottedCount = useMemo(
    () => displayRows.filter((row) => row.result?.ok && !row.result.allotted).length,
    [displayRows],
  );
  const failedCount = useMemo(
    () => displayRows.filter((row) => row.result && !row.result.ok).length,
    [displayRows],
  );

  const checkedProgress = useMemo(
    () => Object.keys(resultsMap).length,
    [resultsMap],
  );

  const progressPct =
    checkAccounts.length > 0
      ? Math.min(100, (checkedProgress / checkAccounts.length) * 100)
      : 0;

  const showSummary =
    checkComplete && !running && Object.keys(resultsMap).length > 0;
  const modalAllotted =
    summary?.results.filter((r) => r.ok && r.allotted).length ?? allottedCount;
  const modalTotal = summary?.results.length ?? checkAccounts.length;

  const shareSummary = useCallback(async () => {
    const company = selected?.name ?? summary?.companyName ?? 'IPO';
    const lines = displayRows.map((row) => {
      const r = row.result;
      const status = !r
        ? 'Not checked'
        : !r.ok
          ? `Error: ${r.message}`
          : r.allotted
            ? `Alloted${r.quantity != null ? ` (${r.quantity})` : ''}`
            : r.message || 'Not alloted';
      return `${row.index}. ${row.account.name}: ${status}`;
    });
    const message = [
      `NEPSE GHAR — IPO Result`,
      company,
      `Alloted ${modalAllotted} / ${modalTotal}`,
      '',
      ...lines,
    ].join('\n');
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('Share', message);
    }
  }, [
    displayRows,
    modalAllotted,
    modalTotal,
    selected?.name,
    summary?.companyName,
  ]);

  const resultHeadline =
    modalAllotted > 0
      ? `Congratulations! 🎉`
      : 'Better luck next time! 😔';

  const resultSubtext =
    modalAllotted > 0
      ? `You were alloted in ${modalAllotted} of ${modalTotal} account${modalTotal === 1 ? '' : 's'}.`
      : modalTotal === 1
        ? 'Unfortunately, you were not alloted in your account.'
        : 'Unfortunately, you were not alloted in any of your accounts.';

  const checkLabel =
    allAccountsSelected
      ? 'Select Category (All Accounts)'
      : checkAccounts.length === 1
        ? `${checkAccounts[0].name.toUpperCase()} - ${checkAccounts[0].username}`
        : `Select Category (${checkAccounts.length} accounts)`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>IPO Result</Text>
        <Pressable onPress={() => setHideBoids((v) => !v)} hitSlop={10}>
          <Ionicons
            name={hideBoids ? 'eye-off-outline' : 'eye-outline'}
            size={rs(22)}
            color={colors.text}
          />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      <View style={styles.controls}>
        <Pressable
          style={styles.companyPicker}
          onPress={() => setCheckPickerOpen(true)}
          disabled={!accounts.length || running}
        >
          <Text style={styles.companyPickerText} numberOfLines={1}>
            {checkLabel}
          </Text>
          <Ionicons name="chevron-down" size={rs(16)} color={colors.textMuted} />
        </Pressable>

        <Pressable
          style={styles.companyPicker}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingCompanies || companies.length === 0 || running}
        >
          <Text style={styles.companyPickerText} numberOfLines={1}>
            {selected ? selected.name : 'Select IPO / FPO / Debenture'}
          </Text>
          {loadingCompanies || loadingCdsc ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-down" size={rs(16)} color={colors.textMuted} />
          )}
        </Pressable>

        {running ? (
          <View style={styles.checkingBlock}>
            <View style={styles.checkingHead}>
              <View style={styles.checkingIconWrap}>
                <MaterialCommunityIcons
                  name="cached"
                  size={rs(16)}
                  color="#FFFFFF"
                />
              </View>
              <Text style={styles.checkingTitle}>Checking IPO Status.</Text>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
            <Text style={styles.progressLabel}>
              Progress: {checkedProgress} of {checkAccounts.length}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progressPct}%` }]}
              />
            </View>
            <View style={styles.infoBox}>
              <Ionicons
                name="information-circle-outline"
                size={rs(16)}
                color={colors.textMuted}
              />
              <Text style={styles.infoBoxText}>
                Please wait while we are checking your demat accounts…
              </Text>
            </View>
            <View style={styles.checkNowBtnDisabled}>
              <Text style={styles.checkingNowText}>Checking Now...</Text>
            </View>
          </View>
        ) : (
          <Pressable
            style={[
              styles.checkNowBtn,
              (running || !selected) && styles.checkNowDisabled,
            ]}
            onPress={onCheckAll}
            disabled={running || !selected}
          >
            <Text style={styles.checkNowText}>Check Now</Text>
          </Pressable>
        )}

        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {showSummary ? (
          <View style={styles.summaryBox}>
            <View style={styles.summaryHead}>
              <View style={styles.summaryTitleRow}>
                <MaterialCommunityIcons
                  name="chart-bar"
                  size={rs(14)}
                  color={colors.textSecondary}
                />
                <Text style={styles.summaryHeadTitle}>Summary</Text>
              </View>
              <Text style={styles.summaryTotal}>
                Total: {Object.keys(resultsMap).length || checkAccounts.length}
              </Text>
            </View>

            <View style={styles.statRow}>
              <View style={[styles.statCard, styles.statAllotted]}>
                <Ionicons name="checkmark-circle" size={rs(16)} color="#66BB6A" />
                <Text style={[styles.statNum, { color: '#66BB6A' }]}>
                  {allottedCount}
                </Text>
                <Text style={[styles.statLabel, { color: '#66BB6A' }]}>
                  Alloted
                </Text>
              </View>
              <View style={[styles.statCard, styles.statNotAllotted]}>
                <Ionicons name="alert-circle" size={rs(16)} color="#E57373" />
                <Text style={[styles.statNum, { color: '#E57373' }]}>
                  {notAllottedCount}
                </Text>
                <Text style={[styles.statLabel, { color: '#E57373' }]}>
                  Not Alloted
                </Text>
              </View>
              <View style={[styles.statCard, styles.statErrors]}>
                <Ionicons name="warning" size={rs(16)} color="#FB8C00" />
                <Text style={[styles.statNum, { color: '#FB8C00' }]}>
                  {failedCount}
                </Text>
                <Text style={[styles.statLabel, { color: '#FB8C00' }]}>
                  Errors
                </Text>
              </View>
            </View>

            {failedCount > 0 ? (
              <View style={styles.retryBox}>
                <Text style={styles.retryText}>
                  {retriableFailedAccounts.length > 0
                    ? `${retriableFailedAccounts.length} account${retriableFailedAccounts.length === 1 ? '' : 's'} failed (often a short CDSC pause after ~200 checks). Re-check only those errors — no need to run the full list again.`
                    : `${failedCount} account${failedCount === 1 ? '' : 's'} failed with errors that may need manual review.`}
                </Text>
                {retriableFailedAccounts.length > 0 ? (
                  <Pressable
                    style={styles.retryBtn}
                    onPress={onRecheckFailed}
                    disabled={running}
                  >
                    <MaterialCommunityIcons
                      name="refresh"
                      size={rs(16)}
                      color={isDark ? '#FFFFFF' : '#2D5A27'}
                    />
                    <Text style={styles.retryBtnText}>
                      Re-check {retriableFailedAccounts.length} failed account
                      {retriableFailedAccounts.length === 1 ? '' : 's'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <FlatList
        style={styles.accountList}
        contentContainerStyle={styles.accountListContent}
        data={displayRows}
        keyExtractor={(item) => item.account.id}
        {...ACCOUNT_LIST_FLAT_PROPS}
        extraData={checkingIds}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item: { account, index, result } }) => (
          <AccountResultRow
            account={account}
            index={index}
            result={result}
            isChecking={checkingIds.has(account.id)}
            hideBoids={hideBoids}
            running={running}
            hasSelected={Boolean(selected)}
            onCheckOne={onCheckOne}
            styles={styles}
            colors={colors}
          />
        )}
      />

      <Modal
        visible={companyPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCompanyPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCompanyPickerOpen(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Text style={styles.modalTitle}>Select company</Text>
            <FlatList
              style={styles.modalList}
              data={companies}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              initialNumToRender={16}
              maxToRenderPerBatch={12}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    userPickedCompanyRef.current = true;
                    setSelected(item);
                    setCompanyPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {selected?.key === item.key ? (
                    <Ionicons
                      name="checkmark"
                      size={rs(20)}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

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
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setCheckPickerOpen(false);
              setAccountPickerFilter('');
            }}
          />
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
                <Ionicons name="checkmark" size={rs(20)} color={colors.primary} />
              ) : null}
            </Pressable>
            <FlatList
              style={styles.modalList}
              data={filteredPickerAccounts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              {...ACCOUNT_LIST_FLAT_PROPS}
              renderItem={({ item }) => (
                <AccountPickerRow
                  account={item}
                  selected={isCheckAccountSelected(item.id, checkAccountIdSet)}
                  onToggle={toggleCheckAccount}
                  styles={styles}
                  colors={colors}
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
      <SensitiveActionModals action={sensitive} />
      <CaptchaOcrBridge ref={ocrRef} />
      {/*
        Mounted as soon as the screen opens: the WebView needs this head start
        to load CDSC and clear its WAF JS challenge before the first check.
      */}
      <IpoResultWebBridge
        ref={bridgeRef}
        interactive={false}
        onReadyChange={setBridgeReady}
        onPortalBlocked={(reason) => {
          // Bulk CDSC checks recover internally — don't flash WAF in the header.
          if (running) return;
          setProgress(reason);
        }}
      />

      <Modal
        visible={resultModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setResultModalOpen(false)}
      >
        <View style={styles.resultModalBackdrop}>
          <View style={styles.resultModalCard}>
            <View style={styles.resultModalIconWrap}>
              <MaterialCommunityIcons
                name="chart-line"
                size={rs(34)}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.resultModalBrand}>NEPSE GHAR</Text>
            <Text
              style={[
                styles.resultModalHeadline,
                { color: modalAllotted > 0 ? '#81C784' : '#EF9A9A' },
              ]}
            >
              {resultHeadline}
            </Text>
            <Text style={styles.resultModalCompany} numberOfLines={2}>
              {selected?.name ?? summary?.companyName ?? 'Selected IPO'}
            </Text>
            <View style={styles.resultModalScoreBox}>
              <Text style={styles.resultModalScore}>
                {modalAllotted} / {modalTotal}
              </Text>
              <Text style={styles.resultModalScoreLabel}>Accounts Alloted</Text>
            </View>
            <Text style={styles.resultModalDesc}>{resultSubtext}</Text>
            <View style={styles.resultModalActions}>
              <Pressable
                style={styles.resultModalBtn}
                onPress={() => setResultModalOpen(false)}
              >
                <Text style={styles.resultModalBtnText}>Close</Text>
              </Pressable>
              <Pressable
                style={styles.resultModalBtn}
                onPress={() => void shareSummary()}
              >
                <Text style={styles.resultModalBtnText}>Share</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const pageBg = isDark ? c.bg : '#F2F4ED';
  const cardBg = isDark ? c.surface : '#F9F8F4';
  const fieldBorder = isDark ? c.border : '#B8B8B8';
  const cardBorder = isDark ? c.borderMuted : '#E0E0E0';
  const mutedText = isDark ? c.textMuted : '#757575';
  const checkBtnBg = isDark ? '#0A3A14' : '#F0EEEA';
  const forestGreen = isDark ? '#FFFFFF' : '#2D5A27';
  const checkBtnBorder = isDark ? '#06280E' : cardBorder;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: pageBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      backgroundColor: pageBg,
    },
    title: {
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
      marginHorizontal: rs(8),
    },
    controls: {
      paddingHorizontal: rs(16),
      paddingTop: rs(6),
      paddingBottom: rs(4),
    },
    accountList: { flex: 1 },
    accountListContent: {
      paddingHorizontal: rs(16),
      paddingTop: rs(8),
      paddingBottom: rs(40),
    },
    companyPicker: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: fieldBorder,
      borderRadius: rs(18),
      paddingHorizontal: rs(12),
      paddingVertical: rs(9),
      backgroundColor: cardBg,
      marginBottom: rs(8),
      gap: rs(8),
      minHeight: rs(40),
    },
    companyPickerText: {
      flex: 1,
      color: c.text,
      fontWeight: '500',
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    summaryBox: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      padding: rs(8),
      marginBottom: rs(12),
      backgroundColor: 'transparent',
    },
    summaryHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(6),
    },
    summaryTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
    },
    summaryHeadTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(12),
    },
    summaryTotal: {
      color: c.textSecondary,
      fontSize: rs(11),
      fontWeight: '600',
    },
    statRow: {
      flexDirection: 'row',
      gap: rs(6),
    },
    statCard: {
      flex: 1,
      borderRadius: rs(8),
      borderWidth: 1,
      paddingVertical: rs(6),
      alignItems: 'center',
      gap: rs(2),
      backgroundColor: c.surface,
    },
    statAllotted: { borderColor: 'rgba(102,187,106,0.45)' },
    statNotAllotted: { borderColor: 'rgba(229,115,115,0.45)' },
    statErrors: { borderColor: 'rgba(251,140,0,0.45)' },
    statNum: { fontWeight: '800', fontSize: rs(15) },
    statLabel: { fontSize: rs(10), fontWeight: '600' },
    retryBox: {
      marginTop: rs(10),
      padding: rs(10),
      borderRadius: rs(8),
      borderWidth: 1,
      borderColor: 'rgba(251,140,0,0.35)',
      backgroundColor: isDark ? c.surfaceAlt : '#FFF8E6',
      gap: rs(8),
    },
    retryText: {
      color: c.textSecondary,
      fontSize: rs(11),
      lineHeight: rs(16),
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      borderWidth: 1,
      borderColor: checkBtnBorder,
      borderRadius: rs(16),
      paddingVertical: rs(8),
      paddingHorizontal: rs(12),
      backgroundColor: checkBtnBg,
    },
    retryBtnText: {
      color: forestGreen,
      fontWeight: '700',
      fontSize: rs(12),
    },
    checkNowBtn: {
      borderWidth: 1,
      borderColor: checkBtnBorder,
      borderRadius: rs(20),
      minHeight: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(8),
      backgroundColor: checkBtnBg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 3,
      elevation: isDark ? 0 : 2,
    },
    checkNowDisabled: { opacity: 0.55 },
    checkNowText: {
      color: forestGreen,
      fontWeight: '700',
      fontSize: rs(13),
    },
    checkingBlock: {
      marginBottom: rs(8),
    },
    checkingHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(8),
    },
    checkingIconWrap: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: '#4CAF50',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkingTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '600',
      fontSize: rs(14),
    },
    progressLabel: {
      color: mutedText,
      fontSize: rs(12),
      marginBottom: rs(6),
    },
    progressTrack: {
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: isDark ? c.surfaceAlt : '#E8E8E8',
      marginBottom: rs(10),
      overflow: 'hidden',
    },
    progressFill: {
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: '#4CAF50',
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
      backgroundColor: isDark ? c.surfaceAlt : '#F0F0F0',
      borderRadius: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      marginBottom: rs(10),
    },
    infoBoxText: {
      flex: 1,
      color: mutedText,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    checkNowBtnDisabled: {
      borderWidth: 1,
      borderColor: isDark ? '#06280E' : cardBorder,
      borderRadius: rs(20),
      minHeight: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#0A3A14' : '#F0EEEA',
    },
    checkingNowText: {
      color: isDark ? 'rgba(255,255,255,0.7)' : mutedText,
      fontWeight: '600',
      fontSize: rs(13),
    },
    warnText: {
      color: '#FB8C00',
      fontSize: rs(11),
      marginBottom: rs(10),
      lineHeight: rs(16),
    },
    errorText: {
      color: c.danger,
      fontSize: rs(11),
      marginBottom: rs(10),
      lineHeight: rs(16),
    },
    resultCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: rs(10),
      paddingHorizontal: rs(10),
      paddingVertical: rs(10),
      minHeight: rs(66),
      backgroundColor: cardBg,
      marginBottom: rs(6),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 2,
      elevation: isDark ? 0 : 1,
    },
    resultIconWrap: {
      width: rs(30),
      height: rs(30),
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    resultBody: { flex: 1, minWidth: 0, paddingTop: rs(1) },
    resultName: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      lineHeight: rs(18),
      letterSpacing: 0.15,
    },
    resultBoid: {
      color: isDark ? c.textSecondary : '#4A4A4A',
      fontSize: rs(11),
      lineHeight: rs(15),
      marginTop: rs(2),
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },
    resultMsg: {
      fontSize: rs(11),
      lineHeight: rs(15),
      marginTop: rs(3),
      fontWeight: '600',
    },
    resultCheckBtn: {
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: rs(6),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      backgroundColor: checkBtnBg,
      alignSelf: 'center',
    },
    resultCheckText: {
      color: c.text,
      fontWeight: '600',
      fontSize: rs(11),
    },
    resultModalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: rs(24),
    },
    resultModalCard: {
      width: '100%',
      maxWidth: rs(340),
      borderRadius: rs(18),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: rs(22),
      alignItems: 'center',
    },
    resultModalIconWrap: {
      width: rs(72),
      height: rs(72),
      borderRadius: rs(16),
      backgroundColor: '#1565C0',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(12),
    },
    resultModalBrand: {
      color: '#81C784',
      fontWeight: '800',
      fontSize: rs(18),
      marginBottom: rs(8),
    },
    resultModalHeadline: {
      fontWeight: '800',
      fontSize: rs(16),
      marginBottom: rs(8),
      textAlign: 'center',
    },
    resultModalCompany: {
      color: c.textSecondary,
      fontSize: rs(12),
      textAlign: 'center',
      marginBottom: rs(14),
      lineHeight: rs(17),
    },
    resultModalScoreBox: {
      width: '100%',
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: 'rgba(129,199,132,0.35)',
      backgroundColor: c.primarySoft,
      paddingVertical: rs(14),
      alignItems: 'center',
      marginBottom: rs(12),
    },
    resultModalScore: {
      color: '#81C784',
      fontWeight: '800',
      fontSize: rs(28),
    },
    resultModalScoreLabel: {
      color: '#81C784',
      fontSize: rs(12),
      fontWeight: '600',
      marginTop: rs(2),
    },
    resultModalDesc: {
      color: c.textSecondary,
      fontSize: rs(13),
      textAlign: 'center',
      lineHeight: rs(19),
      marginBottom: rs(16),
    },
    resultModalActions: {
      flexDirection: 'row',
      gap: rs(10),
      width: '100%',
    },
    resultModalBtn: {
      flex: 1,
      backgroundColor: '#81C784',
      borderRadius: rs(22),
      paddingVertical: rs(12),
      alignItems: 'center',
    },
    resultModalBtnText: {
      color: '#1B1B1B',
      fontWeight: '800',
      fontSize: rs(14),
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      height: '78%',
      maxHeight: '85%',
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(16),
      paddingTop: rs(16),
    },
    modalList: {
      flex: 1,
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginBottom: rs(10),
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
    modalRowTitle: {
      color: c.text,
      fontWeight: '600',
      fontSize: rs(14),
    },
    modalRowBody: { flex: 1 },
    modalRowSub: { color: c.textMuted, fontSize: rs(12), marginTop: rs(2) },
    modalDone: {
      marginTop: rs(8),
      alignItems: 'center',
      paddingVertical: rs(12),
    },
    modalDoneText: { color: c.primary, fontWeight: '800', fontSize: rs(15) },
  });
}
