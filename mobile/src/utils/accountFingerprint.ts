import type { AccountMeta } from '../types/account';

/**
 * Stable fingerprint for the same MeroShare account across devices.
 * Prefer demat; fall back to dpId+username. Never includes secrets.
 */
export function accountFingerprint(account: AccountMeta): string | null {
  const demat = (account.demat ?? '').replace(/\D/g, '');
  if (demat.length >= 8) {
    return `d:${demat}`.slice(0, 96);
  }
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

/** Map shared fingerprints → local account ids present on this device. */
export function idsMatchingFingerprints(
  accounts: AccountMeta[],
  keys: string[],
): string[] {
  const want = new Set(keys.map((k) => k.trim().toLowerCase()).filter(Boolean));
  if (!want.size) return [];
  const ids: string[] = [];
  const used = new Set<string>();
  for (const a of accounts) {
    const key = accountFingerprint(a);
    if (!key || !want.has(key) || used.has(a.id)) continue;
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
    const key = accountFingerprint(a);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
