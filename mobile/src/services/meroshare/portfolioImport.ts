import type { AccountMeta } from '../../types/account';
import { isMockAccountId, mockHoldingsForAccount } from '../../data/mockAccounts';
import { getSecrets } from '../../storage/accountsStorage';
import { MeroshareClient } from './client';
import { MeroshareError, isRoleRestrictedMeroshareError } from './errors';
import type { PortfolioHoldingRow } from './types';

export type ImportedHolding = {
  symbol: string;
  name?: string;
  qty: number;
  /** MeroShare has no WACC/cost price — seeded from last transaction price. */
  wacc: number;
  ltp: number | null;
  previousClosingPrice: number | null;
};

export type ImportResult = {
  accountId: string;
  accountName: string;
  holdings: ImportedHolding[];
  /** Set after live fetch — persist on account to speed up the next bulk run. */
  meroClientCode?: string;
  demat?: string;
  /** First try hit CDSC role block — holdings empty until a background retry. */
  portfolioAccessRestricted?: boolean;
};

export type ImportPortfolioOpts = {
  /** Preloaded password — avoids per-account SecureStore reads in bulk. */
  password?: string;
  /** Bulk mode: fewer login retries + single-shot portfolio request. */
  bulkFast?: boolean;
  /** Background retry after role block — full login, no re-queue. */
  roleRestrictedRetry?: boolean;
};

/**
 * Log into MeroShare with a saved account's stored secrets and pull the
 * live "My Portfolio" holdings. MeroShare exposes quantity + last/previous
 * price only (no purchase price), so WACC is seeded from LTP and can be
 * edited by the user afterwards.
 *
 * Mock accounts (`mock_*`) return seeded holdings so Expo Go demos work
 * offline without hitting CDSC.
 */
export async function importPortfolioFromMeroshare(
  account: AccountMeta,
  opts?: ImportPortfolioOpts,
): Promise<ImportResult> {
  if (isMockAccountId(account.id)) {
    const holdings = mockHoldingsForAccount(account.id) ?? [];
    if (!opts?.bulkFast) {
      await new Promise((r) => setTimeout(r, 350));
    }
    return {
      accountId: account.id,
      accountName: account.name,
      holdings,
    };
  }

  const password = opts?.password ?? (await getSecrets(account.id))?.password;
  if (!password) {
    throw new MeroshareError(
      'AUTH',
      `No saved password for ${account.name}. Re-add the account to enable import.`,
    );
  }

  const bulkFast = opts?.bulkFast === true;
  const roleRetry = opts?.roleRestrictedRetry === true;

  const onRoleRestricted = (): ImportResult => {
    if (roleRetry) {
      return {
        accountId: account.id,
        accountName: account.name,
        holdings: [],
      };
    }
    return {
      accountId: account.id,
      accountName: account.name,
      holdings: [],
      portfolioAccessRestricted: true,
    };
  };

  const runLiveImport = async (
    useCachedClientCode: boolean,
  ): Promise<ImportResult> => {
    const cachedClientCode = useCachedClientCode
      ? account.meroClientCode?.trim()
      : undefined;
    const cachedDemat = account.demat?.trim();
    const canSkipOwnDetail = Boolean(cachedClientCode) && !roleRetry;

    const client = new MeroshareClient();
    await client.login(
      {
        clientId: account.dpId,
        username: account.username,
        password,
        dpCode: account.dpCode,
        dpName: account.dpName,
      },
      {
        skipOwnDetail: canSkipOwnDetail,
        attempts: bulkFast ? 2 : 3,
      },
    );

    if (canSkipOwnDetail || cachedDemat) {
      client.applyCachedProfile({
        clientCode: cachedClientCode,
        demat: cachedDemat,
      });
    }

    let rows: PortfolioHoldingRow[];
    let meroClientCode: string | undefined;
    let demat: string | undefined;
    try {
      if (!canSkipOwnDetail) {
        await client.ensureClientCodeForPortfolio();
      }
      rows = await client.fetchMyPortfolio(
        {
          username: account.username,
          dpCode: account.dpCode,
        },
        { bulkFast },
      );
      const session = client.getSession();
      meroClientCode = session?.clientCode ?? cachedClientCode;
      demat = session?.demat ?? cachedDemat;
    } finally {
      client.clearSession();
    }

    const holdings: ImportedHolding[] = rows.map((r) => {
      const price = r.lastTransactionPrice ?? r.previousClosingPrice ?? 0;
      return {
        symbol: r.script,
        name: r.scriptDesc,
        qty: r.quantity,
        wacc: price,
        ltp: r.lastTransactionPrice,
        previousClosingPrice: r.previousClosingPrice,
      };
    });

    return {
      accountId: account.id,
      accountName: account.name,
      holdings,
      meroClientCode,
      demat,
    };
  };

  if (account.meroClientCode?.trim() && !roleRetry) {
    try {
      return await runLiveImport(true);
    } catch (e) {
      if (isRoleRestrictedMeroshareError(e)) {
        return onRoleRestricted();
      }
      if (!bulkFast) throw e;
      return await runLiveImport(false);
    }
  }

  try {
    return await runLiveImport(false);
  } catch (e) {
    if (isRoleRestrictedMeroshareError(e)) {
      return onRoleRestricted();
    }
    throw e;
  }
}
