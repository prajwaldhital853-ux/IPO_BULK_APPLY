import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  loadCheckableIssuesForUi,
  type ApplicationReportRow,
} from '../services/meroshare';
import { rs } from '../utils/responsive';
import { usePullToRefresh } from '../utils/usePullToRefresh';
import type { RootStackParamList } from '../navigation/types';

const GREEN = '#43A047';

function badgeType(shareTypeName: string): string {
  const s = (shareTypeName || 'IPO').toUpperCase();
  if (s.includes('FPO')) return 'FPO';
  if (s.includes('RIGHT')) return 'RIGHT';
  return 'IPO';
}

function audienceLabel(item: ApplicationReportRow): string {
  const scrip = item.scrip?.trim();
  return scrip
    ? `For General Public (${scrip})`
    : 'For General Public';
}

export function AllIpoStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [accountId, setAccountId] = useState<string | null>(null);
  const [reports, setReports] = useState<ApplicationReportRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

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

  useEffect(() => {
    setReports([]);
    setChecked(false);
  }, [account?.id]);

  const refresh = useCallback(async () => {
    if (!account) {
      setReports([]);
      setChecked(true);
      return;
    }
    setLoading(true);
    try {
      const { reports: rows } = await loadCheckableIssuesForUi(account);
      setReports(rows);
      setChecked(true);
    } finally {
      setLoading(false);
    }
  }, [account]);

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const accountLabel = account
    ? `${account.name.toUpperCase()} - ${account.username}`
    : 'Select Account';

  return (
    <ProtectedPersonalScreen title="Sign in to view IPO status">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Check IPO Status</Text>
          <View style={{ width: rs(22) }} />
        </View>

        <View style={styles.controls}>
          <Pressable style={styles.select} onPress={() => setPickerOpen(true)}>
            <Text style={styles.selectValue} numberOfLines={1}>
              {accountLabel}
            </Text>
            <Ionicons
              name="chevron-down"
              size={rs(18)}
              color={isDark ? colors.textMuted : '#5F6B5F'}
            />
          </Pressable>

          <Pressable
            style={[styles.checkBtn, loading && { opacity: 0.65 }]}
            onPress={() => void refresh()}
            disabled={loading || !account}
          >
            {loading ? (
              <ActivityIndicator color={isDark ? GREEN : '#1B2E1B'} />
            ) : (
              <Text style={styles.checkBtnText}>Check IPO Status</Text>
            )}
          </Pressable>
        </View>

        {loading && !checked ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: rs(40) }} />
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) =>
              `${item.companyShareId}-${item.applicantFormId ?? 0}`
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Math.max(insets.bottom, rs(24)) },
            ]}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {!account
                  ? 'Add a MeroShare account first.'
                  : checked
                    ? 'No applied IPOs found for this account.'
                    : 'Tap Check IPO Status to load applied companies.'}
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.company} numberOfLines={2}>
                  {item.companyName.toUpperCase()}
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.ipoBadge}>
                    <Text style={styles.ipoBadgeText}>
                      {badgeType(item.shareTypeName)}
                    </Text>
                  </View>
                  <Text style={styles.bullet}>?</Text>
                  <Text style={styles.audience} numberOfLines={1}>
                    {audienceLabel(item)}
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.shareType}>Ordinary Shares</Text>
                  <Pressable
                    style={styles.reportBtn}
                    hitSlop={8}
                    onPress={() => {
                      if (!account) return;
                      navigation.navigate('IpoStatusDetail', {
                        accountId: account.id,
                        report: item,
                      });
                    }}
                  >
                    <MaterialCommunityIcons
                      name="file-document-outline"
                      size={rs(16)}
                      color={isDark ? colors.textSecondary : '#5F6B5F'}
                    />
                    <Text style={styles.reportText}>Report</Text>
                  </Pressable>
                </View>
              </View>
            )}
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
                      {item.name.toUpperCase()} - {item.username}
                    </Text>
                    {account?.id === item.id ? (
                      <Ionicons name="checkmark" size={rs(20)} color={GREEN} />
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

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      backgroundColor: isDark ? c.bgElevated : '#FFFFFF',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    controls: {
      paddingHorizontal: rs(16),
      paddingTop: rs(14),
      paddingBottom: rs(8),
    },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1,
      borderColor: isDark ? c.borderMuted : '#C5D0B5',
      borderRadius: rs(22),
      paddingHorizontal: rs(16),
      paddingVertical: rs(14),
      backgroundColor: isDark ? c.surface : '#F3F5F0',
      marginBottom: rs(14),
    },
    selectValue: {
      flex: 1,
      color: c.text,
      fontWeight: '600',
      fontSize: rs(13),
    },
    checkBtn: {
      alignSelf: 'center',
      borderRadius: rs(22),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      minWidth: rs(180),
      alignItems: 'center',
      backgroundColor: isDark ? c.surfaceAlt : '#E8EBE4',
      borderWidth: 1,
      borderColor: isDark ? c.border : '#C5D0B5',
      marginBottom: rs(8),
    },
    checkBtnText: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
    },
    list: { paddingHorizontal: rs(14), paddingTop: rs(6) },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: rs(40),
      fontSize: rs(13),
      paddingHorizontal: rs(20),
    },
    card: {
      borderWidth: 1,
      borderColor: isDark ? c.borderMuted : '#D5DED0',
      borderRadius: rs(12),
      paddingHorizontal: rs(14),
      paddingTop: rs(14),
      paddingBottom: rs(12),
      backgroundColor: isDark ? c.surface : '#F3F5F0',
      marginBottom: rs(12),
    },
    company: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      lineHeight: rs(20),
      marginBottom: rs(10),
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(14),
    },
    ipoBadge: {
      backgroundColor: GREEN,
      borderRadius: rs(4),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
    },
    ipoBadgeText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: rs(10),
      letterSpacing: 0.3,
    },
    bullet: { color: c.textMuted, fontSize: rs(12), fontWeight: '700' },
    audience: {
      flex: 1,
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '500',
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    shareType: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '500',
    },
    reportBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
    },
    reportText: {
      color: isDark ? c.textSecondary : '#5F6B5F',
      fontSize: rs(12),
      fontWeight: '600',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: isDark ? c.surface : '#FFFFFF',
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
    modalRowTitle: { flex: 1, color: c.text, fontWeight: '700', fontSize: rs(13) },
    modalDone: {
      marginTop: rs(10),
      marginBottom: rs(8),
      borderRadius: rs(22),
      paddingVertical: rs(12),
      alignItems: 'center',
      backgroundColor: isDark ? c.surfaceAlt : '#E8EBE4',
    },
    doneText: { color: c.text, fontWeight: '800', fontSize: rs(13) },
  });
}
