import capitalsStatic from './capitals.static.json';
import { PATHS } from './endpoints';
import { MeroshareError } from './errors';
import { meroshareFetch, parseJsonBody } from './http';

export type CapitalDp = {
  /** MeroShare dropdown id used as login clientId (e.g. 174) */
  id: number;
  /** 5-digit depository code shown in labels (e.g. "13700") */
  code: string;
  name: string;
};

let cached: CapitalDp[] | null = null;

function normalizeList(
  data: Array<{ id: number; code: string | number; name: string }>,
): CapitalDp[] {
  return data.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
  }));
}

/** Full DP catalog shipped with the app (updated from CDSC). */
export function getStaticCapitalList(): CapitalDp[] {
  return normalizeList(
    capitalsStatic as Array<{ id: number; code: string | number; name: string }>,
  );
}

/**
 * Public DP list — prefers live CDSC, falls back to bundled catalog (~130 DPs).
 * Login clientId is `id`, not the 5-digit `code`.
 */
export async function fetchCapitalList(
  opts: { force?: boolean } = {},
): Promise<CapitalDp[]> {
  if (cached && !opts.force) return cached;

  const staticList = getStaticCapitalList();

  try {
    const res = await meroshareFetch(PATHS.capital, {
      method: 'GET',
      // Minimal headers — some Android stacks choke on custom User-Agent
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    const text = await res.text();

    if (res.ok) {
      const data = parseJsonBody<
        Array<{ id: number; code: string | number; name: string }>
      >(text, 'DP list');

      if (Array.isArray(data) && data.length > 0) {
        cached = normalizeList(data);
        return cached;
      }
    }
  } catch {
    // fall through to static
  }

  // Retry once with full browser headers
  try {
    const res = await meroshareFetch(PATHS.capital, { method: 'GET' });
    const text = await res.text();
    if (res.ok) {
      const data = parseJsonBody<
        Array<{ id: number; code: string | number; name: string }>
      >(text, 'DP list');
      if (Array.isArray(data) && data.length > 0) {
        cached = normalizeList(data);
        return cached;
      }
    }
  } catch {
    // use static
  }

  cached = staticList;
  return cached;
}

/**
 * Resolve login clientId from either MeroShare id OR 5-digit DP code.
 */
export async function resolveClientId(
  dpIdOrCode: string | number,
  hint?: { clientId?: number; dpCode?: string; name?: string },
): Promise<{ clientId: number; dpCode: string; name: string }> {
  const raw = String(dpIdOrCode).trim();

  if (hint?.dpCode && hint.clientId != null && Number.isFinite(hint.clientId)) {
    const hintedId = Number(hint.clientId);
    const hintedCode = String(hint.dpCode);
    // UI sometimes passes the 5-digit DP code as clientId when the live DP
    // list could not be loaded — never treat that as the MeroShare login id.
    if (String(hintedId) !== hintedCode) {
      return {
        clientId: hintedId,
        dpCode: hintedCode,
        name: hint.name ?? '',
      };
    }
  }
  if (hint?.dpCode && /^\d+$/.test(raw) && raw.length < 5) {
    return {
      clientId: Number(raw),
      dpCode: String(hint.dpCode),
      name: hint.name ?? '',
    };
  }

  const list = await fetchCapitalList();
  const byId = list.find((d) => String(d.id) === raw);
  if (byId) {
    return { clientId: byId.id, dpCode: byId.code, name: byId.name };
  }
  const byCode = list.find((d) => d.code === raw);
  if (byCode) {
    return { clientId: byCode.id, dpCode: byCode.code, name: byCode.name };
  }

  // Absolute last resort: bundled static only
  const staticList = getStaticCapitalList();
  const sId = staticList.find((d) => String(d.id) === raw);
  if (sId) {
    return { clientId: sId.id, dpCode: sId.code, name: sId.name };
  }
  const sCode = staticList.find((d) => d.code === raw);
  if (sCode) {
    return { clientId: sCode.id, dpCode: sCode.code, name: sCode.name };
  }

  throw new MeroshareError(
    'AUTH',
    `Unknown depository participant: ${raw}. Search again in the DP list.`,
  );
}

export function clearCapitalCache() {
  cached = null;
}
