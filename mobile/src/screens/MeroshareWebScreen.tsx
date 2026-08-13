import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  buildMerosharePostLoadScript,
  buildMeroshareSessionBootstrap,
  loginAccountForWeb,
  MEROSHARE_WEB_APP_URL,
  MEROSHARE_WEB_HOME,
  MEROSHARE_WEB_PURCHASE_URL,
} from '../services/meroshare/webSession';
import { rs } from '../utils/responsive';
import { showLockedAccountAlert } from '../utils/lockedAccountAlert';
import type { RootStackParamList } from '../navigation/types';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

const MEROSHARE_URL = MEROSHARE_WEB_HOME;
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

function accountLabel(account: AccountMeta, index: number): string {
  const code = account.dpCode ?? account.dpId;
  return `${index + 1}. ${account.name.toUpperCase()} - ${code}`;
}

export function MeroshareWebScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'MeroshareWeb'>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts, loadSecrets } = useAccounts();
  const { isAccountActive, needsPick, canEditSelection } = useActiveAccounts();
  const sensitive = useSensitiveAction();
  const webRef = useRef<WebView>(null);
  const loginGenRef = useRef(0);
  const loginSeqRef = useRef(0);

  const destination = route.params?.destination ?? 'dashboard';
  const targetHash = destination === 'purchase' ? '/purchase' : '/dashboard';
  const appUrl =
    destination === 'purchase'
      ? MEROSHARE_WEB_PURCHASE_URL
      : MEROSHARE_WEB_APP_URL;

  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInLabel, setSignInLabel] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(() => {
    const id = route.params?.accountId;
    if (!id) return 0;
    const idx = accounts.findIndex((a) => a.id === id);
    return idx >= 0 ? idx : 0;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [webKey, setWebKey] = useState('idle');
  const [loginError, setLoginError] = useState<string | null>(null);
  const attemptedRef = useRef<string | null>(null);
  const sensitiveRef = useRef(sensitive);
  sensitiveRef.current = sensitive;

  const selected = accounts[selectedIdx] ?? null;

  // When opened from Calculate WACC with an accountId, lock selection to it.
  useEffect(() => {
    const id = route.params?.accountId;
    if (!id || !accounts.length) return;
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx >= 0 && idx !== selectedIdx) setSelectedIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.accountId, accounts]);

  const signInAccount = useCallback(
    async (account: AccountMeta, index: number) => {
      if (!isAccountActive(account.id)) {
        setSigningIn(false);
        setLoading(false);
        setLoginError(
          'This account is locked because it is over your plan limit. Choose it in the active set, or upgrade.',
        );
        return;
      }
      const seq = ++loginSeqRef.current;
      setSigningIn(true);
      setSignInLabel(`Logging in as ${account.name}…`);
      setLoading(true);
      setSessionToken(null);
      setLoginError(null);

      try {
        const secrets = await loadSecrets(account.id);
        if (!secrets?.password) {
          if (seq !== loginSeqRef.current) return;
          setLoginError(
            'Password not saved for this account. Re-add it from Apply → Add capital with the MeroShare password.',
          );
          setSigningIn(false);
          setLoading(false);
          return;
        }

        const session = await loginAccountForWeb(account, secrets.password);
        if (seq !== loginSeqRef.current) return;
        loginGenRef.current += 1;
        setSessionToken(session.token);
        setWebKey(`${account.id}-${destination}-${loginGenRef.current}`);
      } catch (e) {
        if (seq !== loginSeqRef.current) return;
        const raw =
          e instanceof Error ? e.message : 'Could not log in to MeroShare';
        const friendly = /unable to process|too many|busy|timeout|network/i.test(
          raw,
        )
          ? 'MeroShare (CDSC) is busy right now. Wait a few seconds and tap Retry.'
          : raw;
        setLoginError(friendly);
        setSessionToken(null);
        setWebKey(`failed-${account.id}-${Date.now()}`);
      } finally {
        if (seq !== loginSeqRef.current) return;
        setSigningIn(false);
        setSignInLabel('');
      }
    },
    [destination, isAccountActive, loadSecrets],
  );

  const promptLocked = useCallback(() => {
    showLockedAccountAlert(
      canEditSelection
        ? () => navigation.navigate('ChooseActiveAccounts')
        : null,
      () => navigation.navigate('Subscription'),
    );
  }, [canEditSelection, navigation]);

  const retryLogin = useCallback(() => {
    if (!selected) return;
    if (!isAccountActive(selected.id)) {
      promptLocked();
      return;
    }
    attemptedRef.current = selected.id;
    void sensitiveRef.current.requestSensitiveAction(async () => {
      await signInAccount(selected, selectedIdx);
    });
  }, [isAccountActive, promptLocked, selected, selectedIdx, signInAccount]);

  useEffect(() => {
    if (!accounts.length) {
      setSessionToken(null);
      setWebKey('no-accounts');
      setLoading(false);
      attemptedRef.current = null;
      return;
    }
    const idx = Math.min(selectedIdx, accounts.length - 1);
    if (idx !== selectedIdx) {
      setSelectedIdx(idx);
      return;
    }
    const account = accounts[idx];
    if (!isAccountActive(account.id)) {
      setSessionToken(null);
      setLoading(false);
      setLoginError(
        needsPick
          ? 'Choose which accounts stay active before opening MeroShare.'
          : 'This account is locked because it is over your plan limit.',
      );
      return;
    }
    if (attemptedRef.current === account.id) return;
    attemptedRef.current = account.id;
    void sensitiveRef.current.requestSensitiveAction(async () => {
      await signInAccount(account, idx);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, isAccountActive, needsPick, selectedIdx, signInAccount]);

  const onSelectAccount = (index: number) => {
    const account = accounts[index];
    if (account && !isAccountActive(account.id)) {
      promptLocked();
      return;
    }
    attemptedRef.current = null;
    setSelectedIdx(index);
    setPickerOpen(false);
  };

  const injectedBeforeLoad = sessionToken
    ? buildMeroshareSessionBootstrap(sessionToken, targetHash)
    : undefined;

  const injectedAfterLoad = sessionToken
    ? buildMerosharePostLoadScript(sessionToken, targetHash)
    : undefined;

  const webSource = sessionToken ? { uri: appUrl } : { uri: MEROSHARE_URL };

  const title =
    destination === 'purchase' ? 'Calculate WACC' : 'MeroShare Web';

  return (
    <ProtectedPersonalScreen title="Sign in to use MeroShare Web">
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            disabled={!canGoBack}
            onPress={() => webRef.current?.goBack()}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons
              name="chevron-back"
              size={rs(22)}
              color={canGoBack ? colors.text : colors.textDim}
            />
          </Pressable>
          <Pressable
            disabled={!canGoForward}
            onPress={() => webRef.current?.goForward()}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons
              name="chevron-forward"
              size={rs(22)}
              color={canGoForward ? colors.text : colors.textDim}
            />
          </Pressable>
          <Pressable
            onPress={retryLogin}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      {accounts.length > 0 ? (
        <Pressable
          style={styles.accountChip}
          onPress={() => setPickerOpen((v) => !v)}
          disabled={signingIn}
        >
          <Text style={styles.accountChipText} numberOfLines={1}>
            {selected ? accountLabel(selected, selectedIdx) : 'Select account'}
          </Text>
          <Ionicons
            name={pickerOpen ? 'chevron-up' : 'chevron-down'}
            size={rs(16)}
            color={colors.text}
          />
        </Pressable>
      ) : (
        <Text style={styles.hint}>
          Official MeroShare portal — add accounts in Apply to auto-login here.
        </Text>
      )}

      {signInLabel ? (
        <Text style={styles.signInHint}>{signInLabel}</Text>
      ) : null}

      {loginError && !signingIn ? (
        <View style={styles.errorBanner}>
          <Ionicons
            name="alert-circle"
            size={rs(18)}
            color={colors.danger}
          />
          <Text style={styles.errorText}>{loginError}</Text>
          <Pressable onPress={retryLogin} style={styles.retryBtn} hitSlop={8}>
            <Ionicons name="refresh" size={rs(14)} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {pickerOpen && accounts.length > 0 ? (
        <ScrollView style={styles.picker} nestedScrollEnabled>
          {accounts.map((account, index) => {
            const locked = !isAccountActive(account.id);
            return (
            <Pressable
              key={account.id}
              style={[
                styles.pickerRow,
                index === selectedIdx && styles.pickerRowOn,
                locked && { opacity: 0.55 },
              ]}
              onPress={() => onSelectAccount(index)}
            >
              <Text style={styles.pickerText}>
                {accountLabel(account, index)}
                {locked ? '  (Locked)' : ''}
              </Text>
            </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.webWrap}>
        {(loading || signingIn) && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>
              {signingIn ? signInLabel || 'Signing in…' : 'Loading MeroShare…'}
            </Text>
          </View>
        )}
        <WebView
          key={webKey}
          ref={webRef}
          source={webSource}
          userAgent={CHROME_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
          injectedJavaScript={injectedAfterLoad}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            if (sessionToken && webRef.current) {
              webRef.current.injectJavaScript(
                buildMerosharePostLoadScript(sessionToken),
              );
            }
          }}
          onNavigationStateChange={(nav) => {
            setCanGoBack(nav.canGoBack);
            setCanGoForward(nav.canGoForward);
          }}
          style={styles.web}
        />
      </View>
      <SensitiveActionModals action={sensitive} />
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
      paddingHorizontal: rs(16),
      paddingVertical: rs(10),
      gap: rs(8),
    },
    title: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      textAlign: 'center',
    },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    iconBtn: { paddingHorizontal: rs(4) },
    hint: {
      color: c.textSecondary,
      fontSize: rs(11),
      paddingHorizontal: rs(16),
      paddingBottom: rs(6),
      lineHeight: rs(15),
    },
    signInHint: {
      color: c.accentGreen,
      fontSize: rs(11),
      fontWeight: '600',
      paddingHorizontal: rs(16),
      paddingBottom: rs(6),
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderRadius: rs(12),
      backgroundColor: 'rgba(229,72,77,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(229,72,77,0.35)',
    },
    errorText: {
      flex: 1,
      color: c.text,
      fontSize: rs(12),
      fontWeight: '600',
      lineHeight: rs(16),
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: '#E5484D',
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      borderRadius: rs(16),
    },
    retryText: { color: '#fff', fontWeight: '800', fontSize: rs(12) },
    accountChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
      borderRadius: rs(12),
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    accountChipText: {
      flex: 1,
      color: c.text,
      fontWeight: '700',
      fontSize: rs(12),
      marginRight: rs(8),
    },
    picker: {
      maxHeight: rs(160),
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    pickerRow: { paddingHorizontal: rs(14), paddingVertical: rs(12) },
    pickerRowOn: { backgroundColor: c.primarySoft },
    pickerText: { color: c.text, fontWeight: '600', fontSize: rs(12) },
    webWrap: { flex: 1, backgroundColor: c.surface },
    web: { flex: 1, backgroundColor: '#fff' },
    loader: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg,
      zIndex: 2,
      gap: rs(10),
    },
    loaderText: { color: c.textSecondary, fontSize: rs(13) },
  });
}
