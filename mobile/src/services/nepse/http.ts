import { NEPSE_API_BASES } from './config';

const TIMEOUT_MS = 20_000;

export async function nepseFetchJson(
  path: string,
): Promise<{ base: string; json: unknown } | null> {
  for (const base of NEPSE_API_BASES) {
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/plain, */*',
          // Some NEPSE mirrors are picky about browser-like headers.
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36',
          Origin: base.replace(/\/api\/nots$/, ''),
          Referer: base.replace(/\/api\/nots$/, '') + '/',
        },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.startsWith('<')) continue;
      const json = JSON.parse(text) as unknown;
      return { base, json };
    } catch {
      // try next mirror
    }
  }
  return null;
}
