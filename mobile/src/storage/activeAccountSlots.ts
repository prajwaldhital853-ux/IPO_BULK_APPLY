import AsyncStorage from '@react-native-async-storage/async-storage';
import { scopedAsyncKey } from './userScope';
import { isUnlimitedAccountLimit } from './subscriptionStorage';

export const ACTIVE_SLOTS_BASE = 'active_account_slots_v1';

export type ActiveSlotsStored = {
  ids: string[];
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
    return {
      ids: parsed.ids.map(String),
      confirmedForMax: Math.floor(parsed.confirmedForMax),
    };
  } catch {
    return null;
  }
}

export async function saveActiveSlots(
  ids: string[],
  confirmedForMax: number,
): Promise<void> {
  const next: ActiveSlotsStored = {
    ids,
    confirmedForMax: Math.floor(confirmedForMax),
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
};

export function resolveActiveSlots(
  accountIds: string[],
  maxAccounts: number,
  stored: ActiveSlotsStored | null,
): ActiveSlotsResolved {
  if (isUnlimitedAccountLimit(maxAccounts) || accountIds.length <= maxAccounts) {
    return {
      overQuota: false,
      needsPick: false,
      activeIds: new Set(accountIds),
      suggestedIds: accountIds,
    };
  }

  const exist = new Set(accountIds);
  const kept = (stored?.ids ?? []).filter((id) => exist.has(id)).slice(
    0,
    maxAccounts,
  );
  const confirmed =
    stored != null &&
    stored.confirmedForMax === maxAccounts &&
    kept.length > 0 &&
    kept.length <= maxAccounts;

  return {
    overQuota: true,
    needsPick: !confirmed,
    activeIds: confirmed ? new Set(kept) : new Set(),
    suggestedIds: kept,
  };
}
