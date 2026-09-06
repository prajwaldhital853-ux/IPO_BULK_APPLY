import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AccountMeta, AccountSecrets, LinkedAccount } from '../types/account';
import {
  DuplicateAccountError,
  findDuplicateAccountAsync,
} from '../utils/duplicateAccount';
import { holderTypeFromDob } from '../utils/minorAccount';
import { clearApplyHistoryForAccount, clearApplyHistoryForAccounts } from './applyHistory';
import {
  clearBulkPortfolioSnapshot,
  removeAccountFromBulkSnapshot,
  removeAccountsFromBulkSnapshot,
} from './bulkPortfolioStorage';
import { removeTrackerForAccount, removeTrackersForAccounts } from './bankTrackerStorage';
import {
  deletePortfoliosForAccount,
  deletePortfoliosForAccounts,
} from './portfolioStorage';
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

function dedupeAccounts(list: AccountMeta[]): AccountMeta[] {
  const seen = new Set<string>();
  const out: AccountMeta[] = [];
  for (const a of list) {
    if (!a?.id || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

export async function loadAccountMeta(): Promise<AccountMeta[]> {
  await migrateLegacyIfNeeded();
  try {
    const raw = await AsyncStorage.getItem(metaKey());
    if (!raw) return [];
    const list = JSON.parse(raw) as AccountMeta[];
    const deduped = dedupeAccounts(Array.isArray(list) ? list : []);
    if (deduped.length !== list.length) {
      await AsyncStorage.setItem(metaKey(), JSON.stringify(deduped));
    }
    return deduped;
  } catch {
    return [];
  }
}

export async function saveAccountMeta(list: AccountMeta[]): Promise<void> {
  await AsyncStorage.setItem(metaKey(), JSON.stringify(dedupeAccounts(list)));
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

function toAccountMeta(
  meta: Omit<AccountMeta, 'id'> & { id?: string },
  id: string,
): AccountMeta {
  return {
    id,
    name: meta.name,
    dpId: meta.dpId,
    dpName: meta.dpName,
    dpCode: meta.dpCode,
    username: meta.username,
    bankName: meta.bankName,
    accountNumber: meta.accountNumber,
    verified: meta.verified ?? true,
    crnPinVerified: meta.crnPinVerified,
    boidHint: meta.boidHint,
    demat: meta.demat,
    addedAt: meta.addedAt ?? new Date().toISOString(),
    dateOfBirth: meta.dateOfBirth,
    holderType: meta.dateOfBirth
      ? holderTypeFromDob(meta.dateOfBirth)
      : meta.holderType ?? 'major',
    guardianName:
      (meta.dateOfBirth
        ? holderTypeFromDob(meta.dateOfBirth)
        : meta.holderType) === 'minor'
        ? meta.guardianName?.trim() || undefined
        : undefined,
  };
}

export async function addAccountWithSecrets(
  meta: Omit<AccountMeta, 'id'> & { id?: string },
  secrets: AccountSecrets,
  opts?: { skipDuplicateCheck?: boolean },
): Promise<AccountMeta> {
  const list = await loadAccountMeta();
  if (!opts?.skipDuplicateCheck) {
    const hit = await findDuplicateAccountAsync({
      accounts: list,
      candidate: {
        username: meta.username,
        dpId: meta.dpId,
        dpCode: meta.dpCode,
        demat: meta.demat,
        crn: secrets.crn,
      },
      loadCrn: async (id) => (await getSecrets(id))?.crn,
    });
    if (hit) throw new DuplicateAccountError(hit);
  }
  const id = meta.id ?? `acc_${Date.now()}`;
  const next = toAccountMeta(meta, id);
  await saveSecrets(id, secrets);
  // Oldest accounts stay first; newly added accounts go to the end.
  await saveAccountMeta([...list, next]);
  return next;
}

/** Fast path for demo / load-test seeding. Does not run duplicate checks. */
export async function addManyAccountsWithSecrets(
  rows: Array<{
    meta: Omit<AccountMeta, 'id'> & { id?: string };
    secrets: AccountSecrets;
  }>,
): Promise<AccountMeta[]> {
  if (!rows.length) return loadAccountMeta();
  const list = await loadAccountMeta();
  const added: AccountMeta[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const id = row.meta.id ?? `acc_${Date.now()}_${i}`;
    added.push(toAccountMeta({ ...row.meta, addedAt: row.meta.addedAt ?? now }, id));
  }
  for (let i = 0; i < rows.length; i += 15) {
    const chunk = rows.slice(i, i + 15);
    await Promise.all(
      chunk.map((row, j) => saveSecrets(added[i + j]!.id, row.secrets)),
    );
  }
  await saveAccountMeta([...list, ...added]);
  return added;
}

export async function removeAccountsFullyMany(
  ids: string[],
): Promise<AccountMeta[]> {
  if (!ids.length) return loadAccountMeta();
  const idSet = new Set(ids);
  const list = await loadAccountMeta();
  const next = list.filter((a) => !idSet.has(a.id));
  for (let i = 0; i < ids.length; i += 15) {
    await Promise.all(ids.slice(i, i + 15).map((id) => deleteSecrets(id)));
  }
  await Promise.all([
    clearApplyHistoryForAccounts(ids),
    deletePortfoliosForAccounts(ids),
    removeAccountsFromBulkSnapshot(ids),
    removeTrackersForAccounts(ids),
  ]);
  await saveAccountMeta(next);
  return next;
}

export async function patchAccountMeta(
  id: string,
  patch: Partial<Omit<AccountMeta, 'id'>>,
): Promise<AccountMeta[]> {
  return enqueueAccountMetaWrite(() => applyAccountMetaPatch(id, patch));
}

let accountMetaWriteChain: Promise<unknown> = Promise.resolve();

function enqueueAccountMetaWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = accountMetaWriteChain.then(fn, fn);
  accountMetaWriteChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function applyAccountMetaPatch(
  id: string,
  patch: Partial<Omit<AccountMeta, 'id'>>,
): Promise<AccountMeta[]> {
  const list = await loadAccountMeta();
  const next = list.map((a) => {
    if (a.id !== id) return a;
    const merged: AccountMeta = { ...a, ...patch };
    if ('dateOfBirth' in patch && !patch.dateOfBirth) {
      delete merged.dateOfBirth;
    }
    if (merged.dateOfBirth) {
      merged.holderType = holderTypeFromDob(merged.dateOfBirth);
    } else if ('dateOfBirth' in patch) {
      merged.holderType = patch.holderType ?? 'major';
    }
    if (merged.holderType !== 'minor') {
      delete merged.guardianName;
    }
    return merged;
  });
  await saveAccountMeta(next);
  return next;
}

export async function removeAccountFully(id: string): Promise<AccountMeta[]> {
  const list = await loadAccountMeta();
  const next = list.filter((a) => a.id !== id);
  await deleteSecrets(id);
  // Keep Investment Summary / Portfolio / Bulk / Bank tracker in sync
  await Promise.all([
    clearApplyHistoryForAccount(id),
    deletePortfoliosForAccount(id),
    removeAccountFromBulkSnapshot(id),
    removeTrackerForAccount(id),
  ]);
  await saveAccountMeta(next);
  return next;
}

export async function clearAllAccounts(): Promise<void> {
  const list = await loadAccountMeta();
  await Promise.all(
    list.map(async (a) => {
      await deleteSecrets(a.id);
      await clearApplyHistoryForAccount(a.id);
      await removeTrackerForAccount(a.id);
      await deletePortfoliosForAccount(a.id);
    }),
  );
  await clearBulkPortfolioSnapshot();
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
