import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import {
  CaptchaOcrBridge,
  type CaptchaOcrHandle,
} from '../components/CaptchaOcrBridge';
import {
  IpoResultWebBridge,
  type IpoResultWebBridgeHandle,
} from '../components/IpoResultWebBridge';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import type { PublicIpoCompany } from '../services/iporesult/parse';
import {
  loadPublicHomeViaBridge,
  runPublicBulkResultCheck,
  type PublicBulkResultRow,
} from '../services/iporesult/bulkEngine';
import { maskBoid, resolveBoidSync } from '../utils/boid';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

/**
 * "Check From MeroShare" — CDSC IPO result check using this phone's WebView
 * session (same cookies / WAF path as Chrome), not the blocked Angular form
 * submit. Captcha is auto-solved via backend ONNX → 2Captcha → OCR.
 */
export function CheckResultWebScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const bridgeRef = useRef<IpoResultWebBridgeHandle | null>(null);
  const ocrRef = useRef<CaptchaOcrHandle | null>(null);

  const accountsWithBoid = useMemo(
    () =>
      accounts
        .map((a) => ({ account: a, boid: resolveBoidSync(a) ?? a.demat ?? '' }))
        .filter((r) => r.boid),
    [accounts],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    accountsWithBoid[0]?.account.id ?? null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [loadingHome, setLoadingHome] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Starting phone CDSC session…');
  const [companies, setCompanies] = useState<PublicIpoCompany[]>([]);
  const [selectedCompany, setSelectedCompany] =
    useState<PublicIpoCompany | null>(null);
  const [resultsMap, setResultsMap] = useState<
    Record<string, PublicBulkResultRow>
  >({});
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [lastResult, setLastResult] = useState<PublicBulkResultRow | null>(
    null,
  );

  const selected = useMemo(
    () => accountsWithBoid.find((r) => r.account.id === selectedId) ?? null,
    [accountsWithBoid, selectedId],
  );

  const showBridgePane = !bridgeReady || loadingHome || running;

  const refreshHome = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) {
      setStatus('Waiting for phone CDSC session…');
      return;
    }
    setLoadingHome(true);
    setStatus('Loading companies from this phone’s CDSC session…');
    try {
      await bridge.whenReady(90000);
      const home = await loadPublicHomeViaBridge(bridge);
      setCompanies(home.companies);
      setSelectedCompany((prev) => {
        if (prev) {
          const still = home.companies.find((c) => c.id === prev.id);
          if (still) return still;
        }
        return home.companies[0] ?? null;
      });
      setStatus(
        home.companies.length
          ? 'Ready. Pick a company + account, then Check Result.'
          : 'No IPO results listed on CDSC yet.',
      );
    } catch (e) {
      setCompanies([]);
      setSelectedCompany(null);
      setStatus(
        e instanceof Error
          ? e.message
          : 'Could not load CDSC companies on this phone.',
      );
    } finally {
      setLoadingHome(false);
    }
  }, []);

  useEffect(() => {
    if (!bridgeReady) return;
    void refreshHome();
  }, [bridgeReady, refreshHome]);

  useEffect(() => {
    if (!accountsWithBoid.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && accountsWithBoid.some((r) => r.account.id === prev)
        ? prev
        : accountsWithBoid[0].account.id,
    );
  }, [accountsWithBoid]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  const runCheckForAccounts = useCallback(
    async (queue: AccountMeta[]) => {
      const bridge = bridgeRef.current;
      const ocr = ocrRef.current;
      if (!selectedCompany) {
        Alert.alert('Select company', 'Pick an IPO company first.');
        return;
      }
      if (!bridge || !ocr) {
        Alert.alert(
          'Not ready',
          'Phone CDSC session is still starting. Wait a moment and retry.',
        );
        return;
      }
      if (!queue.length) {
        Alert.alert('No accounts', 'Select an account with a BOID.');
        return;
      }

      setRunning(true);
      setResultsMap({});
      setLastResult(null);
      setStatus('Preparing CDSC check on this phone…');

      try {
        const home = await loadPublicHomeViaBridge(bridge);
        const liveCompany =
          home.companies.find((c) => c.id === selectedCompany.id) ??
          selectedCompany;

        const summary = await runPublicBulkResultCheck({
          bridge,
          ocr,
          accounts: queue,
          company: liveCompany,
          captcha: home.captcha,
          onProgress: (msg) => setStatus(msg),
          onAccountResult: (row) => {
            setResultsMap((prev) => ({ ...prev, [row.accountId]: row }));
            setLastResult(row);
          },
        });

        const focus =
          summary.results.find((r) => r.accountId === selected?.account.id) ??
          summary.results[0] ??
          null;
        setLastResult(focus);
        setResultModalOpen(true);
        setStatus(
          focus
            ? focus.ok
              ? focus.allotted
                ? `Allotted${focus.quantity != null ? ` · ${focus.quantity} kitta` : ''}`
                : 'Not allotted'
              : focus.message
            : 'Check finished.',
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Check failed';
        setStatus(msg);
        Alert.alert('Check failed', msg);
      } finally {
        setRunning(false);
      }
    },
    [selected?.account.id, selectedCompany],
  );

  const onCheckSelected = useCallback(() => {
    if (!selected) {
      Alert.alert('No account', 'Pick a saved account with a BOID.');
      return;
    }
    void runCheckForAccounts([selected.account]);
  }, [runCheckForAccounts, selected]);

  const onCheckAll = useCallback(() => {
    void runCheckForAccounts(accountsWithBoid.map((r) => r.account));
  }, [accountsWithBoid, runCheckForAccounts]);

  const onFreshSession = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setStatus('Starting a fresh phone CDSC session…');
    setBridgeReady(false);
    try {
      await bridge.resetSession(90000);
      await refreshHome();
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : 'Could not refresh CDSC session.',
      );
    }
  }, [refreshHome]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Check From MeroShare</Text>
        <Pressable
          onPress={() => {
            void onFreshSession();
          }}
          hitSlop={12}
        >
          <Ionicons name="refresh" size={rs(20)} color={colors.text} />
        </Pressable>
      </View>

      <Text style={styles.statusBar} numberOfLines={3}>
        {status}
      </Text>

      <View style={styles.body}>
        <Text style={styles.label}>Company (CDSC)</Text>
        <Pressable
          style={styles.picker}
          onPress={() => setCompanyPickerOpen(true)}
          disabled={loadingHome || running || !companies.length}
        >
          <Text style={styles.pickerText} numberOfLines={2}>
            {selectedCompany?.name ??
              (loadingHome ? 'Loading…' : 'No company available')}
          </Text>
          <Ionicons
            name="chevron-down"
            size={rs(18)}
            color={colors.textSecondary}
          />
        </Pressable>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, (running || !bridgeReady) && styles.btnDisabled]}
            onPress={onCheckSelected}
            disabled={running || !bridgeReady}
          >
            {running ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Check Result</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, (running || !bridgeReady) && styles.btnDisabled]}
            onPress={onCheckAll}
            disabled={running || !bridgeReady}
          >
            <Text style={styles.secondaryBtnText}>
              Check all ({accountsWithBoid.length})
            </Text>
          </Pressable>
        </View>

        {lastResult ? (
          <View
            style={[
              styles.resultCard,
              lastResult.ok && lastResult.allotted
                ? styles.resultOk
                : lastResult.ok
                  ? styles.resultNo
                  : styles.resultErr,
            ]}
          >
            <Text style={styles.resultTitle}>
              {lastResult.accountName.toUpperCase()}
            </Text>
            <Text style={styles.resultMsg}>
              {!lastResult.ok
                ? lastResult.message
                : lastResult.allotted
                  ? `Congratulations! Allotted${
                      lastResult.quantity != null
                        ? ` · ${lastResult.quantity} kitta`
                        : ''
                    }`
                  : 'Sorry, not allotted for this IPO.'}
            </Text>
          </View>
        ) : (
          <View style={styles.hintCard}>
            <Ionicons
              name="shield-checkmark-outline"
              size={rs(22)}
              color={colors.primary}
            />
            <Text style={styles.hintText}>
              Uses this phone’s CDSC session (same as Chrome). Captcha is solved
              automatically — no WAF form submit.
            </Text>
          </View>
        )}

        {Object.keys(resultsMap).length > 1 ? (
          <Pressable
            style={styles.viewAll}
            onPress={() => setResultModalOpen(true)}
          >
            <Text style={styles.viewAllText}>
              View all results ({Object.keys(resultsMap).length})
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Keep bridge mounted; show briefly while WAF / session warms up */}
      <CaptchaOcrBridge ref={ocrRef} />
      <IpoResultWebBridge
        ref={bridgeRef}
        interactive={showBridgePane}
        onReadyChange={setBridgeReady}
        onPortalBlocked={(reason) => setStatus(reason)}
      />

      <View
        style={[styles.savedBar, { paddingBottom: Math.max(insets.bottom, rs(10)) }]}
      >
        <Pressable
          style={styles.savedHead}
          onPress={() => setSheetOpen((v) => !v)}
        >
          <Text style={styles.savedTitle}>
            Saved Accounts ({accountsWithBoid.length})
          </Text>
          <Ionicons
            name={sheetOpen ? 'chevron-down' : 'chevron-up'}
            size={rs(18)}
            color={colors.textSecondary}
          />
        </Pressable>

        {selected ? (
          <Text style={styles.selectedLine} numberOfLines={1}>
            {selected.account.name.toUpperCase()} · {maskBoid(selected.boid)}
          </Text>
        ) : (
          <Text style={styles.selectedLine}>
            No saved account has a BOID yet.
          </Text>
        )}

        {sheetOpen ? (
          <FlatList
            style={styles.savedList}
            data={accountsWithBoid}
            keyExtractor={(r) => r.account.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const on = item.account.id === selectedId;
              const result = resultsMap[item.account.id];
              return (
                <Pressable
                  style={styles.savedRow}
                  onPress={() => {
                    setSelectedId(item.account.id);
                    setSheetOpen(false);
                    if (result) setLastResult(result);
                  }}
                >
                  <Text style={styles.savedIndex}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedName} numberOfLines={1}>
                      {item.account.name.toUpperCase()}
                    </Text>
                    <Text style={styles.savedBoid}>{maskBoid(item.boid)}</Text>
                    {result ? (
                      <Text
                        style={[
                          styles.rowResult,
                          result.ok && result.allotted
                            ? { color: '#2E7D32' }
                            : result.ok
                              ? { color: colors.textSecondary }
                              : { color: colors.danger },
                        ]}
                        numberOfLines={1}
                      >
                        {!result.ok
                          ? result.message
                          : result.allotted
                            ? `Allotted${result.quantity != null ? ` · ${result.quantity}` : ''}`
                            : 'Not allotted'}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={rs(20)}
                    color={on ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyList}>
                Add a MeroShare account with a BOID to check here.
              </Text>
            }
          />
        ) : null}
      </View>

      <Modal
        visible={companyPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCompanyPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCompanyPickerOpen(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select company</Text>
            <FlatList
              data={companies}
              keyExtractor={(c) => String(c.id)}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedCompany(item);
                    setCompanyPickerOpen(false);
                    setResultsMap({});
                    setLastResult(null);
                  }}
                >
                  <Text style={styles.modalRowText}>{item.name}</Text>
                  {selectedCompany?.id === item.id ? (
                    <Ionicons
                      name="checkmark"
                      size={rs(18)}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={resultModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setResultModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '70%' }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Results</Text>
              <Pressable onPress={() => setResultModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={rs(22)} color={colors.text} />
              </Pressable>
            </View>
            <FlatList
              data={Object.values(resultsMap)}
              keyExtractor={(r) => r.accountId}
              renderItem={({ item }) => (
                <View style={styles.modalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRowText}>
                      {item.accountName.toUpperCase()}
                    </Text>
                    <Text style={styles.savedBoid}>
                      {item.boidMasked ?? ''}
                    </Text>
                    <Text
                      style={[
                        styles.rowResult,
                        item.ok && item.allotted
                          ? { color: '#2E7D32' }
                          : item.ok
                            ? { color: colors.textSecondary }
                            : { color: colors.danger },
                      ]}
                    >
                      {!item.ok
                        ? item.message
                        : item.allotted
                          ? `Allotted${item.quantity != null ? ` · ${item.quantity} kitta` : ''}`
                          : 'Not allotted'}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyList}>No results yet.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: {
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
      marginHorizontal: rs(8),
    },
    statusBar: {
      color: c.textSecondary,
      fontSize: rs(11),
      paddingHorizontal: rs(16),
      paddingVertical: rs(6),
      backgroundColor: c.surface,
      minHeight: rs(36),
    },
    body: {
      flex: 1,
      paddingHorizontal: rs(16),
      paddingTop: rs(16),
      gap: rs(12),
    },
    label: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(12),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      backgroundColor: c.surface,
    },
    pickerText: { flex: 1, color: c.text, fontWeight: '600', fontSize: rs(14) },
    actions: { gap: rs(10) },
    primaryBtn: {
      backgroundColor: '#E53935',
      borderRadius: rs(12),
      paddingVertical: rs(14),
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: rs(48),
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(15) },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(12),
      paddingVertical: rs(12),
      alignItems: 'center',
      backgroundColor: c.surface,
    },
    secondaryBtnText: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
    },
    btnDisabled: { opacity: 0.55 },
    hintCard: {
      flexDirection: 'row',
      gap: rs(10),
      alignItems: 'flex-start',
      padding: rs(14),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    hintText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
    },
    resultCard: {
      padding: rs(14),
      borderRadius: rs(12),
      borderWidth: 1,
      gap: rs(6),
    },
    resultOk: {
      backgroundColor: 'rgba(46,125,50,0.10)',
      borderColor: 'rgba(46,125,50,0.35)',
    },
    resultNo: {
      backgroundColor: c.surface,
      borderColor: c.border,
    },
    resultErr: {
      backgroundColor: 'rgba(229,72,77,0.10)',
      borderColor: 'rgba(229,72,77,0.35)',
    },
    resultTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    resultMsg: { color: c.text, fontSize: rs(13), lineHeight: rs(18) },
    viewAll: { alignSelf: 'center', paddingVertical: rs(6) },
    viewAllText: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
    savedBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.bgElevated,
      paddingHorizontal: rs(16),
      paddingTop: rs(10),
      zIndex: 30,
    },
    savedHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    savedTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    selectedLine: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
    },
    savedList: { maxHeight: rs(220), marginTop: rs(8) },
    savedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    savedIndex: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '700',
      width: rs(20),
    },
    savedName: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    savedBoid: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(2),
      fontVariant: ['tabular-nums'],
    },
    rowResult: { fontSize: rs(11), marginTop: rs(2), fontWeight: '600' },
    emptyList: {
      color: c.textMuted,
      fontSize: rs(12),
      textAlign: 'center',
      paddingVertical: rs(16),
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: rs(16),
      borderTopRightRadius: rs(16),
      padding: rs(16),
      maxHeight: '60%',
    },
    modalHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(8),
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginBottom: rs(8),
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    modalRowText: { flex: 1, color: c.text, fontWeight: '600', fontSize: rs(14) },
  });
}
