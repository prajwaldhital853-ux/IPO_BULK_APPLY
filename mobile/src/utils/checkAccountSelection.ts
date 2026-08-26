import type { AccountMeta } from '../types/account';

/** Empty `selectedIds` = all accounts (avoids storing hundreds of ids). */
export function resolveCheckAccounts(
  accounts: AccountMeta[],
  selectedIds: string[],
): AccountMeta[] {
  if (!selectedIds.length) return accounts;
  const set = new Set(selectedIds);
  return accounts.filter((a) => set.has(a.id));
}

export function isAllAccountsSelected(
  accounts: AccountMeta[],
  selectedIds: string[],
): boolean {
  return !selectedIds.length || selectedIds.length >= accounts.length;
}

export function toggleCheckAccountId(
  accounts: AccountMeta[],
  selectedIds: string[],
  accountId: string,
): string[] {
  const total = accounts.length;
  if (!total) return [];

  // All accounts selected (sentinel).
  if (!selectedIds.length) {
    if (total === 1) return selectedIds;
    return accounts.filter((a) => a.id !== accountId).map((a) => a.id);
  }

  if (selectedIds.includes(accountId)) {
    const next = selectedIds.filter((id) => id !== accountId);
    return next.length ? next : selectedIds;
  }

  const next = [...selectedIds, accountId];
  if (next.length >= total) return [];
  return next;
}

export function buildCheckAccountIdSet(
  accounts: AccountMeta[],
  selectedIds: string[],
): Set<string> | null {
  if (!selectedIds.length) return null;
  return new Set(selectedIds);
}

export function isCheckAccountSelected(
  accountId: string,
  selectedSet: Set<string> | null,
): boolean {
  return selectedSet == null || selectedSet.has(accountId);
}
