import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
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
  humanizeApplicationStatus,
  loadCheckableIssuesForUi,
  runBulkResultCheck,
  type ApplicationReportRow,
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

function badgeType(shareTypeName: string): string {
  const s = (shareTypeName || 'IPO').toUpperCase();
  if (s.includes('FPO')) return 'FPO';
  if (s.includes('RIGHT')) return 'RIGHT';
  return 'IPO';
}

function classify(row: ResultAccountStatus): 'allotted' | 'not' | 'rejected' {
  if (!row.ok) return 'rejected';
  const { code } = humanizeApplicationStatus(row.status, row.allotmentStatus);
  if (code === 'ALLOTTED') return 'allotted';
  if (code === 'NOT_ALLOTTED' || /NOT.?ALLOT/i.test(row.message)) return 'not';
  if (/REJECT|FAIL|ERROR|CANCEL/i.test(row.status + row.message)) return 'rejected';
  return 'not';
}

function statusLine(row: ResultAccountStatus): string {
  if (row.message && /quantity\s*:/i.test(row.message)) {
    return row.message;
  }
  const kind = classify(row);
  const qty = row.appliedKitta;
  if (kind === 'allotted') {
    return qty != null ? `Alloted ( quantity : ${qty} )` : 'Alloted';
  }
  if (kind === 'rejected') {
    return row.message || 'Rejected';
  }
  return qty != null ? `Not Alloted ( quantity : ${qty} )` : 'Not Alloted';
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

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function IpoBulkStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companies, setCompanies] = useState<ApplicationReportRow[]>([]);
  const [selected, setSelected] = useState<ApplicationReportRow | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultAccountStatus[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [filter, setFilter] = useState<'all' | 'allotted' | 'not' | 'rejected'>(
    'all',
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

  const loadCompanies = useCallback(async () => {
    if (!checkAccounts.length) {
      setCompanies([]);
      setSelected(null);
      return;
    }
    setLoadingList(true);
    try {
      const map = new Map<number, ApplicationReportRow>();
      const realAccounts = checkAccounts.filter(
        (a) => !a.id.startsWith('demo_'),
      );
      for (const acc of realAccounts.slice(0, 3)) {
        const { reports } = await loadCheckableIssuesForUi(acc);
        for (const r of reports) {
          if (!map.has(r.companyShareId)) map.set(r.companyShareId, r);
        }
      }
      const list = Array.from(map.values()).sort((a, b) =>
        a.companyName.localeCompare(b.companyName),
      );
      // Offer a demo IPO to exercise the UI when demo accounts are selected.
      if (checkAccounts.some((a) => a.id.startsWith('demo_'))) {
        list.unshift({
          companyShareId: 999001,
          companyName: 'DEMO CEMENT INDUSTRIES LIMITED',
          scrip: 'DEMO',
          shareTypeName: 'IPO',
          statusName: 'CREATE_APPROVE',
        });
      }
      setCompanies(list);
      setSelected((prev) =>
        prev && list.some((c) => c.companyShareId === prev.companyShareId)
          ? prev
          : list[0] ?? null,
      );
    } catch (e) {
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Failed to load listed IPOs',
      );
    } finally {
      setLoadingList(false);
    }
  }, [checkAccounts]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

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
        try {
          await runBulkResultCheck({
            accounts: checkAccounts,
            issue,
            // Render each account as soon as it resolves so the user sees
            // 1, 2, 3… appear instead of staring at a blank screen.
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

  const allotted = results.filter((r) => classify(r) === 'allotted');
  const notAllotted = results.filter((r) => classify(r) === 'not');
  const rejected = results.filter((r) => classify(r) === 'rejected');
  const visibleResults = results.filter((r) => {
    if (filter === 'all') return true;
    return classify(r) === filter;
  });

  const shareToExcel = async () => {
    if (!results.length) {
      Alert.alert('No results', 'Run IPO Bulk Status first.');
      return;
    }
    const company =
      selected?.companyName ??
      results[0]?.companyName ??
      'IPO';
    const scrip = selected?.scrip ? ` (${selected.scrip})` : '';
    const header = [
      'S.N.',
      'Account Name',
      'Username',
      'Status',
      'Quantity',
      'Amount Status',
      'Company',
    ].join(',');
    const lines = results.map((row, idx) =>
      [
        String(idx + 1),
        csvEscape(row.accountName),
        csvEscape(row.username),
        csvEscape(statusLine(row)),
        row.appliedKitta != null ? String(row.appliedKitta) : '',
        csvEscape(amountStatusLine(row)),
        csvEscape(`${company}${scrip}`),
      ].join(','),
    );
    const csv = `\uFEFF${[header, ...lines].join('\n')}`;
    try {
      await Share.share({
        title: `IPO_Bulk_Status_${selected?.scrip || 'export'}.csv`,
        message: csv,
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
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>IPO Bulk Status</Text>
        <Pressable
          hitSlop={10}
          onPress={() =>
            Alert.alert(
              'IPO Bulk Status',
              'Select accounts and a listed IPO/FPO, then tap IPO Bulk Status to check application status across accounts.',
            )
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={colors.text}
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
            color={colors.text}
          />
          <Text style={styles.label}>Listed IPO/FPO</Text>
        </View>

        <Pressable
          style={styles.dropdown}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingList || companies.length === 0}
        >
          {selected ? (
            <View style={styles.companyRow}>
              <View style={styles.ipoBadge}>
                <Text style={styles.ipoBadgeText}>
                  {badgeType(selected.shareTypeName)}
                </Text>
              </View>
              <Text style={styles.companyText} numberOfLines={1}>
                {selected.companyName}
                {selected.scrip ? ` (${selected.scrip})` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.dropdownText}>
              {loadingList ? 'Loading…' : 'No listed IPO/FPO'}
            </Text>
          )}
          {loadingList ? (
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
            <Text style={styles.actionText}>IPO Bulk Status</Text>
          )}
        </Pressable>

        {running && progress ? (
          <View style={styles.progressWrap}>
            <ActivityIndicator size="small" color={ACCENT} />
            <Text style={styles.progressText}>
              Checking account {progress.done}/{progress.total}…
            </Text>
          </View>
        ) : null}

        {results.length > 0 ? (
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

            <View style={styles.chipRow}>
              {([
                { key: 'all', label: 'All', count: results.length, color: colors.text },
                { key: 'allotted', label: 'Alloted', count: allotted.length, color: GREEN },
                { key: 'not', label: 'Not Alloted', count: notAllotted.length, color: RED },
                { key: 'rejected', label: 'Rejected', count: rejected.length, color: '#FB8C00' },
              ] as const).map((chip) => {
                const active = filter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
                    style={[
                      styles.chip,
                      active && { borderColor: chip.color, backgroundColor: `${chip.color}22` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? chip.color : colors.textMuted },
                      ]}
                    >
                      {chip.label} ({chip.count})
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {visibleResults.length === 0 ? (
              <Text style={styles.empty}>No accounts in this category.</Text>
            ) : null}

            {visibleResults.map((row) => {
              const idx = results.indexOf(row);
              const kind = classify(row);
              const color =
                kind === 'allotted' ? GREEN : kind === 'rejected' ? '#FB8C00' : RED;
              const icon =
                kind === 'allotted' ? 'checkmark' : kind === 'rejected' ? 'alert' : 'close';
              return (
                <View
                  key={row.accountId}
                  style={[styles.resultCard, { borderColor: color }]}
                >
                  <View style={[styles.resultIcon, { backgroundColor: color }]}>
                    <Ionicons name={icon} size={rs(20)} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultName, { color }]}>
                      {idx + 1}. {row.accountName.toUpperCase()}
                    </Text>
                    <Text style={[styles.resultStatus, { color }]}>
                      {statusLine(row)}
                    </Text>
                    <View
                      style={[
                        styles.remarkPill,
                        { backgroundColor: `${color}22` },
                      ]}
                    >
                      <Text style={[styles.remarkText, { color }]}>
                        {amountStatusLine(row)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={checkPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCheckPickerOpen(false)}
      >
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
              {checkAccounts.length === accounts.length ? (
                <Ionicons name="checkmark" size={rs(20)} color={ACCENT} />
              ) : null}
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
              style={styles.modalDone}
              onPress={() => setCompanyPickerOpen(false)}
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
      marginBottom: rs(14),
      gap: rs(8),
    },
    dropdownText: { flex: 1, color: c.textMuted, fontSize: rs(14) },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(8),
    },
    label: { color: c.text, fontSize: rs(13), fontWeight: '600' },
    companyRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    ipoBadge: {
      backgroundColor: GREEN,
      borderRadius: rs(4),
      paddingHorizontal: rs(6),
      paddingVertical: rs(2),
    },
    ipoBadgeText: { color: '#FFF', fontWeight: '800', fontSize: rs(10) },
    companyText: { flex: 1, color: c.text, fontSize: rs(13), fontWeight: '600' },
    actionBtn: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: ACCENT,
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      marginTop: rs(4),
      marginBottom: rs(16),
      minWidth: rs(160),
      alignItems: 'center',
    },
    actionText: { color: ACCENT, fontWeight: '700', fontSize: rs(14) },
    progressWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(10),
      marginBottom: rs(6),
    },
    progressText: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(12),
    },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(16),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      backgroundColor: c.surface,
    },
    chipText: { fontSize: rs(11), fontWeight: '700' },
    updatesBox: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      padding: rs(12),
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
    shareText: { color: ACCENT, fontSize: rs(12), fontWeight: '700' },
    clearText: { color: c.textMuted, fontSize: rs(12) },
    resultCard: {
      flexDirection: 'row',
      gap: rs(12),
      borderWidth: 1.5,
      borderRadius: rs(12),
      padding: rs(13),
      marginBottom: rs(10),
      backgroundColor: c.surface,
      alignItems: 'flex-start',
    },
    resultIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: rs(2),
    },
    resultName: { fontWeight: '800', fontSize: rs(13), marginBottom: rs(4) },
    resultStatus: { fontSize: rs(12), fontWeight: '600', marginBottom: rs(8) },
    remarkPill: {
      alignSelf: 'flex-start',
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
    },
    remarkText: { fontSize: rs(11), fontWeight: '600' },
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
