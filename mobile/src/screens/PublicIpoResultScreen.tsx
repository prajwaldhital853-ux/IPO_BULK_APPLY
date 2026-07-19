import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
  catalogSortedForDisplay,
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
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

type ProviderLoadError = { provider: string; label: string; message: string };

export function PublicIpoResultScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts, updateAccountMeta } = useAccounts();
  const { colors } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [companies, setCompanies] = useState<IssueManagerCompany[]>([]);
  const [selected, setSelected] = useState<IssueManagerCompany | null>(null);
  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingCdsc, setLoadingCdsc] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<IssueManagerBulkSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partialWarn, setPartialWarn] = useState<string | null>(null);
  const [providerErrors, setProviderErrors] = useState<ProviderLoadError[]>([]);
  const [liveCount, setLiveCount] = useState(ISSUE_MANAGERS.length);
  const [hideBoids, setHideBoids] = useState(false);
  const [resultsMap, setResultsMap] = useState<Record<string, IssueManagerBulkRow>>({});
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const managersSorted = useMemo(() => catalogSortedForDisplay(), []);
  const failedProviderIds = useMemo(
    () => new Set(providerErrors.map((e) => e.provider)),
    [providerErrors],
  );

  const checkAccounts = useMemo(() => {
    const selectedSet = new Set(
      checkAccountIds.length ? checkAccountIds : accounts.map((a) => a.id),
    );
    return accounts.filter((a) => selectedSet.has(a.id));
  }, [accounts, checkAccountIds]);

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
      setCompanies(primary.companies);
      setProviderErrors(primary.errors);
      setLiveCount(ISSUE_MANAGERS.length);
      setSelected((prev) => {
        const still = prev
          ? primary.companies.find((c) => c.key === prev.key)
          : null;
        return still ?? primary.companies[0] ?? null;
      });

      if (!primary.companies.length) {
        const detail = primary.errors
          .map((e) => `${e.label}: ${e.message}`)
          .join('\n');
        setLoadError(
          detail ||
            `No IPO results listed yet on the ${ISSUE_MANAGERS.length} live issue managers.`,
        );
      } else if (primary.errors.length) {
        setPartialWarn(
          `${primary.companies.length} companies from issue managers. Offline: ${primary.errors
            .map((e) => e.label)
            .join(', ')}.`,
        );
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
        setPartialWarn((prev) => {
          const cdscNote = `${fallback.companies.length} CDSC-only IPO(s) added (not on the 11 managers).`;
          return prev ? `${prev} ${cdscNote}` : cdscNote;
        });
      } else if (fallback.errors.length) {
        setPartialWarn((prev) => {
          const cdscErr = `CDSC backend offline: ${fallback.errors[0]?.message ?? 'unreachable'}. Issue-manager IPOs still work.`;
          return prev ? `${prev} ${cdscErr}` : cdscErr;
        });
      }
    } catch (e) {
      setPartialWarn((prev) => {
        const cdscErr = `CDSC fallback failed: ${e instanceof Error ? e.message : 'unknown error'}. Issue-manager IPOs still work.`;
        return prev ? `${prev} ${cdscErr}` : cdscErr;
      });
    } finally {
      setLoadingCdsc(false);
      setProgress('');
    }
  }, []);

  useEffect(() => {
    void refreshCompanies();
  }, [refreshCompanies]);

  useEffect(() => {
    setResultsMap({});
    setSummary(null);
    setResultModalOpen(false);
  }, [selected?.key]);

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

  const mergeResults = useCallback((result: IssueManagerBulkSummary) => {
    setSummary(result);
    setResultsMap((prev) => {
      const next = { ...prev };
      for (const row of result.results) {
        next[row.accountId] = row;
      }
      return next;
    });
  }, []);

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

      void sensitive.requestSensitiveAction(
        async () => {
          setRunning(true);
          setProgress('Starting…');
          try {
            for (const a of targets) {
              const built = resolveBoidSync(a);
              if (built && a.demat !== built) {
                await updateAccountMeta(a.id, {
                  demat: built,
                  boidHint: built.slice(-4),
                });
              }
            }

            const result = await runIssueManagerBulkCheck({
              accounts: targets,
              company: selected,
              onProgress: (msg) => setProgress(msg),
            });
            mergeResults(result);
            if (openModal) setResultModalOpen(true);
          } catch (e) {
            Alert.alert(
              'Check failed',
              e instanceof Error ? e.message : 'Unknown error',
            );
          } finally {
            setRunning(false);
            setProgress('');
          }
        },
        { pinPolicy: 'skipIfUnlocked' },
      );
    },
    [loadError, mergeResults, selected, sensitive, updateAccountMeta],
  );

  const onCheckAll = useCallback(() => {
    runCheck(checkAccounts, true);
  }, [checkAccounts, runCheck]);

  const onCheckOne = useCallback(
    (account: AccountMeta) => {
      runCheck([account], false);
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
            ? `Allotted${r.quantity != null ? ` (${r.quantity})` : ''}`
            : r.message || 'Not allotted';
      return `${row.index}. ${row.account.name}: ${status}`;
    });
    const message = [
      `NEPSE GHAR — IPO Result`,
      company,
      `Allotted ${modalAllotted} / ${modalTotal}`,
      '',
      ...lines,
    ].join('\n');
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('Share', message);
    }
  }, [displayRows, modalAllotted, modalTotal, selected?.name, summary?.companyName]);

  const resultHeadline =
    modalAllotted > 0
      ? `Congratulations! 🎉`
      : 'Better luck next time! 😔';

  const resultSubtext =
    modalAllotted > 0
      ? `You were allotted in ${modalAllotted} of ${modalTotal} account${modalTotal === 1 ? '' : 's'}.`
      : modalTotal === 1
        ? 'Unfortunately, you were not allotted in your account.'
        : 'Unfortunately, you were not allotted in any of your accounts.';

  return (
    <ProtectedPersonalScreen title="Sign in to check IPO results">
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

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        {loadError ? <Text style={styles.errorNote}>{loadError}</Text> : null}
        {partialWarn ? <Text style={styles.warnNote}>{partialWarn}</Text> : null}

        <Pressable
          style={styles.companyPicker}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingCompanies || companies.length === 0}
        >
          <Text style={styles.companyPickerText} numberOfLines={2}>
            {selected?.name ??
              (loadingCompanies
                ? 'Loading issue managers…'
                : loadingCdsc
                  ? 'Loading CDSC extras…'
                  : 'Select IPO / FPO / Right')}
          </Text>
          {loadingCompanies || loadingCdsc ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
          )}
        </Pressable>

        <View style={styles.summaryHead}>
          <View style={styles.summaryTitleRow}>
            <MaterialCommunityIcons
              name="chart-bar"
              size={rs(16)}
              color={colors.textSecondary}
            />
            <Text style={styles.summaryHeadTitle}>Summary</Text>
          </View>
          <Pressable onPress={() => setCheckPickerOpen(true)} hitSlop={8}>
            <Text style={styles.summaryTotal}>Total: {checkAccounts.length}</Text>
          </Pressable>
        </View>

        <View style={styles.statRow}>
          <View style={[styles.statCard, styles.statAllotted]}>
            <Ionicons name="checkmark-circle" size={rs(18)} color="#66BB6A" />
            <Text style={[styles.statNum, { color: '#66BB6A' }]}>{allottedCount}</Text>
            <Text style={[styles.statLabel, { color: '#66BB6A' }]}>Alloted</Text>
          </View>
          <View style={[styles.statCard, styles.statNotAllotted]}>
            <Ionicons name="close-circle" size={rs(18)} color="#EF5350" />
            <Text style={[styles.statNum, { color: '#EF5350' }]}>{notAllottedCount}</Text>
            <Text style={[styles.statLabel, { color: '#EF5350' }]}>Not Alloted</Text>
          </View>
          <View style={[styles.statCard, styles.statErrors]}>
            <Ionicons name="alert-circle" size={rs(18)} color="#FB8C00" />
            <Text style={[styles.statNum, { color: '#FB8C00' }]}>{failedCount}</Text>
            <Text style={[styles.statLabel, { color: '#FB8C00' }]}>Errors</Text>
          </View>
        </View>

        <Pressable
          style={[styles.checkNowBtn, (running || !selected) && styles.checkNowDisabled]}
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

        {displayRows.map(({ account, index, result }) => {
          const boidRaw = result?.boidMasked ?? resolveBoidSync(account) ?? account.demat;
          const boidText = hideBoids
            ? '••••••••••••••••'
            : boidRaw
              ? maskBoid(boidRaw)
              : 'BOID missing';
          const isAllotted = Boolean(result?.ok && result.allotted);
          const isError = Boolean(result && !result.ok);
          const isNotAllotted = Boolean(result?.ok && !result.allotted);
          const statusColor = isAllotted
            ? '#66BB6A'
            : isError
              ? '#FB8C00'
              : isNotAllotted
                ? '#EF9A9A'
                : colors.textMuted;
          const statusMessage =
            result?.message ??
            (boidRaw ? 'Tap Check to look up this BOID.' : 'Add BOID in account settings.');
          const iconName = isAllotted
            ? 'checkmark'
            : isError
              ? 'alert'
              : isNotAllotted
                ? 'alert'
                : 'help';
          const iconBg = isAllotted
            ? '#2E7D32'
            : isError
              ? '#EF6C00'
              : isNotAllotted
                ? '#C62828'
                : colors.surfaceAlt;

          return (
            <View key={account.id} style={styles.resultCard}>
              <View style={[styles.resultIcon, { backgroundColor: iconBg }]}>
                <Ionicons name={iconName} size={rs(22)} color="#FFFFFF" />
              </View>
              <View style={styles.resultBody}>
                <Text style={styles.resultName}>
                  {index}. {account.name.toUpperCase()}
                </Text>
                <Text style={styles.resultBoid}>{boidText}</Text>
                <Text style={[styles.resultMsg, { color: statusColor }]}>
                  {statusMessage}
                </Text>
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
        })}

        <Pressable style={styles.catalogChip} onPress={() => setManagersOpen(true)}>
          <MaterialCommunityIcons
            name="bank-outline"
            size={rs(16)}
            color={colors.primary}
          />
          <Text style={styles.catalogChipText}>
            {liveCount} live issue managers · tap for full list
          </Text>
          <Ionicons name="chevron-forward" size={rs(16)} color={colors.primary} />
        </Pressable>
      </ScrollView>

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
              <Text style={styles.resultModalScoreLabel}>Accounts Allotted</Text>
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
        visible={managersOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setManagersOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setManagersOpen(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Text style={styles.modalTitle}>Nepal issue managers</Text>
            <Text style={styles.catalogHint}>
              Live first. Scroll for the full list. Offline = temporary
              network/site error — tap refresh on the screen.
            </Text>
            <FlatList
              style={styles.modalList}
              data={managersSorted}
              keyExtractor={(item) => item.name}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              renderItem={({ item }) => {
                const live = !!item.providerId;
                const offline =
                  live &&
                  item.providerId != null &&
                  failedProviderIds.has(item.providerId);
                const err = offline
                  ? providerErrors.find((e) => e.provider === item.providerId)
                  : undefined;
                return (
                  <View style={styles.modalRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalRowTitle}>{item.name}</Text>
                      <Text style={styles.modalRowSub}>
                        {offline
                          ? err?.message ?? 'Temporarily offline'
                          : live
                            ? 'Bulk check available'
                            : 'No public API yet — use CDSC if needed'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.liveBadge,
                        offline
                          ? styles.liveOff
                          : live
                            ? styles.liveOn
                            : styles.liveOff,
                      ]}
                    >
                      {offline ? 'Offline' : live ? 'Live' : 'Soon'}
                    </Text>
                  </View>
                );
              }}
            />
            <Pressable
              style={styles.modalDone}
              onPress={() => setManagersOpen(false)}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
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
            <Text style={styles.modalTitle}>Accounts to check</Text>
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
                      <Text style={styles.modalRowTitle}>{item.name}</Text>
                      <Text style={styles.modalRowSub}>
                        {boid ? maskBoid(boid) : 'BOID missing'}
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
    </View>
    </ProtectedPersonalScreen>
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
    body: { padding: rs(16), paddingBottom: rs(40) },
    companyPicker: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(16),
      gap: rs(10),
    },
    companyPickerText: {
      flex: 1,
      color: c.text,
      fontWeight: '600',
      fontSize: rs(14),
      lineHeight: rs(20),
    },
    summaryHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(10),
    },
    summaryTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
    },
    summaryHeadTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
    },
    summaryTotal: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '600',
    },
    statRow: {
      flexDirection: 'row',
      gap: rs(8),
      marginBottom: rs(16),
    },
    statCard: {
      flex: 1,
      borderRadius: rs(12),
      borderWidth: 1,
      paddingVertical: rs(10),
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: c.surface,
    },
    statAllotted: { borderColor: 'rgba(102,187,106,0.45)' },
    statNotAllotted: { borderColor: 'rgba(239,83,80,0.45)' },
    statErrors: { borderColor: 'rgba(251,140,0,0.45)' },
    statNum: { fontWeight: '800', fontSize: rs(18) },
    statLabel: { fontSize: rs(11), fontWeight: '600' },
    checkNowBtn: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(24),
      minHeight: rs(46),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(16),
      backgroundColor: 'transparent',
    },
    checkNowDisabled: { opacity: 0.55 },
    checkNowText: {
      color: c.primary,
      fontWeight: '800',
      fontSize: rs(15),
    },
    progress: {
      textAlign: 'center',
      color: c.textSecondary,
      marginBottom: rs(10),
      fontSize: rs(12),
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
    catalogChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      backgroundColor: c.surface,
      marginTop: rs(6),
    },
    catalogChipText: {
      flex: 1,
      color: c.text,
      fontSize: rs(12),
      fontWeight: '600',
    },
    catalogHint: {
      color: c.textMuted,
      fontSize: rs(12),
      marginBottom: rs(8),
      lineHeight: rs(16),
    },
    liveBadge: {
      fontSize: rs(10),
      fontWeight: '800',
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
      borderRadius: rs(8),
      overflow: 'hidden',
    },
    liveOn: { backgroundColor: c.primarySoft, color: c.accentGreen },
    liveOff: { backgroundColor: c.surfaceAlt, color: c.textMuted },
    errorNote: {
      color: c.danger,
      fontSize: rs(12),
      lineHeight: rs(16),
      marginBottom: rs(12),
    },
    warnNote: {
      color: c.badgeUpdated,
      fontSize: rs(12),
      lineHeight: rs(16),
      marginBottom: rs(10),
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
