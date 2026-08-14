import type { AccountMeta } from '../types/account';

function dematKey(account: AccountMeta): string | null {
  const demat = (account.demat ?? '').replace(/\D/g, '');
  if (demat.length >= 8) return `d:${demat}`.slice(0, 96);
  return null;
}

function userKey(account: AccountMeta): string | null {
  const dp = String(account.dpId ?? account.dpCode ?? '')
    .trim()
    .toLowerCase();
  const user = String(account.username ?? '')
    .trim()
    .toLowerCase();
  if (dp.length >= 1 && user.length >= 2) {
    return `u:${dp}:${user}`.slice(0, 96);
  }
  return null;
}

/** All fingerprints for one account (demat and/or DP+username). */
export function accountFingerprintList(account: AccountMeta): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of [dematKey(account), userKey(account)]) {
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * Stable fingerprint for the same MeroShare account across devices.
 * Prefer demat; fall back to dpId+username. Never includes secrets.
 */
export function accountFingerprint(account: AccountMeta): string | null {
  return dematKey(account) ?? userKey(account);
}

export function fingerprintsForAccounts(accounts: AccountMeta[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of accounts) {
    const key = accountFingerprint(a);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function expandStoredKeys(keys: string[]): Set<string> {
  const want = new Set<string>();
  for (const raw of keys) {
    for (const part of String(raw).split(';')) {
      const k = part.trim().toLowerCase();
      if (k) want.add(k);
    }
  }
  return want;
}

/** Map shared fingerprints → local account ids present on this device. */
export function idsMatchingFingerprints(
  accounts: AccountMeta[],
  keys: string[],
): string[] {
  const want = expandStoredKeys(keys);
  if (!want.size) return [];
  const ids: string[] = [];
  const used = new Set<string>();
  for (const a of accounts) {
    if (used.has(a.id)) continue;
    const hit = accountFingerprintList(a).some((k) => want.has(k));
    if (!hit) continue;
    used.add(a.id);
    ids.push(a.id);
  }
  return ids;
}

export function keysForAccountIds(
  accounts: AccountMeta[],
  ids: string[],
): string[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) continue;
    const aliases = accountFingerprintList(a);
    if (!aliases.length) continue;
    const packed = aliases.join(';');
    if (seen.has(packed) || aliases.some((k) => seen.has(k))) continue;
    for (const k of aliases) seen.add(k);
    seen.add(packed);
    out.push(packed);
  }
  return out;
}
