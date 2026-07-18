import type { AccountMeta } from '../types/account';
import { getSecrets, patchAccountMeta } from '../storage/accountsStorage';
import { MeroshareClient } from '../services/meroshare/client';
import {
  buildDematFromParts,
  isValidBoid,
  resolveBoidSync,
} from './boid';

export type ResolveBoidResult = {
  boid: string;
  source: 'cached' | 'constructed' | 'fetched';
};

/**
 * Resolve full 16-digit BOID for public IPO result checks.
 * Prefers cached / constructed demat; falls back to MeroShare ownDetail once.
 */
export async function resolveBoid(
  account: AccountMeta,
  opts: { persist?: boolean } = {},
): Promise<ResolveBoidResult> {
  const persist = opts.persist !== false;

  const cached = account.demat?.trim();
  if (cached && isValidBoid(cached)) {
    return { boid: cached, source: 'cached' };
  }

  if (account.dpCode && account.username) {
    const built = buildDematFromParts(account.dpCode, account.username);
    if (isValidBoid(built)) {
      if (persist && account.demat !== built) {
        await patchAccountMeta(account.id, {
          demat: built,
          boidHint: built.slice(-4),
        });
      }
      return { boid: built, source: 'constructed' };
    }
  }

  const secrets = await getSecrets(account.id);
  if (!secrets?.password) {
    throw new Error(
      `Missing demat for ${account.name}. Re-save the account or set DP code.`,
    );
  }

  const client = new MeroshareClient();
  try {
    const session = await client.login({
      clientId: account.dpId,
      dpCode: account.dpCode,
      username: account.username,
      password: secrets.password,
    });
    const fromSession =
      (session.demat && isValidBoid(session.demat) ? session.demat : null) ??
      (session.boid && isValidBoid(session.boid) ? session.boid : null);

    if (!fromSession) {
      throw new Error(
        `Could not read demat from MeroShare for ${account.name}.`,
      );
    }

    if (persist) {
      await patchAccountMeta(account.id, {
        demat: fromSession,
        boidHint: fromSession.slice(-4),
        dpCode: account.dpCode ?? session.dpCode,
      });
    }

    return { boid: fromSession, source: 'fetched' };
  } finally {
    client.clearSession();
  }
}

export async function resolveBoidsForAccounts(
  accounts: AccountMeta[],
): Promise<
  Array<{
    account: AccountMeta;
    boid?: string;
    error?: string;
  }>
> {
  const out: Array<{
    account: AccountMeta;
    boid?: string;
    error?: string;
  }> = [];

  for (const account of accounts) {
    try {
      const sync = resolveBoidSync(account);
      if (sync) {
        if (!account.demat) {
          await patchAccountMeta(account.id, {
            demat: sync,
            boidHint: sync.slice(-4),
          });
        }
        out.push({ account: { ...account, demat: sync }, boid: sync });
        continue;
      }
      const resolved = await resolveBoid(account);
      out.push({
        account: { ...account, demat: resolved.boid },
        boid: resolved.boid,
      });
    } catch (e) {
      out.push({
        account,
        error: e instanceof Error ? e.message : 'Could not resolve BOID',
      });
    }
  }

  return out;
}
