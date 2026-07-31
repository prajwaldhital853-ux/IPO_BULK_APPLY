import { AUTH_API_BASE } from '../auth/config';

export type ManagedOfferingType =
  | 'Ipo'
  | 'Fpo'
  | 'Right'
  | 'MutualFund'
  | 'BondOrDebenture';

export type ManagedOfferingStatus =
  | 'ComingSoon'
  | 'Proposed'
  | 'Open'
  | 'Closed';

export type ManagedOffering = {
  id: string;
  matchKey: string;
  name: string;
  symbol: string;
  type: ManagedOfferingType | string;
  audience: string | null;
  issueManager: string | null;
  status: ManagedOfferingStatus | string;
  units: number | null;
  appliedUnits: number | null;
  applicants: number | null;
  price: number | null;
  totalAmount: number | null;
  appliedAmount: number | null;
  openingDate: string | null;
  closingDate: string | null;
  extendedClosingDate: string | null;
  rightShareRatio: string | null;
  active: boolean;
  updatedAt: string | null;
};

export type ManagedOfferingInput = {
  name: string;
  symbol?: string;
  type?: string;
  audience?: string | null;
  issueManager?: string | null;
  status?: string;
  units?: number | null;
  appliedUnits?: number | null;
  applicants?: number | null;
  price?: number | null;
  totalAmount?: number | null;
  appliedAmount?: number | null;
  openingDate?: string | null;
  closingDate?: string | null;
  extendedClosingDate?: string | null;
  rightShareRatio?: string | null;
  active?: boolean;
  matchKey?: string | null;
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

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapOffering(json: Record<string, unknown>): ManagedOffering {
  return {
    id: String(json.id),
    matchKey: String(json.matchKey ?? json.match_key ?? ''),
    name: String(json.name ?? ''),
    symbol: String(json.symbol ?? ''),
    type: String(json.type ?? 'Ipo'),
    audience: json.audience != null ? String(json.audience) : null,
    issueManager:
      json.issueManager != null
        ? String(json.issueManager)
        : json.issue_manager != null
          ? String(json.issue_manager)
          : null,
    status: String(json.status ?? 'ComingSoon'),
    units: num(json.units),
    appliedUnits: num(json.appliedUnits ?? json.applied_units),
    applicants: num(json.applicants),
    price: num(json.price),
    totalAmount: num(json.totalAmount ?? json.total_amount),
    appliedAmount: num(json.appliedAmount ?? json.applied_amount),
    openingDate:
      json.openingDate != null
        ? String(json.openingDate)
        : json.opening_date != null
          ? String(json.opening_date)
          : null,
    closingDate:
      json.closingDate != null
        ? String(json.closingDate)
        : json.closing_date != null
          ? String(json.closing_date)
          : null,
    extendedClosingDate:
      json.extendedClosingDate != null
        ? String(json.extendedClosingDate)
        : json.extended_closing_date != null
          ? String(json.extended_closing_date)
          : null,
    rightShareRatio:
      json.rightShareRatio != null
        ? String(json.rightShareRatio)
        : json.right_share_ratio != null
          ? String(json.right_share_ratio)
          : null,
    active: Boolean(json.active ?? true),
    updatedAt:
      json.updatedAt != null
        ? String(json.updatedAt)
        : json.updated_at != null
          ? String(json.updated_at)
          : null,
  };
}

/** Public: active admin-managed IPO records for Current / Upcoming Issues. */
export async function fetchManagedOfferings(): Promise<ManagedOffering[]> {
  try {
    const res = await fetch(`${AUTH_API_BASE}/app/ipo-issues`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Record<string, unknown>[];
    return json.map(mapOffering);
  } catch {
    return [];
  }
}

function adminHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function adminFetchManagedOfferings(
  token: string,
): Promise<ManagedOffering[]> {
  const res = await fetch(`${AUTH_API_BASE}/admin/ipo-issues`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map(mapOffering);
}

export async function adminCreateManagedOffering(
  token: string,
  input: ManagedOfferingInput,
): Promise<ManagedOffering> {
  const res = await fetch(`${AUTH_API_BASE}/admin/ipo-issues`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapOffering((await res.json()) as Record<string, unknown>);
}

export async function adminUpdateManagedOffering(
  token: string,
  id: string,
  input: ManagedOfferingInput,
): Promise<ManagedOffering> {
  const res = await fetch(`${AUTH_API_BASE}/admin/ipo-issues/${id}`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapOffering((await res.json()) as Record<string, unknown>);
}

export async function adminDeleteManagedOffering(
  token: string,
  id: string,
): Promise<void> {
  const res = await fetch(`${AUTH_API_BASE}/admin/ipo-issues/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export function buildManagedMatchKey(input: {
  name: string;
  symbol?: string | null;
  audience?: string | null;
}): string {
  const slug = (raw?: string | null) =>
    (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const audienceKey = (raw?: string | null) => {
    let key = slug(raw);
    if (key.startsWith('reserved')) key = key.slice('reserved'.length);
    if (key.startsWith('for')) key = key.slice('for'.length);
    return key || 'generalpublic';
  };
  return `${slug(input.name)}|${slug(input.symbol)}|${audienceKey(input.audience)}`;
}
