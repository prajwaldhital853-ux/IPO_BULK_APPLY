export class MeroshareError extends Error {
  code: 'AUTH' | 'CAPTCHA' | 'NETWORK' | 'RATE' | 'APPLY' | 'UNKNOWN';
  constructor(
    code: MeroshareError['code'],
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'MeroshareError';
  }
}

/** Flaky CDSC / MeroShare responses that usually succeed on a short retry. */
export function isTransientMeroshareMessage(message: string): boolean {
  return /unable to (process|proceed)|try again|temporarily|at the moment|timeout|timed out|network request failed|502|503|504|ECONNRESET|ETIMEDOUT|HTML response|captive portal|rate.?limit|too many requests|please wait/i.test(
    message,
  );
}

export function isTransientMeroshareError(error: unknown): boolean {
  if (error instanceof MeroshareError) {
    if (error.code === 'AUTH' || error.code === 'CAPTCHA') return false;
    if (error.code === 'NETWORK' || error.code === 'RATE') return true;
    return isTransientMeroshareMessage(error.message);
  }
  if (error instanceof Error) {
    return isTransientMeroshareMessage(error.message);
  }
  return false;
}

export async function withMeroshareRetries<T>(
  run: () => Promise<T>,
  opts: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (e) {
      lastError = e;
      if (!isTransientMeroshareError(e) || i === attempts - 1) break;
      const wait = 900 * (i + 1) + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new MeroshareError(
        'UNKNOWN',
        opts.label ? `${opts.label} failed` : 'MeroShare request failed',
      );
}
