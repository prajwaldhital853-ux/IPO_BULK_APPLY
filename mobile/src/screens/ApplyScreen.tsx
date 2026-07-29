import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import {
  formatRs,
  loadInvestmentSummary,
  type InvestmentSummary,
} from '../services/nepse/premiumAnalytics';
import type { ThemeColors } from '../theme/colors';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { guardAddAccount } from '../utils/accountLimits';
import {
  loadOpenIssuesForUi,
  runBulkApply,
  type BulkApplySummary,
  type OpenIssue,
} from '../services/meroshare';
import {
  isAppliedInMap,
  loadApplyHistory,
  markAppliedMany,
} from '../storage/applyHistory';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

export function ApplyScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const { accounts, updateAccountMeta } = useAccounts();
  const { user } = useAuth();
  const { isPremium, maxAccounts } = useSubscription();
  const { colors } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const goAddCapital = useCallback(() => {
    if (
      !guardAddAccount({
        currentCount: accounts.length,
        isPremium,
        maxAccounts,
        onUpgrade: () => navigation.navigate('Subscription'),
      })
    ) {
      return;
    }
    navigation.navigate('AddCapital');
  }, [accounts.length, isPremium, maxAccounts, navigation]);
  const [mode, setMode] = useState<'Bulk' | 'Single'>('Bulk');
  const [hideValues, setHideValues] = useState(false);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [investment, setInvestment] = useState<InvestmentSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qty, setQty] = useState('10');
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [selected, setSelected] = useState<OpenIssue | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<BulkApplySummary | null>(null);
  /** Bulk: which accounts are checked to include */
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [historyTick, setHistoryTick] = useState(0);
  const [historyMap, setHistoryMap] = useState<
    Awaited<ReturnType<typeof loadApplyHistory>>
  >({});
  const [loadingIssues, setLoadingIssues] = useState(false);

  const kitta = Math.max(1, parseInt(qty.replace(/\D/g, ''), 10) || 10);
  const companyShareId = selected?.companyShareId;

  const displayName = useMemo(() => {
    const raw =
      user?.name?.trim() ||
      accounts[0]?.name?.trim() ||
      (accounts.length > 1
        ? `${accounts.length} Accounts`
        : accounts.length === 1
          ? accounts[0].name
          : 'Guest');
    return raw.toUpperCase();
  }, [accounts, user?.name]);

  const refreshIssues = useCallback(async () => {
    setLoadingIssues(true);
    try {
      const list = await loadOpenIssuesForUi(accounts);
      setIssues(list);
      setSelected((prev) => {
        if (!list.length) return null;
        const still = prev
          ? list.find((i) => i.companyShareId === prev.companyShareId)
          : null;
        return still ?? list[0];
      });
    } finally {
      setLoadingIssues(false);
    }
  }, [accounts]);

  const refreshInvestment = useCallback(async () => {
    setInvestment(await loadInvestmentSummary());
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshIssues(), refreshInvestment()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshInvestment, refreshIssues]);

  useFocusEffect(
    useCallback(() => {
      void refreshInvestment();
    }, [refreshInvestment]),
  );

  useEffect(() => {
    void refreshIssues();
  }, [refreshIssues]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next: Record<string, boolean> = {};
      for (const a of accounts) {
        next[a.id] = prev[a.id] ?? true;
      }
      return next;
    });
  }, [accounts]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const map = await loadApplyHistory();
      if (mounted) setHistoryMap(map);
    })();
    return () => {
      mounted = false;
    };
  }, [historyTick, companyShareId]);

  const alreadyApplied = useCallback(
    (accountId: string) => {
      if (companyShareId == null) return false;
      return isAppliedInMap(historyMap, accountId, companyShareId);
    },
    [companyShareId, historyMap],
  );

  const checkedEligible = useMemo(() => {
    if (!selected) return [];
    return accounts.filter(
      (a) => selectedIds[a.id] && !alreadyApplied(a.id),
    );
  }, [accounts, selectedIds, selected, alreadyApplied]);

  const toggleAccount = (id: string) => {
    if (alreadyApplied(id)) return;
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllEligible = () => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const a of accounts) {
        if (!alreadyApplied(a.id)) next[a.id] = true;
      }
      return next;
    });
  };

  const clearEligible = () => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const a of accounts) {
        if (!alreadyApplied(a.id)) next[a.id] = false;
      }
      return next;
    });
  };

  const persistSuccessful = async (
    result: BulkApplySummary,
    companyId: number,
  ) => {
    // Only lock accounts after a real live apply
    const rows = result.results
      .filter((r) => r.ok && !r.dryRun)
      .map((r) => ({
        accountId: r.accountId,
        companyShareId: companyId,
        kitta: result.kitta,
        dryRun: false,
      }));
    if (rows.length) {
      await markAppliedMany(rows);
      // Successful live apply means CRN+PIN were accepted by MeroShare
      for (const row of rows) {
        await updateAccountMeta(row.accountId, { crnPinVerified: true });
      }
      setHistoryTick((t) => t + 1);
    }
  };

  const confirmBulkApply = useCallback(() => {
    if (!selected) {
      Alert.alert('No IPO', 'Select a Current Opening IPO first.');
      return;
    }
    if (selected.companyShareId === 9001) {
      Alert.alert(
        'No open IPO',
        'No live opening is available right now. Pull to refresh after MeroShare login, or check allotment on the Check tab.',
      );
      return;
    }
    if (checkedEligible.length === 0) {
      Alert.alert(
        'No accounts selected',
        'Check at least one account that has not already applied for this IPO.',
      );
      return;
    }

    const title = 'Confirm bulk apply';
    const body = `${selected.companyName} (${selected.scrip || '—'})\nKitta: ${kitta}\nAccounts: ${checkedEligible.length}\n\nThis submits real applications to MeroShare. Start with one account if you are unsure.`;

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Apply',
        style: 'destructive',
        onPress: () => {
          const execute = () => {
            void (async () => {
              setRunning(true);
              setProgress('Starting…');
              setSummary(null);
              try {
                const result = await runBulkApply({
                  accounts: checkedEligible,
                  issue: selected,
                  kitta,
                  dryRun: false,
                  simulateLogin: false,
                  onProgress: (msg) => setProgress(msg),
                });
                setSummary(result);
                await persistSuccessful(result, selected.companyShareId);
              } catch (e) {
                Alert.alert(
                  'Bulk apply failed',
                  e instanceof Error ? e.message : 'Unknown error',
                );
              } finally {
                setRunning(false);
                setProgress('');
              }
            })();
          };
          void sensitive.requestSensitiveAction(execute);
        },
      },
    ]);
  }, [checkedEligible, kitta, selected, sensitive]);

  const runSingle = useCallback(
    (accountId: string) => {
      if (!selected) {
        Alert.alert('No IPO', 'Select a Current Opening IPO first.');
        return;
      }
      if (selected.companyShareId === 9001) {
        Alert.alert(
          'No open IPO',
          'No live opening is available right now. Refresh openings after login.',
        );
        return;
      }
      if (alreadyApplied(accountId)) {
        Alert.alert(
          'Already applied',
          'This account already applied for this IPO (one apply per account per IPO).',
        );
        return;
      }
      const one = accounts.filter((a) => a.id === accountId);
      if (!one.length) return;
      Alert.alert(
        'Confirm apply',
        `${selected.companyName}\nKitta: ${kitta}\nAccount: ${one[0].name}\n\nSubmits a real MeroShare application.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Apply',
            style: 'destructive',
            onPress: () => {
              const execute = () => {
                void (async () => {
                  setRunning(true);
                  try {
                    const result = await runBulkApply({
                      accounts: one,
                      issue: selected,
                      kitta,
                      dryRun: false,
                      simulateLogin: false,
                    });
                    setSummary(result);
                    await persistSuccessful(result, selected.companyShareId);
                  } finally {
                    setRunning(false);
                  }
                })();
              };
              void sensitive.requestSensitiveAction(execute);
            },
          },
        ],
      );
    },
    [accounts, alreadyApplied, kitta, selected, sensitive],
  );

  const openingLabel = useMemo(() => {
    if (loadingIssues) return 'Loading openings…';
    if (!selected || selected.companyShareId === 9001) return 'No Any Opening';
    const suffix = selected.scrip ? ` (${selected.scrip})` : '';
    return `${selected.companyName}${suffix}`;
  }, [loadingIssues, selected]);

  const hasRealOpening =
    Boolean(selected) && selected!.companyShareId !== 9001;

  const currentValueText = hideValues
    ? 'Rs. ••••'
    : formatRs(investment?.currentValue ?? 0);

  const plValue = investment?.pl ?? 0;
  const plText = hideValues
    ? '••••'
    : `${plValue >= 0 ? '+' : '-'} ${formatRs(Math.abs(plValue))}`;

  const eligibleCount = accounts.filter((a) => !alreadyApplied(a.id)).length;

  const headerActions = (
    <View style={styles.headerActions}>
      <Pressable
        onPress={() => navigation.navigate('NepseCalendar')}
        hitSlop={8}
        style={[styles.headerIconBtn, { backgroundColor: colors.primary }]}
      >
        <MaterialCommunityIcons name="calendar-month" size={rs(20)} color="#FFFFFF" />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('FinancialNews')}
        hitSlop={8}
        style={[
          styles.headerIconBtn,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Ionicons name="newspaper-outline" size={rs(18)} color={colors.text} />
        <View style={[styles.headerDot, { backgroundColor: colors.badgeNew }]} />
      </Pressable>
    </View>
  );

  return (
    <ProtectedPersonalScreen
      title="Sign in to bulk apply"
      subtitle="Google sign-in keeps your MeroShare accounts separate per user on this device."
    >
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AppHeader
        onMenuPress={openDrawer}
        title="IPO Bulk Apply"
        showLogo={false}
        right={headerActions}
      />
      <AdminPromoBanner page="apply" />

      {accounts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyArt}>
            <View style={styles.emptyCircle}>
              <MaterialCommunityIcons
                name="file-document-outline"
                size={rs(48)}
                color="#90CAF9"
              />
            </View>
            <View style={styles.plusBubble}>
              <Ionicons name="add" size={rs(28)} color={colors.text} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>No accounts added</Text>
          <Text style={styles.emptySub}>
            Add at least one MeroShare account to apply for IPOs.
          </Text>
          <Pressable
            style={styles.addDataBtn}
            onPress={goAddCapital}
          >
            <Text style={styles.addDataText}>Add account</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refreshAll()}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.summaryCard}>
            <Text style={styles.summaryName}>{displayName}</Text>
            <View style={styles.summaryValueRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>Total current value</Text>
                <Text style={styles.summaryValue}>{currentValueText}</Text>
              </View>
              <View style={styles.summarySide}>
                <View style={styles.plPill}>
                  <Text style={styles.plPillText}>{plText}</Text>
                  <Pressable
                    onPress={() => setHideValues((v) => !v)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={hideValues ? 'eye-off-outline' : 'eye-outline'}
                      size={rs(14)}
                      color={colors.text}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
            <Pressable
              style={styles.summaryBtn}
              onPress={() => navigation.navigate('InvestmentSummary')}
            >
              <Text style={styles.summaryBtnText}>Current Investment Summary</Text>
            </Pressable>
          </View>

          <View style={styles.modeBar}>
            <Pressable
              onPress={() => {
                if (mode === 'Bulk') setAccountsModalOpen(true);
                else goAddCapital();
              }}
              hitSlop={8}
              style={styles.modeSideBtn}
            >
              <MaterialCommunityIcons
                name={mode === 'Bulk' ? 'tray-arrow-up' : 'account-plus-outline'}
                size={rs(22)}
                color={colors.textSecondary}
              />
            </Pressable>
            <View style={styles.modeToggle}>
              {(['Bulk', 'Single'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode === m && styles.modeTextActive,
                    ]}
                  >
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Bulk apply',
                  'Pick an open IPO, set kitta quantity, choose accounts, then tap Auto Apply. Each account can apply once per IPO.',
                )
              }
              hitSlop={8}
              style={styles.modeSideBtn}
            >
              <Ionicons
                name="information-circle-outline"
                size={rs(22)}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {mode === 'Bulk' ? (
            <Pressable
              style={styles.dropdown}
              onPress={() => setAccountsModalOpen(true)}
            >
              <Text style={styles.dropdownText} numberOfLines={1}>
                {checkedEligible.length === accounts.length ||
                checkedEligible.length === eligibleCount
                  ? 'Select Category (All Accounts)'
                  : checkedEligible.length === 1
                    ? `${checkedEligible[0].name.toUpperCase()} - ${checkedEligible[0].username}`
                    : `Select Category (${checkedEligible.length} accounts)`}
              </Text>
              <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
            </Pressable>
          ) : null}

          <View style={styles.fieldBlock}>
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
              disabled={loadingIssues}
            >
              <Text
                style={[
                  styles.dropdownText,
                  hasRealOpening ? { color: colors.text } : null,
                ]}
                numberOfLines={1}
              >
                {openingLabel}
              </Text>
              {loadingIssues ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
              )}
            </Pressable>
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.labelRow}>
              <Text style={styles.hash}>#</Text>
              <Text style={styles.label}>Quantity</Text>
            </View>
            <View style={styles.dropdown}>
              <TextInput
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
                style={styles.qtyInput}
                placeholder="10"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {mode === 'Bulk' ? (
            <Pressable
              style={[styles.autoApply, running && styles.autoApplyDisabled]}
              onPress={confirmBulkApply}
              disabled={running}
            >
              {running ? (
                <ActivityIndicator color="#1B1B1B" />
              ) : (
                <Text style={styles.autoApplyText}>Auto Apply</Text>
              )}
            </Pressable>
          ) : (
            accounts.map((acc, idx) => {
              const applied = alreadyApplied(acc.id);
              return (
                <View key={acc.id} style={styles.accountRow}>
                  <View style={styles.indexBadge}>
                    <Text style={styles.indexText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accName}>{acc.name}</Text>
                    <Text style={styles.accBank}>
                      {applied
                        ? 'Already applied for this IPO'
                        : acc.bankName || acc.dpName}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.applyBtn,
                      applied && styles.applyBtnDisabled,
                    ]}
                    onPress={() => runSingle(acc.id)}
                    disabled={running || applied}
                  >
                    <Text
                      style={[
                        styles.applyBtnText,
                        applied && { color: colors.textMuted },
                      ]}
                    >
                      {applied ? 'Done' : 'Apply'}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}

          {running && progress ? (
            <Text style={styles.progress}>{progress}</Text>
          ) : null}

          {summary ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Apply results</Text>
              <Text style={styles.resultSub}>
                {summary.companyName} · {summary.kitta} kitta ·{' '}
                {summary.results.filter((r) => r.ok).length}/
                {summary.results.length} ok
                {summary.stoppedEarly ? ' · stopped early' : ''}
              </Text>
              {summary.results.map((r) => (
                <View key={r.accountId} style={styles.resultRow}>
                  <Ionicons
                    name={r.ok ? 'checkmark-circle' : 'close-circle'}
                    size={rs(18)}
                    color={r.ok ? colors.accentGreen : colors.danger}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accName}>{r.accountName}</Text>
                    <Text style={styles.resultMsg}>{r.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={accountsModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Select accounts to apply</Text>
            <View style={styles.selectActions}>
              <Pressable onPress={selectAllEligible} hitSlop={8}>
                <Text style={styles.linkAction}>All</Text>
              </Pressable>
              <Pressable onPress={clearEligible} hitSlop={8}>
                <Text style={styles.linkAction}>None</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Already-applied accounts are locked (1 apply / account / IPO).
            </Text>
            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: rs(360) }}
              renderItem={({ item, index: idx }) => {
                const applied = alreadyApplied(item.id);
                const checked = Boolean(selectedIds[item.id]) && !applied;
                return (
                  <Pressable
                    style={[
                      styles.accountRow,
                      applied && styles.accountRowDisabled,
                    ]}
                    onPress={() => toggleAccount(item.id)}
                    disabled={applied}
                  >
                    <Ionicons
                      name={
                        applied
                          ? 'checkmark-done-circle'
                          : checked
                            ? 'checkbox'
                            : 'square-outline'
                      }
                      size={rs(22)}
                      color={
                        applied
                          ? colors.accentGreen
                          : checked
                            ? colors.primary
                            : colors.textMuted
                      }
                    />
                    <View style={styles.indexBadge}>
                      <Text style={styles.indexText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accName}>{item.name}</Text>
                      <Text style={styles.accBank}>
                        {applied
                          ? 'Already applied for this IPO'
                          : item.bankName || item.dpName}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setAccountsModalOpen(false)}
            >
              <Text style={styles.addDataText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Select Opening</Text>
            <FlatList
              data={issues}
              keyExtractor={(item) => String(item.companyShareId)}
              ListEmptyComponent={
                <Text style={styles.emptySub}>No openings available</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelected(item);
                    setPickerOpen(false);
                    setSummary(null);
                  }}
                >
                  <Text style={styles.accName}>{item.companyName}</Text>
                  <Text style={styles.accBank}>
                    {item.shareTypeName}
                    {item.scrip ? ` · ${item.scrip}` : ''}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalClose}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.addDataText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <SensitiveActionModals action={sensitive} />
    </View>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(28),
    },
    emptyArt: {
      width: rs(160),
      height: rs(160),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(16),
    },
    emptyCircle: {
      width: rs(120),
      height: rs(120),
      borderRadius: rs(60),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plusBubble: {
      position: 'absolute',
      width: rs(52),
      height: rs(52),
      borderRadius: rs(26),
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      color: c.text,
      fontSize: rs(20),
      fontWeight: '700',
      marginBottom: rs(8),
    },
    emptySub: {
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: rs(20),
      fontSize: rs(14),
    },
    addDataBtn: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(10),
    },
    addDataText: {
      color: c.primary,
      fontWeight: '600',
      fontSize: rs(15),
    },
    content: { padding: rs(16), paddingBottom: rs(40) },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      minWidth: rs(88),
      justifyContent: 'flex-end',
      paddingBottom: rs(6),
    },
    headerIconBtn: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(8),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    headerDot: {
      position: 'absolute',
      top: rs(4),
      right: rs(4),
      width: rs(8),
      height: rs(8),
      borderRadius: rs(4),
    },
    summaryCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      paddingHorizontal: rs(14),
      paddingTop: rs(12),
      paddingBottom: rs(12),
      backgroundColor: c.surface,
      marginBottom: rs(12),
    },
    summaryName: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      letterSpacing: 0.4,
      marginBottom: rs(8),
    },
    summaryValueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: rs(8),
      marginBottom: rs(10),
    },
    summaryLabel: {
      color: c.textSecondary,
      fontSize: rs(11),
      marginBottom: rs(2),
    },
    summaryValue: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(22),
      letterSpacing: -0.3,
    },
    summarySide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingBottom: rs(2),
    },
    plPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(5),
      backgroundColor: c.surfaceAlt,
      borderRadius: rs(14),
      paddingHorizontal: rs(8),
      paddingVertical: rs(4),
    },
    plPillText: {
      color: c.text,
      fontWeight: '600',
      fontSize: rs(11),
    },
    eyeBtn: {
      padding: rs(4),
    },
    summaryBtn: {
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(20),
      paddingVertical: rs(9),
      paddingHorizontal: rs(14),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg,
    },
    summaryBtnText: {
      color: c.primary,
      fontWeight: '700',
      fontSize: rs(12),
      textAlign: 'center',
      includeFontPadding: false,
    },
    modeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(18),
      gap: rs(10),
    },
    modeSideBtn: {
      width: rs(32),
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(18),
    },
    modeToggle: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: c.primarySoft,
      borderRadius: rs(22),
      padding: rs(4),
    },
    modeBtn: {
      flex: 1,
      paddingVertical: rs(9),
      borderRadius: rs(18),
      alignItems: 'center',
    },
    modeBtnActive: { backgroundColor: c.primary },
    modeText: { color: c.primary, fontWeight: '700', fontSize: rs(14) },
    modeTextActive: { color: '#1B1B1B' },
    fieldBlock: { marginBottom: rs(16) },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(8),
    },
    label: { color: c.textSecondary, fontSize: rs(13) },
    hash: { color: c.textSecondary, fontWeight: '700' },
    dropdown: {
      minHeight: rs(50),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: rs(14),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      marginBottom: rs(12),
    },
    dropdownText: {
      flex: 1,
      color: c.textMuted,
      fontSize: rs(14),
      marginRight: rs(8),
    },
    hint: {
      color: c.textMuted,
      fontSize: rs(11),
      marginBottom: rs(8),
      lineHeight: rs(15),
    },
    qtyInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(15),
      paddingVertical: rs(10),
    },
    selectActions: {
      flexDirection: 'row',
      gap: rs(14),
      marginBottom: rs(8),
    },
    linkAction: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
    autoApply: {
      marginTop: rs(4),
      backgroundColor: c.primary,
      borderRadius: rs(28),
      paddingVertical: rs(16),
      alignItems: 'center',
      minHeight: rs(52),
      justifyContent: 'center',
    },
    autoApplyDisabled: { opacity: 0.7 },
    autoApplyText: {
      color: '#1B1B1B',
      fontWeight: '800',
      fontSize: rs(16),
    },
    accountRow: {
      marginTop: rs(10),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      padding: rs(12),
      backgroundColor: c.surface,
    },
    accountRowDisabled: { opacity: 0.75 },
    indexBadge: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indexText: { color: c.text, fontWeight: '700' },
    accName: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    accBank: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
    applyBtn: {
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(8),
      backgroundColor: c.primarySoft,
    },
    applyBtnDisabled: { backgroundColor: c.surfaceAlt },
    applyBtnText: { color: c.primary, fontWeight: '700' },
    progress: {
      marginTop: rs(16),
      textAlign: 'center',
      color: c.textSecondary,
      fontSize: rs(13),
    },
    resultCard: {
      marginTop: rs(20),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: rs(14),
      gap: rs(10),
    },
    resultTitle: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    resultSub: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginBottom: rs(4),
    },
    resultRow: {
      flexDirection: 'row',
      gap: rs(10),
      alignItems: 'flex-start',
    },
    resultMsg: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      maxHeight: '70%',
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      padding: rs(16),
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginBottom: rs(12),
    },
    modalRow: {
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    modalClose: {
      marginTop: rs(12),
      alignItems: 'center',
      paddingVertical: rs(12),
    },
  });
}
