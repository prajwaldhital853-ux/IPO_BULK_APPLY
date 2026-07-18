import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { verifyPin } from '../storage/pinStorage';
import { rs } from '../utils/responsive';

type Step = 'warning' | 'pin1' | 'pin2';

export function DeleteAccountModal({
  visible,
  busy,
  onClose,
  onConfirmDelete,
}: {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirmDelete: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('warning');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setStep('warning');
    setPin1('');
    setPin2('');
    setError('');
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const onContinueWarning = () => {
    setError('');
    setStep('pin1');
  };

  const onContinuePin1 = async () => {
    if (pin1.length !== 4) {
      setError('Enter your 4-digit PIN');
      return;
    }
    setError('');
    try {
      const ok = await verifyPin(pin1);
      if (!ok) {
        setError('Incorrect PIN');
        return;
      }
      setStep('pin2');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN verification failed');
    }
  };

  const onDelete = async () => {
    if (pin2.length !== 4) {
      setError('Enter your PIN again');
      return;
    }
    if (pin2 !== pin1) {
      setError('PIN entries do not match');
      return;
    }
    setError('');
    try {
      await onConfirmDelete();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete account');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {step === 'warning' ? (
            <>
              <Text style={[styles.title, { color: colors.danger }]}>Delete account?</Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                This permanently removes your Google profile from our server and deletes all
                saved MeroShare accounts, portfolio, watchlist, apply history, and PIN data from
                this device. This cannot be undone.
              </Text>
              <Pressable
                style={[styles.btn, { backgroundColor: colors.danger }]}
                onPress={onContinueWarning}
              >
                <Text style={styles.btnText}>Continue</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                {step === 'pin1' ? 'Enter PIN to continue' : 'Enter PIN again'}
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {step === 'pin2'
                  ? 'Confirm deletion by entering the same PIN one more time.'
                  : 'Enter your 4-digit PIN to authorize account deletion.'}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.borderMuted, color: colors.text }]}
                value={step === 'pin1' ? pin1 : pin2}
                onChangeText={(v) =>
                  (step === 'pin1' ? setPin1 : setPin2)(v.replace(/\D/g, '').slice(0, 4))
                }
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={colors.textSecondary}
                editable={!busy}
              />
              {error ? (
                <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
              ) : null}
              <Pressable
                style={[styles.btn, { backgroundColor: colors.danger }, busy && styles.disabled]}
                onPress={() => void (step === 'pin1' ? onContinuePin1() : onDelete())}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>
                    {step === 'pin1' ? 'Continue' : 'Delete my account'}
                  </Text>
                )}
              </Pressable>
            </>
          )}
          <Pressable onPress={close} disabled={busy}>
            <Text style={[styles.cancel, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: rs(24),
  },
  card: { borderRadius: rs(16), padding: rs(20), gap: rs(12) },
  title: { fontWeight: '800', fontSize: rs(17) },
  sub: { fontSize: rs(13), lineHeight: rs(18) },
  input: {
    borderWidth: 1,
    borderRadius: rs(10),
    paddingHorizontal: rs(14),
    paddingVertical: rs(12),
    fontSize: rs(20),
    letterSpacing: rs(8),
    textAlign: 'center',
  },
  btn: { paddingVertical: rs(14), borderRadius: rs(10), alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  disabled: { opacity: 0.7 },
  error: { fontSize: rs(12), textAlign: 'center' },
  cancel: { textAlign: 'center', fontSize: rs(13), paddingVertical: rs(8) },
});
