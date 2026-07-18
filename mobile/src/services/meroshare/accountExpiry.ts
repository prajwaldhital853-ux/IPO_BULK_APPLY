import { MeroshareClient } from './client';
import type { AccountMeta } from '../../types/account';

export type ExpiryStatus = 'ok' | 'warning' | 'expired' | 'unknown' | 'error';

export type AccountExpiryInfo = {
  accountId: string;
  accountName: string;
  username: string;
  dpName: string;
  demat: string | null;
  meroshareExpired: boolean | null;
  dematExpired: boolean | null;
  meroshareExpiryDate: string | null;
  dematExpiryDate: string | null;
  status: ExpiryStatus;
  detail: string;
};

function pickDate(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const hit = Object.entries(obj).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    );
    if (!hit) continue;
    const raw = hit[1];
    if (typeof raw === 'string' && raw.trim()) return raw.slice(0, 10);
  }
  return null;
}

function pickBool(obj: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const hit = Object.entries(obj).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    );
    if (!hit) continue;
    if (typeof hit[1] === 'boolean') return hit[1];
    if (hit[1] === 'TRUE' || hit[1] === 'true') return true;
    if (hit[1] === 'FALSE' || hit[1] === 'false') return false;
  }
  return null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function classifyExpiry(opts: {
  meroshareExpired: boolean | null;
  dematExpired: boolean | null;
  meroshareExpiryDate: string | null;
  dematExpiryDate: string | null;
}): { status: ExpiryStatus; detail: string } {
  if (opts.meroshareExpired || opts.dematExpired) {
    const parts: string[] = [];
    if (opts.meroshareExpired) parts.push('MeroShare account expired');
    if (opts.dematExpired) parts.push('Demat expired');
    return { status: 'expired', detail: parts.join(' · ') };
  }

  const warnDates = [
    daysUntil(opts.meroshareExpiryDate),
    daysUntil(opts.dematExpiryDate),
  ].filter((d): d is number => d != null);

  const soonest = warnDates.length ? Math.min(...warnDates) : null;
  if (soonest != null && soonest <= 0) {
    return { status: 'expired', detail: 'Renewal date passed' };
  }
  if (soonest != null && soonest <= 30) {
    return {
      status: 'warning',
      detail: `Renew within ${soonest} day(s)`,
    };
  }

  if (opts.meroshareExpiryDate || opts.dematExpiryDate) {
    return { status: 'ok', detail: 'Active — renew dates on file' };
  }
  return { status: 'unknown', detail: 'Logged in — expiry dates not returned' };
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
    meroshareExpiryDate: null,
    dematExpiryDate: null,
    status: 'unknown',
    detail: '',
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

    const raw = await client.fetchOwnDetailRaw();
    const renew =
      raw.renewDetails && typeof raw.renewDetails === 'object'
        ? (raw.renewDetails as Record<string, unknown>)
        : {};

    const meroshareExpired = pickBool(raw, [
      'accountExpired',
      'isAccountExpired',
    ]);
    const dematExpired = pickBool(raw, ['dematExpired', 'isDematExpired']);
    const meroshareExpiryDate =
      pickDate(raw, ['expiryDate', 'accountExpiryDate', 'meroshareExpiryDate']) ??
      pickDate(renew, ['expiryDate', 'accountExpiryDate']);
    const dematExpiryDate =
      pickDate(raw, ['dematExpiryDate']) ??
      pickDate(renew, ['dematExpiryDate']);

    const { status, detail } = classifyExpiry({
      meroshareExpired,
      dematExpired,
      meroshareExpiryDate,
      dematExpiryDate,
    });

    return {
      ...base,
      demat: session.demat ?? account.demat ?? null,
      meroshareExpired,
      dematExpired,
      meroshareExpiryDate,
      dematExpiryDate,
      status,
      detail,
    };
  } catch (e) {
    return {
      ...base,
      status: 'error',
      detail: e instanceof Error ? e.message : 'Could not check expiry',
    };
  }
}
