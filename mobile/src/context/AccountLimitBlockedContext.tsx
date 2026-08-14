import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AccountLimitBlockedModal } from '../components/AccountLimitBlockedModal';
import type { SlotStatus } from '../services/accountSlots';
import {
  clearStaleReleaseAt,
  rememberStaleReleaseAt,
} from '../storage/staleReleaseTimer';

type PresentParams = {
  status: SlotStatus;
  onUpgrade?: () => void;
};

type ContextValue = {
  show: (params: PresentParams) => void;
};

const AccountLimitBlockedContext = createContext<ContextValue | null>(null);

let globalShow: ((params: PresentParams) => void) | null = null;

/** Show the limit modal from non-React code (e.g. accountLimits guard). */
export function showAccountLimitBlocked(params: PresentParams) {
  globalShow?.(params);
}

export function AccountLimitBlockedProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<SlotStatus | null>(null);
  const [onUpgrade, setOnUpgrade] = useState<(() => void) | undefined>();

  const show = useCallback((params: PresentParams) => {
    void (async () => {
      let next = params.status;
      if (next.blockReason === 'waiting_stale_release') {
        const frozen = await rememberStaleReleaseAt(
          next.releaseAt ||
            new Date(Date.now() + next.retryAfterSeconds * 1000).toISOString(),
        );
        const left = Math.max(
          0,
          Math.ceil((Date.parse(frozen) - Date.now()) / 1000),
        );
        next = {
          ...next,
          releaseAt: frozen,
          retryAfterSeconds: left,
        };
      } else {
        await clearStaleReleaseAt();
      }
      setStatus(next);
      setOnUpgrade(() => params.onUpgrade);
      setVisible(true);
    })();
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setStatus(null);
    setOnUpgrade(undefined);
  }, []);

  useEffect(() => {
    globalShow = show;
    return () => {
      if (globalShow === show) globalShow = null;
    };
  }, [show]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <AccountLimitBlockedContext.Provider value={value}>
      {children}
      <AccountLimitBlockedModal
        visible={visible}
        status={status}
        onClose={hide}
        onUpgrade={onUpgrade}
      />
    </AccountLimitBlockedContext.Provider>
  );
}

export function useAccountLimitBlocked() {
  const ctx = useContext(AccountLimitBlockedContext);
  if (!ctx) {
    throw new Error('useAccountLimitBlocked requires AccountLimitBlockedProvider');
  }
  return ctx;
}
