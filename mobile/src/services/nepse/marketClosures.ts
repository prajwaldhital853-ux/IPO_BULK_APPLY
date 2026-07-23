import { AUTH_API_BASE } from '../auth/config';

export type MarketClosure = {
  id: string;
  date: string;
  title: string;
  notice: string;
  color: string;
  active: boolean;
};

export type MarketClosureInput = {
  date: string;
  title?: string;
  notice?: string;
  color?: string;
  active?: boolean;
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return typeof body.detail === 'string'
      ? body.detail
      : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function mapClosure(json: Record<string, unknown>): MarketClosure {
  return {
    id: String(json.id),
    date: String(json.date ?? ''),
    title: String(json.title ?? 'NEPSE Closed'),
    notice: String(json.notice ?? ''),
    color: String(json.color ?? '#E53935'),
    active: Boolean(json.active ?? true),
  };
}

/** Public: active unexpected closed days for the NEPSE calendar. */
export async function fetchMarketClosures(): Promise<MarketClosure[]> {
  const res = await fetch(`${AUTH_API_BASE}/app/market-closures`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map(mapClosure);
}

function adminHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function adminFetchMarketClosures(
  token: string,
): Promise<MarketClosure[]> {
  const res = await fetch(`${AUTH_API_BASE}/admin/market-closures`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map(mapClosure);
}

export async function adminCreateMarketClosure(
  token: string,
  input: MarketClosureInput,
): Promise<MarketClosure> {
  const res = await fetch(`${AUTH_API_BASE}/admin/market-closures`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapClosure((await res.json()) as Record<string, unknown>);
}

export async function adminUpdateMarketClosure(
  token: string,
  id: string,
  input: MarketClosureInput,
): Promise<MarketClosure> {
  const res = await fetch(`${AUTH_API_BASE}/admin/market-closures/${id}`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapClosure((await res.json()) as Record<string, unknown>);
}

export async function adminDeleteMarketClosure(
  token: string,
  id: string,
): Promise<void> {
  const res = await fetch(`${AUTH_API_BASE}/admin/market-closures/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
}
