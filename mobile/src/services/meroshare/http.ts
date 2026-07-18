import {
  DEFAULT_HEADERS,
  MEROSHARE_BASE,
  MEROSHARE_BASE_FALLBACK,
} from './endpoints';
import { MeroshareError } from './errors';

export function isProbablyHtml(text: string): boolean {
  const t = text.trimStart().slice(0, 48).toLowerCase();
  return (
    t.startsWith('<!doctype') ||
    t.startsWith('<html') ||
    t.startsWith('<?xml') ||
    t.startsWith('<head') ||
    t.startsWith('<body')
  );
}

/** Parse JSON safely; throw a clear error if the server returned HTML / garbage. */
export function parseJsonBody<T = unknown>(
  text: string,
  context: string,
): T {
  if (!text || !text.trim()) {
    return {} as T;
  }
  if (isProbablyHtml(text)) {
    throw new MeroshareError(
      'NETWORK',
      `${context}: server returned HTML instead of JSON (often blocked network / captive portal). Check internet and retry.`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 80);
    throw new MeroshareError(
      'NETWORK',
      `${context}: invalid JSON response (${preview}…)`,
    );
  }
}

export type RawHttpResult = {
  ok: boolean;
  status: number;
  text: string;
  headers: Headers;
  url: string;
};

/**
 * Low-level request that does not throw on HTTP error status.
 * Tries fetch, then XMLHttpRequest (helps some Android / Expo Go cases).
 */
export async function rawRequest(
  base: string,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<RawHttpResult> {
  const url = `${base.replace(/\/$/, '')}${path}`;
  const method = init.method ?? 'GET';
  const headers = { ...DEFAULT_HEADERS, ...init.headers };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: init.body,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      headers: res.headers,
      url,
    };
  } catch (fetchErr) {
    // Fall through to XHR
    try {
      return await xhrRequest(url, method, headers, init.body);
    } catch {
      throw new MeroshareError(
        'NETWORK',
        fetchErr instanceof Error
          ? fetchErr.message
          : 'Network request failed',
      );
    }
  }
}

function xhrRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<RawHttpResult> {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      Object.entries(headers).forEach(([k, v]) => {
        try {
          xhr.setRequestHeader(k, v);
        } catch {
          // some headers are forbidden on XHR
        }
      });
      xhr.onload = () => {
        const headerMap = new Headers();
        const raw = xhr.getAllResponseHeaders() || '';
        raw
          .trim()
          .split(/[\r\n]+/)
          .forEach((line) => {
            const idx = line.indexOf(':');
            if (idx > 0) {
              headerMap.append(
                line.slice(0, idx).trim(),
                line.slice(idx + 1).trim(),
              );
            }
          });
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          text: xhr.responseText ?? '',
          headers: headerMap,
          url,
        });
      };
      xhr.onerror = () =>
        reject(new MeroshareError('NETWORK', 'XMLHttpRequest network error'));
      xhr.ontimeout = () =>
        reject(new MeroshareError('NETWORK', 'Request timed out'));
      xhr.timeout = 30000;
      xhr.send(body ?? null);
    } catch (e) {
      reject(e);
    }
  });
}

export async function meroshareFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    ...(init.headers as Record<string, string> | undefined),
  };

  try {
    return await fetch(`${MEROSHARE_BASE.replace(/\/$/, '')}${path}`, {
      ...init,
      headers,
    });
  } catch (e) {
    throw new MeroshareError(
      'NETWORK',
      e instanceof Error ? e.message : 'Network request failed',
    );
  }
}

/** Try primary + fallback host until we get non-HTML JSON (or final error). */
export async function rawRequestWithFallback(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<RawHttpResult> {
  const bases = [MEROSHARE_BASE, MEROSHARE_BASE_FALLBACK];
  let lastHtml: RawHttpResult | null = null;
  let lastErr: unknown = null;

  for (const base of bases) {
    try {
      const result = await rawRequest(base, path, init);
      if (!isProbablyHtml(result.text)) {
        return result;
      }
      lastHtml = result;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastHtml) {
    const preview = lastHtml.text.replace(/\s+/g, ' ').slice(0, 60);
    throw new MeroshareError(
      'NETWORK',
      `MeroShare returned a web page (HTTP ${lastHtml.status}) instead of API JSON. ` +
        `Open chrome://meroshare on this phone to confirm internet works, then retry. Preview: ${preview}`,
    );
  }

  throw lastErr instanceof MeroshareError
    ? lastErr
    : new MeroshareError(
        'NETWORK',
        lastErr instanceof Error ? lastErr.message : 'Network request failed',
      );
}

/** Collect Authorization from response (RN lowercases header names). */
export function readAuthToken(
  res: { headers: Headers },
  body: Record<string, unknown>,
): string | null {
  const fromHeader =
    res.headers.get('Authorization') ??
    res.headers.get('authorization') ??
    (() => {
      try {
        const anyHeaders = res.headers as unknown as {
          map?: Record<string, string>;
        };
        if (anyHeaders.map) {
          return (
            anyHeaders.map.Authorization ??
            anyHeaders.map.authorization ??
            null
          );
        }
      } catch {
        /* ignore */
      }
      return null;
    })();

  if (fromHeader && fromHeader !== 'null') return fromHeader;

  if (typeof body.token === 'string' && body.token !== 'null') return body.token;
  if (typeof body.accessToken === 'string') return body.accessToken;
  return null;
}
