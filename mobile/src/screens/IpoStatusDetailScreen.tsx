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

function statusDisplay(statusName: string): { label: string; color: string } {
  const { code, message } = humanizeApplicationStatus(statusName);
  if (code === 'NOT_ALLOTTED') {
    return { label: 'Not Alloted', color: '#EF5350' };
  }
  if (code === 'ALLOTTED') {
    return { label: 'Alloted', color: '#66BB6A' };
  }
  return { label: message || statusName || '—', color: '#FFFFFF' };
}

export function IpoStatusDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'IpoStatusDetail'>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        bankName: account.bankName,
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
  };

  const status = statusDisplay(data.statusName);
  const { code: statusCode } = humanizeApplicationStatus(data.statusName);
  const isAllotted = statusCode === 'ALLOTTED';
  const titleScrip = data.scrip || 'IPO';
  const companyTitle = data.scrip
    ? `${data.companyName} (${data.scrip})`
    : data.companyName;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          IPO Details - {titleScrip}
        </Text>
      </View>

      {loading && !detail ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: rs(40) }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <Text style={styles.company}>{companyTitle}</Text>

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

            {isAllotted ? (
              <View style={styles.field}>
                <Text style={styles.label}>Allotted Quantity</Text>
                <Text style={[styles.value, { color: '#66BB6A' }]}>
                  {data.allottedKitta != null
                    ? `${data.allottedKitta} kitta`
                    : data.appliedKitta != null
                      ? `${data.appliedKitta} kitta`
                      : '—'}
                </Text>
              </View>
            ) : null}

            <Field label="BOID" value={data.boid || '—'} styles={styles} />
            <Field label="Bank" value={data.bankName || '—'} styles={styles} />
            <Field
              label="Branch"
              value={data.branchName || '—'}
              styles={styles}
            />
            <Field
              label="Account Number"
              value={data.accountNumber || '—'}
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
            <Field
              label="Remarks"
              value={data.remarks || '—'}
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

function makeStyles(c: ThemeColors) {
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
      borderBottomColor: c.border,
    },
    title: {
      flex: 1,
      color: c.text,
      fontSize: rs(15),
      fontWeight: '700',
    },
    body: { padding: rs(16), paddingBottom: rs(40) },
    card: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(12),
      padding: rs(16),
      backgroundColor: c.surface,
    },
    company: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: rs(18),
      lineHeight: rs(22),
    },
    row2: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: rs(14),
    },
    col: { flex: 1 },
    colRight: { alignItems: 'flex-end' },
    field: { marginBottom: rs(14) },
    label: {
      color: c.textMuted,
      fontSize: rs(12),
      marginBottom: rs(3),
    },
    value: {
      color: c.text,
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
