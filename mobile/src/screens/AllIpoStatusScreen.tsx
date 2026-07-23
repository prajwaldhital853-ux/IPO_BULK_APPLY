import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  humanizeApplicationStatus,
  loadCheckableIssuesForUi,
  type ApplicationReportRow,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const ACCENT = '#66BB6A';

function statusColor(statusName: string): string {
  const { code } = humanizeApplicationStatus(statusName);
  if (code === 'ALLOTTED') return '#66BB6A';
  if (code === 'NOT_ALLOTTED') return '#EF5350';
  if (/REJECT|FAIL|CANCEL/i.test(statusName)) return '#EF5350';
  if (/VERIF|APPROV|PENDING|PROCESS/i.test(statusName)) return '#FFA726';
  return '#90CAF9';
}

export function AllIpoStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [accountId, setAccountId] = useState<string | null>(null);
  const [reports, setReports] = useState<ApplicationReportRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const refresh = useCallback(async () => {
    if (!account) {
      setReports([]);
      return;
    }
    setLoading(true);
    try {
      const { reports: rows } = await loadCheckableIssuesForUi(account);
      setReports(rows);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ProtectedPersonalScreen title="Sign in to view IPO status">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>All IPO Status</Text>
          <Pressable onPress={() => void refresh()} hitSlop={12}>
            <Ionicons name="refresh" size={rs(20)} color={ACCENT} />
          </Pressable>
        </View>

        <Pressable style={styles.select} onPress={() => setPickerOpen(true)}>
          <Text style={styles.selectLabel}>Account</Text>
          <Text style={styles.selectValue} numberOfLines={1}>
            {account ? account.name.toUpperCase() : 'Select Account'}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.hint}>
          Applied companies for this account. Tap a card for IPO result & details.
        </Text>

        {loading ? (
          <ActivityIndicator
            color={ACCENT}
            style={{ marginTop: rs(40) }}
          />
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) =>
              `${item.companyShareId}-${item.applicantFormId ?? 0}`
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {account
                  ? 'No applied IPOs found for this account.'
                  : 'Add a MeroShare account first.'}
              </Text>
            }
            renderItem={({ item }) => {
              const tint = statusColor(item.statusName);
              const { message } = humanizeApplicationStatus(item.statusName);
              return (
                <Pressable
                  style={[styles.card, { borderColor: tint }]}
                  onPress={() => {
                    if (!account) return;
                    navigation.navigate('IpoStatusDetail', {
                      accountId: account.id,
                      report: item,
                    });
                  }}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.company} numberOfLines={2}>
                      {item.companyName}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={rs(18)}
                      color={colors.textMuted}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {item.scrip}
                    {item.shareTypeName ? ` -+ ${item.shareTypeName}` : ''}
                    {item.appliedKitta != null
                      ? ` -+ ${item.appliedKitta} kitta`
                      : ''}
                  </Text>
                  <Text style={[styles.status, { color: tint }]}>
                    {message || item.statusName || 'GÇö'}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}

        <Modal
          visible={pickerOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setPickerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
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
                      {item.name.toUpperCase()}
                    </Text>
                    {account?.id === item.id ? (
                      <Ionicons name="checkmark" size={rs(20)} color={ACCENT} />
                    ) : null}
                  </Pressable>
                )}
              />
              <Pressable
                style={styles.modalDone}
                onPress={() => setPickerOpen(false)}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(14),
      marginBottom: rs(8),
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      backgroundColor: c.surface,
    },
    selectLabel: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    selectValue: {
      flex: 1,
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
    },
    hint: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginHorizontal: rs(16),
      marginBottom: rs(10),
      lineHeight: rs(17),
    },
    list: { paddingHorizontal: rs(14), paddingBottom: rs(40) },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: rs(40),
      fontSize: rs(13),
    },
    card: {
      borderWidth: 1,
      borderRadius: rs(12),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(10),
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
    },
    company: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      lineHeight: rs(20),
    },
    meta: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(6),
    },
    status: {
      fontWeight: '700',
      fontSize: rs(13),
      marginTop: rs(8),
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      maxHeight: '70%',
      paddingTop: rs(14),
      paddingHorizontal: rs(14),
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginBottom: rs(8),
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: rs(14),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    modalRowTitle: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    modalDone: {
      marginTop: rs(10),
      marginBottom: rs(8),
      borderWidth: 1,
      borderColor: ACCENT,
      borderRadius: rs(22),
      paddingVertical: rs(12),
      alignItems: 'center',
    },
    doneText: { color: ACCENT, fontWeight: '800', fontSize: rs(13) },
  });
}
