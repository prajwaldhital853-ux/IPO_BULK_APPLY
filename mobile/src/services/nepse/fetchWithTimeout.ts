export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

/**
 * fetch with an AbortController timeout. ShareHub / Merolagani / ShareSansar
 * requests previously had no client timeout, so a bad connection could hang a
 * screen for as long as the OS allowed — fail fast and let caches take over.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
