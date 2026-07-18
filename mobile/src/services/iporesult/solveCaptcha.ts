import type { PublicCaptcha } from './parse';
import type { CaptchaOcrHandle } from '../../components/CaptchaOcrBridge';

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
 * Prefer audioCaptcha (bulk-app style, browser-decoded), then OCR.space,
 * then local Tesseract.
 */
export async function solvePublicCaptcha(
  captcha: PublicCaptcha,
  ocr?: CaptchaOcrHandle | null,
): Promise<string> {
  const errors: string[] = [];

  if (captcha.audioCaptcha && ocr?.decodeAudioPcm16k) {
    try {
      return await solveCaptchaViaAudioSpeech(
        captcha.audioCaptcha,
        (b64) => ocr.decodeAudioPcm16k(b64),
      );
    } catch (e) {
      errors.push(`audio: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  try {
    return await solveCaptchaViaOcrSpace(captcha.captchaImageBase64);
  } catch (e) {
    errors.push(`ocr.space: ${e instanceof Error ? e.message : 'failed'}`);
  }

  if (ocr) {
    try {
      const digits = normalizeCaptchaDigits(
        await ocr.solveDigits(captcha.captchaImageBase64),
      );
      if (digits.length >= 4) {
        return digits.length === 5 ? digits : digits.slice(0, 5);
      }
      errors.push(`local-ocr: weak "${digits}"`);
    } catch (e) {
      errors.push(`local-ocr: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  throw new Error(`Captcha auto-solve failed (${errors.join(' · ')})`);
}
