import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
import type {
  AccountMeta,
  AccountSecrets,
  DraftCapital,
  LinkedAccount,
} from '../types/account';
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
  /** Dev-only: append fake accounts to test list scrolling. */
  addDemoAccounts: (count: number) => Promise<void>;
  /** Dev-only: remove accounts created by addDemoAccounts. */
  removeDemoAccounts: () => Promise<void>;
};

const AccountsContext = createContext<AccountsContextValue | null>(null);

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [accounts, setAccounts] = useState<AccountMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftCapital | null>(null);

  const reloadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await loadAccountMeta());
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
  }, []);

  const removeAccount = useCallback(async (id: string) => {
    setAccounts(await removeAccountFully(id));
  }, []);

  const addDemoAccounts = useCallback(async (count: number) => {
    const list = await loadAccountMeta();
    const base = list.length;
    const demo: AccountMeta[] = Array.from({ length: count }, (_, i) => {
      const n = base + i + 1;
      const username = String(10000000 + n);
      return {
        id: `demo_${Date.now()}_${i}`,
        name: `DEMO USER ${n}`,
        dpId: '13700',
        dpCode: '13700',
        dpName: 'DEMO CAPITAL LTD',
        username,
        bankName: 'DEMO BANK LTD',
        accountNumber: `0600${String(1000000000 + n)}`,
        verified: true,
        demat: `13013700${username}`,
        boidHint: username.slice(-4),
      };
    });
    await saveAccountMeta([...list, ...demo]);
    setAccounts(await loadAccountMeta());
  }, []);

  const removeDemoAccounts = useCallback(async () => {
    const list = await loadAccountMeta();
    await saveAccountMeta(list.filter((a) => !a.id.startsWith('demo_')));
    setAccounts(await loadAccountMeta());
  }, []);

  const clearAll = useCallback(async () => {
    await clearAllAccounts();
    setAccounts([]);
  }, []);

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
      addDemoAccounts,
      removeDemoAccounts,
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
      addDemoAccounts,
      removeDemoAccounts,
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
