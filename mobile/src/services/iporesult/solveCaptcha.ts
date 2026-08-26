import type { PublicCaptcha } from './parse';
import type { CaptchaOcrHandle } from '../../components/CaptchaOcrBridge';
import { isCdscBackendConfigured } from '../issuemanager/backendConfig';

const TWOCAPTCHA_API_KEY = (
  process.env.EXPO_PUBLIC_TWOCAPTCHA_API_KEY ?? ''
).trim();
const TWOCAPTCHA_ENABLED =
  process.env.EXPO_PUBLIC_TWOCAPTCHA_ENABLED !== 'false';

function is2CaptchaConfigured(): boolean {
  return TWOCAPTCHA_ENABLED && TWOCAPTCHA_API_KEY.length > 0;
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  oh: '0',
  o: '0',
};

export function normalizeCaptchaDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 5) return digits.slice(0, 5);
  return digits;
}

export function digitsFromSpokenTranscript(transcript: string): string {
  let s = ` ${transcript.toLowerCase()} `;
  // Replace spelled-out digits ("nine five three") with numerals
  for (const [word, digit] of Object.entries(DIGIT_WORDS)) {
    s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), ` ${digit} `);
  }
  // Extract every numeral (handles "953", "9 5 3", "nine 5 three" alike)
  return s.replace(/\D/g, '');
}

/**
 * Paid 2Captcha — only call after every free solver has failed.
 */
export async function solveCaptchaVia2Captcha(
  imageBase64: string,
  digits: number = 5,
): Promise<string> {
  if (!is2CaptchaConfigured()) {
    throw new Error('2Captcha not configured');
  }

  const clean = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  const submitRes = await fetch('https://2captcha.com/in.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      key: TWOCAPTCHA_API_KEY,
      method: 'base64',
      body: clean,
      numeric: '1',
      min_len: String(digits),
      max_len: String(digits),
      json: '1',
    }).toString(),
  });

  const submitData = (await submitRes.json()) as {
    status?: number;
    request?: string;
  };
  if (submitData.status !== 1 || !submitData.request) {
    throw new Error(`2Captcha submit failed: ${submitData.request}`);
  }
  const captchaId = submitData.request;

  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(
      `https://2captcha.com/res.php?key=${encodeURIComponent(
        TWOCAPTCHA_API_KEY,
      )}&action=get&id=${encodeURIComponent(captchaId)}&json=1`,
    );
    const data = (await res.json()) as { status?: number; request?: string };
    if (data.status === 1 && data.request) {
      return String(data.request);
    }
    if (data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha solve failed: ${data.request}`);
    }
  }
  throw new Error('2Captcha timed out');
}

/** Pick the best 5-digit candidate from a Google speech-api response. */
function bestDigitsFromSpeech(responseText: string): string {
  const candidates: string[] = [];
  for (const line of responseText.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as {
        result?: Array<{ alternative?: Array<{ transcript?: string }> }>;
      };
      for (const r of row.result ?? []) {
        for (const alt of r.alternative ?? []) {
          if (alt.transcript) {
            candidates.push(digitsFromSpokenTranscript(alt.transcript));
          }
        }
      }
    } catch {
      /* ignore malformed line */
    }
  }
  // Prefer an exact 5-digit read, else the longest we saw
  const exact = candidates.find((c) => c.length === 5);
  if (exact) return exact;
  const longest = candidates.sort((a, b) => b.length - a.length)[0] ?? '';
  return longest;
}


function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const BufferCtor = (globalThis as { Buffer?: { from: (s: string, enc: string) => Uint8Array } }).Buffer;
  if (BufferCtor) {
    return new Uint8Array(BufferCtor.from(clean, 'base64'));
  }
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (atobFn) {
    const bin = atobFn(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Minimal base64 decoder
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean.replace(/=+$/, '')) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Solve a CDSC captcha with our trained ONNX model on the backend.
 * Most reliable option for CDSC's grid captchas. Requires the CDSC backend to
 * be configured (EXPO_PUBLIC_CDSC_BACKEND_URL) and reachable.
 */
export async function solveCaptchaViaBackend(
  imageBase64: string,
): Promise<string> {
  const { CDSC_BACKEND_URL, cdscBackendHeaders } = await import(
    '../issuemanager/backendConfig'
  );
  const { clearAccessToken } = await import('../auth/tokenStorage');
  const { refreshSessionIfNeeded } = await import('../auth/http');
  if (!CDSC_BACKEND_URL) {
    throw new Error('CDSC backend not configured');
  }
  const clean = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const body = JSON.stringify({ image_base64: clean });

  const send = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      return await fetch(`${CDSC_BACKEND_URL}/cdsc/solve-captcha`, {
        method: 'POST',
        headers: await cdscBackendHeaders(),
        credentials: 'omit',
        signal: controller.signal,
        body,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await send();
  // A stale in-memory access token yields 401 — force a refresh and retry once,
  // mirroring authFetch's behaviour.
  if (res.status === 401) {
    clearAccessToken();
    await refreshSessionIfNeeded();
    res = await send();
  }
  if (!res.ok) {
    throw new Error(`backend HTTP ${res.status}`);
  }
  const json = (await res.json()) as { text?: string };
  const digits = normalizeCaptchaDigits(json.text ?? '');
  if (digits.length < 4) {
    throw new Error(`backend weak result "${digits}"`);
  }
  return digits.length === 5 ? digits : digits.slice(0, 5);
}

/**
 * OCR.space free endpoint — better on CDSC grid captchas than fragile CDN Tesseract.
 */
export async function solveCaptchaViaOcrSpace(
  imageBase64: string,
): Promise<string> {
  const clean = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const body = new FormData();
  body.append('base64Image', `data:image/png;base64,${clean}`);
  body.append('language', 'eng');
  body.append('isOverlayRequired', 'false');
  body.append('OCREngine', '2');
  body.append('scale', 'true');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: {
      apikey: 'helloworld',
    },
    body,
  });
  const json = (await res.json()) as {
    ParsedResults?: Array<{ ParsedText?: string }>;
    ErrorMessage?: string | string[];
    IsErroredOnProcessing?: boolean;
  };
  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(', ')
      : String(json.ErrorMessage ?? 'OCR.space failed');
    throw new Error(msg);
  }
  const text = (json.ParsedResults ?? [])
    .map((r) => r.ParsedText ?? '')
    .join(' ');
  const digits = normalizeCaptchaDigits(text);
  if (digits.length < 4) {
    throw new Error(`OCR.space weak result "${digits}"`);
  }
  return digits.length === 5 ? digits : digits.slice(0, 5);
}

/**
 * CDSC audioCaptcha → spoken digits → text (bulk IPO apps prefer this).
 * Decoding/resampling is done in the WebView (browser AudioContext) for
 * reliability; we only POST clean 16k PCM to speech recognition here.
 */
export async function solveCaptchaViaAudioSpeech(
  audioBase64: string,
  decodePcm16k: (audioBase64: string) => Promise<string>,
): Promise<string> {
  const pcmBase64 = await decodePcm16k(audioBase64);
  const pcm = base64ToBytes(pcmBase64);
  const url =
    'https://www.google.com/speech-api/v2/recognize?output=json&lang=en-US&client=chromium&key=AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/l16; rate=16000' },
    body: pcm.buffer.slice(
      pcm.byteOffset,
      pcm.byteOffset + pcm.byteLength,
    ) as ArrayBuffer,
  });
  const text = await res.text();
  const digits = bestDigitsFromSpeech(text);
  if (digits.length < 5) {
    throw new Error(`Audio captcha weak "${digits}" (need 5 digits)`);
  }
  return digits.slice(0, 5);
}

/**
 * Auto-solve CDSC captcha without user typing.
 *
 * Free chain first (backend ONNX may use server 2Captcha internally when weak):
 *   backend → audio → OCR.space → local OCR
 * Paid last resort only:
 *   mobile 2Captcha (when EXPO_PUBLIC_TWOCAPTCHA_API_KEY is set)
 *
 * `bulkFast`: skips audio before OCR.space for speed, but still tries audio
 * before the paid 2Captcha step.
 */
export async function solvePublicCaptcha(
  captcha: PublicCaptcha,
  ocr?: CaptchaOcrHandle | null,
  opts?: { bulkFast?: boolean },
): Promise<string> {
  const errors: string[] = [];
  const bulkFast = opts?.bulkFast === true;
  const image = captcha.captchaImageBase64;

  if (isCdscBackendConfigured()) {
    try {
      return await solveCaptchaViaBackend(image);
    } catch (e) {
      errors.push(`backend: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  const tryAudio = async (): Promise<string | null> => {
    if (!captcha.audioCaptcha || !ocr?.decodeAudioPcm16k) return null;
    try {
      return await solveCaptchaViaAudioSpeech(
        captcha.audioCaptcha,
        (b64) => ocr.decodeAudioPcm16k(b64),
      );
    } catch (e) {
      errors.push(`audio: ${e instanceof Error ? e.message : 'failed'}`);
      return null;
    }
  };

  const tryOcrSpace = async (): Promise<string | null> => {
    try {
      return await solveCaptchaViaOcrSpace(image);
    } catch (e) {
      errors.push(`ocr.space: ${e instanceof Error ? e.message : 'failed'}`);
      return null;
    }
  };

  const tryLocalOcr = async (): Promise<string | null> => {
    if (!ocr) return null;
    try {
      const digits = normalizeCaptchaDigits(await ocr.solveDigits(image));
      if (digits.length >= 4) {
        return digits.length === 5 ? digits : digits.slice(0, 5);
      }
      errors.push(`local-ocr: weak "${digits}"`);
    } catch (e) {
      errors.push(`local-ocr: ${e instanceof Error ? e.message : 'failed'}`);
    }
    return null;
  };

  if (!bulkFast) {
    const audio = await tryAudio();
    if (audio) return audio;
  }

  if (bulkFast) {
    const localFirst = await tryLocalOcr();
    if (localFirst) return localFirst;
  }

  const ocrSpace = await tryOcrSpace();
  if (ocrSpace) return ocrSpace;

  if (!bulkFast) {
    const local = await tryLocalOcr();
    if (local) return local;
  } else {
    const audio = await tryAudio();
    if (audio) return audio;
  }

  if (is2CaptchaConfigured()) {
    try {
      return await solveCaptchaVia2Captcha(image, 5);
    } catch (e) {
      errors.push(`2captcha: ${e instanceof Error ? e.message : 'failed'}`);
    }
  } else {
    errors.push('2captcha: not configured');
  }

  throw new Error(`Captcha auto-solve failed (${errors.join(' · ')})`);
}
