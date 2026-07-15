import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LinkedAccount } from '../types/account';

const STORAGE_KEY = '@nepse_ghar/accounts_v1';

type DraftCapital = {
  dpId: string;
  dpName: string;
  username: string;
  password: string;
};

type AccountsContextValue = {
  accounts: LinkedAccount[];
  loading: boolean;
  draft: DraftCapital | null;
  setDraft: (d: DraftCapital | null) => void;
  addAccount: (account: Omit<LinkedAccount, 'id'>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

const AccountsContext = createContext<AccountsContextValue | null>(null);

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftCapital | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setAccounts(JSON.parse(raw));
      } catch {
        // ignore corrupt storage in design phase
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (next: LinkedAccount[]) => {
    setAccounts(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addAccount = useCallback(
    async (account: Omit<LinkedAccount, 'id'>) => {
      const next: LinkedAccount = {
        ...account,
        id: `acc_${Date.now()}`,
        verified: true,
      };
      await persist([...accounts, next]);
      setDraft(null);
    },
    [accounts, persist],
  );

  const removeAccount = useCallback(
    async (id: string) => {
      await persist(accounts.filter((a) => a.id !== id));
    },
    [accounts, persist],
  );

  const clearAll = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const value = useMemo(
    () => ({
      accounts,
      loading,
      draft,
      setDraft,
      addAccount,
      removeAccount,
      clearAll,
    }),
    [accounts, loading, draft, addAccount, removeAccount, clearAll],
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
