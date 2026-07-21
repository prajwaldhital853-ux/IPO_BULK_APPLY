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
  humanizeApplicationStatus,
  loadOpenIssuesForUi,
  runBulkResultCheck,
  type OpenIssue,
  type ResultAccountStatus,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

const ACCENT = '#A3C78B';
const GREEN = '#66BB6A';
const RED = '#EF5350';

function classify(row: ResultAccountStatus): 'allotted' | 'not' | 'rejected' {
  if (!row.ok) return 'rejected';
  const { code } = humanizeApplicationStatus(row.status, row.allotmentStatus);
  if (code === 'ALLOTTED') return 'allotted';
  if (code === 'NOT_ALLOTTED' || /NOT.?ALLOT/i.test(row.message)) return 'not';
  if (/REJECT|FAIL|ERROR|CANCEL/i.test(row.status + row.message)) return 'rejected';
  return 'not';
}

function statusLine(row: ResultAccountStatus): string {
  const kind = classify(row);
  const qty = row.appliedKitta;
  if (kind === 'allotted') {
    return qty != null ? `Allotted ( quantity : ${qty} )` : 'Allotted';
  }
  if (kind === 'rejected') return row.message || 'Rejected';
  return qty != null ? `Not Allotted ( quantity : ${qty} )` : 'Not Allotted';
}

export function CurrentIpoStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [selected, setSelected] = useState<OpenIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultAccountStatus[]>([]);

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
      const list = await loadOpenIssuesForUi(accounts);
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
        try {
          const summary = await runBulkResultCheck({
            accounts: checkAccounts,
            issue: selected,
          });
          setResults(summary.results);
        } catch (e) {
          Alert.alert(
            'Check failed',
            e instanceof Error ? e.message : 'Unknown error',
          );
        } finally {
          setRunning(false);
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

      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          style={styles.dropdown}
          onPress={() => setCheckPickerOpen(true)}
        >
          <Text style={styles.dropdownText} numberOfLines={1}>
            {checkLabel}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="bank-outline"
            size={rs(16)}
            color={colors.textSecondary}
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
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
          )}
        </Pressable>

        <Pressable
          style={[styles.actionBtn, running && { opacity: 0.6 }]}
          onPress={runCheck}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color={ACCENT} />
          ) : (
            <Text style={styles.actionText}>Check Bulk Status</Text>
          )}
        </Pressable>

        {results.map((row, idx) => {
          const kind = classify(row);
          const color = kind === 'allotted' ? GREEN : RED;
          return (
            <View
              key={row.accountId}
              style={[styles.resultCard, { borderColor: color }]}
            >
              <View style={[styles.resultIcon, { backgroundColor: color }]}>
                <Ionicons
                  name={kind === 'allotted' ? 'checkmark' : 'close'}
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
        })}
      </ScrollView>

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
              style={styles.modalDone}
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
              style={styles.modalDone}
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

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: c.bgElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: {
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
    },
    body: { padding: rs(16), paddingBottom: rs(40) },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(22),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(16),
      gap: rs(8),
    },
    dropdownText: { flex: 1, color: c.textMuted, fontSize: rs(14) },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(8),
    },
    label: { color: c.textSecondary, fontSize: rs(13) },
    actionBtn: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: ACCENT,
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      marginTop: rs(8),
      marginBottom: rs(16),
      minWidth: rs(180),
      alignItems: 'center',
    },
    actionText: { color: ACCENT, fontWeight: '700', fontSize: rs(14) },
    resultCard: {
      flexDirection: 'row',
      gap: rs(10),
      borderWidth: 1,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(10),
      backgroundColor: c.surface,
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
      backgroundColor: c.bgElevated,
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
