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
  MOCK_ACCOUNT_SEEDS,
} from '../data/mockAccounts';
import {
  addAccountWithSecrets,
  clearAllAccounts,
  getSecrets,
  loadAccountMeta,
  patchAccountMeta,
  removeAccountFully,
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
  seedMockAccounts: () => Promise<void>;
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
      const allowedMockIds = new Set(MOCK_ACCOUNT_SEEDS.map((s) => s.meta.id));
      // Drop leftover demo_* and any mock_* beyond the current 30-seed set.
      const cleaned = list.filter(
        (a) =>
          !a.id.startsWith('demo_') &&
          (!isMockAccountId(a.id) || allowedMockIds.has(a.id)),
      );
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
      const list = await loadAccountMeta();
      const keys = keysForAccountIds(list, list.map((a) => a.id));
      void syncAccountSlots(keys, list.length);
    }
  }, [setDraft]);

  const removeAccount = useCallback(async (id: string) => {
    setAccounts(await removeAccountFully(id));
    if (AUTH_ENABLED) {
      const { syncAccountSlots } = await import('../services/accountSlots');
      const { keysForAccountIds } = await import('../utils/accountFingerprint');
      const list = await loadAccountMeta();
      const keys = keysForAccountIds(list, list.map((a) => a.id));
      void syncAccountSlots(keys, list.length);
    }
  }, []);

  const seedMockAccounts = useCallback(async () => {
    const list = await loadAccountMeta();
    for (const m of list.filter((a) => isMockAccountId(a.id))) {
      await removeAccountFully(m.id);
    }
    for (const seed of MOCK_ACCOUNT_SEEDS) {
      await addAccountWithSecrets(
        { ...seed.meta, id: seed.meta.id },
        seed.secrets,
      );
    }

    // Seed saved portfolios + bulk snapshot so Investment Summary / Portfolio
    // work immediately in Expo Go without a live MeroShare login.
    const { createPortfolioWithHoldings, listPortfolios, deletePortfolio } =
      await import('../storage/portfolioStorage');
    const {
      saveBulkPortfolioSnapshot,
    } = await import('../storage/bulkPortfolioStorage');

    const existing = await listPortfolios();
    for (const p of existing.filter((x) =>
      x.name.includes('(MeroShare)') || x.name.includes('(Sample)'),
    )) {
      await deletePortfolio(p.id);
    }

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

    for (const seed of MOCK_ACCOUNT_SEEDS) {
      await createPortfolioWithHoldings(
        `${seed.meta.name} (Sample)`,
        seed.holdings.map((h) => ({
          symbol: h.symbol,
          name: h.name,
          qty: h.qty,
          wacc: h.wacc,
        })),
        seed.meta.id,
      );
      for (const h of seed.holdings) {
        const value =
          h.qty *
          (h.ltp ?? h.previousClosingPrice ?? h.wacc ?? 0);
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
      accounts: MOCK_ACCOUNT_SEEDS.length,
      holdings: snapRows.length,
      rows: snapRows,
    });

    setAccounts(await loadAccountMeta());
  }, []);

  const removeMockAccounts = useCallback(async () => {
    const list = await loadAccountMeta();
    const mocks = list.filter((a) => isMockAccountId(a.id));
    for (const m of mocks) {
      await removeAccountFully(m.id);
    }
    setAccounts(await loadAccountMeta());
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
