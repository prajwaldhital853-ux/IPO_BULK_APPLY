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
} from '../storage/accountsStorage';
import type { AccountMeta, DraftCapital, LinkedAccount } from '../types/account';
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
  updateAccountMeta: (
    id: string,
    patch: Partial<Omit<AccountMeta, 'id'>>,
  ) => Promise<void>;
  loadSecrets: (id: string) => Promise<{
    password: string;
    crn: string;
    pin: string;
  } | null>;
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

  const clearAll = useCallback(async () => {
    await clearAllAccounts();
    setAccounts([]);
  }, []);

  const updateAccountMeta = useCallback(
    async (id: string, patch: Partial<Omit<AccountMeta, 'id'>>) => {
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
      updateAccountMeta,
      loadSecrets,
    }),
    [
      accounts,
      loading,
      reloadAccounts,
      draft,
      addAccount,
      removeAccount,
      clearAll,
      updateAccountMeta,
      loadSecrets,
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
