import type { AccountMeta } from '../../types/account';
import { getSecrets } from '../../storage/accountsStorage';
import { MeroshareClient } from './client';
import { MeroshareError } from './errors';
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
};

/**
 * Log into MeroShare with a saved account's stored secrets and pull the
 * live "My Portfolio" holdings. MeroShare exposes quantity + last/previous
 * price only (no purchase price), so WACC is seeded from LTP and can be
 * edited by the user afterwards.
 */
export async function importPortfolioFromMeroshare(
  account: AccountMeta,
): Promise<ImportResult> {
  const secrets = await getSecrets(account.id);
  if (!secrets?.password) {
    throw new MeroshareError(
      'AUTH',
      `No saved password for ${account.name}. Re-add the account to enable import.`,
    );
  }

  const client = new MeroshareClient();
  await client.login({
    clientId: account.dpId,
    username: account.username,
    password: secrets.password,
    dpCode: account.dpCode,
    dpName: account.dpName,
  });

  let rows: PortfolioHoldingRow[];
  try {
    rows = await client.fetchMyPortfolio({
      username: account.username,
      dpCode: account.dpCode,
    });
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
  };
}
