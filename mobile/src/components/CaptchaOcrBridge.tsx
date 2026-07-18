import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type Pending = {
  resolve: (data: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type CaptchaOcrHandle = {
  /** OCR digit captcha image (base64, no data: prefix). Returns digits only. */
  solveDigits: (imageBase64: string, timeoutMs?: number) => Promise<string>;
  /**
   * Decode CDSC audio captcha (any format) to 16kHz mono PCM16, returned as
   * base64. Uses the browser audio pipeline (reliable resampling).
   */
  decodeAudioPcm16k: (
    audioBase64: string,
    timeoutMs?: number,
  ) => Promise<string>;
};

/**
 * Hidden WebView with browser APIs:
 *  - tesseract.js for image OCR
 *  - AudioContext/OfflineAudioContext to decode+resample audio captcha
 * Auto-solves CDSC captcha so users never type it (IPO Aply–style UX).
 */
export const CaptchaOcrBridge = forwardRef<CaptchaOcrHandle>(
  function CaptchaOcrBridge(_props, ref) {
    const webRef = useRef<WebView>(null);
    const pending = useRef<Map<string, Pending>>(new Map());
    const readyRef = useRef(false);
    const readyWaiters = useRef<Array<() => void>>([]);

    const whenReady = useCallback(() => {
      if (readyRef.current) return Promise.resolve();
      return new Promise<void>((resolve) => {
        readyWaiters.current.push(resolve);
      });
    }, []);

    const call = useCallback(
      (fn: string, payload: Record<string, unknown>, timeoutMs: number) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const requestId = `${fn}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const timer = setTimeout(() => {
            pending.current.delete(requestId);
            reject(new Error(`${fn} timed out`));
          }, timeoutMs);
          pending.current.set(requestId, { resolve, reject, timer });
          const body = JSON.stringify({ ...payload, requestId });
          webRef.current?.injectJavaScript(
            `window.${fn} && window.${fn}(${body}); true;`,
          );
        }),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        async solveDigits(imageBase64: string, timeoutMs = 60000) {
          await whenReady();
          const clean = imageBase64.replace(
            /^data:image\/[a-zA-Z+]+;base64,/,
            '',
          );
          const data = await call(
            '__solveCaptcha',
            { imageBase64: clean },
            timeoutMs,
          );
          if (!data.ok) throw new Error(String(data.message ?? 'OCR failed'));
          return String(data.digits ?? '').replace(/\D/g, '');
        },
        async decodeAudioPcm16k(audioBase64: string, timeoutMs = 30000) {
          await whenReady();
          const clean = audioBase64.replace(
            /^data:audio\/[a-zA-Z0-9.+-]+;base64,/,
            '',
          );
          const data = await call(
            '__decodeAudio',
            { audioBase64: clean },
            timeoutMs,
          );
          if (!data.ok)
            throw new Error(String(data.message ?? 'Audio decode failed'));
          return String(data.pcm ?? '');
        },
      }),
      [call, whenReady],
    );

    const onMessage = (event: WebViewMessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (data.type === 'ready') {
        readyRef.current = true;
        const waiters = readyWaiters.current.splice(0);
        waiters.forEach((w) => w());
        return;
      }
      const requestId = String(data.requestId ?? '');
      const p = pending.current.get(requestId);
      if (!p) return;
      clearTimeout(p.timer);
      pending.current.delete(requestId);
      p.resolve(data);
    };

    return (
      <View style={styles.host} pointerEvents="none">
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onMessage={onMessage}
          source={{ html: OCR_HTML, baseUrl: 'https://localhost/' }}
          style={styles.webview}
        />
      </View>
    );
  },
);

// NOTE: inside this HTML string, JS regex "\D" must be written as "\\D".
const OCR_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"></script>
</head>
<body>
<script>
  function post(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function bytesToB64(u8) {
    var CHUNK = 0x8000;
    var out = '';
    for (var i = 0; i < u8.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(out);
  }

  function preprocess(src) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var scale = 3;
        canvas.width = Math.max(img.width * scale, 160);
        canvas.height = Math.max(img.height * scale, 48);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var d = imageData.data;
        for (var i = 0; i < d.length; i += 4) {
          var g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          var v = g > 145 ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  window.__solveCaptcha = function(cmd) {
    (async function () {
      var requestId = cmd.requestId;
      try {
        if (!window.Tesseract) throw new Error('OCR engine not loaded');
        var raw = 'data:image/png;base64,' + cmd.imageBase64;
        var processed = await preprocess(raw);
        var result = await Tesseract.recognize(processed, 'eng', {
          tessedit_char_whitelist: '0123456789'
        });
        var text = (result && result.data && result.data.text) ? result.data.text : '';
        var digits = String(text).replace(/\\D/g, '');
        post({ type: 'ocr', requestId: requestId, ok: true, digits: digits });
      } catch (e) {
        post({ type: 'ocr', requestId: requestId, ok: false, message: String(e && e.message ? e.message : e) });
      }
    })();
  };

  window.__decodeAudio = function(cmd) {
    (async function () {
      var requestId = cmd.requestId;
      try {
        var bytes = b64ToBytes(cmd.audioBase64);
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('No AudioContext');
        var ac = new AC();
        var decoded = await ac.decodeAudioData(bytes.buffer.slice(0));
        var numCh = decoded.numberOfChannels;
        var srcLen = decoded.length;
        var mono = new Float32Array(srcLen);
        for (var c = 0; c < numCh; c++) {
          var chan = decoded.getChannelData(c);
          for (var i = 0; i < srcLen; i++) mono[i] += chan[i] / numCh;
        }
        var targetRate = 16000;
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        var frames = Math.ceil(decoded.duration * targetRate);
        var offline = new OAC(1, frames, targetRate);
        var srcBuf = offline.createBuffer(1, srcLen, decoded.sampleRate);
        srcBuf.copyToChannel(mono, 0);
        var node = offline.createBufferSource();
        node.buffer = srcBuf;
        node.connect(offline.destination);
        node.start();
        var rendered = await offline.startRendering();
        var out = rendered.getChannelData(0);
        var pcm = new Int16Array(out.length);
        for (var i = 0; i < out.length; i++) {
          var s = Math.max(-1, Math.min(1, out[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        var b64 = bytesToB64(new Uint8Array(pcm.buffer));
        post({ type: 'audio', requestId: requestId, ok: true, pcm: b64 });
      } catch (e) {
        post({ type: 'audio', requestId: requestId, ok: false, message: String(e && e.message ? e.message : e) });
      }
    })();
  };

  function markReady() {
    if (window.Tesseract) post({ type: 'ready' });
    else setTimeout(markReady, 250);
  }
  markReady();
</script>
</body>
</html>`;

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
  },
  webview: { width: 1, height: 1 },
});
