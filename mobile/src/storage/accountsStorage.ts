import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AccountMeta, AccountSecrets, LinkedAccount } from '../types/account';
import {
  LEGACY_META_KEY,
  META_BASE,
  scopedAsyncKey,
  scopedSecretKey,
} from './userScope';

const LEGACY_KEY = '@nepse_ghar/accounts_v1';

function metaKey(): string {
  return scopedAsyncKey(META_BASE);
}

async function saveSecrets(id: string, secrets: AccountSecrets): Promise<void> {
  await SecureStore.setItemAsync(scopedSecretKey(id), JSON.stringify(secrets));
}

export async function updateAccountSecrets(
  id: string,
  patch: Partial<AccountSecrets>,
): Promise<void> {
  const cur = (await getSecrets(id)) ?? { password: '', crn: '', pin: '' };
  await saveSecrets(id, { ...cur, ...patch });
}

export async function getSecrets(id: string): Promise<AccountSecrets | null> {
  try {
    let raw = await SecureStore.getItemAsync(scopedSecretKey(id));
    if (!raw) {
      raw = await SecureStore.getItemAsync(`nepse_ghar_secret_${id}`);
    }
    if (!raw) return null;
    return JSON.parse(raw) as AccountSecrets;
  } catch {
    return null;
  }
}

async function deleteSecrets(id: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(scopedSecretKey(id));
    await SecureStore.deleteItemAsync(`nepse_ghar_secret_${id}`);
  } catch {
    // ignore
  }
}

export async function loadAccountMeta(): Promise<AccountMeta[]> {
  await migrateLegacyIfNeeded();
  try {
    const raw = await AsyncStorage.getItem(metaKey());
    if (!raw) return [];
    return JSON.parse(raw) as AccountMeta[];
  } catch {
    return [];
  }
}

export async function saveAccountMeta(list: AccountMeta[]): Promise<void> {
  await AsyncStorage.setItem(metaKey(), JSON.stringify(list));
}

export async function reorderAccountMeta(
  orderedIds: string[],
): Promise<AccountMeta[]> {
  const list = await loadAccountMeta();
  const byId = new Map(list.map((a) => [a.id, a]));
  const next: AccountMeta[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (row) {
      next.push(row);
      byId.delete(id);
    }
  }
  for (const leftover of byId.values()) next.push(leftover);
  await saveAccountMeta(next);
  return next;
}

export async function addAccountWithSecrets(
  meta: Omit<AccountMeta, 'id'> & { id?: string },
  secrets: AccountSecrets,
): Promise<AccountMeta> {
  const list = await loadAccountMeta();
  const id = meta.id ?? `acc_${Date.now()}`;
  const next: AccountMeta = {
    id,
    name: meta.name,
    dpId: meta.dpId,
    dpName: meta.dpName,
    dpCode: meta.dpCode,
    username: meta.username,
    bankName: meta.bankName,
    verified: meta.verified ?? true,
    crnPinVerified: meta.crnPinVerified,
    boidHint: meta.boidHint,
    demat: meta.demat,
  };
  await saveSecrets(id, secrets);
  await saveAccountMeta([...list, next]);
  return next;
}

export async function patchAccountMeta(
  id: string,
  patch: Partial<Omit<AccountMeta, 'id'>>,
): Promise<AccountMeta[]> {
  const list = await loadAccountMeta();
  const next = list.map((a) => (a.id === id ? { ...a, ...patch } : a));
  await saveAccountMeta(next);
  return next;
}

export async function removeAccountFully(id: string): Promise<AccountMeta[]> {
  const list = await loadAccountMeta();
  const next = list.filter((a) => a.id !== id);
  await deleteSecrets(id);
  await saveAccountMeta(next);
  return next;
}

export async function clearAllAccounts(): Promise<void> {
  const list = await loadAccountMeta();
  await Promise.all(list.map((a) => deleteSecrets(a.id)));
  await saveAccountMeta([]);
}

async function migrateLegacyIfNeeded(): Promise<void> {
  try {
    const key = metaKey();
    const existing = await AsyncStorage.getItem(key);
    if (existing) return;

    const legacyV2 = await AsyncStorage.getItem(LEGACY_META_KEY);
    if (legacyV2) {
      await AsyncStorage.setItem(key, legacyV2);
      return;
    }

    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (!legacy) return;

    const parsed = JSON.parse(legacy) as LinkedAccount[];
    const meta: AccountMeta[] = [];
    for (const row of parsed) {
      const id = row.id || `acc_${Date.now()}_${meta.length}`;
      meta.push({
        id,
        name: row.name,
        dpId: row.dpId,
        dpName: row.dpName,
        username: row.username,
        bankName: row.bankName,
        verified: row.verified,
      });
      if (row.password || row.crn || row.pin) {
        await saveSecrets(id, {
          password: row.password ?? '',
          crn: row.crn ?? '',
          pin: row.pin ?? '',
        });
      }
    }
    await saveAccountMeta(meta);
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    // leave legacy
  }
}
