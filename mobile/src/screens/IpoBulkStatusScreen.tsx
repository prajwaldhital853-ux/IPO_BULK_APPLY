import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
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
import { floatingTabBarClearance } from '../components/AppTabBar';
import { GlassClusterBackground } from '../components/GlassClusterBackground';
import { GlassIpoPickerField } from '../components/GlassIpoPickerField';
import { GlassPrimaryButton } from '../components/GlassPrimaryButton';
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
import { DEMO_OPENINGS } from '../services/meroshare/client';
import { rs } from '../utils/responsive';
import {
  buildCheckAccountIdSet,
  isAllAccountsSelected,
  isCheckAccountSelected,
  resolveCheckAccounts,
  toggleCheckAccountId,
} from '../utils/checkAccountSelection';
import { filterAccountsByQuery } from '../utils/filterAccounts';
import { shareIpoBulkStatusExcel } from '../utils/ipoBulkStatusExport';
import {
  applicationPhaseRemarks,
  applicationPhaseStatusLine,
  classifyApplicationPhase,
  shouldUseApplicationPhaseStatus,
} from '../utils/ipoApplicationPhase';
import { ACCOUNT_LIST_FLAT_PROPS } from '../utils/flatListPerf';
import {
  buildStatusCardStyle,
  chipActiveBackground,
  STATUS_NOT_APPLIED,
  STATUS_REJECTED,
  STATUS_VERIFIED,
} from '../utils/statusCardStyle';
import { useAfterInteractions } from '../utils/useAfterInteractions';
import { usePullToRefresh } from '../utils/usePullToRefresh';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

const ACCENT = '#2D5A27';
/** Deep forest green for check CTAs in dark mode */
const ACCENT_DARK = '#0A3A14';
/** Pure status colors — high contrast on light (and dark) backgrounds */
const GREEN = '#2E7D32';
const RED = '#C62828';
const REJECT_RED = STATUS_REJECTED;
const VERIFIED_GREEN = STATUS_VERIFIED;
const CHIP_ORANGE = STATUS_NOT_APPLIED;
/** Blue for unverified (open IPO) and rejected (published result) rows. */
const STATUS_BLUE = '#1976D2';
const OTHERS_BLUE = '#5C6BC0';

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

type AllotmentFilter = 'all' | 'allotted' | 'not' | 'rejected' | 'others';
type ApplicationFilter =
  | 'all'
  | 'verified'
  | 'unverified'
  | 'rejected'
  | 'not_applied';
type StatusFilter = AllotmentFilter | ApplicationFilter;

function resultText(row: ResultAccountStatus): string {
  return `${row.status} ${row.allotmentStatus ?? ''} ${row.remarks ?? ''} ${row.message}`;
}

function isNotAppliedRow(row: ResultAccountStatus): boolean {
  return classify(row) === 'not_applied';
}

function isInsufficientBalanceRow(row: ResultAccountStatus): boolean {
  const text = resultText(row);
  return (
    /insufficient|not enough|low balance|insufficen|balance.?not.?available|insufficient.?fund/i.test(
      text,
    ) ||
    /block[_\s-]?fail|amount.?block.?fail|block.?amount.?fail/i.test(text)
  );
}

/** UI filter bucket — Rejected = insufficient balance only; Others = rest. */
function resolveFilterBucket(
  row: ResultAccountStatus,
): Exclude<StatusFilter, 'all'> {
  if (isNotAppliedRow(row)) return 'others';
  const kind = classify(row);
  if (kind === 'allotted') return 'allotted';
  if (kind === 'not') return 'not';
  if (isInsufficientBalanceRow(row)) return 'rejected';
  return 'others';
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

export function IpoBulkStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { operationalAccounts: accounts, overQuota } = useActiveAccounts();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const tabClearance = floatingTabBarClearance(insets.bottom);
  const ready = useAfterInteractions();
  const modalListHeight = useMemo(
    () => Math.max(rs(160), Dimensions.get('window').height * 0.38),
    [],
  );

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
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [openCompanyShareIds, setOpenCompanyShareIds] = useState<Set<number>>(
    () => new Set(),
  );
  const loadGenRef = useRef(0);

  const applicationPhase = useMemo(
    () => shouldUseApplicationPhaseStatus(selected, openCompanyShareIds),
    [selected, openCompanyShareIds],
  );

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
      const openIds = new Set<number>();
      const realAccounts = queue.filter(
        (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
      );
      const targets = (realAccounts.length ? realAccounts : queue).slice(0, 5);
      let lastError: string | null = null;

      const loadedSets = await Promise.all(
        targets.map(async (acc) => {
          if (acc.id.startsWith('demo_') || isMockAccountId(acc.id)) {
            return null;
          }
          try {
            return await loadCheckableIssuesForUi(acc);
          } catch (e) {
            lastError = e instanceof Error ? e.message : 'Failed to load';
            return null;
          }
        }),
      );
      if (gen !== loadGenRef.current) return;

      for (const loaded of loadedSets) {
        if (!loaded) continue;
        for (const id of loaded.openCompanyShareIds) {
          openIds.add(id);
        }
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
        const demo = DEMO_OPENINGS[0];
        if (demo && !list.some((c) => c.companyShareId === demo.companyShareId)) {
          list.unshift({
            companyShareId: demo.companyShareId,
            companyName: demo.companyName,
            scrip: demo.scrip,
            shareTypeName: demo.shareTypeName ?? 'IPO',
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
      setOpenCompanyShareIds(openIds);
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
    setFilter('all');
  }, [selected?.companyShareId, applicationPhase]);

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
        const useApplicationPhase = shouldUseApplicationPhaseStatus(
          selected,
          openCompanyShareIds,
        );
        try {
          await runBulkResultCheck({
            accounts: checkAccounts,
            issue,
            applicationPhase: useApplicationPhase,
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

  const allotmentFilterCounts = useMemo(() => {
    const counts = {
      all: results.length,
      allotted: 0,
      not: 0,
      rejected: 0,
      others: 0,
    };
    for (const row of results) {
      counts[resolveFilterBucket(row)] += 1;
    }
    return counts;
  }, [results]);

  const applicationFilterCounts = useMemo(() => {
    const counts = {
      all: results.length,
      verified: 0,
      unverified: 0,
      rejected: 0,
      not_applied: 0,
    };
    for (const row of results) {
      counts[classifyApplicationPhase(row)] += 1;
    }
    return counts;
  }, [results]);

  const applicationChips = useMemo(() => {
    const kinds = (
      [
        { key: 'verified' as const, label: 'Verified', color: VERIFIED_GREEN },
        { key: 'unverified' as const, label: 'Unverified', color: STATUS_BLUE },
        { key: 'rejected' as const, label: 'Rejected', color: REJECT_RED },
        { key: 'not_applied' as const, label: 'Not Applied', color: CHIP_ORANGE },
      ] as const
    )
      .map((chip) => ({ ...chip, count: applicationFilterCounts[chip.key] }))
      .filter((chip) => chip.count > 0);
    if (kinds.length <= 1) return kinds;
    return [
      { key: 'all' as const, label: 'All', color: ACCENT, count: results.length },
      ...kinds,
    ];
  }, [applicationFilterCounts, results.length]);

  const allotmentChips = useMemo(() => {
    const kinds = (
      [
        { key: 'allotted' as const, label: 'Alloted', color: GREEN },
        { key: 'not' as const, label: 'Not Allot', color: RED },
        { key: 'rejected' as const, label: 'Rejected', color: STATUS_BLUE },
        { key: 'others' as const, label: 'Others', color: OTHERS_BLUE },
      ] as const
    )
      .map((chip) => ({ ...chip, count: allotmentFilterCounts[chip.key] }))
      .filter((chip) => chip.count > 0);
    if (kinds.length <= 1) return kinds;
    return [
      { key: 'all' as const, label: 'All', color: colors.text, count: results.length },
      ...kinds,
    ];
  }, [allotmentFilterCounts, colors.text, results.length]);

  const statusChips = applicationPhase ? applicationChips : allotmentChips;

  const visibleResults = useMemo(() => {
    if (filter === 'all') return results;
    if (applicationPhase) {
      return results.filter((row) => classifyApplicationPhase(row) === filter);
    }
    return results.filter((row) => resolveFilterBucket(row) === filter);
  }, [results, filter, applicationPhase]);

  const shareToExcel = async () => {
    if (!results.length) {
      Alert.alert('No results', 'Run IPO Bulk Status first.');
      return;
    }
    const company = selected?.companyName ?? results[0]?.companyName ?? 'IPO';
    const symbol = selected?.scrip ?? '';
    try {
      await shareIpoBulkStatusExcel({
        results,
        accounts: checkAccounts,
        companyName: company,
        symbol,
      });
    } catch (e) {
      Alert.alert(
        'Share failed',
        e instanceof Error ? e.message : 'Could not share Excel file',
      );
    }
  };

  const companyLabel = selected
    ? `${selected.companyName}${selected.scrip ? ` (${selected.scrip})` : ''}`
    : loadingList
      ? 'Loading…'
      : 'No listed IPO/FPO';

  return (
    <GlassClusterBackground variant="default" style={{ paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons
            name="format-list-checks"
            size={rs(20)}
            color={isDark ? '#67E8F9' : '#1565C0'}
          />
          <Text style={styles.title}>IPO Bulk Status</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() =>
            Alert.alert(
              'IPO Bulk Status',
              'Open IPOs (result not out) show Verified / Unverified / Rejected like Current IPO Status. Closed IPOs with published results show Alloted / Not Allot filters.',
            )
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={rs(22)}
            color={isDark ? '#67E8F9' : '#1565C0'}
          />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
        {overQuota && accounts.length > 0 ? (
          <Text style={styles.quotaHint}>
            Status checks use every saved account on this phone, including locked
            ones.
          </Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        <GlassIpoPickerField
          icon="accounts"
          label={checkLabel}
          placeholder={checkAccounts.length === accounts.length}
          onPress={() => setCheckPickerOpen(true)}
        />
        <GlassIpoPickerField
          icon="ipo"
          label={companyLabel}
          placeholder={!selected}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingList || companies.length === 0}
          loading={loadingList}
        />
        <GlassPrimaryButton
          label="IPO Bulk Status"
          onPress={runCheck}
          disabled={!selected}
          loading={running}
        />

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

            {statusChips.length > 0 ? (
              <View style={styles.chipWrap}>
                <View style={styles.chipRowWrap}>
                  {statusChips.map((chip) => {
                    const active =
                      filter === chip.key ||
                      (filter === 'all' && statusChips.length === 1);
                    return (
                      <Pressable
                        key={chip.key}
                        onPress={() => setFilter(chip.key)}
                        style={[
                          styles.chip,
                          styles.chipWrapItem,
                          active && {
                            borderColor: chip.color,
                            backgroundColor: chipActiveBackground(chip.color, isDark),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: active ? chip.color : colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {chip.label} ({chip.count})
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <FlatList
              style={styles.resultsList}
              data={visibleResults}
              keyExtractor={(row) => row.accountId}
              contentContainerStyle={[
                styles.resultsListBody,
                { paddingBottom: tabClearance },
              ]}
              refreshControl={refreshControl}
              {...ACCOUNT_LIST_FLAT_PROPS}
              ListEmptyComponent={
                <Text style={styles.empty}>No accounts in this category.</Text>
              }
              renderItem={({ item: row }) => {
                const idx = resultIndexByAccountId.get(row.accountId) ?? 0;

                if (applicationPhase) {
                  const appKind = classifyApplicationPhase(row);
                  const color =
                    appKind === 'verified'
                      ? VERIFIED_GREEN
                      : appKind === 'unverified'
                        ? STATUS_BLUE
                        : appKind === 'rejected'
                          ? REJECT_RED
                          : RED;
                  const card = buildStatusCardStyle(color, isDark);
                  const remarks = applicationPhaseRemarks(row);
                  const mciIcon =
                    appKind === 'verified'
                      ? 'check-bold'
                      : appKind === 'unverified'
                        ? 'clock-outline'
                        : appKind === 'rejected'
                          ? 'alert-octagon'
                          : 'cancel';
                  return (
                    <View
                      style={[
                        styles.resultCard,
                        {
                          borderColor: card.borderColor,
                          backgroundColor: card.backgroundColor,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.resultIcon,
                          styles.resultIconSquare,
                          { backgroundColor: card.iconBackground },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={mciIcon}
                          size={rs(19)}
                          color={card.iconColor}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultName, { color: card.textColor }]}>
                          {idx + 1}. {row.accountName.toUpperCase()}
                        </Text>
                        <Text style={[styles.resultStatus, { color: card.textColor }]}>
                          {applicationPhaseStatusLine(row)}
                        </Text>
                        {remarks ? (
                          <View
                            style={[
                              styles.remarkPill,
                              { backgroundColor: card.pillBackground },
                            ]}
                          >
                            <Text
                              style={[styles.remarkText, { color: card.textColor }]}
                              numberOfLines={4}
                            >
                              {remarks}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                }

                const kind = classify(row);
                const bucket = resolveFilterBucket(row);
                const color =
                  kind === 'allotted'
                    ? GREEN
                    : bucket === 'rejected'
                      ? STATUS_BLUE
                      : bucket === 'others'
                        ? OTHERS_BLUE
                        : RED;
                const allotmentCard = buildStatusCardStyle(color, isDark);
                const icon =
                  kind === 'allotted'
                    ? 'checkmark'
                    : bucket === 'rejected'
                      ? 'alert'
                      : bucket === 'others'
                        ? 'ellipsis-horizontal'
                        : 'close';
                return (
                  <View
                    style={[
                      styles.resultCard,
                      {
                        borderColor: allotmentCard.borderColor,
                        backgroundColor: allotmentCard.backgroundColor,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.resultIcon,
                        { backgroundColor: allotmentCard.iconBackground },
                      ]}
                    >
                      <Ionicons
                        name={icon}
                        size={rs(20)}
                        color={allotmentCard.iconColor}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.resultName, { color: allotmentCard.textColor }]}
                      >
                        {idx + 1}. {row.accountName.toUpperCase()}
                      </Text>
                      <Text
                        style={[styles.resultStatus, { color: allotmentCard.textColor }]}
                      >
                        {statusLine(row)}
                      </Text>
                      <View
                        style={[
                          styles.remarkPill,
                          { backgroundColor: allotmentCard.pillBackground },
                        ]}
                      >
                        <Text
                          style={[styles.remarkText, { color: allotmentCard.textColor }]}
                        >
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
              style={[styles.modalList, { maxHeight: modalListHeight }]}
              data={filteredPickerAccounts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              {...ACCOUNT_LIST_FLAT_PROPS}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {accountPickerFilter.trim()
                    ? 'No accounts match your search.'
                    : 'No saved accounts yet. Add capital from Apply first.'}
                </Text>
              }
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
              <Text style={styles.modalDoneText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SensitiveActionModals action={sensitive} />
    </GlassClusterBackground>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const boxBorder = isDark ? c.borderMuted : 'rgba(186,230,253,0.55)';

  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      backgroundColor: 'transparent',
    },
    headerTitleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      marginHorizontal: rs(8),
    },
    title: {
      color: isDark ? c.text : '#1B2A4A',
      fontSize: rs(17),
      fontWeight: '800',
    },
    controls: {
      paddingHorizontal: rs(16),
      paddingTop: rs(6),
      paddingBottom: rs(4),
    },
    resultsPane: {
      flex: 1,
      paddingHorizontal: rs(16),
      paddingBottom: rs(12),
      minHeight: 0,
    },
    resultsList: { flex: 1 },
    resultsListBody: {},
    progressWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(8),
      marginBottom: rs(4),
    },
    progressText: { color: c.textSecondary, fontSize: rs(12), fontWeight: '600' },
    chipWrap: { marginBottom: rs(12), gap: rs(8) },
    chipRowWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
    },
    chipWrapItem: {
      flex: 0,
      minWidth: rs(88),
    },
    chipRow: {
      flexDirection: 'row',
      gap: rs(8),
    },
    chipRowBottom: {
      flexDirection: 'row',
    },
    chip: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: isDark ? c.border : 'rgba(186,230,253,0.7)',
      borderRadius: rs(16),
      paddingHorizontal: rs(8),
      paddingVertical: rs(6),
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipBottom: {
      flex: 0,
      width: '23.5%',
      minWidth: rs(78),
    },
    chipText: { fontSize: rs(11), fontWeight: '700', textAlign: 'center' },
    updatesBox: {
      flex: 1,
      borderWidth: 1,
      borderColor: boxBorder,
      borderRadius: rs(16),
      padding: rs(12),
      minHeight: 0,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.35)',
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
    resultIconSquare: {
      borderRadius: rs(8),
      width: rs(34),
      height: rs(34),
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
    modalList: { flexGrow: 0 },
    quotaHint: {
      color: c.textMuted,
      fontSize: rs(11),
      marginBottom: rs(8),
      lineHeight: rs(15),
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
    modalRowTitle: { flex: 1, color: c.text, fontWeight: '600', fontSize: rs(13) },
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
    modalDone: { alignItems: 'center', paddingVertical: rs(14) },
    modalDoneText: {
      color: c.primary,
      fontWeight: '800',
      fontSize: rs(15),
    },
  });
}
