import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
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
import { keysForAccountIds } from '../utils/accountFingerprint';
import { isMockAccountId } from '../data/mockAccounts';
import { AUTH_ENABLED } from '../services/auth/config';
import { isUnlimitedAccountLimit } from '../storage/subscriptionStorage';
import { syncAccountSlots } from '../services/accountSlots';

/** How often a foreground app re-checks the shared set (admin/other phone changes). */
const POLL_MS = 3 * 60 * 1000;

type ActiveAccountsValue = {
  /** This phone holds demats that the plan cap keeps locked. */
  overQuota: boolean;
  /** The active set is fixed by the plan — nobody picks it. */
  selectionLocked: boolean;
  maxAccounts: number;
  activeIds: Set<string>;
  lockedIds: string[];
  /** Active demats across every phone on this Google account. */
  activeCount: number;
  /** Unique demats saved across every phone. */
  claimedTotal: number;
  isAccountActive: (id: string) => boolean;
  usableAccounts: AccountMeta[];
  refresh: () => Promise<void>;
};

const ActiveAccountsContext = createContext<ActiveAccountsValue | null>(null);

export function ActiveAccountsProvider({ children }: { children: React.ReactNode }) {
  const { accounts } = useAccounts();
  const { maxAccounts, refresh: refreshSubscription } = useSubscription();
  const auth = useAuth();
  const [stored, setStored] = useState<ActiveSlotsStored | null>(null);
  const [serverMax, setServerMax] = useState<number | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const signedIn = Boolean(AUTH_ENABLED && auth.user?.id && !auth.loading);

  const realAccounts = useMemo(
    () => accounts.filter((a) => !isMockAccountId(a.id)),
    [accounts],
  );
  const keys = useMemo(
    () => keysForAccountIds(realAccounts, realAccounts.map((a) => a.id)),
    [realAccounts],
  );
  const keySig = keys.join('|');

  const refresh = useCallback(async () => {
    setSyncTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!signedIn) {
        // Guest: cap is enforced locally with the same oldest-first rule.
        if (mounted) {
          setServerMax(null);
          setStored(null);
        }
        return;
      }

      try {
        await refreshSubscription();
      } catch {
        // keep going with the cached cap
      }

      const status = await syncAccountSlots(keys, realAccounts.length);
      if (!mounted) return;
      if (!status) {
        const cached = await loadActiveSlots();
        if (mounted && cached) setStored(cached);
        return;
      }

      setServerMax(status.maxAccounts);
      if (isUnlimitedAccountLimit(status.maxAccounts)) {
        await clearActiveSlots();
        if (mounted) setStored(null);
        return;
      }
      const next: ActiveSlotsStored = {
        keys: status.activeKeys,
        maxAccounts: status.maxAccounts,
        total: status.claimedTotal,
      };
      if (next.keys.length || next.total > 0) {
        await saveActiveSlots(next);
        if (mounted) setStored(next);
      } else {
        await clearActiveSlots();
        if (mounted) setStored(null);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, auth.loading, signedIn, keySig, maxAccounts, syncTick]);

  // Admin limit changes and edits on another phone must land here too.
  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, POLL_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [refresh, signedIn]);

  const effectiveMax = serverMax != null && serverMax > 0 ? serverMax : maxAccounts;

  const resolved = useMemo(
    () => resolveActiveSlots(realAccounts, effectiveMax, stored),
    [realAccounts, effectiveMax, stored],
  );

  const isAccountActive = useCallback(
    (id: string) =>
      isMockAccountId(id) || !resolved.overQuota || resolved.activeIds.has(id),
    [resolved.activeIds, resolved.overQuota],
  );

  const usableAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          isMockAccountId(a.id) ||
          !resolved.overQuota ||
          resolved.activeIds.has(a.id),
      ),
    [accounts, resolved.activeIds, resolved.overQuota],
  );

  const value = useMemo(
    () => ({
      overQuota: resolved.overQuota,
      selectionLocked: resolved.overQuota,
      maxAccounts: effectiveMax,
      activeIds: resolved.activeIds,
      lockedIds: resolved.lockedIds,
      activeCount: resolved.activeCount,
      claimedTotal: resolved.total,
      isAccountActive,
      usableAccounts,
      refresh,
    }),
    [
      effectiveMax,
      isAccountActive,
      refresh,
      resolved.activeCount,
      resolved.activeIds,
      resolved.lockedIds,
      resolved.overQuota,
      resolved.total,
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
