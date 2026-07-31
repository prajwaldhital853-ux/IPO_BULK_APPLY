import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
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
  humanizeApplicationStatus,
  loadCurrentOpenIssuesForUi,
  runBulkResultCheck,
  type OpenIssue,
  type ResultAccountStatus,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

const ACCENT = '#1B5E20';
const GREEN = '#2E7D32';
const RED = '#C62828';

function classify(
  row: ResultAccountStatus,
): 'allotted' | 'not' | 'rejected' | 'not_applied' {
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
  if (
    code === 'REJECTED' ||
    /REJECT|FAIL|ERROR|CANCEL|BLOCK/i.test(row.status + row.message)
  ) {
    return 'rejected';
  }
  return 'not';
}

function statusLine(row: ResultAccountStatus): string {
  const kind = classify(row);
  const qty = row.appliedKitta;
  if (kind === 'allotted') {
    return qty != null ? `Allotted ( quantity : ${qty} )` : 'Allotted';
  }
  if (kind === 'not_applied') {
    return 'You have not applied for this IPO';
  }
  if (kind === 'rejected') return row.message || 'Rejected';
  return qty != null ? `Not Allotted ( quantity : ${qty} )` : 'Not Allotted';
}

export function CurrentIpoStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [selected, setSelected] = useState<OpenIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultAccountStatus[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const checkAccounts = useMemo(() => {
    const set = new Set(
      checkAccountIds.length ? checkAccountIds : accounts.map((a) => a.id),
    );
    return accounts.filter((a) => set.has(a.id));
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

  useEffect(() => {
    void refreshIssues();
  }, [refreshIssues]);

  useEffect(() => {
    setResults([]);
    setProgress(null);
  }, [selected?.companyShareId]);

  const toggleAccount = (account: AccountMeta) => {
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
        setProgress({ done: 0, total: checkAccounts.length });
        try {
          await runBulkResultCheck({
            accounts: checkAccounts,
            issue: selected,
            onProgress: (msg, index, total) => {
              setProgress({ done: index, total });
            },
            // Show each account as soon as it finishes (same as IPO Bulk Status).
            onAccountResult: (row, index, total) => {
              setResults((prev) => [...prev, row]);
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
              'Checks application status only for currently open IPO/FPO/Right issues.',
            )
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={ACCENT}
          />
        </Pressable>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={styles.dropdown}
          onPress={() => setCheckPickerOpen(true)}
        >
          <Text style={styles.dropdownText} numberOfLines={1}>
            {checkLabel}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={isDark ? colors.textMuted : '#1B5E20'} />
        </Pressable>

        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="bank-outline"
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
          <Text style={styles.dropdownText} numberOfLines={1}>
            {openingLabel}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color={isDark ? ACCENT : '#1B5E20'} />
          ) : (
            <Ionicons name="chevron-down" size={rs(18)} color={isDark ? colors.textMuted : '#1B5E20'} />
          )}
        </Pressable>

        <Pressable
          style={[styles.actionBtn, running && { opacity: 0.6 }]}
          onPress={runCheck}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color={isDark ? ACCENT : '#FFFFFF'} />
          ) : (
            <Text style={styles.actionText}>Check Bulk Status</Text>
          )}
        </Pressable>

        {running && progress ? (
          <Text style={styles.progressText}>
            Checking {Math.min(progress.done + 1, progress.total)} of{' '}
            {progress.total}…
            {results.length
              ? ` · ${results.length} result${results.length === 1 ? '' : 's'} so far`
              : ''}
          </Text>
        ) : null}
      </View>

      <FlatList
        style={styles.resultsList}
        contentContainerStyle={[
          styles.resultsContent,
          { paddingBottom: Math.max(insets.bottom, rs(16)) },
        ]}
        data={results}
        keyExtractor={(row) => row.accountId}
        renderItem={({ item: row, index: idx }) => {
          const kind = classify(row);
          const color =
            kind === 'allotted'
              ? GREEN
              : kind === 'not_applied'
                ? colors.textMuted
                : RED;
          return (
            <View style={[styles.resultCard, { borderColor: color }]}>
              <View style={[styles.resultIcon, { backgroundColor: color }]}>
                <Ionicons
                  name={
                    kind === 'allotted'
                      ? 'checkmark'
                      : kind === 'not_applied'
                        ? 'remove'
                        : 'close'
                  }
                  size={rs(20)}
                  color="#1B1B1B"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultName, { color }]}>
                  {idx + 1}. {row.accountName.toUpperCase()}
                </Text>
                <Text style={[styles.resultStatus, { color }]}>
                  {statusLine(row)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !running ? (
            <Text style={styles.empty}>
              Run Check Bulk Status to see account results here.
            </Text>
          ) : null
        }
      />

      <Modal visible={checkPickerOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
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
            </Pressable>
            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const on = checkAccounts.some((a) => a.id === item.id);
                return (
                  <Pressable
                    style={styles.modalRow}
                    onPress={() => toggleAccount(item)}
                  >
                    <Text style={styles.modalRowTitle}>
                      {item.name.toUpperCase()}
                    </Text>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={rs(22)}
                      color={on ? ACCENT : colors.textMuted}
                    />
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={[styles.modalDone, styles.actionBtn]}
              onPress={() => setCheckPickerOpen(false)}
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

      <SensitiveActionModals action={sensitive} />
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const fieldBg = isDark ? c.surface : '#FFFFFF';
  const fieldBorder = isDark ? c.border : '#1B5E20';
  const fieldText = isDark ? c.textMuted : '#121212';
  const btnBg = isDark ? 'transparent' : '#1B5E20';
  const btnBorder = isDark ? ACCENT : '#0D3B12';
  const btnText = isDark ? ACCENT : '#FFFFFF';
  const cardBg = isDark ? c.surface : '#FFFFFF';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: isDark ? c.bgElevated : '#FFFFFF',
      borderBottomWidth: isDark ? StyleSheet.hairlineWidth : 1.5,
      borderBottomColor: isDark ? c.border : '#1B5E20',
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
      paddingHorizontal: rs(16),
      paddingBottom: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    resultsList: { flex: 1 },
    resultsContent: {
      paddingHorizontal: rs(16),
      paddingTop: rs(12),
      flexGrow: 1,
    },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: isDark ? 1 : 1.5,
      borderColor: fieldBorder,
      borderRadius: rs(14),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      backgroundColor: fieldBg,
      marginBottom: rs(16),
      gap: rs(8),
    },
    dropdownText: {
      flex: 1,
      color: fieldText,
      fontSize: rs(14),
      fontWeight: isDark ? '400' : '600',
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(8),
    },
    label: {
      color: isDark ? c.textSecondary : '#1B2E1B',
      fontSize: rs(13),
      fontWeight: isDark ? '400' : '700',
    },
    actionBtn: {
      alignSelf: 'center',
      borderWidth: isDark ? 1 : 0,
      borderColor: btnBorder,
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(13),
      marginTop: rs(8),
      marginBottom: rs(16),
      minWidth: rs(180),
      alignItems: 'center',
      backgroundColor: btnBg,
    },
    actionText: { color: btnText, fontWeight: '800', fontSize: rs(14) },
    progressText: {
      color: c.textSecondary,
      fontSize: rs(12),
      textAlign: 'center',
      marginBottom: rs(8),
    },
    resultCard: {
      flexDirection: 'row',
      gap: rs(10),
      borderWidth: isDark ? 1 : 1.5,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(10),
      backgroundColor: cardBg,
    },
    resultIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultName: { fontWeight: '800', fontSize: rs(13) },
    resultStatus: { fontSize: rs(12), fontWeight: '600', marginTop: rs(2) },
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
