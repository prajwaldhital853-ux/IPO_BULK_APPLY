import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
  NEPAL_ISSUE_MANAGERS,
  catalogSortedForDisplay,
  isCdscBackendConfigured,
  loadIssueManagerCompanies,
  loadCdscFallbackCompanies,
  runIssueManagerBulkCheck,
  type CompanyLoadResult,
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

  const checkLabel =
    checkAccounts.length === accounts.length
      ? `All ${accounts.length} accounts`
      : checkAccounts.length === 1
        ? checkAccounts[0].name
        : `${checkAccounts.length} of ${accounts.length} accounts`;

  const onCheck = useCallback(() => {
    if (!selected) {
      Alert.alert(
        'Not ready',
        loadError ?? 'Wait for the company list to load, then retry.',
      );
      return;
    }
    if (checkAccounts.length === 0) {
      Alert.alert('No accounts', 'Select at least one account to check.');
      return;
    }

    void sensitive.requestSensitiveAction(async () => {
      setRunning(true);
      setProgress('Starting…');
      setSummary(null);
      try {
        for (const a of checkAccounts) {
          const built = resolveBoidSync(a);
          if (built && a.demat !== built) {
            await updateAccountMeta(a.id, {
              demat: built,
              boidHint: built.slice(-4),
            });
          }
        }

        const result = await runIssueManagerBulkCheck({
          accounts: checkAccounts,
          company: selected,
          onProgress: (msg) => setProgress(msg),
        });
        setSummary(result);
      } catch (e) {
        Alert.alert(
          'Check failed',
          e instanceof Error ? e.message : 'Unknown error',
        );
      } finally {
        setRunning(false);
        setProgress('');
      }
    });
  }, [checkAccounts, loadError, selected, sensitive, updateAccountMeta]);

  const allottedCount =
    summary?.results.filter((r) => r.ok && r.allotted).length ?? 0;
  const notAllottedCount =
    summary?.results.filter((r) => r.ok && !r.allotted).length ?? 0;
  const failedCount = summary?.results.filter((r) => !r.ok).length ?? 0;

  return (
    <ProtectedPersonalScreen title="Sign in to check IPO results">
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Same-day IPO Result</Text>
        <Pressable
          onPress={() => void refreshCompanies()}
          hitSlop={10}
          disabled={loadingCompanies || loadingCdsc}
        >
          {loadingCompanies || loadingCdsc ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.banner}>
          Checks the 11 issue managers first (no captcha). CDSC trained-model
          fallback is used only for IPOs not listed on those managers.
        </Text>

        <Pressable style={styles.catalogChip} onPress={() => setManagersOpen(true)}>
          <MaterialCommunityIcons
            name="bank-outline"
            size={rs(16)}
            color={colors.primary}
          />
          <Text style={styles.catalogChipText}>
            {liveCount} of {NEPAL_ISSUE_MANAGERS.length} Nepal issue managers
            live · tap for full list (scrollable)
          </Text>
          <Ionicons name="chevron-forward" size={rs(16)} color={colors.primary} />
        </Pressable>

        {loadError ? <Text style={styles.errorNote}>{loadError}</Text> : null}
        {partialWarn ? (
          <Text style={styles.warnNote}>{partialWarn}</Text>
        ) : null}

        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="domain"
            size={rs(16)}
            color={colors.textSecondary}
          />
          <Text style={styles.label}>Company</Text>
        </View>
        <Pressable
          style={styles.picker}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingCompanies || companies.length === 0}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerTitle} numberOfLines={2}>
              {selected?.name ??
                (loadingCompanies
                  ? 'Loading issue managers…'
                  : loadingCdsc
                    ? 'Loading CDSC extras…'
                    : 'No company listed')}
            </Text>
            {selected ? (
              <Text style={styles.pickerSub}>{selected.providerLabel}</Text>
            ) : null}
          </View>
          <Ionicons
            name="chevron-down"
            size={rs(18)}
            color={colors.textMuted}
          />
        </Pressable>

        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="account-multiple-check"
            size={rs(16)}
            color={colors.textSecondary}
          />
          <Text style={styles.label}>Accounts</Text>
        </View>
        <Pressable
          style={styles.picker}
          onPress={() => setCheckPickerOpen(true)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerTitle}>{checkLabel}</Text>
            <Text style={styles.pickerSub}>
              BOID from demat · tap to select
            </Text>
          </View>
          <Ionicons
            name="chevron-down"
            size={rs(18)}
            color={colors.textMuted}
          />
        </Pressable>

        <View style={styles.accountPreview}>
          {checkAccounts.slice(0, 8).map((a) => {
            const boid = resolveBoidSync(a) ?? a.demat;
            return (
              <Text key={a.id} style={styles.accountPreviewLine}>
                {a.name} · {boid ? maskBoid(boid) : 'BOID missing'}
              </Text>
            );
          })}
          {checkAccounts.length > 8 ? (
            <Text style={styles.accountPreviewLine}>
              +{checkAccounts.length - 8} more…
            </Text>
          ) : null}
        </View>

        <Pressable
          style={[
            styles.cta,
            (running || !selected) && styles.ctaDisabled,
          ]}
          onPress={onCheck}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Check all results</Text>
          )}
        </Pressable>

        {progress ? <Text style={styles.progress}>{progress}</Text> : null}

        {summary ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>{summary.companyName}</Text>
            <Text style={styles.summaryMeta}>
              via {summary.providerLabel} · Allotted {allottedCount} · Not
              allotted {notAllottedCount}
              {failedCount ? ` · Failed ${failedCount}` : ''}
            </Text>
            {summary.results.map((r) => (
              <View key={r.accountId} style={styles.resultRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{r.accountName}</Text>
                  {r.boidMasked ? (
                    <Text style={styles.resultBoid}>{r.boidMasked}</Text>
                  ) : null}
                  <Text style={styles.resultMsg}>{r.message}</Text>
                </View>
                <Text
                  style={[
                    styles.resultBadge,
                    r.ok && r.allotted
                      ? styles.badgeOk
                      : r.ok
                        ? styles.badgeNo
                        : styles.badgeFail,
                  ]}
                >
                  {!r.ok
                    ? 'Error'
                    : r.allotted
                      ? r.quantity != null
                        ? `Allotted ${r.quantity}`
                        : 'Allotted'
                      : 'Not allotted'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

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
    banner: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginBottom: rs(10),
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
      marginBottom: rs(14),
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
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(8),
      marginTop: rs(4),
    },
    label: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(12),
      gap: rs(8),
    },
    pickerTitle: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    pickerSub: {
      color: c.textMuted,
      fontSize: rs(12),
      marginTop: rs(3),
    },
    accountPreview: {
      marginBottom: rs(16),
      gap: rs(4),
    },
    accountPreviewLine: {
      color: c.textSecondary,
      fontSize: rs(11),
      fontVariant: ['tabular-nums'],
    },
    cta: {
      backgroundColor: c.primary,
      borderRadius: rs(28),
      minHeight: rs(50),
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: rs(15) },
    progress: {
      textAlign: 'center',
      color: c.textSecondary,
      marginTop: rs(10),
      fontSize: rs(12),
    },
    summaryBox: {
      marginTop: rs(20),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      gap: rs(10),
    },
    summaryTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    summaryMeta: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginBottom: rs(4),
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(10),
      paddingVertical: rs(8),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
    },
    resultName: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    resultBoid: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(2),
      fontVariant: ['tabular-nums'],
    },
    resultMsg: {
      color: c.textSecondary,
      fontSize: rs(11),
      marginTop: rs(3),
      lineHeight: rs(15),
    },
    resultBadge: {
      fontSize: rs(11),
      fontWeight: '800',
      paddingHorizontal: rs(8),
      paddingVertical: rs(4),
      borderRadius: rs(8),
      overflow: 'hidden',
      maxWidth: rs(110),
      textAlign: 'center',
    },
    badgeOk: { backgroundColor: c.primarySoft, color: c.accentGreen },
    badgeNo: { backgroundColor: c.surfaceAlt, color: c.textSecondary },
    badgeFail: { backgroundColor: c.surfaceAlt, color: c.danger },
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
