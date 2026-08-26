import { Alert } from 'react-native';
import type { AccountMeta } from '../types/account';
import { buildDematFromParts, isValidBoid, resolveBoidSync } from './boid';

export type DuplicateMatchReason = 'boid' | 'username' | 'crn';

export type DuplicateCandidate = {
  username?: string;
  dpId?: string;
  dpCode?: string;
  demat?: string;
  boid?: string;
  crn?: string;
};

export type DuplicateAccountHit = {
  account: AccountMeta;
  reason: DuplicateMatchReason;
};

export class DuplicateAccountError extends Error {
  hit: DuplicateAccountHit;
  constructor(hit: DuplicateAccountHit) {
    super(duplicateAccountMessage(hit).body);
    this.name = 'DuplicateAccountError';
    this.hit = hit;
  }
}

function normUser(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normCrn(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function digits(value: string | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

function boidSet(parts: {
  demat?: string;
  boid?: string;
  dpCode?: string;
  username?: string;
}): Set<string> {
  const out = new Set<string>();
  for (const raw of [parts.demat, parts.boid]) {
    const d = digits(raw);
    if (isValidBoid(d)) out.add(d);
  }
  const dp = String(parts.dpCode ?? '').trim();
  const user = String(parts.username ?? '').trim();
  if (dp && user) {
    const built = buildDematFromParts(dp, user);
    if (isValidBoid(built)) out.add(built);
  }
  return out;
}

function accountBoids(account: AccountMeta): Set<string> {
  const out = boidSet({
    demat: account.demat,
    dpCode: account.dpCode,
    username: account.username,
  });
  const sync = resolveBoidSync(account);
  if (sync && isValidBoid(sync)) out.add(sync);
  return out;
}

function dpTokens(dpId?: string, dpCode?: string): Set<string> {
  const out = new Set<string>();
  for (const raw of [dpId, dpCode]) {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s) out.add(s);
  }
  return out;
}

function sameUsernameLogin(
  account: AccountMeta,
  candidate: DuplicateCandidate,
): boolean {
  const userA = normUser(account.username);
  const userC = normUser(candidate.username);
  if (!userA || !userC || userA !== userC) return false;
  const a = dpTokens(account.dpId, account.dpCode);
  const c = dpTokens(candidate.dpId, candidate.dpCode);
  if (!a.size || !c.size) return true;
  for (const token of c) {
    if (a.has(token)) return true;
  }
  return false;
}

function reasonLabel(reason: DuplicateMatchReason): string {
  if (reason === 'boid') return 'BOID';
  if (reason === 'crn') return 'CRN';
  return 'username';
}

export function duplicateAccountMessage(hit: DuplicateAccountHit): {
  title: string;
  body: string;
} {
  const who = (hit.account.name || hit.account.username || 'this account').trim();
  return {
    title: 'Account already saved',
    body:
      `You cannot save the same account more than once.\n\n` +
      `This ${reasonLabel(hit.reason)} already belongs to "${who}" on this device.\n\n` +
      `Open Accounts to use or edit the existing one.`,
  };
}

export function showDuplicateAccountAlert(hit: DuplicateAccountHit): void {
  const { title, body } = duplicateAccountMessage(hit);
  Alert.alert(title, body);
}

export function findDuplicateAccount(opts: {
  accounts: AccountMeta[];
  candidate: DuplicateCandidate;
  excludeId?: string;
  crnById?: Record<string, string>;
}): DuplicateAccountHit | null {
  const { accounts, candidate, excludeId, crnById } = opts;
  const wantBoids = boidSet(candidate);
  const wantCrn = normCrn(candidate.crn);
  const canCheckCrn = wantCrn.length >= 4;

  for (const account of accounts) {
    if (!account?.id || account.id === excludeId) continue;

    if (wantBoids.size) {
      const have = accountBoids(account);
      for (const boid of wantBoids) {
        if (have.has(boid)) {
          return { account, reason: 'boid' };
        }
      }
    }

    if (sameUsernameLogin(account, candidate)) {
      return { account, reason: 'username' };
    }

    if (canCheckCrn && crnById) {
      const existing = normCrn(crnById[account.id]);
      if (existing.length >= 4 && existing === wantCrn) {
        return { account, reason: 'crn' };
      }
    }
  }
  return null;
}

export async function findDuplicateAccountAsync(opts: {
  accounts: AccountMeta[];
  candidate: DuplicateCandidate;
  excludeId?: string;
  loadCrn?: (id: string) => Promise<string | null | undefined>;
}): Promise<DuplicateAccountHit | null> {
  const crnById: Record<string, string> = {};
  const wantCrn = normCrn(opts.candidate.crn);
  if (wantCrn.length >= 4 && opts.loadCrn) {
    await Promise.all(
      opts.accounts.map(async (account) => {
        if (!account?.id || account.id === opts.excludeId) return;
        const crn = await opts.loadCrn!(account.id);
        if (crn) crnById[account.id] = crn;
      }),
    );
  }
  return findDuplicateAccount({ ...opts, crnById });
}
