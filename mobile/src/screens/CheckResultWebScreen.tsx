import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import { IPORESULT_BASE } from '../services/iporesult/endpoints';
import {
  solveCaptchaViaBackend,
  solveCaptchaViaOcrSpace,
} from '../services/iporesult/solveCaptcha';
import { maskBoid, resolveBoidSync } from '../utils/boid';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

/**
 * Injected once the CDSC result page (Angular SPA) has rendered. Provides:
 *  - window.__fillBoid(boid)   → types the BOID into the form (Angular-safe)
 *  - window.__fillCaptcha(txt) → types the solved captcha
 *  - a poller that grabs the captcha <img> as a PNG data URL and posts it to
 *    React Native for OCR, re-reading whenever the captcha image changes.
 * Selectors are heuristic (the portal markup can change) with several
 * fallbacks so BOID / captcha auto-fill keeps working.
 */
const AUTOMATION = `
(function(){
  if (window.__ngharAuto) return; window.__ngharAuto = true;
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  function setNativeValue(el, value){
    try {
      var proto = Object.getPrototypeOf(el);
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    } catch(e){ el.value = value; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  function attr(i, name){ return (i.getAttribute(name) || ''); }
  function meta(i){ return attr(i,'formcontrolname')+' '+(i.id||'')+' '+attr(i,'placeholder')+' '+(i.name||'')+' '+attr(i,'aria-label'); }
  function findBoidInput(){
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
    var el = inputs.find(function(i){ return /boid|demat/i.test(meta(i)); });
    if (el) return el;
    el = inputs.find(function(i){ return i.maxLength === 16; });
    if (el) return el;
    var visible = inputs.filter(function(i){ var t=(i.type||'text').toLowerCase(); return (t==='text'||t==='tel'||t==='number') && i.offsetParent !== null; });
    return visible[0] || null;
  }
  function findCaptchaInput(){
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
    var el = inputs.find(function(i){ return /captcha|verif/i.test(meta(i)); });
    if (el) return el;
    var visible = inputs.filter(function(i){ var t=(i.type||'text').toLowerCase(); return (t==='text'||t==='tel'||t==='number') && i.offsetParent !== null; });
    // captcha field is usually short (<= 7 chars) and the last text input
    var shortOnes = visible.filter(function(i){ return i.maxLength>0 && i.maxLength<=7; });
    if (shortOnes.length) return shortOnes[shortOnes.length-1];
    return visible[visible.length-1] || null;
  }
  function findCaptchaImg(){
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    var el = imgs.find(function(i){ return /captcha/i.test((i.src||'')+' '+(i.id||'')+' '+(i.className||'')+' '+(i.alt||'')); });
    if (el) return el;
    el = imgs.find(function(i){ return (i.src||'').indexOf('data:image') === 0 && (i.naturalWidth||0) > 40 && (i.naturalWidth||0) < 400; });
    return el || null;
  }
  window.__fillBoid = function(boid){
    var el = findBoidInput();
    if (el){ setNativeValue(el, String(boid)); post({type:'boidFilled', ok:true}); }
    else post({type:'boidFilled', ok:false});
  };
  window.__fillCaptcha = function(text){
    var el = findCaptchaInput();
    if (el){ setNativeValue(el, String(text)); post({type:'captchaFilled', ok:true}); }
    else post({type:'captchaFilled', ok:false});
  };
  function readCaptcha(){
    var img = findCaptchaImg();
    if (!img) { post({type:'captchaImg', ok:false}); return; }
    try{
      var c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width || 160;
      c.height = img.naturalHeight || img.height || 60;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      post({type:'captchaImg', ok:true, dataUrl: c.toDataURL('image/png'), key: img.src});
    }catch(e){ post({type:'captchaImg', ok:false, error:String(e)}); }
  }
  window.__readCaptcha = readCaptcha;
  // A few bounded reads while the SPA renders, then stop — an infinite poller
  // saturates the JS thread and makes the screen flicker / feel stuck.
  var lastKey = '';
  function tryRead(){
    var img = findCaptchaImg();
    if (img && img.src && img.src !== lastKey && (img.complete || (img.naturalWidth||0) > 0)){
      lastKey = img.src;
      readCaptcha();
    }
  }
  [600, 1500, 3000, 5000].forEach(function(ms){ setTimeout(tryRead, ms); });
  post({type:'ready'});
})(); true;
`;

export function CheckResultWebScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const webRef = useRef<WebView>(null);

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
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading CDSC result page…');
  const lastSolvedKey = useRef<string>('');

  const selected = useMemo(
    () => accountsWithBoid.find((r) => r.account.id === selectedId) ?? null,
    [accountsWithBoid, selectedId],
  );

  const fillBoid = useCallback((boid: string) => {
    webRef.current?.injectJavaScript(
      `window.__fillBoid && window.__fillBoid(${JSON.stringify(boid)}); true;`,
    );
  }, []);

  const selectAccount = useCallback(
    (row: { account: AccountMeta; boid: string }) => {
      setSelectedId(row.account.id);
      setSheetOpen(false);
      fillBoid(row.boid);
      lastSolvedKey.current = '';
      webRef.current?.injectJavaScript('window.__readCaptcha && window.__readCaptcha(); true;');
      setStatus(`BOID for ${row.account.name} filled. Solving captcha…`);
    },
    [fillBoid],
  );

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(data.type ?? '');

      if (type === 'ready') {
        setReady(true);
        setStatus('Page ready. Pick a company, then it auto-fills BOID + captcha.');
        if (selected) fillBoid(selected.boid);
        webRef.current?.injectJavaScript('window.__readCaptcha && window.__readCaptcha(); true;');
        return;
      }

      if (type === 'captchaImg') {
        if (!data.ok || !data.dataUrl) return;
        const key = String(data.key ?? '');
        if (key && key === lastSolvedKey.current) return;
            lastSolvedKey.current = key;
            setStatus('Solving captcha…');
            // Trained CDSC model (backend) first — most reliable — then OCR.space.
            let digits = '';
            try {
              digits = await solveCaptchaViaBackend(String(data.dataUrl));
            } catch {
              try {
                digits = await solveCaptchaViaOcrSpace(String(data.dataUrl));
              } catch {
                digits = '';
              }
            }
            if (digits) {
              webRef.current?.injectJavaScript(
                `window.__fillCaptcha && window.__fillCaptcha(${JSON.stringify(digits)}); true;`,
              );
              setStatus('Captcha filled. Verify it, then tap View Result.');
            } else {
              setStatus('Captcha auto-solve failed — type it manually and tap reload to retry.');
            }
            return;
      }

      if (type === 'boidFilled') {
        if (!data.ok) {
          setStatus('Could not find the BOID field automatically — enter it manually.');
        }
        return;
      }
    },
    [fillBoid, selected],
  );

  const reinject = useCallback(() => {
    webRef.current?.injectJavaScript(AUTOMATION);
  }, []);

  // Always let the hardware back button leave this screen (never trap the user
  // inside the WebView, even while the CDSC page is reloading).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Check IPO Result</Text>
        <Pressable
          onPress={() => {
            setLoading(true);
            lastSolvedKey.current = '';
            webRef.current?.reload();
          }}
          hitSlop={12}
        >
          <Ionicons name="refresh" size={rs(20)} color={colors.text} />
        </Pressable>
      </View>

      <Text style={styles.statusBar} numberOfLines={2}>
        {status}
      </Text>

      <View style={styles.webWrap}>
        <WebView
          ref={webRef}
          source={{ uri: `${IPORESULT_BASE}/` }}
          userAgent={CHROME_UA}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          cacheEnabled
          onMessage={onMessage}
          injectedJavaScript={AUTOMATION}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            if (!ready) setTimeout(reinject, 1200);
          }}
          onError={() =>
            setStatus(
              'CDSC did not load. Tap reload to retry, or check later — the portal can be busy.',
            )
          }
          onHttpError={() =>
            setStatus('CDSC portal is busy right now. Tap reload to retry.')
          }
          style={styles.webview}
        />
        {loading && !ready ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : null}
      </View>

      <View style={[styles.savedBar, { paddingBottom: Math.max(insets.bottom, rs(10)) }]}>
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
              return (
                <Pressable
                  style={styles.savedRow}
                  onPress={() => selectAccount(item)}
                >
                  <Text style={styles.savedIndex}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savedName} numberOfLines={1}>
                      {item.account.name.toUpperCase()}
                    </Text>
                    <Text style={styles.savedBoid}>{maskBoid(item.boid)}</Text>
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
                Add a MeroShare account with a BOID to auto-fill it here.
              </Text>
            }
          />
        ) : null}
      </View>
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
    },
    webWrap: { flex: 1 },
    webview: { flex: 1, backgroundColor: '#fff' },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.6)',
    },
    savedBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.bgElevated,
      paddingHorizontal: rs(16),
      paddingTop: rs(10),
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
    emptyList: {
      color: c.textMuted,
      fontSize: rs(12),
      textAlign: 'center',
      paddingVertical: rs(16),
    },
  });
}
