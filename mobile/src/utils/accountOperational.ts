import type { AccountMeta } from '../types/account';
import { isMockAccountId } from '../data/mockAccounts';

/** User toggled this account off — excluded from bulk apply, results, and status checks. */
export function isUserInactive(account: AccountMeta): boolean {
  return account.inactive === true;
}

export function filterOperationalAccounts(accounts: AccountMeta[]): AccountMeta[] {
  return accounts.filter((a) => !isUserInactive(a));
}

/** Real saved accounts that are not user-inactive. */
export function filterRealOperationalAccounts(
  accounts: AccountMeta[],
): AccountMeta[] {
  return accounts.filter(
    (a) =>
      !a.id.startsWith('demo_') &&
      !isMockAccountId(a.id) &&
      !isUserInactive(a),
  );
}

/**
 * Account used to load opening IPO lists — primary first, else first operational.
 */
export function pickLeadAccount(
  accounts: AccountMeta[],
): AccountMeta | undefined {
  const real = filterRealOperationalAccounts(accounts);
  if (!real.length) {
    const targets = accounts.filter(
      (a) => !a.id.startsWith('demo_') && !isMockAccountId(a.id),
    );
    return targets.find((a) => a.isPrimary) ?? targets[0];
  }
  return real.find((a) => a.isPrimary) ?? real[0];
}
