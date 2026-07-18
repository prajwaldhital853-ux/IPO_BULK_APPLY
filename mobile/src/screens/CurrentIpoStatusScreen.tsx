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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  loadCheckableIssuesForUi,
  runBulkResultCheck,
  type BulkResultSummary,
  type OpenIssue,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

type IssueSource = 'mixed' | 'reports' | 'open' | 'empty';

export function CurrentIpoStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CurrentIpoStatus'>>();
  const mode = route.params?.mode ?? 'status';
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [issueSource, setIssueSource] = useState<IssueSource>('empty');
  const [selected, setSelected] = useState<OpenIssue | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<BulkResultSummary | null>(null);
  const [liveMode, setLiveMode] = useState(true);

  const title =
    mode === 'result' ? 'IPO Bulk Result' : 'Current IPO Status';
  const buttonLabel =
    mode === 'result' ? 'Check Bulk Result' : 'Check Bulk Status';

  const sourceAccount = useMemo(
    () =>
      accounts.find((a) => a.id === sourceAccountId) ?? accounts[0] ?? null,
    [accounts, sourceAccountId],
  );

  const checkAccounts = useMemo(() => {
    const selectedSet = new Set(
      checkAccountIds.length ? checkAccountIds : accounts.map((a) => a.id),
    );
    return accounts.filter((a) => selectedSet.has(a.id));
  }, [accounts, checkAccountIds]);

  useEffect(() => {
    if (!accounts.length) {
      setSourceAccountId(null);
      setCheckAccountIds([]);
      return;
    }
    setSourceAccountId((prev) =>
      prev && accounts.some((a) => a.id === prev) ? prev : accounts[0].id,
    );
    setCheckAccountIds((prev) => {
      const valid = prev.filter((id) => accounts.some((a) => a.id === id));
      return valid.length ? valid : accounts.map((a) => a.id);
    });
  }, [accounts]);

  const refreshIssues = useCallback(async () => {
    if (!sourceAccount) {
      setIssues([]);
      setIssueSource('empty');
      setSelected(null);
      return;
    }
    setLoadingIssues(true);
    try {
      const { issues: list, source } =
        await loadCheckableIssuesForUi(sourceAccount);
      setIssues(list);
      setIssueSource(source);
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
  }, [sourceAccount]);

  useEffect(() => {
    void refreshIssues();
  }, [refreshIssues]);

  const onCheck = useCallback(() => {
    if (!selected) {
      Alert.alert(
        'Nothing to check',
        issueSource === 'empty'
          ? 'No applications found for this account on MeroShare Application Report.'
          : 'Select an IPO first.',
      );
      return;
    }
    if (checkAccounts.length === 0) {
      Alert.alert('No accounts', 'Select at least one account to check.');
      return;
    }

    const run = () => {
      void (async () => {
        setRunning(true);
        setProgress('Starting…');
        setSummary(null);
        try {
          const result = await runBulkResultCheck({
            accounts: checkAccounts,
            issue: selected,
            dryRun: !liveMode,
            simulateLogin: !liveMode,
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
      })();
    };

    if (!liveMode) {
      run();
      return;
    }

    Alert.alert(
      'Live status check',
      `Log into MeroShare for ${checkAccounts.length} account(s) and read application status for:\n\n${selected.companyName}\n\nCredentials stay on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Live',
          onPress: () =>
            void sensitive.requestSensitiveAction(run, { pinPolicy: 'skipIfUnlocked' }),
        },
      ],
    );
  }, [checkAccounts, issueSource, liveMode, selected, sensitive]);

  const sourceHint =
    issueSource === 'empty'
      ? 'No applications loaded for this account. Try another saved account or refresh.'
      : `Showing ${issues.length} IPO(s) from MeroShare Application Report · ${sourceAccount?.name ?? 'account'}`;

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

  return (
    <ProtectedPersonalScreen title="Sign in to check IPO status">
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={() => void refreshIssues()} hitSlop={10}>
          {loadingIssues ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.modeRow}>
          <View style={styles.modeToggle}>
            {(
              [
                { key: true, label: 'Live' },
                { key: false, label: 'Dry-run' },
              ] as const
            ).map((m) => (
              <Pressable
                key={String(m.key)}
                onPress={() => setLiveMode(m.key)}
                style={[
                  styles.modeBtn,
                  liveMode === m.key && styles.modeBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    liveMode === m.key && styles.modeTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.banner}>{sourceHint}</Text>

        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="account"
            size={rs(16)}
            color={colors.textSecondary}
          />
          <Text style={styles.label}>Load IPO list from account</Text>
        </View>
        <Pressable
          style={styles.dropdown}
          onPress={() => setAccountPickerOpen(true)}
          disabled={!accounts.length}
        >
          <Text
            style={[
              styles.dropdownText,
              sourceAccount ? { color: colors.text } : null,
            ]}
            numberOfLines={1}
          >
            {sourceAccount
              ? `${sourceAccount.name} (${sourceAccount.username})`
              : 'No account'}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <View style={[styles.labelRow, { marginTop: rs(16) }]}>
          <MaterialCommunityIcons
            name="account-multiple-check"
            size={rs(16)}
            color={colors.textSecondary}
          />
          <Text style={styles.label}>Accounts to check</Text>
        </View>
        <Pressable
          style={styles.dropdown}
          onPress={() => setCheckPickerOpen(true)}
          disabled={!accounts.length}
        >
          <Text
            style={[styles.dropdownText, { color: colors.text }]}
            numberOfLines={1}
          >
            {checkLabel}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <View style={[styles.labelRow, { marginTop: rs(16) }]}>
          <MaterialCommunityIcons
            name="bank"
            size={rs(16)}
            color={colors.textSecondary}
          />
          <Text style={styles.label}>
            Applied / open IPO ({issues.length})
          </Text>
        </View>
        <Pressable
          style={styles.dropdown}
          onPress={() => setPickerOpen(true)}
          disabled={!issues.length}
        >
          <Text
            style={[
              styles.dropdownText,
              selected ? { color: colors.text } : null,
            ]}
            numberOfLines={1}
          >
            {selected
              ? `${selected.companyName}${selected.scrip ? ` (${selected.scrip})` : ''}`
              : 'No issues available'}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.hint}>
          {liveMode ? 'Live' : 'Dry-run'} · full apply history from selected
          account · credentials stay on device
        </Text>

        <Pressable
          style={[styles.checkBtn, running && styles.checkBtnDisabled]}
          onPress={onCheck}
          disabled={running || loadingIssues}
        >
          {running ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.checkText}>
              {liveMode ? `Live ${buttonLabel}` : buttonLabel}
            </Text>
          )}
        </Pressable>

        {progress ? <Text style={styles.progress}>{progress}</Text> : null}

        {summary ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>
              {summary.dryRun ? 'Dry-run status' : 'Live status'} ·{' '}
              {summary.results.filter((r) => r.ok).length}/
              {summary.results.length}
              {summary.stoppedEarly ? ' · stopped early' : ''}
            </Text>
            <Text style={styles.resultSub}>{summary.companyName}</Text>
            {summary.results.map((r) => (
              <View key={r.accountId} style={styles.resultRow}>
                <Ionicons
                  name={
                    r.status === 'ALLOTTED'
                      ? 'checkmark-done-circle'
                      : r.ok
                        ? 'checkmark-circle'
                        : 'close-circle'
                  }
                  size={rs(18)}
                  color={
                    r.status === 'NOT_ALLOTTED' || !r.ok
                      ? colors.danger
                      : r.status === 'ALLOTTED'
                        ? colors.accentGreen
                        : colors.primary
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accName}>{r.accountName}</Text>
                  <Text style={styles.statusChip}>{r.status}</Text>
                  <Text style={styles.resultMsg}>{r.message}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={accountPickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Load IPO list from</Text>
            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <Text style={styles.resultMsg}>No saved accounts</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSourceAccountId(item.id);
                    setAccountPickerOpen(false);
                    setSummary(null);
                  }}
                >
                  <View style={styles.modalRowHeader}>
                    <Text style={styles.accName}>{item.name}</Text>
                    {sourceAccount?.id === item.id ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={rs(18)}
                        color={colors.primary}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.resultMsg}>
                    {item.username}
                    {item.dpName ? ` · ${item.dpName}` : ''}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setAccountPickerOpen(false)}
            >
              <Text style={styles.checkText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={checkPickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Accounts to check</Text>
            <Pressable
              style={styles.modalRow}
              onPress={() => setCheckAccountIds(accounts.map((a) => a.id))}
            >
              <Text style={styles.accName}>Select all</Text>
            </Pressable>
            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const on =
                  checkAccountIds.length === 0 ||
                  checkAccountIds.includes(item.id);
                return (
                  <Pressable
                    style={styles.modalRow}
                    onPress={() => toggleCheckAccount(item)}
                  >
                    <View style={styles.modalRowHeader}>
                      <Text style={styles.accName}>{item.name}</Text>
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={rs(20)}
                        color={on ? colors.primary : colors.textMuted}
                      />
                    </View>
                    <Text style={styles.resultMsg}>{item.username}</Text>
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setCheckPickerOpen(false)}
            >
              <Text style={styles.checkText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>
              Select IPO ({issues.length})
            </Text>
            <FlatList
              data={issues}
              keyExtractor={(item) => String(item.companyShareId)}
              ListEmptyComponent={
                <Text style={styles.resultMsg}>No issues loaded</Text>
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
                  <Text style={styles.resultMsg}>
                    {item.shareTypeName}
                    {item.scrip ? ` · ${item.scrip}` : ''}
                    {item.alreadyApplied ? ' · applied' : ''}
                    {item.issueOpenDate ? ` · ${item.issueOpenDate}` : ''}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.checkText}>Close</Text>
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
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      gap: rs(10),
      backgroundColor: c.bgElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    title: { flex: 1, color: c.text, fontSize: rs(17), fontWeight: '600' },
    body: {
      paddingHorizontal: rs(16),
      paddingTop: rs(16),
      paddingBottom: rs(40),
    },
    modeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: rs(12),
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: rs(20),
      padding: rs(3),
      borderWidth: 1,
      borderColor: c.border,
    },
    modeBtn: {
      paddingHorizontal: rs(22),
      paddingVertical: rs(8),
      borderRadius: rs(16),
    },
    modeBtnActive: { backgroundColor: c.primary },
    modeText: { color: c.text, fontWeight: '600', fontSize: rs(13) },
    modeTextActive: { color: '#FFFFFF' },
    banner: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginBottom: rs(14),
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(10),
    },
    label: { color: c.textSecondary, fontSize: rs(13) },
    dropdown: {
      minHeight: rs(48),
      borderRadius: rs(24),
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: rs(16),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
    },
    dropdownText: {
      flex: 1,
      color: c.textMuted,
      fontSize: rs(14),
      marginRight: rs(8),
    },
    hint: { color: c.textMuted, fontSize: rs(11), marginTop: rs(8) },
    checkBtn: {
      alignSelf: 'center',
      marginTop: rs(28),
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      minWidth: rs(180),
      alignItems: 'center',
    },
    checkBtnDisabled: { opacity: 0.7 },
    checkText: { color: c.primary, fontWeight: '700', fontSize: rs(14) },
    progress: {
      marginTop: rs(16),
      textAlign: 'center',
      color: c.textSecondary,
      fontSize: rs(13),
    },
    resultCard: {
      marginTop: rs(20),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: rs(14),
      gap: rs(10),
    },
    resultTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    resultSub: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginBottom: rs(4),
    },
    resultRow: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start' },
    accName: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    statusChip: {
      color: c.primary,
      fontWeight: '700',
      fontSize: rs(11),
      marginTop: rs(2),
    },
    resultMsg: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
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
    modalRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(8),
    },
    modalClose: {
      marginTop: rs(12),
      alignItems: 'center',
      paddingVertical: rs(12),
    },
  });
}
