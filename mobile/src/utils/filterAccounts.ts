import type { AccountMeta } from '../types/account';

/** Fast name / username / demat filter for large account lists. */
export function filterAccountsByQuery(
  accounts: AccountMeta[],
  query: string,
): AccountMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return accounts;
  return accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.username.toLowerCase().includes(q) ||
      (a.demat && a.demat.includes(q)) ||
      (a.bankName && a.bankName.toLowerCase().includes(q)) ||
      (a.accountNumber && a.accountNumber.toLowerCase().includes(q)),
  );
}

/** Prune a Set selection when the account list changes. */
export function pruneAccountIdSet(
  accounts: AccountMeta[],
  selected: Set<string>,
): Set<string> {
  if (!selected.size) return selected;
  const next = new Set<string>();
  for (const a of accounts) {
    if (selected.has(a.id)) next.add(a.id);
  }
  if (next.size === selected.size) {
    for (const id of selected) {
      if (!next.has(id)) return next;
    }
    return selected;
  }
  return next;
}
