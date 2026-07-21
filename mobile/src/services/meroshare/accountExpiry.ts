import { MeroshareClient } from './client';
import type { AccountMeta } from '../../types/account';

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

/** Normalize ownDetail payload (sometimes wrapped in `object`). */
function unwrapDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.object;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...raw, ...(nested as Record<string, unknown>) };
  }
  return raw;
}

function pickRaw(obj: Record<string, unknown>, keys: string[]): unknown {
  const entries = Object.entries(obj);
  for (const key of keys) {
    const hit = entries.find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (hit && hit[1] != null && hit[1] !== '') return hit[1];
  }
  return null;
}

/**
 * Parse MeroShare date strings into YYYY-MM-DD (local calendar day).
 * Handles: ISO, D/M/YYYY, M/D/YYYY, "Jan 6, 2054 3:35:24 PM", epoch ms.
 */
function normalizeDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw > 1e12 ? raw : raw * 1000);
    if (!Number.isNaN(d.getTime())) return toYmd(d);
  }

  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO / YYYY-MM-DD…
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return toYmd(d);
    return s.slice(0, 10);
  }

  // D/M/YYYY or M/D/YYYY (Nepal UI often uses D/M/YYYY)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    // Prefer D/M/YYYY when day > 12; otherwise also treat as D/M (CDSC Nepal)
    const day = a;
    const month = b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toYmd(new Date(y, month - 1, day));
    }
  }

  // "Jan 6, 2054 3:35:24 PM" / "6 Jan 2054"
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return toYmd(new Date(parsed));

  return null;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickDate(obj: Record<string, unknown>, keys: string[]): string | null {
  return normalizeDate(pickRaw(obj, keys));
}

function pickBool(obj: Record<string, unknown>, keys: string[]): boolean | null {
  const raw = pickRaw(obj, keys);
  if (typeof raw === 'boolean') return raw;
  if (raw === 'TRUE' || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'FALSE' || raw === 'false' || raw === 0 || raw === '0') return false;
  return null;
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ymd = normalizeDate(iso) ?? iso;
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, day] = ymd.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ymd)) {
    const [dd, mm, yyyy] = ymd.split('/').map(Number);
    d = new Date(yyyy, mm - 1, dd);
  } else {
    d = new Date(ymd);
  }
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function formatExpiryDisplay(iso: string | null): string {
  if (!iso) return '—';
  const ymd = normalizeDate(iso) ?? iso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, day] = ymd.split('-').map(Number);
    return `${day}/${m}/${y}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ymd)) return ymd;
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function pillStatusLine(
  expired: boolean | null,
  days: number | null,
): string {
  if (expired === true || (days != null && days < 0)) {
    const ago = days != null ? Math.abs(days) : null;
    return ago != null ? `Expired ${ago}d ago` : 'Expired';
  }
  if (days != null) {
    return `Valid (${days} d)`;
  }
  if (expired === false) return 'Valid';
  return 'Unknown';
}

function buildPills(info: {
  passwordExpired: boolean | null;
  dematExpired: boolean | null;
  meroshareExpired: boolean | null;
  passwordExpiryDate: string | null;
  dematExpiryDate: string | null;
  meroshareExpiryDate: string | null;
}): ExpiryPill[] {
  const defs: Array<{
    kind: PillKind;
    label: string;
    expired: boolean | null;
    date: string | null;
  }> = [
    {
      kind: 'password',
      label: 'Password',
      expired: info.passwordExpired,
      date: info.passwordExpiryDate,
    },
    {
      kind: 'demat',
      label: 'Demat',
      expired: info.dematExpired,
      date: info.dematExpiryDate,
    },
    {
      kind: 'meroshare',
      label: 'MeroShare',
      expired: info.meroshareExpired,
      date: info.meroshareExpiryDate,
    },
  ];
  return defs.map((d) => {
    const days = daysUntil(d.date);
    let isExpired = d.expired;
    if (days != null) {
      isExpired = days < 0;
    }
    return {
      kind: d.kind,
      label: d.label,
      expired: isExpired,
      expiryDate: d.date,
      daysLeft: days,
      statusLine: pillStatusLine(isExpired, days),
    };
  });
}

function classifyExpiry(opts: {
  meroshareExpired: boolean | null;
  dematExpired: boolean | null;
  passwordExpired: boolean | null;
  meroshareExpiryDate: string | null;
  dematExpiryDate: string | null;
  passwordExpiryDate: string | null;
}): { status: ExpiryStatus; detail: string } {
  const anyExpired =
    opts.meroshareExpired ||
    opts.dematExpired ||
    opts.passwordExpired ||
    [opts.meroshareExpiryDate, opts.dematExpiryDate, opts.passwordExpiryDate]
      .map(daysUntil)
      .some((d) => d != null && d < 0);

  if (anyExpired) {
    const parts: string[] = [];
    if (opts.passwordExpired || (daysUntil(opts.passwordExpiryDate) ?? 1) < 0) {
      parts.push('Password expired');
    }
    if (opts.dematExpired || (daysUntil(opts.dematExpiryDate) ?? 1) < 0) {
      parts.push('Demat expired');
    }
    if (
      opts.meroshareExpired ||
      (daysUntil(opts.meroshareExpiryDate) ?? 1) < 0
    ) {
      parts.push('MeroShare expired');
    }
    return { status: 'expired', detail: parts.join(' · ') || 'Expired' };
  }

  const warnDates = [
    daysUntil(opts.meroshareExpiryDate),
    daysUntil(opts.dematExpiryDate),
    daysUntil(opts.passwordExpiryDate),
  ].filter((d): d is number => d != null);

  const soonest = warnDates.length ? Math.min(...warnDates) : null;
  if (soonest != null && soonest <= 30) {
    return {
      status: 'warning',
      detail: `Renew within ${soonest} day(s)`,
    };
  }

  if (
    opts.meroshareExpiryDate ||
    opts.dematExpiryDate ||
    opts.passwordExpiryDate
  ) {
    return { status: 'ok', detail: 'Active — renew dates on file' };
  }
  return { status: 'unknown', detail: 'Logged in — expiry dates not returned' };
}

function expiredFromDate(date: string | null, flag: boolean | null): boolean | null {
  const days = daysUntil(date);
  if (days != null) return days < 0;
  return flag;
}

export async function fetchAccountExpiryInfo(
  account: AccountMeta,
  password: string,
): Promise<AccountExpiryInfo> {
  const base: AccountExpiryInfo = {
    accountId: account.id,
    accountName: account.name,
    username: account.username,
    dpName: account.dpName,
    demat: account.demat ?? null,
    meroshareExpired: null,
    dematExpired: null,
    passwordExpired: null,
    meroshareExpiryDate: null,
    dematExpiryDate: null,
    passwordExpiryDate: null,
    status: 'unknown',
    detail: '',
    pills: buildPills({
      passwordExpired: null,
      dematExpired: null,
      meroshareExpired: null,
      passwordExpiryDate: null,
      dematExpiryDate: null,
      meroshareExpiryDate: null,
    }),
  };

  try {
    const client = new MeroshareClient();
    const session = await client.login({
      clientId: account.dpId,
      username: account.username,
      password,
      dpCode: account.dpCode,
      dpName: account.dpName,
    });

    const raw = unwrapDetail(await client.fetchOwnDetailRaw());
    const renewRaw = pickRaw(raw, ['renewDetails', 'renewDetail', 'renew']);
    const renew =
      renewRaw && typeof renewRaw === 'object' && !Array.isArray(renewRaw)
        ? (renewRaw as Record<string, unknown>)
        : {};

    /**
     * CDSC ownDetail fields (confirmed via @util/meroshare OwnDetail):
     * - MeroShare account: expiredDate / expiredDateStr
     * - Demat: dematExpiryDate
     * - Password: passwordExpiryDate / passwordExpiryDateStr
     */
    const meroshareExpiryDate =
      pickDate(raw, [
        'expiredDate',
        'expiredDateStr',
        'expiryDate',
        'accountExpiryDate',
        'meroshareExpiryDate',
        'meroShareExpiryDate',
      ]) ??
      pickDate(renew, [
        'expiredDate',
        'expiredDateStr',
        'expiryDate',
        'accountExpiryDate',
        'meroshareExpiryDate',
      ]);

    const dematExpiryDate =
      pickDate(raw, ['dematExpiryDate', 'dematExpiredDate', 'dematExpireDate']) ??
      pickDate(renew, ['dematExpiryDate', 'dematExpiredDate']);

    const passwordExpiryDate =
      pickDate(raw, [
        'passwordExpiryDate',
        'passwordExpiryDateStr',
        'passwordExpireDate',
        'pwdExpiryDate',
      ]) ??
      pickDate(renew, [
        'passwordExpiryDate',
        'passwordExpiryDateStr',
        'passwordExpireDate',
      ]);

    const meroshareExpired = expiredFromDate(
      meroshareExpiryDate,
      pickBool(raw, [
        'accountExpired',
        'isAccountExpired',
        'meroShareExpired',
        'expired',
      ]),
    );
    const dematExpired = expiredFromDate(
      dematExpiryDate,
      pickBool(raw, ['dematExpired', 'isDematExpired']),
    );
    const passwordExpired = expiredFromDate(
      passwordExpiryDate,
      pickBool(raw, [
        'passwordExpired',
        'isPasswordExpired',
        'passwordExpire',
      ]),
    );

    const { status, detail } = classifyExpiry({
      meroshareExpired,
      dematExpired,
      passwordExpired,
      meroshareExpiryDate,
      dematExpiryDate,
      passwordExpiryDate,
    });

    const pills = buildPills({
      passwordExpired,
      dematExpired,
      meroshareExpired,
      passwordExpiryDate,
      dematExpiryDate,
      meroshareExpiryDate,
    });

    return {
      ...base,
      demat:
        (typeof raw.demat === 'string' ? raw.demat : null) ??
        session.demat ??
        account.demat ??
        null,
      meroshareExpired,
      dematExpired,
      passwordExpired,
      meroshareExpiryDate,
      dematExpiryDate,
      passwordExpiryDate,
      status,
      detail,
      pills,
    };
  } catch (e) {
    return {
      ...base,
      status: 'error',
      detail: e instanceof Error ? e.message : 'Could not check expiry',
    };
  }
}
