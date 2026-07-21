import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { PinPromptModal } from '../components/PinPromptModal';
import { PinSetupModal } from '../components/PinSetupModal';
import { PinOtpResetModal } from '../components/PinOtpResetModal';
import { AUTH_ENABLED } from '../services/auth/config';
import { hasPin, setupPin, verifyPin } from '../storage/pinStorage';
import { useAuth } from './AuthContext';

type LockPhase = 'idle' | 'setup' | 'locked' | 'unlocked';

type AppLockContextValue = {
  /** True after app PIN verified this foreground session. */
  sessionUnlocked: boolean;
  isAppLocked: boolean;
  /** Mark session unlocked after a successful PIN (e.g. sensitive action). */
  unlockSession: () => void;
};

const AppLockContext = createContext<AppLockContextValue>({
  sessionUnlocked: false,
  isAppLocked: false,
  unlockSession: () => undefined,
});

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { enabled, loading, isAuthenticated, user, signOut } = useAuth();
  const [phase, setPhase] = useState<LockPhase>('idle');
  const [pinError, setPinError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const authLockActive = enabled && AUTH_ENABLED && isAuthenticated && Boolean(user);

  useEffect(() => {
    if (loading) return;
    if (!authLockActive || !user) {
      setPhase('idle');
      setPinError('');
      return;
    }
    let mounted = true;
    (async () => {
      const exists = await hasPin(user.id);
      if (!mounted) return;
      setPhase(exists ? 'locked' : 'setup');
      setPinError('');
    })();
    return () => {
      mounted = false;
    };
  }, [loading, authLockActive, user?.id]);

  useEffect(() => {
    if (!authLockActive) return;
    let backgroundAt: number | null = null;
    const LOCK_AFTER_MS = 30 * 60 * 1000; // only re-lock after 30 min in background
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        backgroundAt = Date.now();
        return;
      }
      if (next === 'active' && backgroundAt != null) {
        const away = Date.now() - backgroundAt;
        backgroundAt = null;
        if (away >= LOCK_AFTER_MS) {
          setPhase((current) => (current === 'unlocked' ? 'locked' : current));
        }
      }
    });
    return () => sub.remove();
  }, [authLockActive]);

  const unlock = useCallback(() => {
    setPinError('');
    setPhase('unlocked');
  }, []);

  const onSetupComplete = useCallback(
    async (pin: string) => {
      if (!user) return;
      setBusy(true);
      setPinError('');
      try {
        await setupPin(pin, user.id);
        unlock();
      } catch (e) {
        setPinError(e instanceof Error ? e.message : 'Could not save PIN');
      } finally {
        setBusy(false);
      }
    },
    [unlock, user],
  );

  const onPromptSubmit = useCallback(
    async (pin: string) => {
      if (!user) return;
      setBusy(true);
      setPinError('');
      try {
        const ok = await verifyPin(pin, user.id);
        if (!ok) {
          setPinError('Incorrect PIN');
          return;
        }
        unlock();
      } catch (e) {
        setPinError(e instanceof Error ? e.message : 'PIN verification failed');
      } finally {
        setBusy(false);
      }
    },
    [unlock, user],
  );

  const value = useMemo(
    () => ({
      sessionUnlocked: phase === 'unlocked',
      isAppLocked: phase === 'locked' || phase === 'setup',
      unlockSession: unlock,
    }),
    [phase, unlock],
  );

  const showBlocker = authLockActive && phase !== 'unlocked' && phase !== 'idle';

  return (
    <AppLockContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {showBlocker ? <View style={styles.blocker} pointerEvents="none" /> : null}
      </View>
      <PinSetupModal
        visible={phase === 'setup'}
        required
        onComplete={(pin) => void onSetupComplete(pin)}
        onCancel={() => void signOut()}
      />
      <PinPromptModal
        visible={phase === 'locked'}
        title="Enter your PIN"
        subtitle="Unlock NEPSE GHAR with the 4-digit PIN you created on this device."
        busy={busy}
        error={pinError}
        onSubmit={(pin) => void onPromptSubmit(pin)}
        onCancel={() => void signOut()}
        cancelLabel="Sign out"
        onForgotPin={() => setForgotOpen(true)}
      />
      <PinOtpResetModal
        visible={forgotOpen}
        userEmail={user?.email}
        onClose={() => setForgotOpen(false)}
        onReset={() => {
          setForgotOpen(false);
          unlock();
        }}
      />
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  blocker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});
