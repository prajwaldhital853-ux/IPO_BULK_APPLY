const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';

export type PublicOfferingType =
  | 'Ipo'
  | 'Fpo'
  | 'Right'
  | 'MutualFund'
  | 'BondOrDebenture';

export type PublicOfferingStatus =
  | 'ComingSoon'
  | 'Proposed'
  | 'Open'
  | 'Closed'
  | string;

export type PublicOffering = {
  id: number;
  symbol: string;
  name: string;
  type: PublicOfferingType | string;
  status: PublicOfferingStatus;
  units: number | null;
  price: number | null;
  priceUpto: number | null;
  cutOffPrice: number | null;
  openingDate: string | null;
  closingDate: string | null;
  issueManager: string | null;
  rightShareRatio: string | null;
  iconUrl: string | null;
};

export type IssueTab = {
  id: string;
  label: string;
  apiType: PublicOfferingType;
};

export const ISSUE_TABS: IssueTab[] = [
  { id: 'ipo', label: 'IPO', apiType: 'Ipo' },
  { id: 'fpo', label: 'FPO', apiType: 'Fpo' },
  { id: 'right', label: 'Right Share', apiType: 'Right' },
  { id: 'mutual', label: 'Mutual Fund', apiType: 'MutualFund' },
  { id: 'debenture', label: 'Debenture', apiType: 'BondOrDebenture' },
];

type ApiPage = {
  pageIndex: number;
  totalPages: number;
  totalItems: number;
  content: PublicOffering[];
};

type ApiEnvelope = {
  success?: boolean;
  data?: ApiPage;
};

const cache = new Map<string, { at: number; rows: PublicOffering[] }>();
const CACHE_MS = 5 * 60_000;

export function invalidatePublicOfferingCache(): void {
  cache.clear();
}

function normalizeRow(raw: Record<string, unknown>): PublicOffering {
  return {
    id: Number(raw.id ?? 0),
    symbol: String(raw.symbol ?? ''),
    name: String(raw.name ?? ''),
    type: String(raw.type ?? ''),
    status: String(raw.status ?? ''),
    units: raw.units != null ? Number(raw.units) : null,
    price: raw.price != null ? Number(raw.price) : null,
    priceUpto: raw.priceUpto != null ? Number(raw.priceUpto) : null,
    cutOffPrice: raw.cutOffPrice != null ? Number(raw.cutOffPrice) : null,
    openingDate: raw.openingDate ? String(raw.openingDate) : null,
    closingDate: raw.closingDate ? String(raw.closingDate) : null,
    issueManager: raw.issueManager ? String(raw.issueManager) : null,
    rightShareRatio: raw.rightShareRatio ? String(raw.rightShareRatio) : null,
    iconUrl: raw.iconUrl ? String(raw.iconUrl) : null,
  };
}

async function fetchPage(
  type: PublicOfferingType,
  page: number,
): Promise<ApiPage | null> {
  const url = `${DATA_BASE}/public-offering?type=${encodeURIComponent(type)}&page=${page}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = (await res.json()) as ApiEnvelope;
  const data = json.data;
  if (!data?.content) return null;
  return {
    pageIndex: data.pageIndex,
    totalPages: data.totalPages,
    totalItems: data.totalItems,
    content: (data.content as Record<string, unknown>[]).map(normalizeRow),
  };
}

function dedupeOfferings(rows: PublicOffering[]): PublicOffering[] {
  const seen = new Set<number>();
  const out: PublicOffering[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export async function loadPublicOfferingsByType(
  type: PublicOfferingType,
  force = false,
): Promise<PublicOffering[]> {
  const hit = cache.get(`${type}:v2`);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) {
    return hit.rows;
  }

  const first = await fetchPage(type, 1);
  if (!first) {
    const stale = cache.get(`${type}:v2`);
    return stale?.rows ?? [];
  }

  const rows = [...first.content];
  const totalPages = first.totalPages || 1;

  const rest = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
      fetchPage(type, i + 2),
    ),
  );
  for (const page of rest) {
    if (page?.content.length) rows.push(...page.content);
  }

  const unique = dedupeOfferings(rows);
  cache.set(`${type}:v2`, { at: Date.now(), rows: unique });
  return unique;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(raw?: string | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

export function isOfferingCurrent(
  row: PublicOffering,
  now = new Date(),
): boolean {
  const today = startOfDay(now);
  const open = parseDay(row.openingDate);
  const close = parseDay(row.closingDate);
  if (open && close) {
    return open <= today && close >= today;
  }
  if (row.status === 'Open') return true;
  return false;
}

export function isOfferingUpcoming(
  row: PublicOffering,
  now = new Date(),
): boolean {
  if (row.status === 'ComingSoon' || row.status === 'Proposed') return true;
  const open = parseDay(row.openingDate);
  if (open && open > startOfDay(now)) return true;
  return false;
}

export function formatOfferingDate(raw?: string | null): string {
  if (!raw?.trim()) return 'Coming Soon';
  return raw.slice(0, 10);
}

export function formatOfferingUnits(units: number | null): string {
  if (units == null || !Number.isFinite(units)) return '—';
  return units.toLocaleString('en-NP', { maximumFractionDigits: 0 });
}

export function offeringStatusLabel(row: PublicOffering): {
  label: string;
  tone: 'open' | 'soon' | 'closed' | 'proposed';
} {
  if (isOfferingCurrent(row)) {
    return { label: 'OPEN', tone: 'open' };
  }
  if (row.status === 'ComingSoon') {
    return { label: 'COMING SOON', tone: 'soon' };
  }
  if (row.status === 'Proposed') {
    return { label: 'PROPOSED', tone: 'proposed' };
  }
  if (row.status === 'Closed') {
    return { label: 'CLOSED', tone: 'closed' };
  }
  if (isOfferingUpcoming(row)) {
    return { label: 'COMING SOON', tone: 'soon' };
  }
  return { label: String(row.status || '—').toUpperCase(), tone: 'closed' };
}
