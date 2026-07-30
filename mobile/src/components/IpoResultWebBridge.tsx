import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { IPORESULT_BASE } from '../services/iporesult/endpoints';

type Pending = {
  resolve: (v: BridgeHttpResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  kind: string;
};

export type BridgeHttpResult = {
  ok: boolean;
  status: number;
  text: string;
};

export type IpoResultWebBridgeHandle = {
  whenReady: (timeoutMs?: number) => Promise<void>;
  resetSession: (timeoutMs?: number) => Promise<void>;
  fetchHome: () => Promise<BridgeHttpResult>;
  checkResult: (body: {
    companyShareId: string | number;
    boid: string;
    userCaptcha: string;
    captchaIdentifier: string;
  }) => Promise<BridgeHttpResult>;
  reloadCaptcha: (captchaIdentifier: string) => Promise<BridgeHttpResult>;
};

type Props = {
  onPortalBlocked?: (reason: string) => void;
  onReadyChange?: (ready: boolean) => void;
  /**
   * When true, WebView is laid out on-screen (needed for some WAF challenges).
   * Parent should shrink it after companies load.
   */
  interactive?: boolean;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

/**
 * Runs BEFORE page scripts — intercept SPA fetch/XHR so we capture the same
 * company+captcha payload Chrome gets after the WAF challenge.
 */
const BEFORE_LOAD = `
(function() {
  if (window.__ipoHookInstalled) return;
  window.__ipoHookInstalled = true;
  window.__ipoLastHome = null;
  window.__ipoHomeWaiters = [];

  function notifyHome(text) {
    window.__ipoLastHome = text;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'homeCaptured',
        ok: true,
        status: 200,
        text: text
      }));
    } catch (e) {}
    var w = window.__ipoHomeWaiters || [];
    window.__ipoHomeWaiters = [];
    for (var i = 0; i < w.length; i++) {
      try { w[i](text); } catch (e) {}
    }
  }

  function looksLikeHome(text) {
    if (!text || typeof text !== 'string') return false;
    if (/request rejected/i.test(text)) return false;
    if (text.trim().charAt(0) === '<') return false;
    return /companyShare|captchaData|captchaIdentifier/i.test(text);
  }

  var origFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    return origFetch.apply(this, args).then(function(res) {
      try {
        var url = '';
        if (typeof args[0] === 'string') url = args[0];
        else if (args[0] && args[0].url) url = args[0].url;
        if (/companyShares\\/fileUploaded|companyShareList/i.test(String(url))) {
          res.clone().text().then(function(text) {
            if (looksLikeHome(text)) notifyHome(text);
          }).catch(function(){});
        }
      } catch (e) {}
      return res;
    });
  };

  var XO = XMLHttpRequest.prototype.open;
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__ipoUrl = url;
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      try {
        if (/companyShares\\/fileUploaded/i.test(String(xhr.__ipoUrl || ''))) {
          var text = xhr.responseText || '';
          if (looksLikeHome(text)) notifyHome(text);
        }
      } catch (e) {}
    });
    return XS.apply(this, arguments);
  };
})();
true;
`;

const AFTER_LOAD = `
(function() {
  if (window.__ipoBridgeInstalled) return;
  window.__ipoBridgeInstalled = true;

  function post(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }
  function sleep(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  }
  function looksBlocked(text) {
    if (!text) return true;
    if (/request rejected/i.test(text)) return true;
    var t = text.trim();
    return t.charAt(0) === '<' || t.indexOf('<!DOCTYPE') === 0 || t.indexOf('<html') === 0;
  }
  function looksLikeHome(text) {
    if (!text || looksBlocked(text)) return false;
    return /companyShare|captchaData|captchaIdentifier/i.test(text);
  }

  window.__ipoRun = async function(cmd) {
    var requestId = cmd && cmd.requestId;
    try {
      if (cmd.type === 'home') {
        // 1) Already captured from SPA?
        if (window.__ipoLastHome && looksLikeHome(window.__ipoLastHome)) {
          post({ type: 'home', requestId: requestId, ok: true, status: 200, text: window.__ipoLastHome });
          return;
        }
        // 2) Poll API like Chrome after cookies settle (WAF challenge)
        var lastText = '';
        var lastStatus = 0;
        for (var i = 0; i < 30; i++) {
          try {
            var res = await fetch('/result/companyShares/fileUploaded', {
              method: 'GET',
              credentials: 'include',
              headers: { 'Accept': 'application/json, text/plain, */*' },
              cache: 'no-store'
            });
            lastStatus = res.status;
            lastText = await res.text();
            if (looksLikeHome(lastText)) {
              window.__ipoLastHome = lastText;
              post({ type: 'home', requestId: requestId, ok: true, status: lastStatus, text: lastText });
              return;
            }
          } catch (e) {}
          // Also wait if SPA is about to publish captured home
          if (window.__ipoLastHome && looksLikeHome(window.__ipoLastHome)) {
            post({ type: 'home', requestId: requestId, ok: true, status: 200, text: window.__ipoLastHome });
            return;
          }
          await sleep(700);
        }
        post({
          type: 'home',
          requestId: requestId,
          ok: false,
          status: lastStatus || 0,
          text: lastText || 'Request Rejected'
        });
        return;
      }

      if (cmd.type === 'check') {
        var cres = await fetch('/result/result/check', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cmd.body)
        });
        var ctext = await cres.text();
        post({ type: 'check', requestId: requestId, ok: cres.ok, status: cres.status, text: ctext });
        return;
      }

      if (cmd.type === 'reloadCaptcha') {
        var rres = await fetch('/result/captcha/reload/' + encodeURIComponent(cmd.captchaIdentifier), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        var rtext = await rres.text();
        post({ type: 'reloadCaptcha', requestId: requestId, ok: rres.ok, status: rres.status, text: rtext });
        return;
      }

      post({ type: 'error', requestId: requestId, message: 'Unknown command' });
    } catch (e) {
      post({
        type: 'error',
        requestId: requestId,
        message: String(e && e.message ? e.message : e)
      });
    }
  };

  post({ type: 'ready' });
})();
true;
`;

/**
 * Full-size off-screen WebView that behaves like Chrome on the same device.
 * Tiny 1×1 WebViews often fail CDSC WAF JS challenges while Chrome succeeds.
 */
export const IpoResultWebBridge = forwardRef<IpoResultWebBridgeHandle, Props>(
  function IpoResultWebBridge(
    { onPortalBlocked, onReadyChange, interactive = false },
    ref,
  ) {
    const webRef = useRef<WebView>(null);
    const pending = useRef<Map<string, Pending>>(new Map());
    const readyRef = useRef(false);
    const readyWaiters = useRef<Array<{
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }>>([]);
    const [reloadKey, setReloadKey] = useState(0);
    const loadAttempts = useRef(0);

    const settleReady = useCallback(
      (ok: boolean, err?: Error) => {
        readyRef.current = ok;
        onReadyChange?.(ok);
        const waiters = readyWaiters.current.splice(0);
        for (const w of waiters) {
          clearTimeout(w.timer);
          if (ok) w.resolve();
          else w.reject(err ?? new Error('iporesult WebView not ready'));
        }
      },
      [onReadyChange],
    );

    const runCmd = useCallback(
      (cmd: Record<string, unknown>, timeoutMs = 90000) =>
        new Promise<BridgeHttpResult>((resolve, reject) => {
          if (!readyRef.current || !webRef.current) {
            reject(new Error('iporesult portal WebView is not ready'));
            return;
          }
          const requestId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const timer = setTimeout(() => {
            pending.current.delete(requestId);
            reject(new Error('iporesult request timed out'));
          }, timeoutMs);
          pending.current.set(requestId, {
            resolve,
            reject,
            timer,
            kind: String(cmd.type ?? ''),
          });
          const payload = JSON.stringify({ ...cmd, requestId });
          webRef.current.injectJavaScript(
            `window.__ipoRun && window.__ipoRun(${payload}); true;`,
          );
        }),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        whenReady(timeoutMs = 60000) {
          if (readyRef.current) return Promise.resolve();
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              readyWaiters.current = readyWaiters.current.filter(
                (w) => w.resolve !== resolve,
              );
              reject(
                new Error(
                  'iporesult portal WebView did not finish loading. Tap refresh.',
                ),
              );
            }, timeoutMs);
            readyWaiters.current.push({ resolve, reject, timer });
          });
        },
        resetSession(timeoutMs = 60000) {
          readyRef.current = false;
          onReadyChange?.(false);
          try {
            webRef.current?.clearCache?.(true);
          } catch {
            // clearCache is Android-only; ignore where unavailable.
          }
          for (const [, p] of pending.current.entries()) {
            clearTimeout(p.timer);
            p.reject(new Error('iporesult session reset'));
          }
          pending.current.clear();
          setReloadKey((k) => k + 1);
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              readyWaiters.current = readyWaiters.current.filter(
                (w) => w.resolve !== resolve,
              );
              reject(
                new Error(
                  'iporesult portal did not recover after session reset. Tap refresh.',
                ),
              );
            }, timeoutMs);
            readyWaiters.current.push({ resolve, reject, timer });
          });
        },
        fetchHome: () => runCmd({ type: 'home' }, 90000),
        checkResult: (body) => runCmd({ type: 'check', body }),
        reloadCaptcha: (captchaIdentifier) =>
          runCmd({ type: 'reloadCaptcha', captchaIdentifier }),
      }),
      [runCmd],
    );

    const onMessage = (event: WebViewMessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(data.type ?? '');

      if (type === 'ready') {
        settleReady(true);
        return;
      }
      // SPA already loaded company list — satisfy waiting home() calls only
      if (type === 'homeCaptured') {
        for (const [id, p] of pending.current.entries()) {
          if (p.kind !== 'home') continue;
          clearTimeout(p.timer);
          pending.current.delete(id);
          p.resolve({
            ok: Boolean(data.ok),
            status: Number(data.status ?? 200),
            text: String(data.text ?? ''),
          });
        }
        return;
      }
      if (type === 'error') {
        const requestId = String(data.requestId ?? '');
        const p = pending.current.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pending.current.delete(requestId);
          p.reject(new Error(String(data.message ?? 'Bridge error')));
        }
        return;
      }

      const requestId = String(data.requestId ?? '');
      const p = pending.current.get(requestId);
      if (!p) return;
      clearTimeout(p.timer);
      pending.current.delete(requestId);
      p.resolve({
        ok: Boolean(data.ok),
        status: Number(data.status ?? 0),
        text: String(data.text ?? ''),
      });
    };

    return (
      <View
        style={interactive ? styles.hostInteractive : styles.hostHidden}
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        <WebView
          key={reloadKey}
          ref={webRef}
          source={{ uri: IPORESULT_BASE + '/' }}
          userAgent={CHROME_UA}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          cacheEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures={false}
          onMessage={onMessage}
          injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD}
          injectedJavaScript={AFTER_LOAD}
          onLoadEnd={() => {
            setTimeout(() => {
              webRef.current?.injectJavaScript(AFTER_LOAD);
            }, 1500);
          }}
          onError={() => {
            loadAttempts.current += 1;
            if (loadAttempts.current <= 2) {
              setReloadKey((k) => k + 1);
              return;
            }
            settleReady(false, new Error('Failed to load iporesult portal'));
            onPortalBlocked?.('Failed to load iporesult.cdsc.com.np in WebView');
          }}
          style={styles.webview}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  // Visible Chrome-sized pane while WAF challenge runs
  hostInteractive: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 108,
    height: 240,
    zIndex: 20,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#444',
    backgroundColor: '#fff',
  },
  // Keep full browser viewport alive off-screen after session is ready
  hostHidden: {
    position: 'absolute',
    width: SCREEN_W,
    height: Math.min(SCREEN_H, 900),
    left: -SCREEN_W - 48,
    top: 0,
    opacity: 0.99,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
});
