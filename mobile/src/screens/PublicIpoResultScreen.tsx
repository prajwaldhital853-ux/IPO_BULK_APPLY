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
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from '../context/AccountsContext';
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
import { maskBoid, resolveBoidSync } from '../utils/boid';
import { rs } from '../utils/responsive';
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
  loadPublicHomeViaBridge,
  runPublicBulkResultCheck,
  type PublicBulkResultRow,
  type PublicBulkResultSummary,
} from '../services/iporesult/bulkEngine';

type ProviderLoadError = { provider: string; label: string; message: string };
type ResultRow = IssueManagerBulkRow | PublicBulkResultRow;
type BulkSummary = IssueManagerBulkSummary | PublicBulkResultSummary;

export function PublicIpoResultScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts, updateAccountMeta } = useAccounts();
  const { colors } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bridgeRef = useRef<IpoResultWebBridgeHandle | null>(null);
  const ocrRef = useRef<CaptchaOcrHandle | null>(null);

  const [companies, setCompanies] = useState<IssueManagerCompany[]>([]);
  const [selected, setSelected] = useState<IssueManagerCompany | null>(null);
  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingCdsc, setLoadingCdsc] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [checkingId, setCheckingId] = useState<string | null>(null);
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

  const checkAccounts = useMemo(() => {
    const selectedSet = new Set(
      checkAccountIds.length ? checkAccountIds : accounts.map((a) => a.id),
    );
    return accounts.filter((a) => selectedSet.has(a.id));
  }, [accounts, checkAccountIds]);
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
      const phoneCompanies: IssueManagerCompany[] = home.companies.map((c) => ({
        key: `cdsc:${c.id}`,
        provider: 'cdsc',
        rawId: String(c.id),
        name: c.name.trim(),
        providerLabel: 'CDSC portal (this phone)',
        scrip: c.scrip?.trim() || undefined,
      }));
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
      return valid.length ? valid : accounts.map((a) => a.id);
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
      const loaded = primary;
      setCompanies(loaded.companies);
      setProviderErrors(loaded.errors);
      setSelected((prev) => {
        const still = prev
          ? loaded.companies.find((c) => c.key === prev.key)
          : null;
        // Keep a previously selected CDSC-only company while fallback sources
        // are still loading; otherwise the picker jumps back to the first
        // issue-manager company during background refresh/recovery.
        return still ?? prev ?? loaded.companies[0] ?? null;
      });

      if (!loaded.companies.length) {
        const detail = loaded.errors
          .map((e) => `${e.label}: ${e.message}`)
          .join('\n');
        setLoadError(
          detail ||
            `No IPO results listed yet on the ${ISSUE_MANAGERS.length} live issue managers.`,
        );
      } else if (loaded.errors.length) {
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
    setProgress('Checking CDSC for other IPOs…');
    try {
      const fallback = await loadCdscFallbackCompanies(primary!.companies);
      setProviderErrors((prev) => [...prev, ...fallback.errors]);

      if (fallback.companies.length) {
        setCompanies((prev) => {
          const merged = [...prev, ...fallback.companies].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
          setSelected((sel) => sel ?? merged[0] ?? null);
          return merged;
        });
        setPartialWarn(
          `${fallback.companies.length} CDSC-only IPO(s) added from backend cache.`,
        );
      } else if (fallback.errors.length) {
        setPartialWarn('CDSC backend is unavailable, trying this phone instead.');
      }
    } catch (e) {
      setPartialWarn('CDSC backend fallback failed, trying this phone instead.');
    }

    if (bridgeReady) {
      try {
        const phoneFallback = await loadCdscPhoneCompanies(primary!.companies);
        if (phoneFallback.length) {
          setCompanies((prev) => {
            const seen = new Set(prev.map((c) => c.key));
            const merged = [...prev];
            for (const company of phoneFallback) {
              if (!seen.has(company.key)) {
                seen.add(company.key);
                merged.push(company);
              }
            }
            merged.sort((a, b) => a.name.localeCompare(b.name));
            setSelected((sel) => sel ?? merged[0] ?? null);
            return merged;
          });
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
  }, [bridgeReady, loadCdscPhoneCompanies]);

  useEffect(() => {
    void refreshCompanies();
  }, [refreshCompanies]);

  useEffect(() => {
    if (!bridgeReady) return;
    if (!isCdscBackendConfigured()) return;
    if (running) return;
    if (hasCdscCompanies) return;
    void refreshCompanies();
  }, [bridgeReady, hasCdscCompanies, refreshCompanies, running]);

  useEffect(() => {
    setResultsMap({});
    setSummary(null);
    setResultModalOpen(false);
    setCheckComplete(false);
    setCheckingId(null);
  }, [selected?.key]);

  const runCdscBridgeCheck = useCallback(
    async (queue: AccountMeta[]) => {
      const bridge = bridgeRef.current;
      const ocr = ocrRef.current;
      if (!selected) {
        throw new Error('Select a CDSC company first.');
      }
      if (!bridge || !ocr) {
        throw new Error('CDSC in-app checker is not ready yet. Retry in a moment.');
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
        onProgress: (msg, index) => {
          setProgress(msg);
          setCheckingId(queue[index]?.id ?? null);
        },
        onAccountResult: (row, index) => {
          setResultsMap((prev) => ({ ...prev, [row.accountId]: row }));
          setCheckingId(queue[index + 1]?.id ?? null);
        },
      });
    },
    [selected],
  );

  const toggleCheckAccount = (account: AccountMeta) => {
    setCheckAccountIds((prev) => {
      const base = prev.length ? prev : accounts.map((a) => a.id);
      if (base.includes(account.id)) {
        const next = base.filter((id) => id !== account.id);
        return next.length ? next : base;
      }
      return [...base, account.id];
    });
  };

  const runCheck = useCallback(
    (targets: AccountMeta[], openModal: boolean) => {
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
          setCheckingId(queue[0]?.id ?? null);
          // Clear only the accounts we're about to re-check.
          setResultsMap((prev) => {
            const next = { ...prev };
            for (const a of queue) delete next[a.id];
            return next;
          });
          try {
            for (const a of queue) {
              const built = resolveBoidSync(a);
              if (built && a.demat !== built) {
                await updateAccountMeta(a.id, {
                  demat: built,
                  boidHint: built.slice(-4),
                });
              }
            }

            const result =
              selected.provider === 'cdsc'
                ? await runCdscBridgeCheck(queue)
                : await runIssueManagerBulkCheck({
                    accounts: queue,
                    company: selected,
                    onProgress: (msg, index) => {
                      setProgress(msg);
                      setCheckingId(queue[index]?.id ?? null);
                    },
                    onAccountResult: (row, index) => {
                      setResultsMap((prev) => ({ ...prev, [row.accountId]: row }));
                      setCheckingId(queue[index + 1]?.id ?? null);
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
            setCheckingId(null);
          }
        },
        { pinPolicy: 'skipIfUnlocked' },
      );
    },
    [loadError, selected, sensitive, updateAccountMeta],
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

  const showSummary =
    checkComplete && !running && Object.keys(resultsMap).length > 0;
  const usesCdscBridge = selected?.provider === 'cdsc';
  const showCdscBridge = usesCdscBridge && (!bridgeReady || running);

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
    checkAccounts.length === accounts.length
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

      <View style={styles.controls}>
        <Pressable
          style={styles.companyPicker}
          onPress={() => setCheckPickerOpen(true)}
          disabled={!accounts.length}
        >
          <Text style={styles.companyPickerText} numberOfLines={1}>
            {checkLabel}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <Pressable
          style={styles.companyPicker}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingCompanies || companies.length === 0}
        >
          <Text style={styles.companyPickerText} numberOfLines={2}>
            {selected?.name ??
              (loadingCompanies
                ? 'Loading companies…'
                : 'Select IPO / FPO / Debenture')}
          </Text>
          {loadingCompanies || loadingCdsc ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
          )}
        </Pressable>

        <Pressable
          style={[
            styles.checkNowBtn,
            (running || !selected) && styles.checkNowDisabled,
          ]}
          onPress={onCheckAll}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.checkNowText}>Check Now</Text>
          )}
        </Pressable>

        {progress ? <Text style={styles.progress}>{progress}</Text> : null}

        {usesCdscBridge ? (
          <Text style={styles.progress}>
            CDSC result checks run from this phone's in-app browser session.
          </Text>
        ) : null}

        {partialWarn ? <Text style={styles.warnText}>{partialWarn}</Text> : null}

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
          </View>
        ) : null}
      </View>

      <FlatList
        style={styles.accountList}
        contentContainerStyle={styles.accountListContent}
        data={displayRows}
        keyExtractor={(item) => item.account.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item: { account, index, result } }) => {
          const isChecking = checkingId === account.id;
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
          const iconName = isChecking
            ? 'time'
            : isAllotted
              ? 'checkmark'
              : isError
                ? 'alert'
                : isNotAllotted
                  ? 'alert'
                  : 'help';
          const iconBg = isChecking
            ? colors.primary
            : isAllotted
              ? '#2E7D32'
              : isError
                ? '#EF6C00'
                : isNotAllotted
                  ? '#C62828'
                  : colors.surfaceAlt;

          return (
            <View style={styles.resultCard}>
              <View style={[styles.resultIcon, { backgroundColor: iconBg }]}>
                {isChecking ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name={iconName} size={rs(22)} color="#FFFFFF" />
                )}
              </View>
              <View style={styles.resultBody}>
                <Text style={styles.resultName}>
                  {index}. {account.name.toUpperCase()}
                </Text>
                <Text style={styles.resultBoid}>{boidText}</Text>
                {statusMessage ? (
                  <Text style={[styles.resultMsg, { color: statusColor }]}>
                    {statusMessage}
                  </Text>
                ) : null}
              </View>
              <Pressable
                style={styles.resultCheckBtn}
                onPress={() => onCheckOne(account)}
                disabled={running || !selected}
              >
                <Text style={styles.resultCheckText}>Check</Text>
              </Pressable>
            </View>
          );
        }}
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
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelected(item);
                    setCompanyPickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRowTitle}>{item.name}</Text>
                    <Text style={styles.modalRowSub}>
                      {item.providerLabel}
                    </Text>
                  </View>
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
        onRequestClose={() => setCheckPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCheckPickerOpen(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Text style={styles.modalTitle}>Select Category</Text>
            <Pressable
              style={styles.modalRow}
              onPress={() => {
                setCheckAccountIds(accounts.map((a) => a.id));
                setCheckPickerOpen(false);
              }}
            >
              <Text style={styles.modalRowTitle}>All Accounts</Text>
              {checkAccounts.length === accounts.length ? (
                <Ionicons name="checkmark" size={rs(20)} color={colors.primary} />
              ) : null}
            </Pressable>
            <FlatList
              style={styles.modalList}
              data={accounts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              renderItem={({ item }) => {
                const on = checkAccounts.some((a) => a.id === item.id);
                const boid = resolveBoidSync(item) ?? item.demat;
                return (
                  <Pressable
                    style={styles.modalRow}
                    onPress={() => toggleCheckAccount(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalRowTitle}>
                        {item.name.toUpperCase()}
                      </Text>
                      <Text style={styles.modalRowSub}>
                        {boid ? maskBoid(boid) : item.username}
                      </Text>
                    </View>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={rs(22)}
                      color={on ? colors.primary : colors.textMuted}
                    />
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={styles.modalDone}
              onPress={() => setCheckPickerOpen(false)}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <SensitiveActionModals action={sensitive} />
      <CaptchaOcrBridge ref={ocrRef} />
      <IpoResultWebBridge
        ref={bridgeRef}
        interactive={showCdscBridge}
        onReadyChange={setBridgeReady}
        onPortalBlocked={(reason) => {
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

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
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
      paddingTop: rs(16),
      paddingBottom: rs(4),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    accountList: { flex: 1 },
    accountListContent: {
      paddingHorizontal: rs(16),
      paddingTop: rs(12),
      paddingBottom: rs(40),
    },
    companyPicker: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(10),
      gap: rs(10),
    },
    companyPickerText: {
      flex: 1,
      color: c.text,
      fontWeight: '600',
      fontSize: rs(14),
      lineHeight: rs(20),
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
    checkNowBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(24),
      minHeight: rs(44),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(10),
      backgroundColor: c.surface,
    },
    checkNowDisabled: { opacity: 0.55 },
    checkNowText: {
      color: c.primary,
      fontWeight: '700',
      fontSize: rs(14),
    },
    progress: {
      textAlign: 'center',
      color: c.textSecondary,
      marginBottom: rs(10),
      fontSize: rs(12),
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
      alignItems: 'center',
      gap: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      padding: rs(12),
      backgroundColor: c.surface,
      marginBottom: rs(10),
    },
    resultIcon: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(22),
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultBody: { flex: 1 },
    resultName: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      letterSpacing: 0.3,
    },
    resultBoid: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(3),
      fontVariant: ['tabular-nums'],
    },
    resultMsg: {
      fontSize: rs(11),
      marginTop: rs(4),
      lineHeight: rs(15),
    },
    resultCheckBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(16),
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      backgroundColor: c.bg,
    },
    resultCheckText: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(12),
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
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
      gap: rs(10),
    },
    modalRowTitle: { color: c.text, fontWeight: '600', fontSize: rs(14) },
    modalRowSub: { color: c.textMuted, fontSize: rs(12), marginTop: rs(2) },
    modalDone: {
      marginTop: rs(8),
      alignItems: 'center',
      paddingVertical: rs(12),
    },
    modalDoneText: { color: c.primary, fontWeight: '800', fontSize: rs(15) },
  });
}
