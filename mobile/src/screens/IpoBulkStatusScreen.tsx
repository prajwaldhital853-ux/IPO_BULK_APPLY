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
import { AccountCheckboxPickerRow } from '../components/AccountListRows';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import { isMockAccountId } from '../data/mockAccounts';
import {
  humanizeApplicationStatus,
  loadCheckableIssuesForUi,
  runBulkResultCheck,
  type ApplicationReportRow,
  type OpenIssue,
  type ResultAccountStatus,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import {
  buildCheckAccountIdSet,
  isAllAccountsSelected,
  isCheckAccountSelected,
  resolveCheckAccounts,
  toggleCheckAccountId,
} from '../utils/checkAccountSelection';
import { filterAccountsByQuery } from '../utils/filterAccounts';
import { ACCOUNT_LIST_FLAT_PROPS } from '../utils/flatListPerf';
import { useAfterInteractions } from '../utils/useAfterInteractions';
import { usePullToRefresh } from '../utils/usePullToRefresh';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

const ACCENT = '#2D5A27';
/** Deep forest green for check CTAs in dark mode */
const ACCENT_DARK = '#0A3A14';
const HEADER_BG = '#E8F0E6';
const BODY_BG = '#F6F8F2';
/** Pure status colors — high contrast on light (and dark) backgrounds */
const GREEN = '#2E7D32';
const RED = '#C62828';

function badgeType(shareTypeName: string): string {
  const s = (shareTypeName || 'IPO').toUpperCase();
  if (s.includes('FPO')) return 'FPO';
  if (s.includes('RIGHT')) return 'RIGHT';
  return 'IPO';
}

function classify(row: ResultAccountStatus): 'allotted' | 'not' | 'rejected' | 'not_applied' {
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
  if (/REJECT|FAIL|ERROR|CANCEL/i.test(row.status + row.message)) return 'rejected';
  return 'not';
}

function statusLine(row: ResultAccountStatus): string {
  if (
    row.status === 'NOT_APPLIED' ||
    /no application found|not applied|have not applied/i.test(row.message)
  ) {
    return 'You have not applied for this IPO';
  }
  if (row.message && /quantity\s*:/i.test(row.message)) {
    return row.message;
  }
  const kind = classify(row);
  const qty = row.appliedKitta;
  if (kind === 'allotted') {
    return qty != null ? `Alloted ( quantity : ${qty} )` : 'Alloted';
  }
  if (kind === 'not_applied') {
    return 'You have not applied for this IPO';
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
  const { usableAccounts: accounts } = useActiveAccounts();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const ready = useAfterInteractions();

  const [checkAccountIds, setCheckAccountIds] = useState<string[]>([]);
  const [accountPickerFilter, setAccountPickerFilter] = useState('');
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companies, setCompanies] = useState<ApplicationReportRow[]>([]);
  const [selected, setSelected] = useState<ApplicationReportRow | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultAccountStatus[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [filter, setFilter] = useState<'all' | 'allotted' | 'not' | 'rejected'>(
    'all',
  );
  const loadGenRef = useRef(0);

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

  const filteredPickerAccounts = useMemo(
    () => filterAccountsByQuery(accounts, accountPickerFilter),
    [accounts, accountPickerFilter],
  );

  const resultIndexByAccountId = useMemo(() => {
    const m = new Map<string, number>();
    results.forEach((r, i) => m.set(r.accountId, i));
    return m;
  }, [results]);

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

  const checkAccountKey = useMemo(
    () =>
      checkAccounts
        .map((a) => a.id)
        .sort()
        .join('|'),
    [checkAccounts],
  );

  const loadCompanies = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const selectedAccounts = accounts.filter((a) => {
      if (!checkAccountKey) return true;
      const ids = new Set(checkAccountKey.split('|').filter(Boolean));
      return ids.has(a.id);
    });
    const queue =
      selectedAccounts.length > 0
        ? selectedAccounts
        : accounts;

    if (!queue.length) {
      if (gen === loadGenRef.current) {
        setCompanies([]);
        setSelected(null);
        setLoadingList(false);
      }
      return;
    }

    setLoadingList(true);
    try {
      const map = new Map<number, ApplicationReportRow>();
      const realAccounts = queue.filter(
        (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
      );
      const targets = (realAccounts.length ? realAccounts : queue).slice(0, 5);
      let lastError: string | null = null;

      for (const acc of targets) {
        if (acc.id.startsWith('demo_') || isMockAccountId(acc.id)) continue;
        try {
          const loaded = await loadCheckableIssuesForUi(acc);
          if (gen !== loadGenRef.current) return;

          // Prefer application reports; also map open/applicable issues so the
          // dropdown is not empty when reports are briefly unavailable.
          for (const r of loaded.reports) {
            if (r.companyShareId > 0 && !map.has(r.companyShareId)) {
              map.set(r.companyShareId, r);
            }
          }
          for (const issue of loaded.issues) {
            if (issue.companyShareId <= 0 || map.has(issue.companyShareId)) {
              continue;
            }
            map.set(issue.companyShareId, {
              companyShareId: issue.companyShareId,
              companyName: issue.companyName,
              scrip: issue.scrip,
              shareTypeName: issue.shareTypeName ?? 'IPO',
              statusName: issue.alreadyApplied
                ? 'TRANSACTION_SUCCESS'
                : 'OPEN',
              appliedDate: issue.issueOpenDate,
            });
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : 'Failed to load';
        }
      }

      if (gen !== loadGenRef.current) return;

      const list = Array.from(map.values()).sort((a, b) =>
        a.companyName.localeCompare(b.companyName),
      );

      if (
        queue.some(
          (a) => a.id.startsWith('demo_') || isMockAccountId(a.id),
        )
      ) {
        if (!list.some((c) => c.companyShareId === 999001)) {
          list.unshift({
            companyShareId: 999001,
            companyName: 'DEMO CEMENT INDUSTRIES LIMITED',
            scrip: 'DEMO',
            shareTypeName: 'IPO',
            statusName: 'CREATE_APPROVE',
          });
        }
      }

      if (!list.length) {
        // Keep prior list if we already had one; only blank when first load fails.
        setCompanies((prev) => {
          if (prev.length) return prev;
          return [];
        });
        if (lastError && gen === loadGenRef.current) {
          Alert.alert('Could not load', lastError);
        }
        return;
      }

      setCompanies(list);
      setSelected((prev) =>
        prev && list.some((c) => c.companyShareId === prev.companyShareId)
          ? prev
          : list[0] ?? null,
      );
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Failed to load listed IPOs',
      );
    } finally {
      if (gen === loadGenRef.current) setLoadingList(false);
    }
  }, [accounts, checkAccountKey]);

  // Shell paints first; MeroShare company list waits for the stack transition.
  useEffect(() => {
    if (!ready) return;
    void loadCompanies();
  }, [ready, loadCompanies]);

  const { refreshing, onRefresh } = usePullToRefresh(loadCompanies);
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  useEffect(() => {
    setResults([]);
  }, [selected?.companyShareId]);

  const toggleAccount = useCallback(
    (account: AccountMeta) => {
      setCheckAccountIds((prev) =>
        toggleCheckAccountId(accounts, prev, account.id),
      );
    },
    [accounts],
  );

  const checkLabel =
    allAccountsSelected
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
              setResults((prev) => {
                const i = prev.findIndex((r) => r.accountId === row.accountId);
                if (i < 0) return [...prev, row];
                const next = prev.slice();
                next[i] = row;
                return next;
              });
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
            color={isDark ? colors.text : ACCENT}
          />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      <View style={styles.controls}>
        <Pressable
          style={styles.dropdown}
          onPress={() => setCheckPickerOpen(true)}
        >
          <Text
            style={[
              styles.dropdownText,
              checkAccounts.length === accounts.length && styles.dropdownPlaceholder,
            ]}
            numberOfLines={1}
          >
            {checkLabel}
          </Text>
          <Ionicons
            name="caret-down"
            size={rs(14)}
            color={isDark ? colors.textMuted : '#6B726B'}
          />
        </Pressable>

        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="bank"
            size={rs(16)}
            color={isDark ? colors.text : '#1B2E1B'}
          />
          <Text style={styles.label}>Listed IPO/FPO</Text>
        </View>

        <Pressable
          style={styles.dropdown}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingList || companies.length === 0}
        >
          <Text
            style={[
              styles.dropdownText,
              styles.dropdownValue,
              !selected && styles.dropdownPlaceholder,
            ]}
            numberOfLines={1}
          >
            {selected
              ? `${selected.companyName}${selected.scrip ? ` (${selected.scrip})` : ''}`
              : loadingList
                ? 'Loading…'
                : 'No listed IPO/FPO'}
          </Text>
          {loadingList ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Ionicons
              name="caret-down"
              size={rs(14)}
              color={isDark ? colors.textMuted : '#6B726B'}
            />
          )}
        </Pressable>

        <Pressable
          style={[styles.actionBtn, running && { opacity: 0.6 }]}
          onPress={runCheck}
          disabled={running || !selected}
        >
          {running ? (
            <ActivityIndicator color={isDark ? '#FFFFFF' : ACCENT} />
          ) : (
            <Text style={styles.actionText}>IPO Bulk Status</Text>
          )}
        </Pressable>

        {running && progress ? (
          <View style={styles.progressWrap}>
            <ActivityIndicator size="small" color={isDark ? ACCENT : '#1B5E20'} />
            <Text style={styles.progressText}>
              Checking account {progress.done}/{progress.total}…
            </Text>
          </View>
        ) : null}
      </View>

      {results.length > 0 ? (
        <View style={styles.resultsPane}>
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

            <FlatList
              style={styles.resultsList}
              data={visibleResults}
              keyExtractor={(row) => row.accountId}
              contentContainerStyle={styles.resultsListBody}
              refreshControl={refreshControl}
              {...ACCOUNT_LIST_FLAT_PROPS}
              ListEmptyComponent={
                <Text style={styles.empty}>No accounts in this category.</Text>
              }
              renderItem={({ item: row }) => {
                const idx = resultIndexByAccountId.get(row.accountId) ?? 0;
                const kind = classify(row);
                const color =
                  kind === 'allotted' ? GREEN : kind === 'rejected' ? '#FB8C00' : RED;
                const icon =
                  kind === 'allotted' ? 'checkmark' : kind === 'rejected' ? 'alert' : 'close';
                return (
                  <View style={[styles.resultCard, { borderColor: color }]}>
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
              }}
            />
          </View>
        </View>
      ) : null}

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
                <Ionicons name="checkmark" size={rs(20)} color={ACCENT} />
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
                <AccountCheckboxPickerRow
                  account={item}
                  selected={isCheckAccountSelected(item.id, checkAccountIdSet)}
                  onPress={() => toggleAccount(item)}
                  accentColor={ACCENT}
                  mutedColor={colors.textMuted}
                  rowStyle={styles.modalRow}
                  titleStyle={styles.modalRowTitle}
                />
              )}
            />
            <Pressable
              style={[styles.modalDone, styles.actionBtn]}
              onPress={() => {
                setCheckPickerOpen(false);
                setAccountPickerFilter('');
              }}
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
              style={[styles.modalDone, styles.actionBtn]}
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

function makeStyles(c: ThemeColors, isDark: boolean) {
  const fieldBg = isDark ? c.surface : BODY_BG;
  const fieldBorder = isDark ? c.border : '#8E968E';
  const fieldText = isDark ? c.text : '#1B2E1B';
  const cardBg = isDark ? c.surface : '#FFFFFF';
  const boxBorder = isDark ? c.border : '#C5CBC5';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? c.bg : BODY_BG },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: isDark ? c.bgElevated : HEADER_BG,
    },
    title: {
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
    },
    controls: {
      paddingHorizontal: rs(18),
      paddingTop: rs(18),
      paddingBottom: rs(4),
    },
    resultsPane: {
      flex: 1,
      paddingHorizontal: rs(16),
      paddingBottom: rs(12),
      minHeight: 0,
    },
    resultsList: { flex: 1 },
    resultsListBody: { paddingBottom: rs(16) },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: fieldBorder,
      borderRadius: rs(22),
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      minHeight: rs(46),
      backgroundColor: fieldBg,
      marginBottom: rs(14),
      gap: rs(8),
    },
    dropdownText: {
      flex: 1,
      color: fieldText,
      fontSize: rs(13),
      fontWeight: '500',
    },
    dropdownPlaceholder: {
      color: isDark ? c.textMuted : '#8A938A',
      fontWeight: '500',
    },
    dropdownValue: {
      color: isDark ? c.text : '#1B2E1B',
      fontWeight: '600',
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(10),
    },
    label: {
      color: isDark ? c.text : '#1B2E1B',
      fontSize: rs(13),
      fontWeight: '700',
    },
    companyRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    ipoBadge: {
      backgroundColor: isDark ? GREEN : ACCENT,
      borderRadius: rs(4),
      paddingHorizontal: rs(6),
      paddingVertical: rs(2),
    },
    ipoBadgeText: { color: '#FFF', fontWeight: '800', fontSize: rs(10) },
    companyText: {
      flex: 1,
      color: isDark ? c.text : '#1B2E1B',
      fontSize: rs(13),
      fontWeight: '600',
    },
    actionBtn: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: isDark ? ACCENT_DARK : '#C5D0C5',
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      marginTop: rs(10),
      marginBottom: rs(10),
      minWidth: rs(168),
      alignItems: 'center',
      backgroundColor: isDark ? ACCENT_DARK : BODY_BG,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: isDark ? 0 : 1,
    },
    actionText: {
      color: isDark ? '#FFFFFF' : ACCENT,
      fontWeight: '700',
      fontSize: rs(14),
    },
    progressWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(8),
      marginBottom: rs(4),
    },
    progressText: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginBottom: rs(12),
    },
    chip: {
      borderWidth: isDark ? 1 : 1.5,
      borderColor: isDark ? c.border : '#5F6B5F',
      borderRadius: rs(16),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      backgroundColor: isDark ? c.surface : '#FFFFFF',
    },
    chipText: { fontSize: rs(11), fontWeight: '700' },
    updatesBox: {
      flex: 1,
      borderWidth: isDark ? 1 : 1.5,
      borderColor: boxBorder,
      borderRadius: rs(14),
      padding: rs(12),
      minHeight: 0,
      backgroundColor: isDark ? 'transparent' : '#FFFFFF',
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
    shareText: {
      color: isDark ? ACCENT : '#1B5E20',
      fontSize: rs(12),
      fontWeight: '800',
    },
    clearText: { color: c.textMuted, fontSize: rs(12) },
    resultCard: {
      flexDirection: 'row',
      gap: rs(12),
      borderWidth: 1.5,
      borderRadius: rs(12),
      padding: rs(13),
      marginBottom: rs(10),
      backgroundColor: cardBg,
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
    modalList: { flex: 1 },
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
    modalRowTitle: { flex: 1, color: c.text, fontWeight: '600', fontSize: rs(13) },
    modalDone: { alignItems: 'center', paddingVertical: rs(14) },
  });
}
