import {
  loadCdscIssueStats,
  matchCdscStat,
  type CdscIssueStat,
} from './cdscIssues';
import {
  buildManagedMatchKey,
  fetchManagedOfferings,
  type ManagedOffering,
} from './managedOfferings';

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
  totalAmount: number | null;
  openingDate: string | null;
  closingDate: string | null;
  extendedClosingDate: string | null;
  issueManager: string | null;
  rightShareRatio: string | null;
  iconUrl: string | null;
  /** "GeneralPublic", "ForeignEmployment", … */
  audience: string | null;
  /** Only present when the upstream feed exposes live subscription data. */
  appliedUnits: number | null;
  applicants: number | null;
  appliedAmount: number | null;
  /** Live CDSC "Current Issue Update" row, only while the issue is open. */
  cdsc: CdscIssueStat | null;
  /** Set when this card comes from (or is overridden by) an admin record. */
  managedId: string | null;
  matchKey: string | null;
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

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function offeringMatchKey(row: {
  name: string;
  symbol: string;
  audience: string | null;
}): string {
  return buildManagedMatchKey(row);
}

/** Name + audience only — used as a soft fallback when symbols disagree. */
function offeringNameAudienceKey(row: {
  name: string;
  audience: string | null;
}): string {
  return buildManagedMatchKey({
    name: row.name,
    symbol: '',
    audience: row.audience,
  });
}

function normalizeRow(raw: Record<string, unknown>): PublicOffering {
  const name = String(raw.name ?? '');
  const symbol = String(raw.symbol ?? '');
  const audience = raw.for ? String(raw.for) : null;
  return {
    id: Number(raw.id ?? 0),
    symbol,
    name,
    type: String(raw.type ?? ''),
    status: String(raw.status ?? ''),
    units: num(raw.units),
    price: num(raw.price),
    priceUpto: num(raw.priceUpto),
    cutOffPrice: num(raw.cutOffPrice),
    totalAmount: num(raw.totalAmount),
    openingDate: raw.openingDate ? String(raw.openingDate) : null,
    closingDate: raw.closingDate ? String(raw.closingDate) : null,
    extendedClosingDate: raw.extendedClosingDate
      ? String(raw.extendedClosingDate)
      : null,
    issueManager: raw.issueManager ? String(raw.issueManager) : null,
    rightShareRatio: raw.rightShareRatio ? String(raw.rightShareRatio) : null,
    iconUrl: raw.iconUrl ? String(raw.iconUrl) : null,
    audience,
    appliedUnits: num(raw.appliedUnits ?? raw.totalAppliedUnits),
    applicants: num(raw.applicants ?? raw.totalApplicants),
    appliedAmount: num(raw.appliedAmount),
    cdsc: null,
    managedId: null,
    matchKey: offeringMatchKey({ name, symbol, audience }),
  };
}

function managedToOffering(row: ManagedOffering): PublicOffering {
  // Negative synthetic ids keep FlatList keys unique without colliding with ShareHub.
  const hash = Math.abs(
    Array.from(row.id).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0),
  );
  return {
    id: -(hash || 1),
    symbol: row.symbol || '',
    name: row.name,
    type: row.type,
    status: row.status,
    units: row.units,
    price: row.price,
    priceUpto: null,
    cutOffPrice: null,
    totalAmount: row.totalAmount,
    openingDate: row.openingDate,
    closingDate: row.closingDate,
    extendedClosingDate: row.extendedClosingDate,
    issueManager: row.issueManager,
    rightShareRatio: row.rightShareRatio,
    iconUrl: null,
    audience: row.audience,
    appliedUnits: row.appliedUnits,
    applicants: row.applicants,
    appliedAmount: row.appliedAmount,
    cdsc: null,
    managedId: row.id,
    matchKey: row.matchKey || offeringMatchKey(row),
  };
}

/** Prefer admin values when set; keep live values for empty admin fields. */
function applyAdminOverride(
  base: PublicOffering,
  admin: ManagedOffering,
): PublicOffering {
  const pick = <T,>(adminVal: T | null | undefined, live: T): T =>
    adminVal != null && adminVal !== '' ? adminVal : live;

  return {
    ...base,
    name: pick(admin.name, base.name),
    symbol: pick(admin.symbol, base.symbol),
    type: pick(admin.type, base.type),
    status: pick(admin.status, base.status),
    units: pick(admin.units, base.units),
    price: pick(admin.price, base.price),
    totalAmount: pick(admin.totalAmount, base.totalAmount),
    openingDate: pick(admin.openingDate, base.openingDate),
    closingDate: pick(admin.closingDate, base.closingDate),
    extendedClosingDate: pick(
      admin.extendedClosingDate,
      base.extendedClosingDate,
    ),
    issueManager: pick(admin.issueManager, base.issueManager),
    rightShareRatio: pick(admin.rightShareRatio, base.rightShareRatio),
    audience: pick(admin.audience, base.audience),
    appliedUnits: pick(admin.appliedUnits, base.appliedUnits),
    applicants: pick(admin.applicants, base.applicants),
    appliedAmount: pick(admin.appliedAmount, base.appliedAmount),
    managedId: admin.id,
    matchKey: admin.matchKey || base.matchKey,
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

/**
 * Every offering type merged into one list, newest opening first, with live
 * CDSC subscription figures and admin overrides applied.
 */
export async function loadAllPublicOfferings(
  force = false,
): Promise<PublicOffering[]> {
  const [pages, stats, managed] = await Promise.all([
    Promise.all(
      ISSUE_TABS.map((tab) =>
        loadPublicOfferingsByType(tab.apiType, force).catch(() => []),
      ),
    ),
    loadCdscIssueStats(force).catch(() => [] as CdscIssueStat[]),
    fetchManagedOfferings().catch(() => [] as ManagedOffering[]),
  ]);

  const withCdsc = dedupeOfferings(pages.flat()).map((row) => {
    const cdsc = matchCdscStat(stats, row);
    if (!cdsc) return row;
    return {
      ...row,
      cdsc,
      appliedUnits: cdsc.appliedUnits ?? row.appliedUnits,
      applicants: cdsc.applicants ?? row.applicants,
      units: cdsc.issuedUnits ?? row.units,
      appliedAmount: cdsc.appliedAmount ?? row.appliedAmount,
    };
  });

  const byKey = new Map<string, PublicOffering>();
  const byNameAudience = new Map<string, string>(); // soft key -> primary key
  for (const row of withCdsc) {
    const key = row.matchKey || offeringMatchKey(row);
    const soft = offeringNameAudienceKey(row);
    byKey.set(key, { ...row, matchKey: key });
    if (!byNameAudience.has(soft)) byNameAudience.set(soft, key);
  }

  for (const admin of managed) {
    const key =
      admin.matchKey ||
      offeringMatchKey({
        name: admin.name,
        symbol: admin.symbol,
        audience: admin.audience,
      });
    const soft = offeringNameAudienceKey({
      name: admin.name,
      audience: admin.audience,
    });
    const existing =
      byKey.get(key) ??
      (byNameAudience.get(soft)
        ? byKey.get(byNameAudience.get(soft)!)
        : undefined);
    if (existing) {
      const merged = applyAdminOverride(existing, admin);
      byKey.delete(existing.matchKey || key);
      byKey.set(key, { ...merged, matchKey: key });
      byNameAudience.set(soft, key);
    } else {
      byKey.set(key, managedToOffering(admin));
      byNameAudience.set(soft, key);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const at = a.openingDate ? Date.parse(a.openingDate) : 0;
    const bt = b.openingDate ? Date.parse(b.openingDate) : 0;
    return bt - at;
  });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(raw?: string | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function effectiveClose(row: PublicOffering): Date | null {
  return parseDay(row.extendedClosingDate) ?? parseDay(row.closingDate);
}

export function isOfferingCurrent(
  row: PublicOffering,
  now = new Date(),
): boolean {
  if (row.status === 'Closed') return false;
  // CDSC only publishes rows for issues accepting applications right now.
  if (row.cdsc && row.status !== 'Closed') return true;
  const today = startOfDay(now);
  const open = parseDay(row.openingDate);
  const close = effectiveClose(row);
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
  if (isOfferingCurrent(row, now)) return false;
  if (row.status === 'ComingSoon' || row.status === 'Proposed') return true;
  const open = parseDay(row.openingDate);
  if (open && open > startOfDay(now)) return true;
  return false;
}

export function isOfferingClosed(
  row: PublicOffering,
  now = new Date(),
): boolean {
  if (isOfferingCurrent(row, now) || isOfferingUpcoming(row, now)) return false;
  if (row.status === 'Closed') return true;
  const close = effectiveClose(row);
  if (close && close < startOfDay(now)) return true;
  return false;
}

/** Upcoming Issues list: upcoming + closed (everything not currently open). */
export function isOfferingNonCurrent(
  row: PublicOffering,
  now = new Date(),
): boolean {
  return !isOfferingCurrent(row, now);
}

export function formatOfferingDate(raw?: string | null): string {
  if (!raw?.trim()) return 'Coming Soon';
  return raw.slice(0, 10);
}

/** Indian/Nepali digit grouping with latin numerals: 3000000 -> "30,00,000" */
export function formatOfferingUnits(units: number | null): string {
  if (units == null || !Number.isFinite(units)) return '—';
  const sign = units < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(units)));
  if (digits.length <= 3) return sign + digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${sign}${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`;
}

const TYPE_LABELS: Record<string, string> = {
  Ipo: 'IPO',
  Fpo: 'FPO',
  Right: 'Right Share',
  MutualFund: 'Mutual Fund',
  BondOrDebenture: 'Debenture',
};

export function offeringTypeLabel(row: PublicOffering): string {
  return TYPE_LABELS[String(row.type)] ?? String(row.type || 'Issue');
}

/** "GeneralPublic" -> "For General Public" */
export function offeringAudienceLabel(row: PublicOffering): string | null {
  const raw = row.audience?.trim();
  if (!raw) return null;
  if (/^for\s/i.test(raw)) return raw;
  const words = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return `For ${words}`;
}

/** 3000000000 -> "Rs. 3 Ar", 11400000 -> "Rs. 1.14 Cr" */
export function formatOfferingAmount(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  if (amount >= 1_00_00_00_000) {
    return `Rs. ${(amount / 1_00_00_00_000).toFixed(2).replace(/\.00$/, '')} Ar`;
  }
  if (amount >= 1_00_00_000) {
    return `Rs. ${(amount / 1_00_00_000).toFixed(2).replace(/\.00$/, '')} Cr`;
  }
  if (amount >= 1_00_000) {
    return `Rs. ${(amount / 1_00_000).toFixed(2).replace(/\.00$/, '')} L`;
  }
  return `Rs. ${formatOfferingUnits(amount)}`;
}

/** "in 4 days" / "a day ago" / "3 hours ago" */
export function relativeFromNow(
  raw?: string | null | number,
  now = Date.now(),
): string | null {
  if (raw == null || raw === '') return null;
  const ms = typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  const diff = ms - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const say = (value: number, unit: string) => {
    const n = Math.max(1, Math.round(value));
    const article = unit === 'hour' ? 'an' : 'a';
    const text = n === 1 ? `${article} ${unit}` : `${n} ${unit}s`;
    return diff >= 0 ? `in ${text}` : `${text} ago`;
  };

  if (abs < minute) return diff >= 0 ? 'in a moment' : 'just now';
  if (abs < hour) return say(abs / minute, 'minute');
  if (abs < day) return say(abs / hour, 'hour');
  if (abs < 30 * day) return say(abs / day, 'day');
  return say(abs / (30 * day), 'month');
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Long form used on the offering cards: "30 Jul 2026" */
export function formatOfferingDateLong(raw?: string | null): string {
  if (!raw?.trim()) return 'Coming Soon';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function offeringSubscription(
  row: PublicOffering,
): { percent: number; label: string } | null {
  if (row.appliedUnits == null || !row.units) return null;
  const percent = (row.appliedUnits / row.units) * 100;
  return { percent, label: `${percent.toFixed(2)}%` };
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
  if (isOfferingClosed(row) || row.status === 'Closed') {
    return { label: 'CLOSED', tone: 'closed' };
  }
  if (isOfferingUpcoming(row)) {
    return { label: 'COMING SOON', tone: 'soon' };
  }
  return { label: String(row.status || '—').toUpperCase(), tone: 'closed' };
}
