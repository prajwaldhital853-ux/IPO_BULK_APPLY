import type { AccountMeta } from '../types/account';

/** 16-digit CDSC demat / BOID (130 + DP + username). */
export function looksLikeBoid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 16 && digits.startsWith('130');
}

/** True when bank account number is missing or wrongly stored as BOID. */
export function needsBankAccountFetch(account: AccountMeta): boolean {
  const acct = account.accountNumber?.trim() ?? '';
  if (acct && !looksLikeBoid(acct)) return false;
  return true;
}
