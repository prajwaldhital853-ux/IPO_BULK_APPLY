/**
 * Pure rules for the shared active-account set (no storage / native imports,
 * so they can be unit-checked outside the app).
 *
 * Active accounts are derived, never chosen: the demats added first keep the
 * plan's slots and the rest are locked on every phone signed in with the same
 * Google account.
 */
import type { AccountMeta } from '../types/account';
import { idsMatchingFingerprints } from './accountFingerprint';

/** Admin can set this value (= unlimited accounts). */
export const UNLIMITED_ACCOUNT_LIMIT = 999_999;

export function isUnlimitedAccountLimit(n: number | null | undefined): boolean {
  return n != null && n >= UNLIMITED_ACCOUNT_LIMIT;
}

export type ActiveSlotsStored = {
  /**
   * Active cross-device fingerprints (`d:…` / `u:…`) for this Google account,
   * as decided by the server.
   */
  keys: string[];
  /** Plan cap these keys were computed for. */
  maxAccounts: number;
  /** Unique demats claimed across every phone. */
  total: number;
};

export type ActiveSlotsResolved = {
  /** Plan cap is exceeded across all phones (admin lowered limit, etc.). */
  overQuota: boolean;
  activeIds: Set<string>;
  lockedIds: string[];
  /** Active demats across all phones (may exceed what is on this one). */
  activeCount: number;
  /** Unique demats claimed across all phones. */
  total: number;
};

/** Oldest-first: the queue order the server also uses (added time, then id). */
function queueOrder(accounts: AccountMeta[]): AccountMeta[] {
  return [...accounts].sort((a, b) => {
    const ta = Date.parse(a.addedAt ?? '') || 0;
    const tb = Date.parse(b.addedAt ?? '') || 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function claimedTotal(
  accounts: AccountMeta[],
  stored: ActiveSlotsStored | null,
): number {
  const local = accounts.length;
  if (stored && stored.total > 0) {
    return Math.max(stored.total, local);
  }
  return local;
}

/**
 * The server set wins when it matches the live cap; offline we apply the same
 * oldest-first rule locally so the cap can never be side-stepped.
 */
export function resolveActiveSlots(
  accounts: AccountMeta[],
  maxAccounts: number,
  stored: ActiveSlotsStored | null,
): ActiveSlotsResolved {
  const allIds = accounts.map((a) => a.id);

  if (isUnlimitedAccountLimit(maxAccounts)) {
    return {
      overQuota: false,
      activeIds: new Set(allIds),
      lockedIds: [],
      activeCount: allIds.length,
      total: allIds.length,
    };
  }

  const total = claimedTotal(accounts, stored);
  const globalOver = total > maxAccounts;
  const staleCap =
    stored != null && stored.maxAccounts > 0 && stored.maxAccounts !== maxAccounts;

  const serverKeys =
    stored && !staleCap ? stored.keys.slice(0, maxAccounts) : [];

  if (serverKeys.length) {
    const activeIds = new Set(idsMatchingFingerprints(accounts, serverKeys));
    const lockedIds = allIds.filter((id) => !activeIds.has(id));
    return {
      overQuota: globalOver,
      activeIds,
      lockedIds,
      activeCount: serverKeys.length,
      total,
    };
  }

  const ordered = queueOrder(accounts);
  const activeIds = new Set(ordered.slice(0, maxAccounts).map((a) => a.id));
  const lockedIds = ordered.slice(maxAccounts).map((a) => a.id);
  return {
    overQuota: globalOver,
    activeIds,
    lockedIds,
    activeCount: activeIds.size,
    total,
  };
}
