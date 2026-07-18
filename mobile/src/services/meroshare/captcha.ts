import { MeroshareClient } from './client';
import type { CaptchaPayload } from './types';

/**
 * Captcha fetch helper. Interactive OCR / image UI will plug in here later.
 * For dry-run / simulate paths the engine skips this.
 */
export async function fetchCaptchaPayload(
  client = new MeroshareClient(),
): Promise<CaptchaPayload> {
  return client.fetchCaptcha();
}

/** Placeholder for future on-device OCR or user-entered captcha. */
export async function solveCaptchaInteractive(
  _payload: CaptchaPayload,
): Promise<string> {
  throw new Error(
    'Interactive captcha UI not implemented yet — use dry-run / simulate login.',
  );
}
