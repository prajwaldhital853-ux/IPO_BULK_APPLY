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
const REJECT = '#E66A5C';
const CHIP_ORANGE = '#EF6C00';
const APPLY_GREEN = '#66BB6A';

type ResultKind = 'allotted' | 'not' | 'rejected' | 'not_applied';
type StatusFilter = 'all' | ResultKind;

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

function appliedQty(row: ResultAccountStatus): number | undefined {
  if (row.appliedKitta != null && Number.isFinite(row.appliedKitta)) {
    return row.appliedKitta;
  }
  const m = String(row.message || '').match(
    /quantity\s*:\s*(\d+)/i,
  );
  if (m?.[1]) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function statusLine(row: ResultAccountStatus): string {
  const kind = classify(row);
  const qty = appliedQty(row);
  if (kind === 'allotted') {
    return qty != null ? `Alloted ( quantity : ${qty} )` : 'Alloted';
  }
  if (kind === 'not_applied') return 'NOT APPLIED';
  if (kind === 'rejected') {
    return qty != null ? `Rejected ( quantity : ${qty} )` : 'Rejected';
  }
  return qty != null ? `Not Alloted ( quantity : ${qty} )` : 'Not Alloted';
}

/** Strip status boilerplate so the pill never repeats the line above it. */
function cleanReason(raw: string): string | null {
  const text = raw
    .replace(/\s*\(HTTP\s*\d+\)\s*$/i, '')
    .replace(/^rejected\s*\(\s*quantity\s*:\s*\d+\s*\)\s*[-–—]?\s*/i, '')
    .replace(/^rejected\s*[-–—:]\s*/i, '')
    .trim();
  if (!text) return null;
  if (/^rejected\.?$/i.test(text)) return null;
  if (/^not\s*allot/i.test(text)) return null;
  if (/^block\s*amount\s*status/i.test(text)) return null;
  if (/^\(?\s*quantity\s*:/i.test(text)) return null;
  return text;
}

function rejectReason(row: ResultAccountStatus): string | null {
  for (const candidate of [row.remarks, row.allotmentStatus, row.message]) {
    const text = cleanReason(String(candidate ?? ''));
    if (!text) continue;
    if (/insufficient|not enough|low balance|block[_\s-]?fail/i.test(text)) {
      return 'Insufficient Balance';
    }
    if (/\bcrn\b/i.test(text)) return 'CRN Mismatch';
    if (/\bpan\b/i.test(text)) return 'PAN Not Registered';
    if (/duplicate|already applied/i.test(text)) return 'Duplicate Application';
    if (/expire/i.test(text)) return 'Account Expired';
    return text.length > 42 ? `${text.slice(0, 40)}…` : text;
  }
  return null;
}

function kindColor(kind: ResultKind): string {
  if (kind === 'allotted') return GREEN;
  if (kind === 'rejected') return REJECT;
  if (kind === 'not_applied') return RED;
  return RED;
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
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const counts = useMemo(() => {
    const base: Record<ResultKind, number> = {
      allotted: 0,
      not: 0,
      rejected: 0,
      not_applied: 0,
    };
    for (const row of results) base[classify(row)] += 1;
    return base;
  }, [results]);

  const chips = useMemo(() => {
    const kinds = (
      [
        { key: 'allotted', label: 'Alloted', color: GREEN },
        { key: 'not', label: 'Not Alloted', color: RED },
        { key: 'rejected', label: 'Rejected', color: REJECT },
        { key: 'not_applied', label: 'Not Applied', color: CHIP_ORANGE },
      ] as const
    )
      .map((chip) => ({ ...chip, count: counts[chip.key] }))
      .filter((chip) => chip.count > 0);
    if (kinds.length <= 1) return kinds;
    return [
      { key: 'all' as const, label: 'All', color: ACCENT, count: results.length },
      ...kinds,
    ];
  }, [counts, results.length]);

  const visibleResults = useMemo(
    () =>
      filter === 'all'
        ? results
        : results.filter((row) => classify(row) === filter),
    [filter, results],
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
    setFilter('all');
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
        setFilter('all');
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
            color={colors.text}
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
          <Ionicons
            name="chevron-down"
            size={rs(18)}
            color={isDark ? colors.textMuted : '#8A938A'}
          />
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
            <ActivityIndicator size="small" color={GREEN} />
          ) : (
            <Ionicons
              name="chevron-down"
              size={rs(18)}
              color={isDark ? colors.textMuted : '#8A938A'}
            />
          )}
        </Pressable>

        <Pressable
          style={[styles.actionBtn, running && styles.actionBtnLoading]}
          onPress={runCheck}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color={GREEN} />
          ) : (
            <Text style={styles.actionText}>Check Bulk Status</Text>
          )}
        </Pressable>
      </View>

      {results.length > 0 ? (
        <View
          style={[
            styles.resultsPane,
            { paddingBottom: Math.max(insets.bottom, rs(12)) },
          ]}
        >
          <View style={styles.updatesBox}>
            <View style={styles.updatesHead}>
              <Text style={styles.updatesTitle}>
                IPO/FPO Status Updates{' '}
                <Text style={styles.updatesCount}>
                  ({results.length}/{counts.allotted})
                </Text>
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setResults([]);
                  setFilter('all');
                }}
              >
                <Text style={styles.clearText}>clear</Text>
              </Pressable>
            </View>

            <View style={styles.chipRow}>
              {chips.map((chip) => {
                const active =
                  filter === chip.key || (filter === 'all' && chips.length === 1);
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? chip.color : colors.borderMuted,
                        backgroundColor: active
                          ? `${chip.color}1A`
                          : 'transparent',
                      },
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

            <FlatList
              style={styles.resultsList}
              data={visibleResults}
              keyExtractor={(row) => row.accountId}
              contentContainerStyle={styles.resultsListBody}
              ListEmptyComponent={
                <Text style={styles.empty}>No accounts in this category.</Text>
              }
              renderItem={({ item: row }) => {
                const idx = results.indexOf(row);
                const kind = classify(row);
                const color = kindColor(kind);
                const reason =
                  kind === 'rejected' ? rejectReason(row) : null;
                const showApply =
                  kind === 'not_applied' || kind === 'rejected';
                const applyBtnColor =
                  kind === 'not_applied' ? APPLY_GREEN : color;
                return (
                  <View
                    style={[
                      styles.resultCard,
                      {
                        borderColor: `${color}55`,
                        backgroundColor: isDark ? colors.surface : `${color}12`,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.resultIcon,
                        styles.resultIconSquare,
                        { backgroundColor: `${color}26` },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          kind === 'allotted'
                            ? 'check-bold'
                            : kind === 'rejected'
                              ? 'alert-octagon'
                              : 'cancel'
                        }
                        size={rs(19)}
                        color={color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color }]}>
                        {idx + 1}. {row.accountName.toUpperCase()}
                      </Text>
                      <Text style={[styles.resultStatus, { color }]}>
                        {statusLine(row)}
                      </Text>
                      {reason ? (
                        <View
                          style={[
                            styles.reasonPill,
                            { backgroundColor: `${color}22` },
                          ]}
                        >
                          <Text
                            style={[styles.reasonPillText, { color }]}
                            numberOfLines={2}
                          >
                            {reason}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {showApply ? (
                      <Pressable
                        style={[
                          styles.rowApplyBtn,
                          {
                            borderColor: isDark
                              ? `${applyBtnColor}66`
                              : '#D0D0D0',
                          },
                        ]}
                        onPress={() =>
                          navigation.navigate('MainTabs', { screen: 'Apply' })
                        }
                      >
                        <Text
                          style={[
                            styles.rowApplyText,
                            { color: applyBtnColor },
                          ]}
                        >
                          Apply
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              }}
            />
          </View>
        </View>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>
            {running && progress
              ? `Checking ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : 'Run Check Bulk Status to see account results here.'}
          </Text>
        </View>
      )}

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
  const fieldBg = isDark ? c.surface : '#F4F6F4';
  const fieldBorder = isDark ? c.border : '#E2E6E2';
  const fieldText = isDark ? c.textMuted : '#6C766C';
  const cardBg = isDark ? c.bgElevated : '#FFFFFF';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: isDark ? c.bgElevated : '#FFFFFF',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? c.border : '#E2E6E2',
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
      paddingTop: rs(14),
      paddingBottom: rs(4),
    },
    resultsList: { flex: 1, minHeight: 0 },
    resultsListBody: { paddingBottom: rs(8) },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: fieldBorder,
      borderRadius: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      backgroundColor: fieldBg,
      marginBottom: rs(12),
      gap: rs(8),
    },
    dropdownText: {
      flex: 1,
      color: fieldText,
      fontSize: rs(13),
      fontWeight: '500',
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(10),
    },
    label: {
      color: isDark ? c.textSecondary : '#1B2E1B',
      fontSize: rs(13),
      fontWeight: '700',
    },
    actionBtn: {
      alignSelf: 'center',
      borderRadius: rs(22),
      paddingHorizontal: rs(28),
      paddingVertical: rs(13),
      marginTop: rs(16),
      marginBottom: rs(14),
      minWidth: rs(180),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
    },
    actionBtnLoading: {
      backgroundColor: isDark ? c.surface : '#EDF0ED',
      minWidth: rs(92),
      paddingHorizontal: rs(24),
    },
    actionText: { color: '#FFFFFF', fontWeight: '800', fontSize: rs(14) },
    resultsPane: { flex: 1, paddingHorizontal: rs(14) },
    updatesBox: {
      flex: 1,
      minHeight: 0,
      borderWidth: 1,
      borderColor: isDark ? c.border : '#E2E6E2',
      borderRadius: rs(12),
      backgroundColor: cardBg,
      paddingHorizontal: rs(10),
      paddingTop: rs(10),
    },
    updatesHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(10),
    },
    updatesTitle: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    updatesCount: { color: GREEN, fontWeight: '800' },
    clearText: { color: c.textMuted, fontSize: rs(12), fontWeight: '600' },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginTop: rs(10),
      marginBottom: rs(10),
    },
    chip: {
      borderWidth: 1,
      borderRadius: rs(14),
      paddingHorizontal: rs(12),
      paddingVertical: rs(5),
    },
    chipText: { fontSize: rs(11), fontWeight: '700' },
    resultCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderWidth: 1,
      borderRadius: rs(10),
      padding: rs(10),
      marginBottom: rs(8),
    },
    resultIcon: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(17),
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultIconSquare: {
      borderRadius: rs(8),
    },
    resultName: { fontWeight: '800', fontSize: rs(12) },
    resultStatus: {
      fontSize: rs(11),
      fontWeight: '700',
      marginTop: rs(2),
    },
    reasonPill: {
      alignSelf: 'flex-start',
      marginTop: rs(6),
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
    },
    reasonPillText: {
      fontSize: rs(11),
      fontWeight: '700',
    },
    rowApplyBtn: {
      borderWidth: 1,
      borderRadius: rs(14),
      paddingHorizontal: rs(14),
      paddingVertical: rs(6),
      backgroundColor: isDark ? 'transparent' : '#FFFFFF',
    },
    rowApplyText: { fontSize: rs(11), fontWeight: '700' },
    emptyWrap: { flex: 1, justifyContent: 'flex-start', paddingTop: rs(24) },
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
