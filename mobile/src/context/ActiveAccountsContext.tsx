import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState } from 'react-native';
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
  reportAccountSlots,
  getLastSlotStatus,
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
  const { maxAccounts, refresh: refreshSubscription } = useSubscription();
  const auth = useAuth();
  const [stored, setStored] = useState<ActiveSlotsStored | null>(null);
  const [syncReady, setSyncReady] = useState(false);
  const [claimedTotal, setClaimedTotal] = useState(0);
  const [syncTick, setSyncTick] = useState(0);
  const signedIn = Boolean(AUTH_ENABLED && auth.user?.id && !auth.loading);
  const prevAccountsRef = useRef<AccountMeta[] | null>(null);

  const refreshClaimed = useCallback(async () => {
    if (!signedIn) {
      setClaimedTotal(accounts.length);
      return accounts.length;
    }
    const status = await reportAccountSlots(accounts.length);
    const total = status?.claimedTotal ?? getLastSlotStatus()?.claimedTotal ?? accounts.length;
    setClaimedTotal(total);
    return total;
  }, [accounts.length, signedIn]);

  useEffect(() => {
    let mounted = true;
    setSyncReady(false);
    void (async () => {
      // Pick up admin limit changes before deciding over-quota.
      if (signedIn) {
        try {
          await refreshSubscription();
        } catch {
          // keep going with cached max
        }
      }

      const local = await loadActiveSlots();
      const claimed = await refreshClaimed();
      if (!mounted) return;

      if (!signedIn) {
        // Drop stale local lock if the plan cap changed.
        if (
          local &&
          local.confirmedForMax > 0 &&
          local.confirmedForMax !== maxAccounts
        ) {
          await clearActiveSlots();
          setStored(null);
        } else {
          setStored(local);
        }
        setSyncReady(true);
        return;
      }

      const remote = await fetchSharedActiveAccounts();
      if (!mounted) return;

      const liveMax = remote?.maxAccounts || maxAccounts;

      // Server says no valid lock for this cap (admin reduced limit, etc.).
      if (
        remote &&
        (remote.keys.length === 0 ||
          remote.confirmedForMax !== liveMax ||
          remote.keys.length > liveMax)
      ) {
        if (local) await clearActiveSlots();
        if (mounted) {
          setStored(null);
          setSyncReady(true);
        }
        return;
      }

      if (
        remote &&
        remote.keys.length > 0 &&
        remote.confirmedForMax === liveMax &&
        remote.keys.length <= liveMax &&
        !isUnlimitedAccountLimit(liveMax)
      ) {
        const ids = idsMatchingFingerprints(accounts, remote.keys);
        const next: ActiveSlotsStored = {
          ids,
          keys: remote.keys,
          confirmedForMax: remote.confirmedForMax,
        };
        await saveActiveSlots(next.ids, next.confirmedForMax, next.keys);
        if (mounted) {
          setStored(next);
          setSyncReady(true);
        }
        return;
      }

      // Only migrate a local set that matches the LIVE cap and is under quota.
      if (
        remote &&
        remote.keys.length === 0 &&
        local &&
        local.confirmedForMax === maxAccounts &&
        accounts.length > 0 &&
        claimed <= maxAccounts &&
        !isUnlimitedAccountLimit(maxAccounts)
      ) {
        const migrateKeys =
          local.keys?.length
            ? local.keys
            : keysForAccountIds(accounts, local.ids);
        if (
          migrateKeys.length > 0 &&
          migrateKeys.length <= maxAccounts
        ) {
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

      if (
        local &&
        local.confirmedForMax === maxAccounts &&
        (local.keys?.length || local.ids.length)
      ) {
        if (mounted) setStored(local);
      } else {
        if (local) await clearActiveSlots();
        if (mounted) setStored(null);
      }
      if (mounted) setSyncReady(true);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, auth.loading, maxAccounts, signedIn, accounts.length, syncTick]);

  // Re-check limit + shared active set when app comes to foreground
  // (admin may have just lowered the limit).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !signedIn) return;
      void (async () => {
        try {
          await refreshSubscription();
        } catch {
          /* ignore */
        }
        setSyncTick((n) => n + 1);
      })();
    });
    return () => sub.remove();
  }, [refreshSubscription, signedIn]);

  const resolved = useMemo(
    () => resolveActiveSlots(accounts, maxAccounts, stored, claimedTotal),
    [accounts, maxAccounts, stored, claimedTotal],
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
    if (stored.confirmedForMax !== maxAccounts) return;

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
  }, [accounts, maxAccounts, signedIn, stored, syncReady]);

  const sharedKeyCount = stored?.keys?.length ?? 0;

  const isAccountActive = useCallback(
    (id: string) => {
      if (!resolved.overQuota) return true;
      // Until they pick after a limit drop, nothing is usable for apply.
      if (resolved.needsPick) return false;
      return resolved.activeIds.has(id);
    },
    [resolved.activeIds, resolved.needsPick, resolved.overQuota],
  );

  const usableAccounts = useMemo(() => {
    if (!resolved.overQuota) return accounts;
    if (resolved.needsPick) return [];
    return accounts.filter((a) => resolved.activeIds.has(a.id));
  }, [accounts, resolved.activeIds, resolved.needsPick, resolved.overQuota]);

  const saveSelection = useCallback(
    async (ids: string[]) => {
      const exist = new Set(accounts.map((a) => a.id));
      const lockedKeys = resolved.lockedKeys;
      const confirmed =
        stored != null &&
        stored.confirmedForMax === maxAccounts &&
        lockedKeys.length > 0;

      let nextIds: string[];
      if (confirmed) {
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
          await refreshClaimed();
          return;
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : 'Failed to save active accounts for this Google login.';
          // Another phone already locked the set — pull it and switch to fill mode.
          if (/already chosen|cannot pick a different|locked/i.test(msg)) {
            try {
              const remote = await fetchSharedActiveAccounts();
              if (
                remote &&
                remote.keys.length > 0 &&
                remote.confirmedForMax === maxAccounts
              ) {
                const mapped = idsMatchingFingerprints(accounts, remote.keys);
                await saveActiveSlots(
                  mapped,
                  remote.confirmedForMax,
                  remote.keys,
                );
                setStored({
                  ids: mapped,
                  keys: remote.keys,
                  confirmedForMax: remote.confirmedForMax,
                });
                Alert.alert(
                  'Set already chosen on another phone',
                  remote.keys.length >= maxAccounts
                    ? `This Google account already has ${maxAccounts} active accounts chosen on another device. Extra demats on this phone stay saved but locked.`
                    : `Another phone already started the active set (${remote.keys.length}/${maxAccounts}). You can only fill the remaining empty slots — you cannot replace their choices.`,
                );
                return;
              }
            } catch {
              /* fall through */
            }
          }
          Alert.alert('Could not sync', msg);
          throw e;
        }
      }

      await saveActiveSlots(nextIds, maxAccounts, keys);
      setStored({ ids: nextIds, keys, confirmedForMax: maxAccounts });
    },
    [
      accounts,
      maxAccounts,
      refreshClaimed,
      resolved.lockedKeys,
      signedIn,
      stored,
    ],
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
