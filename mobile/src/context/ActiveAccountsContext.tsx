import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAccounts } from './AccountsContext';
import { useSubscription } from './SubscriptionContext';
import { useAuth } from './AuthContext';
import type { AccountMeta } from '../types/account';
import {
  clearActiveSlots,
  loadActiveSlots,
  resolveActiveSlots,
  saveActiveSlots,
  type ActiveSlotsStored,
} from '../storage/activeAccountSlots';

type ActiveAccountsValue = {
  overQuota: boolean;
  needsPick: boolean;
  /** Confirmed set is full — cannot swap accounts. */
  selectionLocked: boolean;
  /** Confirmed but under cap (deleted an active account) — can add only. */
  canFillSlots: boolean;
  canEditSelection: boolean;
  maxAccounts: number;
  activeIds: Set<string>;
  suggestedIds: string[];
  isAccountActive: (id: string) => boolean;
  usableAccounts: AccountMeta[];
  saveSelection: (ids: string[]) => Promise<void>;
};

const ActiveAccountsContext = createContext<ActiveAccountsValue | null>(null);

export function ActiveAccountsProvider({ children }: { children: React.ReactNode }) {
  const { accounts } = useAccounts();
  const { maxAccounts } = useSubscription();
  const auth = useAuth();
  const [stored, setStored] = useState<ActiveSlotsStored | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const loaded = await loadActiveSlots();
      if (mounted) setStored(loaded);
    })();
    return () => {
      mounted = false;
    };
  }, [auth.user?.id, auth.loading]);

  const resolved = useMemo(
    () =>
      resolveActiveSlots(
        accounts.map((a) => a.id),
        maxAccounts,
        stored,
      ),
    [accounts, maxAccounts, stored],
  );

  useEffect(() => {
    if (!resolved.overQuota && stored) {
      void clearActiveSlots();
      setStored(null);
    }
  }, [resolved.overQuota, stored]);

  const isAccountActive = useCallback(
    (id: string) => {
      if (!resolved.overQuota) return true;
      return resolved.activeIds.has(id);
    },
    [resolved.activeIds, resolved.overQuota],
  );

  const usableAccounts = useMemo(() => {
    if (!resolved.overQuota) return accounts;
    return accounts.filter((a) => resolved.activeIds.has(a.id));
  }, [accounts, resolved.activeIds, resolved.overQuota]);

  const saveSelection = useCallback(
    async (ids: string[]) => {
      const exist = new Set(accounts.map((a) => a.id));
      const confirmed =
        stored != null &&
        stored.confirmedForMax === maxAccounts &&
        stored.ids.some((id) => exist.has(id));

      let next: string[];
      if (confirmed) {
        const locked = stored!.ids.filter((id) => exist.has(id));
        const extras = ids.filter(
          (id) => exist.has(id) && !locked.includes(id),
        );
        next = [...locked, ...extras].slice(0, maxAccounts);
      } else {
        next = ids.filter((id) => exist.has(id)).slice(0, maxAccounts);
      }
      if (!next.length) return;
      await saveActiveSlots(next, maxAccounts);
      setStored({ ids: next, confirmedForMax: maxAccounts });
    },
    [accounts, maxAccounts, stored],
  );

  const selectionLocked =
    resolved.overQuota &&
    !resolved.needsPick &&
    resolved.activeIds.size >= maxAccounts;
  const canFillSlots =
    resolved.overQuota &&
    !resolved.needsPick &&
    resolved.activeIds.size < maxAccounts;
  const canEditSelection = resolved.needsPick || canFillSlots;

  const value = useMemo(
    () => ({
      overQuota: resolved.overQuota,
      needsPick: resolved.needsPick,
      selectionLocked,
      canFillSlots,
      canEditSelection,
      maxAccounts,
      activeIds: resolved.activeIds,
      suggestedIds: resolved.suggestedIds,
      isAccountActive,
      usableAccounts,
      saveSelection,
    }),
    [
      canEditSelection,
      canFillSlots,
      isAccountActive,
      maxAccounts,
      resolved.activeIds,
      resolved.needsPick,
      resolved.overQuota,
      resolved.suggestedIds,
      saveSelection,
      selectionLocked,
      usableAccounts,
    ],
  );

  return (
    <ActiveAccountsContext.Provider value={value}>
      {children}
    </ActiveAccountsContext.Provider>
  );
}

export function useActiveAccounts(): ActiveAccountsValue {
  const ctx = useContext(ActiveAccountsContext);
  if (!ctx) {
    throw new Error('useActiveAccounts must be used within ActiveAccountsProvider');
  }
  return ctx;
}
