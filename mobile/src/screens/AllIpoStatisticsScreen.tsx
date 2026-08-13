import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { SwipeTabGesture } from '../components/SwipeTabGesture';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import { useSensitiveAction } from '../hooks/useSensitiveAction';
import type { ThemeColors } from '../theme/colors';
import {
  humanizeApplicationStatus,
  loadAllApplicationDetailsForUi,
} from '../services/meroshare';
import type { ApplicationReportDetail } from '../services/meroshare/types';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type FilterId =
  | 'all'
  | 'allotted'
  | 'not_allotted'
  | 'verified'
  | 'unverified'
  | 'rejected'
  | 'unknown';

type StatBucket =
  | 'allotted'
  | 'not_allotted'
  | 'verified'
  | 'unverified'
  | 'rejected'
  | 'unknown';

const FILTERS: {
  id: FilterId;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  activeBg: string;
  activeText: string;
}[] = [
  {
    id: 'all',
    label: 'All',
    activeBg: '#ECEFF1',
    activeText: '#37474F',
  },
  {
    id: 'allotted',
    label: 'Allotted',
    icon: 'checkmark-circle',
    activeBg: '#E8F5E9',
    activeText: '#2E7D32',
  },
  {
    id: 'not_allotted',
    label: 'Not Allotted',
    icon: 'close-circle',
    activeBg: '#FFEBEE',
    activeText: '#C62828',
  },
  {
    id: 'verified',
    label: 'Verified',
    icon: 'checkmark-done-circle',
    activeBg: '#E0F7FA',
    activeText: '#00838F',
  },
  {
    id: 'unverified',
    label: 'Unverified',
    icon: 'alert-circle',
    activeBg: '#FFF8E1',
    activeText: '#F9A825',
  },
  {
    id: 'rejected',
    label: 'Rejected',
    icon: 'ban',
    activeBg: '#FBE9E7',
    activeText: '#D84315',
  },
  {
    id: 'unknown',
    label: 'Unknown',
    icon: 'help-circle',
    activeBg: '#E3F2FD',
    activeText: '#1565C0',
  },
];

function classifyStatus(statusName: string): StatBucket {
  const raw = (statusName || '').toUpperCase();
  const { code } = humanizeApplicationStatus(statusName);

  if (code === 'ALLOTTED' || (/ALLOT/.test(raw) && !/NOT/.test(raw))) {
    return 'allotted';
  }
  if (code === 'NOT_ALLOTTED' || /NOT.?ALLOT/.test(raw)) {
    return 'not_allotted';
  }
  if (/REJECT|CANCEL|FAIL|ERROR/.test(raw) || code === 'FAILED') {
    return 'rejected';
  }
  if (/UNVERIF|NOT.?VERIF/.test(raw)) {
    return 'unverified';
  }
  if (/VERIF|APPROV/.test(raw)) {
    return 'verified';
  }
  if (code === 'APPLIED' || code === 'PENDING') {
    return 'unverified';
  }
  return 'unknown';
}

function statusBadge(bucket: StatBucket): { label: string; color: string; bg: string } {
  switch (bucket) {
    case 'allotted':
      return { label: 'Allotted', color: '#2E7D32', bg: '#E8F5E9' };
    case 'not_allotted':
      return { label: 'Not Allotted', color: '#C62828', bg: '#FFEBEE' };
    case 'verified':
      return { label: 'Verified', color: '#00838F', bg: '#E0F7FA' };
    case 'unverified':
      return { label: 'Unverified', color: '#F57F17', bg: '#FFF8E1' };
    case 'rejected':
      return { label: 'Rejected', color: '#D84315', bg: '#FBE9E7' };
    default:
      return { label: 'Unknown', color: '#1565C0', bg: '#E3F2FD' };
  }
}

function formatAppliedOn(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const date = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} • ${time}`;
}

function formatAmount(amount?: number | null, kitta?: number): string {
  if (amount != null && Number.isFinite(amount)) {
    return `Rs ${Number(amount).toFixed(2)}`;
  }
  if (kitta != null && Number.isFinite(kitta)) {
    return `Rs ${(kitta * 100).toFixed(2)}`;
  }
  return 'Rs —';
}

function shareTypeLabel(item: ApplicationReportDetail): string {
  const raw = (item.shareTypeName || 'ORDINARY SHARES').trim();
  return raw.toUpperCase();
}

function issueKindBadge(item: ApplicationReportDetail): string {
  const t = `${item.shareTypeName} ${item.companyName}`.toUpperCase();
  if (/\bFPO\b/.test(t)) return 'FPO';
  if (/\bRIGHT/.test(t)) return 'RIGHTS';
  if (/\bDEBENTURE\b|\bBOND\b/.test(t)) return 'DEB';
  return 'IPO';
}

export function AllIpoStatisticsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { usableAccounts: accounts } = useActiveAccounts();
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [accountId, setAccountId] = useState<string | null>(null);
  const [rows, setRows] = useState<ApplicationReportDetail[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterId>('all');
  const [error, setError] = useState<string | null>(null);

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null,
    [accounts, accountId],
  );

  useEffect(() => {
    if (!accounts.length) {
      setAccountId(null);
      return;
    }
    setAccountId((prev) =>
      prev && accounts.some((a) => a.id === prev) ? prev : accounts[0].id,
    );
  }, [accounts]);

  const refresh = useCallback(() => {
    if (!account) {
      setRows([]);
      return;
    }
    void sensitive.requestSensitiveAction(
      async () => {
        setLoading(true);
        setError(null);
        try {
          const details = await loadAllApplicationDetailsForUi(account);
          setRows(details);
        } catch (e) {
          setRows([]);
          setError(e instanceof Error ? e.message : 'Could not load IPO stats');
        } finally {
          setLoading(false);
        }
      },
      { pinPolicy: 'skipIfUnlocked' },
    );
  }, [account, sensitive]);

  useEffect(() => {
    refresh();
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const classified = useMemo(
    () =>
      rows.map((row) => ({
        row,
        bucket: classifyStatus(row.statusName),
      })),
    [rows],
  );

  const counts = useMemo(() => {
    const c = {
      allotted: 0,
      not_allotted: 0,
      verified: 0,
      unverified: 0,
      rejected: 0,
      unknown: 0,
    };
    for (const item of classified) c[item.bucket] += 1;
    return c;
  }, [classified]);

  const successRate = useMemo(() => {
    const decided = counts.allotted + counts.not_allotted;
    if (!decided) return 0;
    return (counts.allotted / decided) * 100;
  }, [counts]);

  const visible = useMemo(() => {
    if (filter === 'all') return classified;
    return classified.filter((c) => c.bucket === filter);
  }, [classified, filter]);

  const accountLabel = account
    ? `${account.name.toUpperCase()} - ${account.username}`
    : 'Select Account';

  const shareSummary = useCallback(async () => {
    if (!account || !rows.length) return;
    const lines = classified.map(({ row, bucket }, idx) => {
      const badge = statusBadge(bucket);
      const received =
        bucket === 'allotted' ? (row.allottedKitta ?? row.appliedKitta ?? 0) : 0;
      return [
        `${idx + 1}. ${row.companyName}${row.scrip ? ` (${row.scrip})` : ''} — ${badge.label}`,
        `Applied: ${row.appliedKitta ?? '—'} | Received: ${received}`,
        `Amount: ${formatAmount(row.amount, row.appliedKitta)}`,
        row.remarks ? `Remark: ${row.remarks}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    });
    const message = [
      `NEPSE GHAR — All IPO Statistics`,
      accountLabel,
      `Total: ${rows.length} · Allotted: ${counts.allotted} · Success: ${successRate.toFixed(1)}%`,
      '',
      ...lines,
    ].join('\n\n');
    try {
      await Share.share({ message });
    } catch {
      // ignore
    }
  }, [
    account,
    accountLabel,
    classified,
    counts.allotted,
    rows.length,
    successRate,
  ]);

  return (
    <ProtectedPersonalScreen title="Sign in to view IPO statistics">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.screenTitle}>All IPO Statistics</Text>
          <View style={{ width: rs(22) }} />
        </View>

        <Pressable style={styles.accountSelect} onPress={() => setPickerOpen(true)}>
          <Text style={styles.accountSelectText} numberOfLines={1}>
            {accountLabel}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <View style={styles.titleRow}>
          <View style={styles.allotmentPill}>
            <Text style={styles.allotmentPillText}>Allotment Status</Text>
          </View>
          <Pressable style={styles.refreshChip} onPress={refresh} hitSlop={8}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={rs(16)} color={colors.textSecondary} />
            )}
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count =
              f.id === 'all'
                ? rows.length
                : f.id === 'allotted'
                  ? counts.allotted
                  : f.id === 'not_allotted'
                    ? counts.not_allotted
                    : f.id === 'verified'
                      ? counts.verified
                      : f.id === 'unverified'
                        ? counts.unverified
                        : f.id === 'rejected'
                          ? counts.rejected
                          : counts.unknown;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[
                  styles.filterChip,
                  active && {
                    backgroundColor: f.activeBg,
                    borderColor: f.activeText,
                  },
                ]}
              >
                {f.icon ? (
                  <Ionicons
                    name={f.icon}
                    size={rs(14)}
                    color={active ? f.activeText : colors.textMuted}
                  />
                ) : null}
                <Text
                  style={[
                    styles.filterLabel,
                    active && { color: f.activeText, fontWeight: '800' },
                  ]}
                >
                  {f.label} {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <SwipeTabGesture
          index={Math.max(
            0,
            FILTERS.findIndex((f) => f.id === filter),
          )}
          count={FILTERS.length}
          enabled={!pickerOpen}
          onIndexChange={(i) => {
            const next = FILTERS[i];
            if (next) setFilter(next.id);
          }}
        >
        <FlatList
          data={visible}
          keyExtractor={(item) =>
            `${item.row.companyShareId}-${item.row.applicantFormId ?? 0}`
          }
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + rs(88) },
          ]}
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.summaryCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Applications</Text>
                  <Text style={styles.totalValue}>{rows.length}</Text>
                </View>

                <View style={styles.statGrid}>
                  <StatPill
                    label="Allotted"
                    count={counts.allotted}
                    color="#2E7D32"
                    bg="#E8F5E9"
                    styles={styles}
                  />
                  <StatPill
                    label="Not Allotted"
                    count={counts.not_allotted}
                    color="#C62828"
                    bg="#FFEBEE"
                    styles={styles}
                  />
                  <StatPill
                    label="Verified"
                    count={counts.verified}
                    color="#00838F"
                    bg="#E0F7FA"
                    styles={styles}
                  />
                  <StatPill
                    label="Unverified"
                    count={counts.unverified}
                    color="#F57F17"
                    bg="#FFF8E1"
                    styles={styles}
                  />
                  <StatPill
                    label="Rejected"
                    count={counts.rejected}
                    color="#D84315"
                    bg="#FBE9E7"
                    styles={styles}
                  />
                </View>

                <View style={styles.rateBlock}>
                  <View style={styles.rateHead}>
                    <MaterialCommunityIcons
                      name="chart-bar"
                      size={rs(16)}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.rateTitle}>Allotment Success Rate</Text>
                  </View>
                  <View style={styles.rateRow}>
                    <View style={styles.rateTrack}>
                      <View
                        style={[
                          styles.rateFill,
                          { width: `${Math.min(100, successRate)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.ratePct}>
                      {successRate.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="document-text-outline"
                  size={rs(52)}
                  color={colors.textDim}
                />
                <Text style={styles.emptyTitle}>No IPO records found</Text>
                <Text style={styles.emptySub}>
                  {account
                    ? filter === 'all'
                      ? 'No applications for this account yet.'
                      : 'Try changing the filter'
                    : 'Add a MeroShare account first.'}
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const { row, bucket } = item;
            const badge = statusBadge(bucket);
            const kind = issueKindBadge(row);
            const received =
              bucket === 'allotted'
                ? (row.allottedKitta ?? row.appliedKitta ?? 0)
                : (row.allottedKitta ?? 0);
            const remarkColor =
              bucket === 'allotted'
                ? '#2E7D32'
                : bucket === 'not_allotted' || bucket === 'rejected'
                  ? '#C62828'
                  : colors.textSecondary;

            return (
              <Pressable
                style={styles.card}
                onPress={() => {
                  if (!account) return;
                  navigation.navigate('IpoStatusDetail', {
                    accountId: account.id,
                    report: {
                      companyShareId: row.companyShareId,
                      companyName: row.companyName,
                      scrip: row.scrip,
                      shareTypeName: row.shareTypeName,
                      statusName: row.statusName,
                      applicantFormId: row.applicantFormId,
                      appliedKitta: row.appliedKitta,
                      appliedDate: row.appliedDate,
                    },
                  });
                }}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {index + 1}. {row.companyName}
                    {row.scrip ? ` (${row.scrip})` : ''}
                  </Text>
                  <View style={styles.badgeCol}>
                    <View style={[styles.kindBadge, styles.kindBadgeIpo]}>
                      <Text style={styles.kindBadgeText}>{kind}</Text>
                    </View>
                    <View
                      style={[styles.statusBadge, { backgroundColor: badge.bg }]}
                    >
                      <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.cardLine}>
                  Applied: {row.appliedKitta ?? '—'} | Received:{' '}
                  <Text
                    style={{
                      color:
                        received > 0 ? '#2E7D32' : colors.textSecondary,
                      fontWeight: '700',
                    }}
                  >
                    {received}
                  </Text>
                </Text>
                <Text style={styles.cardLine}>
                  Applied On: {formatAppliedOn(row.appliedDate)}
                </Text>
                <Text style={styles.cardLine}>
                  Amount: {formatAmount(row.amount, row.appliedKitta)}
                </Text>
                <Text style={styles.shareType}>{shareTypeLabel(row)}</Text>
                {row.remarks ? (
                  <Text style={[styles.remark, { color: remarkColor }]}>
                    Remark: {row.remarks}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
        </SwipeTabGesture>

        {rows.length > 0 ? (
          <Pressable
            style={[styles.fab, { bottom: insets.bottom + rs(18) }]}
            onPress={() => void shareSummary()}
          >
            <Ionicons name="share-social" size={rs(22)} color="#FFF" />
          </Pressable>
        ) : null}

        <Modal
          visible={pickerOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setPickerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPickerOpen(false)}
            />
            <View
              style={[
                styles.modalSheet,
                { paddingBottom: Math.max(insets.bottom, rs(12)) },
              ]}
            >
              <Text style={styles.modalTitle}>Select Account</Text>
              <FlatList
                data={accounts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.modalRow}
                    onPress={() => {
                      setAccountId(item.id);
                      setPickerOpen(false);
                    }}
                  >
                    <Text style={styles.modalRowTitle}>
                      {item.name.toUpperCase()} - {item.username}
                    </Text>
                    {account?.id === item.id ? (
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

        <SensitiveActionModals action={sensitive} />
      </View>
    </ProtectedPersonalScreen>
  );
}

function StatPill({
  label,
  count,
  color,
  bg,
  styles,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[styles.statPill, { backgroundColor: bg }]}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={[styles.statPillText, { color }]}>
        {label} {count}
      </Text>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
    },
    screenTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    accountSelect: {
      marginHorizontal: rs(14),
      marginTop: rs(4),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    accountSelectText: {
      flex: 1,
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(10),
      marginTop: rs(12),
      marginBottom: rs(8),
    },
    allotmentPill: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: rs(20),
      paddingHorizontal: rs(16),
      paddingVertical: rs(7),
    },
    allotmentPillText: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
    },
    refreshChip: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterScroll: {
      flexGrow: 0,
      flexShrink: 0,
      marginBottom: rs(4),
    },
    filterRow: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(6),
      gap: rs(8),
      alignItems: 'center',
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: rs(18),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
    },
    filterLabel: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '600',
    },
    errorText: {
      color: '#EF5350',
      fontSize: rs(12),
      textAlign: 'center',
      marginTop: rs(6),
      paddingHorizontal: rs(16),
    },
    list: {
      paddingHorizontal: rs(14),
      paddingTop: rs(10),
    },
    summaryCard: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(12),
      gap: rs(12),
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    totalLabel: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
    },
    totalValue: {
      color: '#1565C0',
      fontWeight: '800',
      fontSize: rs(18),
    },
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
    },
    statPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      borderRadius: rs(20),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
    },
    statDot: {
      width: rs(7),
      height: rs(7),
      borderRadius: rs(4),
    },
    statPillText: {
      fontSize: rs(12),
      fontWeight: '700',
    },
    rateBlock: { gap: rs(8) },
    rateHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
    },
    rateTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
    },
    rateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
    },
    rateTrack: {
      flex: 1,
      height: rs(8),
      borderRadius: rs(4),
      backgroundColor: isDark ? '#333' : '#E0E0E0',
      overflow: 'hidden',
    },
    rateFill: {
      height: '100%',
      backgroundColor: '#43A047',
      borderRadius: rs(4),
    },
    ratePct: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      minWidth: rs(48),
      textAlign: 'right',
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(10),
      gap: rs(4),
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
      marginBottom: rs(4),
    },
    cardTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    badgeCol: { alignItems: 'flex-end', gap: rs(4) },
    kindBadge: {
      borderRadius: rs(6),
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
    },
    kindBadgeIpo: { backgroundColor: '#E8F5E9' },
    kindBadgeText: {
      color: '#2E7D32',
      fontWeight: '800',
      fontSize: rs(10),
    },
    statusBadge: {
      borderRadius: rs(6),
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
    },
    statusBadgeText: {
      fontWeight: '800',
      fontSize: rs(10),
    },
    cardLine: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(18),
    },
    shareType: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      marginTop: rs(2),
    },
    remark: {
      fontSize: rs(12),
      fontWeight: '600',
      marginTop: rs(6),
    },
    emptyWrap: {
      alignItems: 'center',
      paddingTop: rs(48),
      gap: rs(8),
    },
    emptyTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(15),
    },
    emptySub: {
      color: c.textMuted,
      fontSize: rs(13),
    },
    fab: {
      position: 'absolute',
      right: rs(18),
      width: rs(52),
      height: rs(52),
      borderRadius: rs(26),
      backgroundColor: '#66BB6A',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      maxHeight: '70%',
      paddingTop: rs(14),
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(14),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
    },
    modalRowTitle: {
      color: c.text,
      fontWeight: '600',
      fontSize: rs(14),
      flex: 1,
      paddingRight: rs(8),
    },
  });
}
