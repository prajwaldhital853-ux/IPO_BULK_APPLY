import { MeroshareClient } from './client';
import type { AccountMeta } from '../../types/account';
import {
  isMockAccountId,
  mockExpiryForAccount,
} from '../../data/mockAccounts';
import { bsToAd, daysInBsMonth } from '../../utils/bsDate';

export type ExpiryStatus = 'ok' | 'warning' | 'expired' | 'unknown' | 'error';

export type PillKind = 'password' | 'demat' | 'meroshare';

export type DateCalendar = 'AD' | 'BS';

export type ExpiryPill = {
  kind: PillKind;
  label: string;
  expired: boolean | null;
  expiryDate: string | null;
  /** CDSC demat expiry is Bikram Sambat; password / MeroShare are A.D. */
  calendar: DateCalendar;
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

function toIsoDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function padIsoParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * CDSC demat expiry is shown in MeroShare as B.S. (e.g. 2084-03-32 B.S.).
 * Years 2070–2099 in that field are BS, not Gregorian.
 */
export function isBsDematYear(year: number): boolean {
  return year >= 2070 && year <= 2099;
}

/** Keep YYYY-MM-DD / DD-MM-YYYY text without Date() (day 32 is valid in BS). */
function preserveDateString(input: unknown): string | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number' && Number.isFinite(input)) {
    return coerceDate(input);
  }
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/\s*B\.?S\.?\s*$/i, '').trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return padIsoParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    let day = a;
    let month = b;
    if (a <= 12 && b > 12) {
      month = a;
      day = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 32) {
      return padIsoParts(year, month, day);
    }
  }

  return coerceDate(text);
}

function readPreservedDate(
  source: Record<string, unknown>,
  aliases: string[],
): string | null {
  return preserveDateString(readField(source, aliases));
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

  const slash = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    // Nepal / CDSC strings are DD/MM/YYYY (or DD.MM.YYYY).
    // If first part > 12 it must be day; otherwise treat as D/M.
    let day = a;
    let month = b;
    if (a <= 12 && b > 12) {
      // Rare M/D/Y shape
      month = a;
      day = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toIsoDay(new Date(year, month - 1, day));
    }
  }

  // BS-looking years (e.g. 2081-03-15) sometimes appear in demat fields.
  // Leave them as ISO day strings so display works; daysUntil will treat as AD.
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

export function daysUntil(
  iso: string | null,
  calendar: DateCalendar = 'AD',
): number | null {
  if (!iso) return null;
  const normalized = preserveDateString(iso) ?? iso;

  let target: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [y, m, d] = normalized.split('-').map(Number);
    const useBs = calendar === 'BS' || isBsDematYear(y);
    if (useBs) {
      try {
        const maxDay = daysInBsMonth(y, m);
        const ad = bsToAd({ year: y, month: m, day: Math.min(d, maxDay) });
        target = new Date(ad.year, ad.month - 1, ad.day);
      } catch {
        return null;
      }
    } else {
      target = new Date(y, m - 1, d);
    }
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

export function formatExpiryDisplay(
  iso: string | null,
  calendar: DateCalendar = 'AD',
): string {
  if (!iso) return '—';
  const normalized = preserveDateString(iso) ?? iso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [y, m, d] = normalized.split('-').map(Number);
    const useBs = calendar === 'BS' || isBsDematYear(y);
    if (useBs) {
      // Match MeroShare: 2084-03-32 B.S.
      return `${padIsoParts(y, m, d)} B.S.`;
    }
    // Match MeroShare A.D.: year-month-day
    return padIsoParts(y, m, d);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(normalized)) {
    const [d, m, y] = normalized.split('/').map(Number);
    return padIsoParts(y, m, d);
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return iso;
  return padIsoParts(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
  );
}

/** A field is "expired" when its date is in the past; otherwise fall back to the flag. */
function resolveExpired(
  date: string | null,
  flag: boolean | null,
  calendar: DateCalendar = 'AD',
): boolean | null {
  const remaining = daysUntil(date, calendar);
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
  const byKind: Record<
    PillKind,
    { expired: boolean | null; date: string | null; calendar: DateCalendar }
  > = {
    password: {
      expired: fields.passwordExpired,
      date: fields.passwordExpiryDate,
      calendar: 'AD',
    },
    demat: {
      expired: fields.dematExpired,
      date: fields.dematExpiryDate,
      calendar: 'BS',
    },
    meroshare: {
      expired: fields.meroshareExpired,
      date: fields.meroshareExpiryDate,
      calendar: 'AD',
    },
  };

  return PILL_ORDER.map(({ kind, label }) => {
    const { expired, date, calendar } = byKind[kind];
    const days = daysUntil(date, calendar);
    const isExpired = days != null ? days < 0 : expired;
    return {
      kind,
      label,
      expired: isExpired,
      expiryDate: date,
      calendar,
      daysLeft: days,
      statusLine: statusLineFor(isExpired, days),
    };
  });
}

function summarize(fields: ExpiryFields): { status: ExpiryStatus; detail: string } {
  const dated: Array<{
    name: string;
    date: string | null;
    flag: boolean | null;
    calendar: DateCalendar;
  }> = [
    {
      name: 'Password',
      date: fields.passwordExpiryDate,
      flag: fields.passwordExpired,
      calendar: 'AD',
    },
    {
      name: 'Demat',
      date: fields.dematExpiryDate,
      flag: fields.dematExpired,
      calendar: 'BS',
    },
    {
      name: 'MeroShare',
      date: fields.meroshareExpiryDate,
      flag: fields.meroshareExpired,
      calendar: 'AD',
    },
  ];

  const expiredNames = dated
    .filter(
      ({ date, flag, calendar }) => resolveExpired(date, flag, calendar) === true,
    )
    .map(({ name }) => `${name} expired`);
  if (expiredNames.length) {
    return { status: 'expired', detail: expiredNames.join(' · ') };
  }

  const remaining = dated
    .map(({ date, calendar }) => daysUntil(date, calendar))
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
      passwordExpired: resolveExpired(exp.passwordExpiryDate ?? null, null, 'AD'),
      dematExpired: resolveExpired(exp.dematExpiryDate ?? null, null, 'BS'),
      meroshareExpired: resolveExpired(exp.meroshareExpiryDate ?? null, null, 'AD'),
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

    // Official CDSC ownDetail fields (see @util/meroshare OwnDetail):
    //   passwordExpiryDate / passwordExpiryDateStr
    //   dematExpiryDate
    //   expiredDate / expiredDateStr  → MeroShare account term
    //   renewedDate / renewedDateStr  → last demat/account renew
    const passwordExpiryDate =
      readDate(detail, [
        'passwordExpiryDateStr',
        'passwordExpiryDate',
        'passwordExpireDate',
        'pwdExpiryDate',
      ]) ??
      readDate(renew, [
        'passwordExpiryDateStr',
        'passwordExpiryDate',
        'passwordExpireDate',
      ]);

    // MeroShare account access — ONLY expiredDate* (never generic expiryDate /
    // dematExpiryDate, or demat and meroshare collapse to the same day).
    const meroshareExpiryDate =
      readDate(detail, ['expiredDateStr', 'expiredDate']) ??
      readDate(renew, [
        'expiredDateStr',
        'expiredDate',
        'meroshareExpiryDate',
        'meroShareExpiryDate',
        'accountExpiryDate',
      ]);

    // Exact CDSC dematExpiryDate as shown in MeroShare (B.S., e.g. 2084-03-32).
    // Preserve day 32; never derive from renewedDate + 1 year or MeroShare expiredDate.
    const dematExpiryDate =
      readPreservedDate(detail, [
        'dematExpiryDate',
        'dematExpiredDate',
        'dematExpireDate',
      ]) ??
      readPreservedDate(renew, [
        'dematExpiryDate',
        'dematExpiredDate',
        'dematExpireDate',
      ]);

    if (__DEV__) {
      console.log('[expiry]', account.username, {
        passwordExpiryDate,
        dematExpiryDate,
        meroshareExpiryDate,
        renewedDate: readPreservedDate(detail, [
          'renewedDateStr',
          'renewedDate',
        ]),
      });
    }

    const fields: ExpiryFields = {
      meroshareExpiryDate,
      dematExpiryDate,
      passwordExpiryDate,
      meroshareExpired: resolveExpired(
        meroshareExpiryDate,
        readFlag(detail, [
          'accountExpired',
          'isAccountExpired',
          'meroShareExpired',
        ]),
        'AD',
      ),
      dematExpired: resolveExpired(
        dematExpiryDate,
        readFlag(detail, ['dematExpired', 'isDematExpired']),
        'BS',
      ),
      passwordExpired: resolveExpired(
        passwordExpiryDate,
        readFlag(detail, [
          'passwordExpired',
          'isPasswordExpired',
          'passwordExpire',
        ]),
        'AD',
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
