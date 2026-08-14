import AsyncStorage from '@react-native-async-storage/async-storage';
import { scopedAsyncKey } from './userScope';
import { isUnlimitedAccountLimit } from './subscriptionStorage';
import type { AccountMeta } from '../types/account';
import {
  accountFingerprint,
  idsMatchingFingerprints,
} from '../utils/accountFingerprint';

export const ACTIVE_SLOTS_BASE = 'active_account_slots_v1';

export type ActiveSlotsStored = {
  /** Local account ids (device-specific). */
  ids: string[];
  /**
   * Cross-device fingerprints (`d:…` / `u:…`) shared via the server
   * for the same Google account.
   */
  keys?: string[];
  /** Plan cap this selection was confirmed for. */
  confirmedForMax: number;
};

export async function loadActiveSlots(): Promise<ActiveSlotsStored | null> {
  try {
    const raw = await AsyncStorage.getItem(scopedAsyncKey(ACTIVE_SLOTS_BASE));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSlotsStored;
    if (!Array.isArray(parsed.ids) || !Number.isFinite(parsed.confirmedForMax)) {
      return null;
    }
    const keys = Array.isArray(parsed.keys)
      ? parsed.keys.map(String).filter(Boolean)
      : undefined;
    return {
      ids: parsed.ids.map(String),
      ...(keys?.length ? { keys } : {}),
      confirmedForMax: Math.floor(parsed.confirmedForMax),
    };
  } catch {
    return null;
  }
}

export async function saveActiveSlots(
  ids: string[],
  confirmedForMax: number,
  keys?: string[],
): Promise<void> {
  const next: ActiveSlotsStored = {
    ids,
    confirmedForMax: Math.floor(confirmedForMax),
    ...(keys?.length ? { keys } : {}),
  };
  await AsyncStorage.setItem(
    scopedAsyncKey(ACTIVE_SLOTS_BASE),
    JSON.stringify(next),
  );
}

export async function clearActiveSlots(): Promise<void> {
  await AsyncStorage.removeItem(scopedAsyncKey(ACTIVE_SLOTS_BASE));
}

export type ActiveSlotsResolved = {
  overQuota: boolean;
  needsPick: boolean;
  activeIds: Set<string>;
  suggestedIds: string[];
  /** Full shared key list (may include keys not on this phone). */
  lockedKeys: string[];
};

export function resolveActiveSlots(
  accounts: AccountMeta[],
  maxAccounts: number,
  stored: ActiveSlotsStored | null,
): ActiveSlotsResolved {
  const accountIds = accounts.map((a) => a.id);

  if (isUnlimitedAccountLimit(maxAccounts) || accountIds.length <= maxAccounts) {
    return {
      overQuota: false,
      needsPick: false,
      activeIds: new Set(accountIds),
      suggestedIds: accountIds,
      lockedKeys: [],
    };
  }

  const keys = (stored?.keys ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  let keptIds: string[];
  if (keys.length) {
    keptIds = idsMatchingFingerprints(accounts, keys).slice(0, maxAccounts);
  } else {
    const exist = new Set(accountIds);
    keptIds = (stored?.ids ?? []).filter((id) => exist.has(id)).slice(
      0,
      maxAccounts,
    );
  }

  const confirmed =
    stored != null &&
    stored.confirmedForMax === maxAccounts &&
    (keys.length > 0 || keptIds.length > 0);

  return {
    overQuota: true,
    needsPick: !confirmed,
    activeIds: confirmed ? new Set(keptIds) : new Set(),
    suggestedIds: keptIds,
    lockedKeys: confirmed ? keys : [],
  };
}

/** Build fingerprint list for ids, preserving already-locked keys first. */
export function mergeActiveKeys(
  accounts: AccountMeta[],
  selectedIds: string[],
  lockedKeys: string[],
  maxAccounts: number,
): string[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const key of lockedKeys) {
    const k = key.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  for (const id of selectedIds) {
    const a = byId.get(id);
    if (!a) continue;
    const key = accountFingerprint(a);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  return out.slice(0, maxAccounts);
}
