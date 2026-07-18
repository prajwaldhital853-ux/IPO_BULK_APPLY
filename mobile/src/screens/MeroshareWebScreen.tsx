import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  buildMerosharePostLoadScript,
  buildMeroshareSessionBootstrap,
  loginAccountForWeb,
  MEROSHARE_WEB_APP_URL,
  MEROSHARE_WEB_HOME,
} from '../services/meroshare/webSession';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
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
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts, loadSecrets } = useAccounts();
  const sensitive = useSensitiveAction();
  const webRef = useRef<WebView>(null);
  const loginGenRef = useRef(0);
  const loginSeqRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInLabel, setSignInLabel] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [webKey, setWebKey] = useState('idle');

  const selected = accounts[selectedIdx] ?? null;

  const signInAccount = useCallback(
    async (account: AccountMeta, index: number) => {
      const seq = ++loginSeqRef.current;
      setSigningIn(true);
      setSignInLabel(`Logging in as ${account.name}…`);
      setLoading(true);
      setSessionToken(null);

      try {
        const secrets = await loadSecrets(account.id);
        if (!secrets?.password) {
          Alert.alert(
            'Password missing',
            'Re-add this account from Apply → Add capital with the MeroShare password saved.',
          );
          setSigningIn(false);
          setLoading(false);
          return;
        }

        const session = await loginAccountForWeb(account, secrets.password);
        if (seq !== loginSeqRef.current) return;
        loginGenRef.current += 1;
        setSessionToken(session.token);
        setWebKey(`${account.id}-${loginGenRef.current}`);
      } catch (e) {
        if (seq !== loginSeqRef.current) return;
        const msg =
          e instanceof Error ? e.message : 'Could not log in to MeroShare';
        Alert.alert('Login failed', msg);
        setSessionToken(null);
        setWebKey(`failed-${account.id}-${Date.now()}`);
      } finally {
        if (seq !== loginSeqRef.current) return;
        setSigningIn(false);
        setSignInLabel('');
      }
    },
    [loadSecrets],
  );

  useEffect(() => {
    if (!accounts.length) {
      setSessionToken(null);
      setWebKey('no-accounts');
      setLoading(false);
      return;
    }
    const idx = Math.min(selectedIdx, accounts.length - 1);
    if (idx !== selectedIdx) setSelectedIdx(idx);
    void sensitive.requestSensitiveAction(async () => {
      await signInAccount(accounts[idx], idx);
    });
  }, [accounts, selectedIdx, signInAccount, sensitive]);

  const onSelectAccount = (index: number) => {
    setSelectedIdx(index);
    setPickerOpen(false);
  };

  const injectedBeforeLoad = sessionToken
    ? buildMeroshareSessionBootstrap(sessionToken)
    : undefined;

  const injectedAfterLoad = sessionToken
    ? buildMerosharePostLoadScript(sessionToken)
    : undefined;

  const webSource = sessionToken
    ? { uri: MEROSHARE_WEB_APP_URL }
    : { uri: MEROSHARE_URL };

  return (
    <ProtectedPersonalScreen title="Sign in to use MeroShare Web">
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          MeroShare Web
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
            onPress={() => {
              if (selected) void signInAccount(selected, selectedIdx);
            }}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
          </Pressable>
        </View>
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

      {pickerOpen && accounts.length > 0 ? (
        <ScrollView style={styles.picker} nestedScrollEnabled>
          {accounts.map((account, index) => (
            <Pressable
              key={account.id}
              style={[
                styles.pickerRow,
                index === selectedIdx && styles.pickerRowOn,
              ]}
              onPress={() => onSelectAccount(index)}
            >
              <Text style={styles.pickerText}>{accountLabel(account, index)}</Text>
            </Pressable>
          ))}
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
