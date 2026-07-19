import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { changePin } from '../storage/pinStorage';
import { PinOtpResetModal } from './PinOtpResetModal';
import { rs } from '../utils/responsive';

type Step = 'current' | 'new' | 'confirm';

export function ChangePinModal({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const auth = useAuth();
  const [step, setStep] = useState<Step>('current');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setStep('current');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const onContinueCurrent = async () => {
    if (currentPin.length !== 4) {
      setError('Enter your current 4-digit PIN');
      return;
    }
    setError('');
    setStep('new');
  };

  const onContinueNew = async () => {
    if (newPin.length !== 4) {
      setError('Enter a new 4-digit PIN');
      return;
    }
    setError('');
    setStep('confirm');
  };

  const onSave = async () => {
    if (confirmPin !== newPin) {
      setError('New PINs do not match');
      return;
    }
    setError('');
    try {
      await changePin(currentPin, newPin);
      reset();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change PIN');
      if (e instanceof Error && e.message.includes('Current PIN')) {
        setStep('current');
        setNewPin('');
        setConfirmPin('');
      }
    }
  };

  const value =
    step === 'current' ? currentPin : step === 'new' ? newPin : confirmPin;
  const setValue =
    step === 'current'
      ? setCurrentPin
      : step === 'new'
        ? setNewPin
        : setConfirmPin;

  const title =
    step === 'current'
      ? 'Enter current PIN'
      : step === 'new'
        ? 'Create new PIN'
        : 'Confirm new PIN';

  const subtitle =
    step === 'new'
      ? 'You cannot reuse a PIN you used before on this account.'
      : step === 'confirm'
        ? 'Enter the same new PIN again.'
        : 'Verify your current PIN to continue.';

  const onPrimary = () => {
    if (step === 'current') void onContinueCurrent();
    else if (step === 'new') void onContinueNew();
    else void onSave();
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>{subtitle}</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderMuted, color: colors.text }]}
              value={value}
              onChangeText={(v) => setValue(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              placeholderTextColor={colors.textSecondary}
            />
            {error ? (
              <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
            ) : null}
            <Pressable
              style={[styles.btn, { backgroundColor: colors.fab }]}
              onPress={onPrimary}
            >
              <Text style={styles.btnText}>
                {step === 'confirm' ? 'Save new PIN' : 'Continue'}
              </Text>
            </Pressable>
            <Pressable onPress={close}>
              <Text style={[styles.cancel, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            {step === 'current' && auth.isAuthenticated ? (
              <Pressable onPress={() => setForgotOpen(true)}>
                <Text style={[styles.forgot, { color: colors.primary }]}>Forgot PIN?</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
      <PinOtpResetModal
        visible={forgotOpen}
        userEmail={auth.user?.email}
        onClose={() => setForgotOpen(false)}
        onReset={() => {
          setForgotOpen(false);
          close();
          onChanged();
        }}
      />
    </>
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
  error: { fontSize: rs(12), textAlign: 'center' },
  cancel: { textAlign: 'center', fontSize: rs(13), paddingVertical: rs(8) },
  forgot: { textAlign: 'center', fontSize: rs(13), fontWeight: '600' },
});
