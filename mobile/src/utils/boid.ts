import type { AccountMeta } from '../types/account';

/** CDSC 16-digit demat / BOID from DP code + MeroShare username. */
export function buildDematFromParts(
  dpCode: string,
  username: string,
): string {
  return `130${String(dpCode).trim()}${String(username).trim()}`;
}

export function isValidBoid(value: string): boolean {
  return /^\d{16}$/.test(value.trim());
}

/** Mask for UI: 13013700••••1234 */
export function maskBoid(boid: string): string {
  const s = boid.trim();
  if (s.length < 12) return s;
  return `${s.slice(0, 8)}••••${s.slice(-4)}`;
}

/**
 * Sync resolve: cached demat, else construct from dpCode + username.
 * Returns null when neither is available (needs MeroShare fetch).
 */
export function resolveBoidSync(account: AccountMeta): string | null {
  const cached = account.demat?.trim();
  if (cached && isValidBoid(cached)) return cached;

  if (account.dpCode && account.username) {
    const built = buildDematFromParts(account.dpCode, account.username);
    if (isValidBoid(built)) return built;
  }

  return null;
}
