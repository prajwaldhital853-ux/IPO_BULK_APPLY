import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaptchaOcrBridge,
  type CaptchaOcrHandle,
} from '../components/CaptchaOcrBridge';
import {
  IpoResultWebBridge,
  type IpoResultWebBridgeHandle,
} from '../components/IpoResultWebBridge';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import type { AccountMeta } from '../types/account';
import type { PublicCaptcha, PublicIpoCompany } from '../services/iporesult/parse';
import {
  loadPublicHomeViaBridge,
  reloadPublicCaptchaViaBridge,
  runPublicBulkResultCheck,
  type PublicBulkResultRow,
} from '../services/iporesult/bulkEngine';
import { solvePublicCaptcha } from '../services/iporesult/solveCaptcha';
import { isValidBoid, resolveBoidSync } from '../utils/boid';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const BG = '#2F3550';
const CARD = '#252B42';
const BTN = '#6A78A3';
const HEADER_BG = '#F2F4F6';
const SAVED_BG = '#FFFFFF';
const SHARE_RED = '#E53935';
const RESULT_RED = '#FF3B30';
const RESULT_GREEN = '#34C759';

function formatPortalResult(row: PublicBulkResultRow): {
  text: string;
  tone: 'ok' | 'no' | 'err';
} {
  if (!row.ok) {
    return {
      text: row.message || 'Could not check result for the entered BOID.',
      tone: 'err',
    };
  }
  if (row.allotted) {
    const fromMsg = row.message.match(
      /allot(?:ed|ted)?\s*quantity\s*[:=\-–]?\s*(\d+)/i,
    )?.[1];
    const qty =
      row.quantity != null && Number.isFinite(row.quantity) && row.quantity > 0
        ? String(row.quantity)
        : fromMsg ??
          row.message.match(/quantity\s*[:=\-–]?\s*(\d+)/i)?.[1] ??
          null;
    return {
      text: qty
        ? `Congratulations! Alloted for the entered BOID.\nQuantity : ${qty}`
        : row.message?.trim() ||
          'Congratulations! Alloted for the entered BOID.',
      tone: 'ok',
    };
  }
  return {
    text: 'Sorry, not alloted for the entered BOID.',
    tone: 'no',
  };
}

/**
 * "Check From MeroShare" — CDSC IPO result UI styled like the official portal,
 * using this phone’s WebView session + auto captcha solve.
 */
export function CheckResultWebScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { operationalAccounts: accounts } = useActiveAccounts();

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
  const [captcha, setCaptcha] = useState<PublicCaptcha | null>(null);
  const [captchaText, setCaptchaText] = useState('');
  const [solvingCaptcha, setSolvingCaptcha] = useState(false);
  const [boidText, setBoidText] = useState('');
  const captchaSolveGen = useRef(0);
  const [resultsMap, setResultsMap] = useState<
    Record<string, PublicBulkResultRow>
  >({});
  const [lastResult, setLastResult] = useState<PublicBulkResultRow | null>(
    null,
  );

  const selected = useMemo(
    () => accountsWithBoid.find((r) => r.account.id === selectedId) ?? null,
    [accountsWithBoid, selectedId],
  );

  const selectedIndex = useMemo(() => {
    if (!selected) return 0;
    const i = accountsWithBoid.findIndex(
      (r) => r.account.id === selected.account.id,
    );
    return i >= 0 ? i + 1 : 1;
  }, [accountsWithBoid, selected]);

  const autoFillCaptcha = useCallback(async (next: PublicCaptcha) => {
    const gen = ++captchaSolveGen.current;
    setSolvingCaptcha(true);
    setCaptchaText('');
    try {
      const digits = await solvePublicCaptcha(next, ocrRef.current);
      if (gen !== captchaSolveGen.current) return;
      setCaptchaText(digits);
    } catch {
      if (gen !== captchaSolveGen.current) return;
      setCaptchaText('');
    } finally {
      if (gen === captchaSolveGen.current) setSolvingCaptcha(false);
    }
  }, []);

  const applyHome = useCallback(
    (home: { companies: PublicIpoCompany[]; captcha: PublicCaptcha }) => {
      setCompanies(home.companies);
      setCaptcha(home.captcha);
      setSelectedCompany((prev) => {
        if (prev) {
          const still = home.companies.find((c) => c.id === prev.id);
          if (still) return still;
        }
        return home.companies[0] ?? null;
      });
      void autoFillCaptcha(home.captcha);
    },
    [autoFillCaptcha],
  );

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
      applyHome(home);
      setStatus(
        home.companies.length
          ? 'Ready — pick company & view result.'
          : 'No IPO results listed on CDSC yet.',
      );
    } catch (e) {
      setCompanies([]);
      setSelectedCompany(null);
      setCaptcha(null);
      setStatus(
        e instanceof Error
          ? e.message
          : 'Could not load CDSC companies on this phone.',
      );
    } finally {
      setLoadingHome(false);
    }
  }, [applyHome]);

  useEffect(() => {
    if (!bridgeReady) return;
    void refreshHome();
  }, [bridgeReady, refreshHome]);

  useEffect(() => {
    if (!accountsWithBoid.length) {
      setSelectedId(null);
      setBoidText('');
      return;
    }
    setSelectedId((prev) => {
      const next =
        prev && accountsWithBoid.some((r) => r.account.id === prev)
          ? prev
          : accountsWithBoid[0].account.id;
      const row = accountsWithBoid.find((r) => r.account.id === next);
      if (row) setBoidText(row.boid);
      return next;
    });
  }, [accountsWithBoid]);

  useEffect(() => {
    if (!selected) return;
    setBoidText(selected.boid);
  }, [selected]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  const reloadCaptcha = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge || !captcha) {
      void refreshHome();
      return;
    }
    try {
      const next = await reloadPublicCaptchaViaBridge(
        bridge,
        captcha.captchaIdentifier,
      );
      setCaptcha(next);
      void autoFillCaptcha(next);
    } catch {
      void refreshHome();
    }
  }, [autoFillCaptcha, captcha, refreshHome]);

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
        applyHome(home);
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
        setStatus(
          focus
            ? focus.ok
              ? focus.allotted
                ? `Alloted${focus.quantity != null ? ` · ${focus.quantity}` : ''}`
                : 'Not alloted'
              : focus.message
            : 'Check finished.',
        );
        await reloadCaptcha();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Check failed';
        setStatus(msg);
        Alert.alert('Check failed', msg);
      } finally {
        setRunning(false);
      }
    },
    [applyHome, reloadCaptcha, selected?.account.id, selectedCompany],
  );

  const onViewResult = useCallback(() => {
    if (!selected) {
      Alert.alert('No account', 'Pick a saved account with a BOID.');
      return;
    }
    const typed = boidText.trim();
    const account =
      typed && isValidBoid(typed)
        ? { ...selected.account, demat: typed }
        : selected.account;
    void runCheckForAccounts([account]);
  }, [boidText, runCheckForAccounts, selected]);

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

  const captchaUri = captcha?.captchaImageBase64
    ? `data:image/png;base64,${captcha.captchaImageBase64}`
    : null;

  const portalResult = lastResult ? formatPortalResult(lastResult) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color="#1A1A1A" />
        </Pressable>
        <Text style={styles.title}>Check IPO Result</Text>
        <Pressable onPress={() => void onFreshSession()} hitSlop={12}>
          <Ionicons name="refresh" size={rs(20)} color="#1A1A1A" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollBody,
            { paddingBottom: Math.max(insets.bottom, rs(12)) + rs(72) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerBlock}>
          {selected ? (
            <View style={styles.accountPillWrap}>
              <Pressable
                style={styles.accountPill}
                onPress={() => setSheetOpen(true)}
              >
                <Text style={styles.accountPillText} numberOfLines={1}>
                  {selectedIndex}. {selected.account.name.toUpperCase()}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.formCard}>
            <View style={styles.logoBlock}>
              <View style={styles.logoRow}>
                <Text style={styles.logoMero}>MERO</Text>
                <MaterialCommunityIcons
                  name="earth"
                  size={rs(18)}
                  color="#90CAF9"
                  style={{ marginHorizontal: rs(3) }}
                />
                <Text style={styles.logoShare}>SHARE</Text>
              </View>
              <Text style={styles.logoSub}>Check Share Result</Text>
            </View>

            <Pressable
              style={styles.field}
              onPress={() => setCompanyPickerOpen(true)}
              disabled={loadingHome || running || !companies.length}
            >
              <Text
                style={[
                  styles.fieldText,
                  !selectedCompany && styles.fieldPlaceholder,
                ]}
                numberOfLines={1}
              >
                {selectedCompany?.name ??
                  (loadingHome ? 'Loading…' : 'Select company')}
              </Text>
              <View style={styles.fieldIcons}>
                {selectedCompany ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => setSelectedCompany(null)}
                  >
                    <Ionicons name="close" size={rs(16)} color="#666" />
                  </Pressable>
                ) : null}
                <Ionicons name="chevron-down" size={rs(18)} color="#666" />
              </View>
            </Pressable>

            <TextInput
              style={styles.field}
              value={boidText}
              onChangeText={setBoidText}
              placeholder="BOID (16 digits)"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              maxLength={16}
              editable={!running}
            />

            <View style={styles.captchaRow}>
              <View style={styles.captchaInputWrap}>
                <TextInput
                  style={styles.captchaInput}
                  value={captchaText}
                  onChangeText={setCaptchaText}
                  placeholder={solvingCaptcha ? '…' : 'Enter Captcha'}
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!running && !solvingCaptcha}
                />
                {solvingCaptcha ? (
                  <ActivityIndicator
                    style={styles.captchaSolving}
                    size="small"
                    color={BTN}
                  />
                ) : null}
              </View>
              <View style={styles.captchaImageWrap}>
                {captchaUri ? (
                  <Image
                    source={{ uri: captchaUri }}
                    style={styles.captchaImage}
                    resizeMode="stretch"
                  />
                ) : (
                  <ActivityIndicator size="small" color="#888" />
                )}
              </View>
              <View style={styles.captchaIconCol}>
                <Pressable
                  style={styles.captchaIconBtn}
                  onPress={() => {
                    Alert.alert(
                      'Auto captcha',
                      'Captcha is solved and filled automatically. Tap refresh for a new code.',
                    );
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="volume-high" size={rs(16)} color="#fff" />
                </Pressable>
                <Pressable
                  style={styles.captchaIconBtn}
                  onPress={() => void reloadCaptcha()}
                  disabled={running || loadingHome || solvingCaptcha}
                  hitSlop={6}
                >
                  <Ionicons name="refresh" size={rs(16)} color="#fff" />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={[
                styles.viewBtn,
                (running || !bridgeReady) && styles.btnDisabled,
              ]}
              onPress={onViewResult}
              onLongPress={onCheckAll}
              disabled={running || !bridgeReady}
            >
              {running ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.viewBtnText}>View Result</Text>
              )}
            </Pressable>

            {portalResult ? (
              <Text
                style={[
                  styles.inlineResult,
                  portalResult.tone === 'ok'
                    ? styles.inlineResultOk
                    : styles.inlineResultNo,
                ]}
              >
                {portalResult.text}
              </Text>
            ) : running ? (
              <Text style={styles.inlineResultHint}>Checking result…</Text>
            ) : null}
          </View>

          <Text style={styles.copyright}>
            © {new Date().getFullYear()} CDS and Clearing Limited. All Rights
            Reserved.
          </Text>

          {status && !lastResult ? (
            <Text style={styles.statusHint} numberOfLines={3}>
              {status}
            </Text>
          ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CaptchaOcrBridge ref={ocrRef} />
      {/* Keep CDSC WebView off-screen — session only, never shown in UI */}
      <IpoResultWebBridge
        ref={bridgeRef}
        interactive={false}
        onReadyChange={setBridgeReady}
        onPortalBlocked={(reason) => setStatus(reason)}
      />

      <View
        style={[
          styles.savedBar,
          { paddingBottom: Math.max(insets.bottom, rs(10)) },
        ]}
      >
        <View style={styles.savedHead}>
          <Pressable
            style={styles.savedHeadLeft}
            onPress={() => setSheetOpen((v) => !v)}
          >
            <Text style={styles.savedTitle}>
              Saved Accounts ({accountsWithBoid.length})
            </Text>
            <Ionicons
              name={sheetOpen ? 'caret-down' : 'caret-up'}
              size={rs(16)}
              color="#1565C0"
            />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={() => navigation.navigate('AddCapital')}
          >
            <Ionicons name="add" size={rs(26)} color="#111" />
          </Pressable>
        </View>

        {sheetOpen ? (
          <FlatList
            style={styles.savedList}
            data={accountsWithBoid}
            keyExtractor={(r) => r.account.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              accountsWithBoid.length > 1 ? (
                <Pressable
                  style={styles.checkAllRow}
                  onPress={onCheckAll}
                  disabled={running || !bridgeReady}
                >
                  <Ionicons
                    name="checkmark-done"
                    size={rs(18)}
                    color={BTN}
                  />
                  <Text style={styles.checkAllText}>
                    Check all ({accountsWithBoid.length})
                  </Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item, index }) => {
              const on = item.account.id === selectedId;
              const result = resultsMap[item.account.id];
              return (
                <Pressable
                  style={[styles.savedRow, on && styles.savedRowOn]}
                  onPress={() => {
                    setSelectedId(item.account.id);
                    setBoidText(item.boid);
                    setSheetOpen(false);
                    setLastResult(result ?? null);
                  }}
                >
                  <Text style={styles.savedIndex}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedName} numberOfLines={1}>
                      {item.account.name.toUpperCase()}
                    </Text>
                    <Text style={styles.savedBoid}>{item.boid}</Text>
                    {result ? (
                      <Text
                        style={[
                          styles.rowResult,
                          result.ok && result.allotted
                            ? { color: '#2E7D32' }
                            : result.ok
                              ? { color: '#666' }
                              : { color: '#C62828' },
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
                    color={on ? BTN : '#999'}
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
                    <Ionicons name="checkmark" size={rs(18)} color={BTN} />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(14),
    paddingVertical: rs(12),
    backgroundColor: HEADER_BG,
  },
  title: {
    color: '#1A1A1A',
    fontSize: rs(16),
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: rs(8),
  },
  scrollBody: {
    flexGrow: 1,
    paddingHorizontal: rs(22),
    justifyContent: 'center',
    paddingTop: rs(56),
  },
  centerBlock: {
    width: '100%',
    maxWidth: rs(360),
    alignSelf: 'center',
  },
  accountPillWrap: {
    alignItems: 'flex-end',
    marginBottom: rs(8),
  },
  accountPill: {
    backgroundColor: '#111',
    borderRadius: rs(14),
    paddingHorizontal: rs(10),
    paddingVertical: rs(4),
    maxWidth: '78%',
  },
  accountPillText: {
    color: '#fff',
    fontSize: rs(10),
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: CARD,
    borderRadius: rs(6),
    paddingHorizontal: rs(16),
    paddingTop: rs(30),
    paddingBottom: rs(28),
    gap: rs(12),
  },
  logoBlock: {
    alignItems: 'center',
    marginBottom: rs(8),
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoMero: {
    color: '#fff',
    fontSize: rs(22),
    fontWeight: '800',
    letterSpacing: 1,
  },
  logoShare: {
    color: SHARE_RED,
    fontSize: rs(22),
    fontWeight: '800',
    letterSpacing: 1,
  },
  logoSub: {
    color: '#fff',
    fontSize: rs(12),
    marginTop: rs(4),
    fontWeight: '500',
  },
  field: {
    backgroundColor: '#fff',
    borderRadius: rs(3),
    paddingHorizontal: rs(10),
    paddingVertical: rs(8),
    minHeight: rs(36),
    color: '#111',
    fontSize: rs(12),
    fontWeight: '500',
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldText: {
    flex: 1,
    color: '#111',
    fontSize: rs(12),
    fontWeight: '500',
  },
  fieldPlaceholder: { color: '#999' },
  fieldIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    marginLeft: rs(8),
  },
  captchaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: rs(6),
  },
  captchaInputWrap: {
    width: '38%',
    position: 'relative',
  },
  captchaInput: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: rs(3),
    paddingHorizontal: rs(6),
    paddingVertical: rs(8),
    minHeight: rs(42),
    height: rs(42),
    color: '#111',
    fontSize: rs(15),
    fontWeight: '700',
    textAlign: 'center',
  },
  captchaSolving: {
    position: 'absolute',
    right: rs(4),
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  captchaImageWrap: {
    flex: 1,
    height: rs(42),
    backgroundColor: '#fff',
    borderRadius: rs(3),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  captchaImage: {
    width: '100%',
    height: '100%',
  },
  captchaIconCol: {
    justifyContent: 'space-between',
    paddingVertical: rs(2),
  },
  captchaIconBtn: {
    width: rs(22),
    height: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtn: {
    backgroundColor: BTN,
    borderRadius: rs(3),
    paddingVertical: rs(9),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: rs(36),
    marginTop: rs(2),
  },
  viewBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: rs(13),
  },
  btnDisabled: { opacity: 0.55 },
  inlineResult: {
    marginTop: rs(16),
    textAlign: 'center',
    fontSize: rs(13),
    fontWeight: '600',
    lineHeight: rs(18),
  },
  inlineResultOk: { color: RESULT_GREEN },
  inlineResultNo: { color: RESULT_RED },
  inlineResultHint: {
    marginTop: rs(16),
    textAlign: 'center',
    fontSize: rs(12),
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
  },
  copyright: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: rs(10),
    textAlign: 'center',
    marginTop: rs(14),
    lineHeight: rs(15),
  },
  statusHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: rs(11),
    textAlign: 'center',
    marginTop: rs(10),
    paddingHorizontal: rs(8),
  },
  savedBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDD',
    backgroundColor: SAVED_BG,
    paddingHorizontal: rs(16),
    paddingTop: rs(12),
    zIndex: 30,
  },
  savedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
  },
  savedTitle: { color: '#111', fontWeight: '700', fontSize: rs(14) },
  savedList: { maxHeight: rs(240), marginTop: rs(8) },
  checkAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    paddingVertical: rs(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  checkAllText: { color: BTN, fontWeight: '700', fontSize: rs(13) },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    paddingVertical: rs(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  savedRowOn: { backgroundColor: 'rgba(92,107,154,0.08)' },
  savedIndex: {
    color: '#888',
    fontSize: rs(12),
    fontWeight: '700',
    width: rs(20),
  },
  savedName: { color: '#111', fontWeight: '700', fontSize: rs(13) },
  savedBoid: {
    color: '#777',
    fontSize: rs(11),
    marginTop: rs(2),
    fontVariant: ['tabular-nums'],
  },
  rowResult: { fontSize: rs(11), marginTop: rs(2), fontWeight: '600' },
  emptyList: {
    color: '#888',
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
    backgroundColor: '#fff',
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
    color: '#111',
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
    borderBottomColor: '#EEE',
  },
  modalRowText: {
    flex: 1,
    color: '#111',
    fontWeight: '600',
    fontSize: rs(14),
  },
});
