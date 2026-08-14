import AsyncStorage from '@react-native-async-storage/async-storage';
import { scopedAsyncKey } from './userScope';
import type { ActiveSlotsStored } from '../utils/activeSlotsRules';

export const ACTIVE_SLOTS_BASE = 'active_account_slots_v1';

export {
  resolveActiveSlots,
  type ActiveSlotsResolved,
  type ActiveSlotsStored,
} from '../utils/activeSlotsRules';

export async function loadActiveSlots(): Promise<ActiveSlotsStored | null> {
  try {
    const raw = await AsyncStorage.getItem(scopedAsyncKey(ACTIVE_SLOTS_BASE));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveSlotsStored> & {
      confirmedForMax?: number;
    };
    const keys = Array.isArray(parsed.keys)
      ? parsed.keys.map(String).filter(Boolean)
      : [];
    const max = Number(parsed.maxAccounts ?? parsed.confirmedForMax ?? 0);
    if (!keys.length || !Number.isFinite(max) || max <= 0) return null;
    return {
      keys,
      maxAccounts: Math.floor(max),
      total: Math.max(keys.length, Math.floor(Number(parsed.total ?? 0))),
    };
  } catch {
    return null;
  }
}

export async function saveActiveSlots(value: ActiveSlotsStored): Promise<void> {
  await AsyncStorage.setItem(
    scopedAsyncKey(ACTIVE_SLOTS_BASE),
    JSON.stringify(value),
  );
}

export async function clearActiveSlots(): Promise<void> {
  await AsyncStorage.removeItem(scopedAsyncKey(ACTIVE_SLOTS_BASE));
}
