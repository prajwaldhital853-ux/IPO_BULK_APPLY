import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
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
  const { colors, isDark } = useTheme();
  const sensitive = useSensitiveAction();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<'Bulk' | 'Single'>('Bulk');
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
  /** Live = real MeroShare; dry-run = offline demo */
  const [liveMode, setLiveMode] = useState(true);
  const [loadingIssues, setLoadingIssues] = useState(false);

  const primary = accounts[0];
  const kitta = Math.max(1, parseInt(qty.replace(/\D/g, ''), 10) || 10);
  const companyShareId = selected?.companyShareId;

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
    if (liveMode && selected.companyShareId === 9001) {
      Alert.alert(
        'Demo IPO only',
        'No live opening loaded. Pull real openings (refresh) after a successful account login, or switch to Dry-run.',
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

    const title = liveMode
      ? '⚠ LIVE Bulk Apply'
      : 'Confirm Bulk Apply (Dry-run)';
    const body = liveMode
      ? `${selected.companyName} (${selected.scrip || '—'})\nKitta: ${kitta}\nAccounts: ${checkedEligible.length}\n\nThis WILL submit real applications to MeroShare with CRN + PIN.\nStart with 1 account if unsure.\nCredentials stay on this device.`
      : `${selected.companyName} (${selected.scrip || '—'})\nKitta: ${kitta}\nSelected accounts: ${checkedEligible.length}\n\nDry-run only — does NOT call MeroShare apply.`;

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: liveMode ? 'Apply Live' : 'Run Dry-run',
        style: liveMode ? 'destructive' : 'default',
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
                  dryRun: !liveMode,
                  simulateLogin: !liveMode,
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
          if (liveMode) {
            void sensitive.requestSensitiveAction(execute);
          } else {
            execute();
          }
        },
      },
    ]);
  }, [checkedEligible, kitta, liveMode, selected, sensitive]);

  const runSingle = useCallback(
    (accountId: string) => {
      if (!selected) {
        Alert.alert('No IPO', 'Select a Current Opening IPO first.');
        return;
      }
      if (liveMode && selected.companyShareId === 9001) {
        Alert.alert(
          'Demo IPO only',
          'No live opening loaded. Refresh openings after login, or use Dry-run.',
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
        liveMode ? '⚠ LIVE Apply' : 'Confirm Apply (Dry-run)',
        liveMode
          ? `${selected.companyName}\nKitta: ${kitta}\nAccount: ${one[0].name}\n\nSubmits a real MeroShare application.`
          : `${selected.companyName}\nKitta: ${kitta}\nAccount: ${one[0].name}\n\nDry-run only — not live MeroShare.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: liveMode ? 'Apply Live' : 'Run',
            style: liveMode ? 'destructive' : 'default',
            onPress: () => {
              const execute = () => {
                void (async () => {
                  setRunning(true);
                  try {
                    const result = await runBulkApply({
                      accounts: one,
                      issue: selected,
                      kitta,
                      dryRun: !liveMode,
                      simulateLogin: !liveMode,
                    });
                    setSummary(result);
                    await persistSuccessful(result, selected.companyShareId);
                  } finally {
                    setRunning(false);
                  }
                })();
              };
              if (liveMode) {
                void sensitive.requestSensitiveAction(execute);
              } else {
                execute();
              }
            },
          },
        ],
      );
    },
    [accounts, alreadyApplied, kitta, liveMode, selected, sensitive],
  );

  return (
    <ProtectedPersonalScreen
      title="Sign in to bulk apply"
      subtitle="Google sign-in keeps your MeroShare accounts separate per user on this device."
    >
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      {isDark ? <PromoBanner /> : null}

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
          <Text style={styles.emptyTitle}>Oops! No Data Found</Text>
          <Text style={styles.emptySub}>
            Please add some data first to apply bulk IPO
          </Text>
          <Pressable
            style={styles.addDataBtn}
            onPress={() => navigation.navigate('AddCapital')}
          >
            <Text style={styles.addDataText}>Add Data</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.bannerWarn, liveMode && styles.bannerLive]}>
            <Ionicons
              name={liveMode ? 'warning' : 'information-circle'}
              size={rs(18)}
              color={liveMode ? colors.danger : colors.primary}
            />
            <Text style={styles.bannerWarnText}>
              {liveMode
                ? 'LIVE mode: Apply submits real MeroShare applications. Start with 1 account.'
                : 'Dry-run mode: simulates only — no live apply.'}
            </Text>
          </View>

          <View style={styles.modeRow}>
            <View style={styles.modeToggle}>
              {(
                [
                  { key: true, label: 'Live' },
                  { key: false, label: 'Dry-run' },
                ] as const
              ).map((m) => (
                <Pressable
                  key={String(m.key)}
                  onPress={() => setLiveMode(m.key)}
                  style={[
                    styles.modeBtn,
                    liveMode === m.key && styles.modeBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      liveMode === m.key && styles.modeTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => void refreshIssues()}
              style={styles.refreshBtn}
              disabled={loadingIssues || running}
            >
              {loadingIssues ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={rs(18)} color={colors.primary} />
              )}
            </Pressable>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryName}>{primary.name}</Text>
            <Text style={styles.metaLine}>
              {accounts.length} account{accounts.length === 1 ? '' : 's'} on this
              device
            </Text>
          </View>

          <View style={styles.modeRow}>
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
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.labelRow}>
              <MaterialCommunityIcons
                name="bank"
                size={rs(16)}
                color={colors.textSecondary}
              />
              <Text style={styles.label}>Current Opening IPO/FPO/Right</Text>
            </View>
            <Pressable
              style={styles.dropdown}
              onPress={() => setPickerOpen(true)}
            >
              <Text
                style={[
                  styles.dropdownText,
                  selected ? { color: colors.text } : null,
                ]}
                numberOfLines={1}
              >
                {selected
                  ? `${selected.companyName}${selected.scrip ? ` (${selected.scrip})` : ''}`
                  : loadingIssues
                    ? 'Loading openings…'
                    : 'No open IPO right now'}
              </Text>
              <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
            </Pressable>
            {!loadingIssues && issues.length === 0 ? (
              <View style={styles.emptyOpenBox}>
                <Text style={styles.emptyOpenTitle}>No IPO is open</Text>
                <Text style={styles.emptyOpenText}>
                  Live apply needs an open issue. Meanwhile you can check past
                  application / allotment status on the Check tab (works with no
                  open IPO).
                </Text>
                <Pressable
                  style={styles.emptyOpenBtn}
                  onPress={() =>
                    navigation.navigate('MainTabs', { screen: 'Check' })
                  }
                >
                  <Text style={styles.emptyOpenBtnText}>Go to Check</Text>
                </Pressable>
              </View>
            ) : null}
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
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {mode === 'Bulk' ? (
            <>
              <View style={styles.selectHead}>
                <Text style={styles.selectTitle}>Select accounts to apply</Text>
                <View style={styles.selectActions}>
                  <Pressable onPress={selectAllEligible} hitSlop={8}>
                    <Text style={styles.linkAction}>All</Text>
                  </Pressable>
                  <Pressable onPress={clearEligible} hitSlop={8}>
                    <Text style={styles.linkAction}>None</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.hint}>
                Unchecked accounts are skipped. Already-applied accounts are
                locked (1 apply / account / IPO).
              </Text>

              {accounts.map((acc, idx) => {
                const applied = alreadyApplied(acc.id);
                const checked = Boolean(selectedIds[acc.id]) && !applied;
                return (
                  <Pressable
                    key={acc.id}
                    style={[
                      styles.accountRow,
                      applied && styles.accountRowDisabled,
                    ]}
                    onPress={() => toggleAccount(acc.id)}
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
                      <Text style={styles.accName}>{acc.name}</Text>
                      <Text style={styles.accBank}>
                        {applied
                          ? 'Already applied for this IPO'
                          : acc.bankName || acc.dpName}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              <Pressable
                style={[styles.autoApply, running && styles.autoApplyDisabled]}
                onPress={confirmBulkApply}
                disabled={running}
              >
                {running ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.autoApplyText}>
                    {liveMode ? 'Live Apply' : 'Dry-run Apply'} (
                    {checkedEligible.length})
                  </Text>
                )}
              </Pressable>
            </>
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
              <Text style={styles.resultTitle}>
                {summary.dryRun ? 'Dry-run results (demo)' : 'Apply results'}
              </Text>
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
      backgroundColor: '#2196F3',
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
    bannerWarn: {
      flexDirection: 'row',
      gap: rs(8),
      alignItems: 'flex-start',
      backgroundColor: c.primarySoft,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(14),
    },
    bannerLive: {
      backgroundColor: 'rgba(198,40,40,0.12)',
    },
    bannerWarnText: {
      flex: 1,
      color: c.text,
      fontSize: rs(12),
      lineHeight: rs(17),
      fontWeight: '600',
    },
    refreshBtn: {
      marginLeft: rs(10),
      padding: rs(8),
      borderRadius: rs(20),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      minWidth: rs(36),
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(16),
    },
    summaryName: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      letterSpacing: 0.4,
    },
    metaLine: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
    },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(18),
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: rs(20),
      padding: rs(3),
      borderWidth: 1,
      borderColor: c.border,
    },
    modeBtn: {
      paddingHorizontal: rs(22),
      paddingVertical: rs(8),
      borderRadius: rs(16),
    },
    modeBtnActive: { backgroundColor: c.primary },
    modeText: { color: c.text, fontWeight: '600', fontSize: rs(13) },
    modeTextActive: { color: '#FFFFFF' },
    fieldBlock: { marginBottom: rs(14) },
    emptyOpenBox: {
      marginTop: rs(10),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      gap: rs(8),
    },
    emptyOpenTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    emptyOpenText: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    emptyOpenBtn: {
      alignSelf: 'flex-start',
      marginTop: rs(4),
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: rs(20),
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
    },
    emptyOpenBtnText: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginBottom: rs(8),
    },
    label: { color: c.textSecondary, fontSize: rs(13) },
    hash: { color: c.textSecondary, fontWeight: '700' },
    dropdown: {
      minHeight: rs(48),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: rs(14),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
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
    selectHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: rs(4),
      marginBottom: rs(4),
    },
    selectTitle: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    selectActions: { flexDirection: 'row', gap: rs(14) },
    linkAction: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
    autoApply: {
      marginTop: rs(20),
      backgroundColor: c.primary,
      borderRadius: rs(28),
      paddingVertical: rs(14),
      alignItems: 'center',
      minHeight: rs(48),
      justifyContent: 'center',
    },
    autoApplyDisabled: { opacity: 0.7 },
    autoApplyText: {
      color: '#FFFFFF',
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
