import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  humanizeApplicationStatus,
  loadApplicationReportDetailForUi,
} from '../services/meroshare';
import type { ApplicationReportDetail } from '../services/meroshare/types';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

function formatAppliedDate(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAmount(amount?: number | null, kitta?: number): string {
  if (amount != null && Number.isFinite(amount)) {
    return `Rs. ${Number(amount).toFixed(1)}`;
  }
  if (kitta != null && Number.isFinite(kitta)) {
    return `Rs. ${(kitta * 100).toFixed(1)}`;
  }
  return '—';
}

function statusDisplay(
  statusName: string,
  remarks?: string,
): { label: string; color: string; code: string } {
  const { code } = humanizeApplicationStatus(statusName, undefined, remarks);
  if (code === 'ALLOTTED') {
    return { label: 'Alloted', color: '#2E7D32', code };
  }
  if (code === 'NOT_ALLOTTED') {
    return { label: 'Not Alloted', color: '#C62828', code };
  }
  if (code === 'NOT_APPLIED') {
    return { label: 'Not Applied', color: '#757575', code };
  }
  if (code === 'REJECTED' || /REJECT|FAIL|CANCEL|BLOCK/i.test(statusName)) {
    return { label: 'Rejected', color: '#C62828', code: 'REJECTED' };
  }
  if (code === 'PENDING' || code === 'APPLIED') {
    return {
      label: code === 'PENDING' ? 'Pending' : 'Applied',
      color: '#EF6C00',
      code,
    };
  }
  return { label: statusName || '—', color: '#1B1B1B', code };
}

function reasonDisplay(detail: ApplicationReportDetail): {
  text: string;
  color: string | null;
} {
  const rawReason = (detail.reason || '').trim();
  const remarks = (detail.remarks || '').trim();
  const { code } = humanizeApplicationStatus(
    detail.statusName,
    undefined,
    remarks || rawReason,
  );

  // Explicit reason from API
  if (rawReason && !/^n\/?a$/i.test(rawReason)) {
    const isBad = code === 'REJECTED' || /insufficien|reject|fail/i.test(rawReason);
    return { text: rawReason, color: isBad ? '#C62828' : null };
  }

  // Parse "(Insufficient balance)" style from remarks
  const paren = remarks.match(/\(([^)]+)\)\s*$/);
  if (paren?.[1] && /insufficien|balance|reject|fail/i.test(paren[1])) {
    return { text: paren[1].trim(), color: '#C62828' };
  }

  if (
    code === 'REJECTED' ||
    /INSUFFICIENT|NOT ENOUGH|LOW BALANCE|BLOCK[_\s-]?FAIL/i.test(
      `${detail.statusName} ${remarks}`,
    )
  ) {
    if (/insufficien|balance/i.test(`${detail.statusName} ${remarks}`)) {
      return { text: 'Insufficient balance', color: '#C62828' };
    }
    return { text: 'Application rejected', color: '#C62828' };
  }

  if (code === 'ALLOTTED') {
    return { text: 'Allotted', color: '#2E7D32' };
  }
  if (code === 'NOT_ALLOTTED') {
    return { text: 'Not allotted', color: null };
  }

  return { text: '—', color: null };
}

function remarksLine(detail: ApplicationReportDetail): string {
  const raw = (detail.remarks || '').trim();
  if (raw) return raw;
  const { code } = humanizeApplicationStatus(
    detail.statusName,
    undefined,
    detail.reason,
  );
  if (code === 'ALLOTTED' || code === 'NOT_ALLOTTED') {
    return 'Block Amount Status - Amount Released';
  }
  if (code === 'REJECTED') {
    const reason = reasonDisplay(detail).text;
    if (reason && reason !== '—') {
      return `Block Amount Status - Amount Rejected (${reason})`;
    }
    return 'Block Amount Status - Amount Rejected';
  }
  return '—';
}

/** Prefer real branch; otherwise "{Bank} - Head Office". */
function displayBranch(
  branch?: string,
  bank?: string,
): string {
  const b = (branch || '').trim();
  if (b && !/^n\/?a$/i.test(b) && !/^-+$/.test(b) && b !== '—') return b;
  const bankName = (bank || '').trim();
  if (!bankName) return '—';
  if (/head\s*office/i.test(bankName)) return bankName;
  return `${bankName} - Head Office`;
}

function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function IpoStatusDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'IpoStatusDetail'>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const { accountId, report } = route.params;
  const account = accounts.find((a) => a.id === accountId) ?? null;

  const [detail, setDetail] = useState<ApplicationReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account) {
      setError('Account not found');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await loadApplicationReportDetailForUi(account, report);
      setDetail(row);
    } catch (e) {
      const bankName = account.bankName;
      setDetail({
        companyShareId: report.companyShareId,
        companyName: report.companyName,
        scrip: report.scrip,
        shareTypeName: report.shareTypeName,
        statusName: report.statusName,
        applicantFormId: report.applicantFormId,
        appliedKitta: report.appliedKitta,
        amount:
          report.appliedKitta != null ? report.appliedKitta * 100 : null,
        bankName,
        branchName: displayBranch(undefined, bankName),
        accountNumber: account.accountNumber,
        boid: account.demat,
        appliedDate: report.appliedDate,
      });
      setError(e instanceof Error ? e.message : null);
    } finally {
      setLoading(false);
    }
  }, [account, report]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = detail ?? {
    companyShareId: report.companyShareId,
    companyName: report.companyName,
    scrip: report.scrip,
    shareTypeName: report.shareTypeName,
    statusName: report.statusName,
    appliedKitta: report.appliedKitta,
    appliedDate: report.appliedDate,
    bankName: account?.bankName,
    accountNumber: account?.accountNumber,
    amount:
      report.appliedKitta != null ? report.appliedKitta * 100 : null,
  };

  const status = statusDisplay(data.statusName, data.remarks || data.reason);
  const reason = reasonDisplay(data);
  const titleScrip = data.scrip || 'IPO';
  const companyTitle = data.scrip
    ? `${toTitleCase(data.companyName)} (${data.scrip})`
    : toTitleCase(data.companyName);
  const bankValue = data.bankName || account?.bankName || '—';
  const branchValue = displayBranch(data.branchName, bankValue === '—' ? undefined : bankValue);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          IPO Details - {titleScrip}
        </Text>
        <View style={{ width: rs(22) }} />
      </View>

      {loading && !detail ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: rs(40) }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: Math.max(insets.bottom, rs(32)) },
          ]}
        >
          <View style={styles.card}>
            <Text style={styles.company}>{companyTitle}</Text>
            <View style={styles.divider} />

            <View style={styles.row2}>
              <View style={styles.col}>
                <Text style={styles.label}>Applied Quantity</Text>
                <Text style={styles.value}>
                  {data.appliedKitta != null ? String(data.appliedKitta) : '—'}
                </Text>
              </View>
              <View style={[styles.col, styles.colRight]}>
                <Text style={styles.label}>Amount</Text>
                <Text style={styles.value}>
                  {formatAmount(data.amount, data.appliedKitta)}
                </Text>
              </View>
            </View>

            <Field label="Bank" value={bankValue} styles={styles} />
            <Field label="Branch" value={branchValue} styles={styles} />
            <Field
              label="Account Number"
              value={data.accountNumber || account?.accountNumber || '—'}
              styles={styles}
            />
            <Field
              label="Application Submitted"
              value={formatAppliedDate(data.appliedDate)}
              styles={styles}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Status</Text>
              <Text style={[styles.value, { color: status.color }]}>
                {status.label}
              </Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Reason</Text>
              <Text
                style={[
                  styles.value,
                  reason.color ? { color: reason.color } : null,
                ]}
              >
                {reason.text}
              </Text>
            </View>
            <Field
              label="Remarks"
              value={remarksLine(data)}
              styles={styles}
            />
          </View>
          {error ? <Text style={styles.errorNote}>{error}</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

function Field({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: c.bgElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    title: {
      flex: 1,
      color: c.text,
      fontSize: rs(15),
      fontWeight: '700',
      textAlign: 'center',
    },
    body: {
      paddingHorizontal: rs(16),
      paddingTop: rs(16),
    },
    card: {
      backgroundColor: isDark ? c.surface : '#FFFFFF',
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: isDark ? c.borderMuted : '#D5DED0',
      paddingHorizontal: rs(18),
      paddingTop: rs(18),
      paddingBottom: rs(8),
    },
    company: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: rs(22),
      marginBottom: rs(14),
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? c.borderMuted : '#D5DED0',
      marginBottom: rs(18),
    },
    row2: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: rs(18),
    },
    col: { flex: 1 },
    colRight: { alignItems: 'flex-end' },
    field: { marginBottom: rs(18) },
    label: {
      color: isDark ? c.textMuted : '#8A9285',
      fontSize: rs(12),
      marginBottom: rs(4),
      fontWeight: '500',
    },
    value: {
      color: isDark ? c.text : '#1B1B1B',
      fontSize: rs(14),
      fontWeight: '600',
      lineHeight: rs(20),
    },
    errorNote: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(10),
      textAlign: 'center',
    },
  });
}
