import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  isMockAccountId,
  buildMockAccountSeeds,
  DEFAULT_MOCK_ACCOUNT_COUNT,
} from '../data/mockAccounts';
import {
  addAccountWithSecrets,
  addManyAccountsWithSecrets,
  clearAllAccounts,
  getSecrets,
  loadAccountMeta,
  patchAccountMeta,
  removeAccountFully,
  removeAccountsFullyMany,
  reorderAccountMeta,
  saveAccountMeta,
  updateAccountSecrets,
} from '../storage/accountsStorage';
import {
  clearCapitalDraft,
  loadCapitalDraft,
  saveCapitalDraft,
} from '../storage/draftCapitalStorage';
import type {
  AccountMeta,
  AccountSecrets,
  DraftCapital,
  LinkedAccount,
} from '../types/account';
import { AUTH_ENABLED } from '../services/auth/config';
import { DuplicateAccountError, findDuplicateAccountAsync } from '../utils/duplicateAccount';
import { useAuth } from './AuthContext';

type AccountsContextValue = {
  accounts: AccountMeta[];
  loading: boolean;
  reloadAccounts: () => Promise<void>;
  draft: DraftCapital | null;
  setDraft: (d: DraftCapital | null) => void;
  addAccount: (account: Omit<LinkedAccount, 'id'>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  reorderAccounts: (orderedIds: string[]) => Promise<void>;
  updateAccountMeta: (
    id: string,
    patch: Partial<Omit<AccountMeta, 'id'>>,
  ) => Promise<void>;
  /**
   * Edit an existing account in place (keeps the same id, so apply history and
   * ordering are preserved). Updates meta and, when provided, secrets.
   */
  updateAccount: (
    id: string,
    patch: Partial<Omit<AccountMeta, 'id'>>,
    secrets?: Partial<AccountSecrets>,
  ) => Promise<void>;
  loadSecrets: (id: string) => Promise<{
    password: string;
    crn: string;
    pin: string;
  } | null>;
  /** Seed realistic mock accounts for Expo Go / offline demos. */
  seedMockAccounts: (count?: number) => Promise<void>;
  /** Remove all mock_* accounts. */
  removeMockAccounts: () => Promise<void>;
};

const AccountsContext = createContext<AccountsContextValue | null>(null);

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [accounts, setAccounts] = useState<AccountMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraftState] = useState<DraftCapital | null>(null);

  const setDraft = useCallback((d: DraftCapital | null) => {
    setDraftState(d);
    if (d) {
      void saveCapitalDraft(d);
    } else {
      void clearCapitalDraft();
    }
  }, []);

  const reloadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadAccountMeta();
      // Drop leftover demo_* ids from older builds. Keep all mock_* (36 or 200).
      const cleaned = list.filter((a) => !a.id.startsWith('demo_'));
      const removed = list.filter((a) => !cleaned.some((c) => c.id === a.id));
      if (removed.length) {
        for (const a of removed) {
          await removeAccountFully(a.id);
        }
        setAccounts(await loadAccountMeta());
      } else {
        setAccounts(list);
      }
      const savedDraft = await loadCapitalDraft();
      if (savedDraft) setDraftState(savedDraft);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadAccounts();
  }, [reloadAccounts, auth.user?.id, auth.loading]);

  const addAccount = useCallback(async (account: Omit<LinkedAccount, 'id'>) => {
    const { password = '', crn = '', pin = '', ...meta } = account;
    await addAccountWithSecrets(meta, { password, crn, pin });
    setAccounts(await loadAccountMeta());
    setDraft(null);
    if (AUTH_ENABLED) {
      const { syncAccountSlots } = await import('../services/accountSlots');
      const { keysForAccountIds } = await import('../utils/accountFingerprint');
      const list = (await loadAccountMeta()).filter(
        (a) => !isMockAccountId(a.id),
      );
      const keys = keysForAccountIds(list, list.map((a) => a.id));
      void syncAccountSlots(keys, list.length);
    }
  }, [setDraft]);

  const removeAccount = useCallback(async (id: string) => {
    setAccounts(await removeAccountFully(id));
    if (AUTH_ENABLED) {
      const { syncAccountSlots } = await import('../services/accountSlots');
      const { keysForAccountIds } = await import('../utils/accountFingerprint');
      const list = (await loadAccountMeta()).filter(
        (a) => !isMockAccountId(a.id),
      );
      const keys = keysForAccountIds(list, list.map((a) => a.id));
      void syncAccountSlots(keys, list.length);
    }
  }, []);

  const seedMockAccounts = useCallback(async (count = DEFAULT_MOCK_ACCOUNT_COUNT) => {
    const list = await loadAccountMeta();
    const existingMocks = list.filter((a) => isMockAccountId(a.id));
    if (existingMocks.length) {
      await removeAccountsFullyMany(existingMocks.map((a) => a.id));
    }

    const seeds = buildMockAccountSeeds(count);
    await addManyAccountsWithSecrets(
      seeds.map((seed) => ({
        meta: { ...seed.meta, id: seed.meta.id },
        secrets: seed.secrets,
      })),
    );

    const { createManyPortfoliosWithHoldings, listPortfolios, replaceAllPortfolios } =
      await import('../storage/portfolioStorage');
    const { saveBulkPortfolioSnapshot } = await import(
      '../storage/bulkPortfolioStorage'
    );

    const existing = await listPortfolios();
    const kept = existing.filter(
      (x) =>
        !x.name.includes('(MeroShare)') &&
        !x.name.includes('(Sample)') &&
        !(x.sourceAccountId && isMockAccountId(x.sourceAccountId)),
    );
    if (kept.length !== existing.length) {
      await replaceAllPortfolios(kept);
    }

    await createManyPortfoliosWithHoldings(
      seeds.map((seed) => ({
        name: `${seed.meta.name} (Sample)`,
        sourceAccountId: seed.meta.id,
        holdings: seed.holdings.map((h) => ({
          symbol: h.symbol,
          name: h.name,
          qty: h.qty,
          wacc: h.wacc,
        })),
      })),
    );

    const snapRows: Array<{
      accountId: string;
      accountName: string;
      symbol: string;
      name?: string;
      qty: number;
      wacc: number;
      ltp: number | null;
      previousClosingPrice: number | null;
      value: number;
      dayChange: number;
    }> = [];

    for (const seed of seeds) {
      for (const h of seed.holdings) {
        const value =
          h.qty * (h.ltp ?? h.previousClosingPrice ?? h.wacc ?? 0);
        const dayChange =
          h.ltp != null && h.previousClosingPrice != null
            ? h.qty * (h.ltp - h.previousClosingPrice)
            : 0;
        snapRows.push({
          accountId: seed.meta.id,
          accountName: seed.meta.name,
          symbol: h.symbol,
          name: h.name,
          qty: h.qty,
          wacc: h.wacc,
          ltp: h.ltp,
          previousClosingPrice: h.previousClosingPrice,
          value,
          dayChange,
        });
      }
    }

    await saveBulkPortfolioSnapshot({
      updatedAt: new Date().toISOString(),
      totalValue: snapRows.reduce((s, r) => s + r.value, 0),
      dayChange: snapRows.reduce((s, r) => s + r.dayChange, 0),
      accounts: seeds.length,
      holdings: snapRows.length,
      rows: snapRows,
    });

    setAccounts(await loadAccountMeta());
  }, []);

  const removeMockAccounts = useCallback(async () => {
    const list = await loadAccountMeta();
    const mocks = list.filter((a) => isMockAccountId(a.id));
    if (mocks.length) {
      setAccounts(await removeAccountsFullyMany(mocks.map((a) => a.id)));
    } else {
      setAccounts(list);
    }
  }, []);

  const clearAll = useCallback(async () => {
    await clearAllAccounts();
    setAccounts([]);
    setDraft(null);
  }, [setDraft]);

  const reorderAccounts = useCallback(async (orderedIds: string[]) => {
    setAccounts(await reorderAccountMeta(orderedIds));
  }, []);

  const updateAccountMeta = useCallback(
    async (id: string, patch: Partial<Omit<AccountMeta, 'id'>>) => {
      setAccounts(await patchAccountMeta(id, patch));
    },
    [],
  );

  const updateAccount = useCallback(
    async (
      id: string,
      patch: Partial<Omit<AccountMeta, 'id'>>,
      secrets?: Partial<AccountSecrets>,
    ) => {
      const list = await loadAccountMeta();
      const current = list.find((a) => a.id === id);
      const crn =
        secrets?.crn ?? (await getSecrets(id))?.crn ?? '';
      const hit = await findDuplicateAccountAsync({
        accounts: list,
        excludeId: id,
        candidate: {
          username: patch.username ?? current?.username,
          dpId: patch.dpId ?? current?.dpId,
          dpCode: patch.dpCode ?? current?.dpCode,
          demat: patch.demat ?? current?.demat,
          crn,
        },
        loadCrn: async (accId) => (await getSecrets(accId))?.crn,
      });
      if (hit) throw new DuplicateAccountError(hit);
      if (secrets && Object.keys(secrets).length) {
        await updateAccountSecrets(id, secrets);
      }
      setAccounts(await patchAccountMeta(id, patch));
    },
    [],
  );

  const loadSecrets = useCallback(async (id: string) => {
    return getSecrets(id);
  }, []);

  const value = useMemo(
    () => ({
      accounts,
      loading,
      reloadAccounts,
      draft,
      setDraft,
      addAccount,
      removeAccount,
      clearAll,
      reorderAccounts,
      updateAccountMeta,
      updateAccount,
      loadSecrets,
      seedMockAccounts,
      removeMockAccounts,
    }),
    [
      accounts,
      loading,
      reloadAccounts,
      draft,
      addAccount,
      removeAccount,
      clearAll,
      reorderAccounts,
      updateAccountMeta,
      updateAccount,
      loadSecrets,
      seedMockAccounts,
      removeMockAccounts,
    ],
  );

  return (
    <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error('useAccounts must be used within AccountsProvider');
  return ctx;
}
