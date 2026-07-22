import { MeroshareClient } from './client';
import type { AccountMeta } from '../../types/account';
import {
  isMockAccountId,
  mockExpiryForAccount,
} from '../../data/mockAccounts';

export type ExpiryStatus = 'ok' | 'warning' | 'expired' | 'unknown' | 'error';

export type PillKind = 'password' | 'demat' | 'meroshare';

export type ExpiryPill = {
  kind: PillKind;
  label: string;
  expired: boolean | null;
  expiryDate: string | null;
  daysLeft: number | null;
  statusLine: string;
};

export type AccountExpiryInfo = {
  accountId: string;
  accountName: string;
  username: string;
  dpName: string;
  demat: string | null;
  meroshareExpired: boolean | null;
  dematExpired: boolean | null;
  passwordExpired: boolean | null;
  meroshareExpiryDate: string | null;
  dematExpiryDate: string | null;
  passwordExpiryDate: string | null;
  status: ExpiryStatus;
  detail: string;
  pills: ExpiryPill[];
};

const PILL_ORDER: Array<{ kind: PillKind; label: string }> = [
  { kind: 'password', label: 'Password' },
  { kind: 'demat', label: 'Demat' },
  { kind: 'meroshare', label: 'MeroShare' },
];

const WARN_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/** CDSC ownDetail is sometimes wrapped in an `object` envelope — flatten it. */
function flatten(raw: Record<string, unknown>): Record<string, unknown> {
  const inner = raw.object;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { ...raw, ...(inner as Record<string, unknown>) };
  }
  return raw;
}

/** Case-insensitive lookup that returns the first non-empty match. */
function readField(source: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const target = alias.toLowerCase();
    for (const [key, value] of Object.entries(source)) {
      if (key.toLowerCase() !== target) continue;
      if (value != null && value !== '') return value;
    }
  }
  return null;
}

/** Add whole years to a YYYY-MM-DD string, returning YYYY-MM-DD. */
function addYears(iso: string | null, years: number): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return toIsoDay(new Date(y + years, m - 1, d));
}

function toIsoDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Coerce the many date shapes CDSC returns into YYYY-MM-DD.
 * Accepts ISO strings, D/M/YYYY, M/D/YYYY, epoch millis/seconds and
 * free-form strings such as "Jan 6, 2054 3:35:24 PM".
 */
function coerceDate(input: unknown): string | null {
  if (input == null || input === '') return null;

  if (typeof input === 'number' && Number.isFinite(input)) {
    const epoch = new Date(input > 1e12 ? input : input * 1000);
    return Number.isNaN(epoch.getTime()) ? null : toIsoDay(epoch);
  }

  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const iso = new Date(text);
    return Number.isNaN(iso.getTime()) ? text.slice(0, 10) : toIsoDay(iso);
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toIsoDay(new Date(year, month - 1, day));
    }
  }

  const loose = Date.parse(text);
  return Number.isNaN(loose) ? null : toIsoDay(new Date(loose));
}

function readDate(source: Record<string, unknown>, aliases: string[]): string | null {
  return coerceDate(readField(source, aliases));
}

function readFlag(source: Record<string, unknown>, aliases: string[]): boolean | null {
  const value = readField(source, aliases);
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'TRUE') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'FALSE') return false;
  return null;
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const normalized = coerceDate(iso) ?? iso;

  let target: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [y, m, d] = normalized.split('-').map(Number);
    target = new Date(y, m - 1, d);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(normalized)) {
    const [d, m, y] = normalized.split('/').map(Number);
    target = new Date(y, m - 1, d);
  } else {
    target = new Date(normalized);
  }
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

export function formatExpiryDisplay(iso: string | null): string {
  if (!iso) return '—';
  const normalized = coerceDate(iso) ?? iso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [y, m, d] = normalized.split('-').map(Number);
    return `${d}/${m}/${y}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(normalized)) return normalized;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${parsed.getDate()}/${parsed.getMonth() + 1}/${parsed.getFullYear()}`;
}

/** A field is "expired" when its date is in the past; otherwise fall back to the flag. */
function resolveExpired(date: string | null, flag: boolean | null): boolean | null {
  const remaining = daysUntil(date);
  if (remaining != null) return remaining < 0;
  return flag;
}

/**
 * Human-friendly "time remaining" so far-future demat dates (e.g. year 2084)
 * read as years rather than an unrealistic-looking raw day count.
 */
function humanizeRemaining(days: number): string {
  if (days < 60) return `${days} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  const years = Math.floor(days / 365);
  const months = Math.round((days - years * 365) / 30);
  if (years < 5 && months > 0) return `${years}y ${months}m`;
  return `${years} yr`;
}

function statusLineFor(expired: boolean | null, days: number | null): string {
  if (expired === true || (days != null && days < 0)) {
    return days != null ? `Expired ${Math.abs(days)}d ago` : 'Expired';
  }
  if (days != null) return `Valid (${humanizeRemaining(days)})`;
  if (expired === false) return 'Valid';
  return 'Unknown';
}

type ExpiryFields = {
  passwordExpired: boolean | null;
  dematExpired: boolean | null;
  meroshareExpired: boolean | null;
  passwordExpiryDate: string | null;
  dematExpiryDate: string | null;
  meroshareExpiryDate: string | null;
};

function makePills(fields: ExpiryFields): ExpiryPill[] {
  const byKind: Record<PillKind, { expired: boolean | null; date: string | null }> = {
    password: { expired: fields.passwordExpired, date: fields.passwordExpiryDate },
    demat: { expired: fields.dematExpired, date: fields.dematExpiryDate },
    meroshare: { expired: fields.meroshareExpired, date: fields.meroshareExpiryDate },
  };

  return PILL_ORDER.map(({ kind, label }) => {
    const { expired, date } = byKind[kind];
    const days = daysUntil(date);
    const isExpired = days != null ? days < 0 : expired;
    return {
      kind,
      label,
      expired: isExpired,
      expiryDate: date,
      daysLeft: days,
      statusLine: statusLineFor(isExpired, days),
    };
  });
}

function summarize(fields: ExpiryFields): { status: ExpiryStatus; detail: string } {
  const dated = [
    { name: 'Password', date: fields.passwordExpiryDate, flag: fields.passwordExpired },
    { name: 'Demat', date: fields.dematExpiryDate, flag: fields.dematExpired },
    { name: 'MeroShare', date: fields.meroshareExpiryDate, flag: fields.meroshareExpired },
  ];

  const expiredNames = dated
    .filter(({ date, flag }) => resolveExpired(date, flag) === true)
    .map(({ name }) => `${name} expired`);
  if (expiredNames.length) {
    return { status: 'expired', detail: expiredNames.join(' · ') };
  }

  const remaining = dated
    .map(({ date }) => daysUntil(date))
    .filter((d): d is number => d != null);
  const soonest = remaining.length ? Math.min(...remaining) : null;
  if (soonest != null && soonest <= WARN_WINDOW_DAYS) {
    return { status: 'warning', detail: `Renew within ${soonest} day(s)` };
  }

  const hasAnyDate =
    fields.passwordExpiryDate || fields.dematExpiryDate || fields.meroshareExpiryDate;
  if (hasAnyDate) {
    return { status: 'ok', detail: 'Active — renew dates on file' };
  }
  return { status: 'unknown', detail: 'Logged in — expiry dates not returned' };
}

function blankInfo(account: AccountMeta): AccountExpiryInfo {
  const fields: ExpiryFields = {
    passwordExpired: null,
    dematExpired: null,
    meroshareExpired: null,
    passwordExpiryDate: null,
    dematExpiryDate: null,
    meroshareExpiryDate: null,
  };
  return {
    accountId: account.id,
    accountName: account.name,
    username: account.username,
    dpName: account.dpName,
    demat: account.demat ?? null,
    ...fields,
    status: 'unknown',
    detail: '',
    pills: makePills(fields),
  };
}

/**
 * Log into MeroShare for a single account and read the expiry dates for the
 * password, demat and MeroShare account from the ownDetail payload.
 */
export async function fetchAccountExpiryInfo(
  account: AccountMeta,
  password: string,
): Promise<AccountExpiryInfo> {
  const base = blankInfo(account);

  // Sample accounts: return seeded expiry (some demat / password expired).
  if (isMockAccountId(account.id)) {
    await new Promise((r) => setTimeout(r, 280));
    const exp = mockExpiryForAccount(account.id) ?? {};
    const fields: ExpiryFields = {
      passwordExpiryDate: exp.passwordExpiryDate ?? null,
      dematExpiryDate: exp.dematExpiryDate ?? null,
      meroshareExpiryDate: exp.meroshareExpiryDate ?? null,
      passwordExpired: resolveExpired(exp.passwordExpiryDate ?? null, null),
      dematExpired: resolveExpired(exp.dematExpiryDate ?? null, null),
      meroshareExpired: resolveExpired(exp.meroshareExpiryDate ?? null, null),
    };
    const { status, detail: summaryDetail } = summarize(fields);
    return {
      ...base,
      ...fields,
      status,
      detail: summaryDetail,
      pills: makePills(fields),
    };
  }

  try {
    const client = new MeroshareClient();
    const session = await client.login({
      clientId: account.dpId,
      username: account.username,
      password,
      dpCode: account.dpCode,
      dpName: account.dpName,
    });

    const detail = flatten(await client.fetchOwnDetailRaw());
    const renewRaw = readField(detail, ['renewDetails', 'renewDetail', 'renew']);
    const renew =
      renewRaw && typeof renewRaw === 'object' && !Array.isArray(renewRaw)
        ? (renewRaw as Record<string, unknown>)
        : {};

    const passwordExpiryDate =
      readDate(detail, [
        'passwordExpiryDate',
        'passwordExpiryDateStr',
        'passwordExpireDate',
        'pwdExpiryDate',
      ]) ??
      readDate(renew, [
        'passwordExpiryDate',
        'passwordExpiryDateStr',
        'passwordExpireDate',
      ]);

    // MeroShare account access expiry — CDSC "expiredDate" (account term).
    const meroshareExpiryDate =
      readDate(detail, [
        'expiredDate',
        'expiredDateStr',
        'expiryDate',
        'accountExpiryDate',
        'meroshareExpiryDate',
        'meroShareExpiryDate',
      ]) ??
      readDate(renew, [
        'expiredDate',
        'expiredDateStr',
        'expiryDate',
        'accountExpiryDate',
        'meroshareExpiryDate',
      ]);

    // Demat renewal expiry: CDSC demat accounts renew ANNUALLY from the last
    // renewed date. The literal `dematExpiryDate` field is the demat-number
    // lifetime (~year 2084), NOT the renewable expiry — so we derive the real
    // one as renewedDate + 1 year, falling back to any explicit demat field.
    const renewedDate = readDate(detail, [
      'renewedDate',
      'renewedDateStr',
      'renewDate',
      'lastRenewedDate',
    ]);
    const dematLifetime = readDate(detail, [
      'dematExpiryDate',
      'dematExpiredDate',
      'dematExpireDate',
    ]);
    const dematExpiryDate =
      addYears(renewedDate, 1) ?? meroshareExpiryDate ?? dematLifetime;

    const fields: ExpiryFields = {
      meroshareExpiryDate,
      dematExpiryDate,
      passwordExpiryDate,
      meroshareExpired: resolveExpired(
        meroshareExpiryDate,
        readFlag(detail, ['accountExpired', 'isAccountExpired', 'meroShareExpired', 'expired']),
      ),
      dematExpired: resolveExpired(
        dematExpiryDate,
        readFlag(detail, ['dematExpired', 'isDematExpired']),
      ),
      passwordExpired: resolveExpired(
        passwordExpiryDate,
        readFlag(detail, ['passwordExpired', 'isPasswordExpired', 'passwordExpire']),
      ),
    };

    const { status, detail: summaryDetail } = summarize(fields);

    return {
      ...base,
      demat:
        (typeof detail.demat === 'string' ? detail.demat : null) ??
        session.demat ??
        account.demat ??
        null,
      ...fields,
      status,
      detail: summaryDetail,
      pills: makePills(fields),
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      detail: error instanceof Error ? error.message : 'Could not check expiry',
    };
  }
}
