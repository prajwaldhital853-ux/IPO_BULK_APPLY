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
    setStatus(params.status);
    setOnUpgrade(() => params.onUpgrade);
    setVisible(true);
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
