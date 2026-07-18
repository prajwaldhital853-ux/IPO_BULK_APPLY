import { useCallback, useState } from 'react';
import { hasPin, setupPin, verifyPin } from '../storage/pinStorage';
import { AUTH_ENABLED } from '../services/auth/config';
import { useAuthGate } from '../components/AuthGateSheet';

type PendingAction = () => void | Promise<void>;

export function useSensitiveAction() {
  const { enabled, isAuthenticated } = useAuthGate();
  const [setupVisible, setSetupVisible] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [pinError, setPinError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const runPending = useCallback(async (action: PendingAction) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, []);

  const afterPinVerified = useCallback(
    async (action: PendingAction) => {
      setPromptVisible(false);
      setPinError('');
      await runPending(action);
    },
    [runPending],
  );

  const requestSensitiveAction = useCallback(
    async (action: PendingAction) => {
      if (enabled && !isAuthenticated) {
        throw new Error('Sign in required');
      }
      if (!AUTH_ENABLED) {
        await action();
        return;
      }
      const exists = await hasPin();
      if (!exists) {
        setPending(() => action);
        setSetupVisible(true);
        return;
      }
      setPending(() => action);
      setPinError('');
      setPromptVisible(true);
    },
    [enabled, isAuthenticated],
  );

  const onSetupComplete = useCallback(
    async (pin: string) => {
      await setupPin(pin);
      setSetupVisible(false);
      if (pending) {
        setPromptVisible(true);
      }
    },
    [pending],
  );

  const onSetupCancel = useCallback(() => {
    setSetupVisible(false);
    setPending(null);
  }, []);

  const onPromptSubmit = useCallback(
    async (pin: string) => {
      setPinError('');
      try {
        const ok = await verifyPin(pin);
        if (!ok) {
          setPinError('Incorrect PIN');
          return;
        }
        if (pending) await afterPinVerified(pending);
      } catch (e) {
        setPinError(e instanceof Error ? e.message : 'PIN verification failed');
      }
    },
    [pending, afterPinVerified],
  );

  const onPromptCancel = useCallback(() => {
    setPromptVisible(false);
    setPinError('');
    setPending(null);
  }, []);

  return {
    requestSensitiveAction,
    setupVisible,
    promptVisible,
    pinError,
    busy,
    onSetupComplete,
    onSetupCancel,
    onPromptSubmit,
    onPromptCancel,
  };
}
