import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { useAccounts } from './AccountsContext';
import { useSubscription } from './SubscriptionContext';
import { useAuth } from './AuthContext';
import type { AccountMeta } from '../types/account';
import {
  clearActiveSlots,
  loadActiveSlots,
  mergeActiveKeys,
  resolveActiveSlots,
  saveActiveSlots,
  type ActiveSlotsStored,
} from '../storage/activeAccountSlots';
import {
  idsMatchingFingerprints,
  keysForAccountIds,
  accountFingerprint,
} from '../utils/accountFingerprint';
import { AUTH_ENABLED } from '../services/auth/config';
import { isUnlimitedAccountLimit } from '../storage/subscriptionStorage';
import {
  fetchSharedActiveAccounts,
  putSharedActiveAccounts,
  pruneSharedActiveAccounts,
} from '../services/accountSlots';

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
  const { accounts, loading: accountsLoading } = useAccounts();
  const { maxAccounts } = useSubscription();
  const auth = useAuth();
  const [stored, setStored] = useState<ActiveSlotsStored | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const signedIn = Boolean(AUTH_ENABLED && auth.user?.id && !auth.loading);
  const prevAccountsRef = useRef<AccountMeta[] | null>(null);

  useEffect(() => {
    let mounted = true;
    setSyncReady(false);
    void (async () => {
      const local = await loadActiveSlots();
      if (!signedIn) {
        if (mounted) {
          setStored(local);
          setSyncReady(true);
        }
        return;
      }

      const remote = await fetchSharedActiveAccounts();
      if (!mounted) return;

      const remoteCap = remote?.maxAccounts || maxAccounts;
      if (
        remote &&
        remote.keys.length > 0 &&
        !isUnlimitedAccountLimit(remoteCap)
      ) {
        const ids = idsMatchingFingerprints(accounts, remote.keys);
        const next: ActiveSlotsStored = {
          ids,
          keys: remote.keys,
          confirmedForMax: remote.confirmedForMax || remoteCap,
        };
        await saveActiveSlots(next.ids, next.confirmedForMax, next.keys);
        if (mounted) {
          setStored(next);
          setSyncReady(true);
        }
        return;
      }

      // Server empty: upload this phone's confirmed set once (first writer).
      if (
        remote &&
        remote.keys.length === 0 &&
        local &&
        accounts.length > 0 &&
        !isUnlimitedAccountLimit(maxAccounts)
      ) {
        const migrateKeys =
          local.keys?.length
            ? local.keys
            : keysForAccountIds(accounts, local.ids);
        if (migrateKeys.length > 0) {
          try {
            const saved = await putSharedActiveAccounts(migrateKeys, maxAccounts);
            const ids = idsMatchingFingerprints(accounts, saved.keys);
            const next: ActiveSlotsStored = {
              ids,
              keys: saved.keys,
              confirmedForMax: saved.confirmedForMax,
            };
            await saveActiveSlots(next.ids, next.confirmedForMax, next.keys);
            if (mounted) {
              setStored(next);
              setSyncReady(true);
            }
            return;
          } catch {
            // Another phone may have locked the set first.
          }
        }
      }

      if (local && (local.keys?.length || local.ids.length)) {
        if (mounted) setStored(local);
      } else if (mounted) {
        setStored(null);
      }
      if (mounted) setSyncReady(true);
    })();
    return () => {
      mounted = false;
    };
    // Re-fetch when sign-in or plan cap changes. Do not depend on
    // accounts.length — an empty first paint used to wipe the shared set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, auth.loading, maxAccounts, signedIn]);

  const resolved = useMemo(
    () => resolveActiveSlots(accounts, maxAccounts, stored),
    [accounts, maxAccounts, stored],
  );

  useEffect(() => {
    if (!syncReady || accountsLoading) return;
    if (resolved.overQuota || !stored) return;
    if (stored.keys?.length && signedIn) return;
    if (isUnlimitedAccountLimit(maxAccounts) || accounts.length <= maxAccounts) {
      void clearActiveSlots();
      setStored(null);
    }
  }, [
    accounts.length,
    accountsLoading,
    maxAccounts,
    resolved.overQuota,
    signedIn,
    stored,
    syncReady,
  ]);

  // When an active demat is deleted on this phone, free its shared slot.
  useEffect(() => {
    const prev = prevAccountsRef.current;
    prevAccountsRef.current = accounts;
    if (!syncReady || !prev || !stored?.keys?.length) return;

    const nowKeys = new Set(
      accounts
        .map((a) => accountFingerprint(a))
        .filter((k): k is string => Boolean(k)),
    );
    const removed = prev
      .map((a) => accountFingerprint(a))
      .filter((k): k is string => Boolean(k))
      .filter((k) => {
        const packed = stored.keys ?? [];
        const want = packed
          .flatMap((row) => row.split(';'))
          .map((p) => p.trim().toLowerCase());
        return want.includes(k) && !nowKeys.has(k);
      });
    if (!removed.length) return;

    void (async () => {
      let nextKeys = (stored.keys ?? []).filter((row) => {
        const parts = row.split(';').map((p) => p.trim().toLowerCase());
        return !parts.some((p) => removed.includes(p));
      });
      let nextConfirmed = stored.confirmedForMax;
      if (signedIn) {
        const remote = await pruneSharedActiveAccounts(removed);
        if (remote) {
          nextKeys = remote.keys;
          nextConfirmed = remote.confirmedForMax;
        }
      }
      if (!nextKeys.length) {
        await clearActiveSlots();
        setStored(null);
        return;
      }
      const ids = idsMatchingFingerprints(accounts, nextKeys);
      await saveActiveSlots(ids, nextConfirmed, nextKeys);
      setStored({ ids, keys: nextKeys, confirmedForMax: nextConfirmed });
    })();
  }, [accounts, signedIn, stored, syncReady]);

  const sharedKeyCount = stored?.keys?.length ?? 0;

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
      const lockedKeys = resolved.lockedKeys;
      const confirmed =
        stored != null &&
        (lockedKeys.length > 0 || stored.ids.some((id) => exist.has(id)));

      let nextIds: string[];
      if (confirmed && lockedKeys.length > 0) {
        const lockedLocal = idsMatchingFingerprints(accounts, lockedKeys);
        const extras = ids.filter(
          (id) => exist.has(id) && !lockedLocal.includes(id),
        );
        nextIds = [...lockedLocal, ...extras].slice(0, maxAccounts);
      } else {
        nextIds = ids.filter((id) => exist.has(id)).slice(0, maxAccounts);
      }
      if (!nextIds.length && !lockedKeys.length) return;

      const keys = mergeActiveKeys(
        accounts,
        nextIds,
        confirmed ? lockedKeys : [],
        maxAccounts,
      );
      if (!keys.length) {
        Alert.alert(
          'Missing account details',
          'Active accounts need a demat or DP + username so they can sync across your phones.',
        );
        return;
      }

      if (signedIn && !isUnlimitedAccountLimit(maxAccounts)) {
        try {
          const remote = await putSharedActiveAccounts(keys, maxAccounts);
          const mapped = idsMatchingFingerprints(accounts, remote.keys);
          await saveActiveSlots(mapped, remote.confirmedForMax, remote.keys);
          setStored({
            ids: mapped,
            keys: remote.keys,
            confirmedForMax: remote.confirmedForMax,
          });
          return;
        } catch (e) {
          Alert.alert(
            'Could not sync',
            e instanceof Error
              ? e.message
              : 'Failed to save active accounts for this Google login.',
          );
          throw e;
        }
      }

      await saveActiveSlots(nextIds, maxAccounts, keys);
      setStored({ ids: nextIds, keys, confirmedForMax: maxAccounts });
    },
    [accounts, maxAccounts, resolved.lockedKeys, signedIn, stored],
  );

  const effectiveCount =
    sharedKeyCount > 0 ? sharedKeyCount : resolved.activeIds.size;
  const waitingForSync = signedIn && !syncReady;
  const needsPick = !waitingForSync && resolved.needsPick;
  const selectionLocked =
    !waitingForSync &&
    resolved.overQuota &&
    !needsPick &&
    effectiveCount >= maxAccounts;
  const canFillSlots =
    !waitingForSync &&
    resolved.overQuota &&
    !needsPick &&
    effectiveCount < maxAccounts;
  const canEditSelection = needsPick || canFillSlots;

  const value = useMemo(
    () => ({
      overQuota: resolved.overQuota,
      needsPick,
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
      needsPick,
      resolved.activeIds,
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
