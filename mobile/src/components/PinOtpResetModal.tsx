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
import { sendPinResetOtp, verifyPinResetOtp } from '../services/auth/pinApi';
import { resetPinAfterVerification } from '../storage/pinStorage';
import { rs } from '../utils/responsive';

type Step = 'send' | 'otp' | 'new' | 'confirm';

export function PinOtpResetModal({
  visible,
  userEmail,
  onClose,
  onReset,
}: {
  visible: boolean;
  userEmail?: string;
  onClose: () => void;
  onReset: () => void;
}) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('send');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('send');
    setMaskedEmail('');
    setOtp('');
    setNewPin('');
    setConfirmPin('');
    setError('');
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onSendOtp = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await sendPinResetOtp();
      setMaskedEmail(res.email || userEmail || '');
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send code');
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyPinResetOtp(otp);
      setStep('new');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (newPin.length !== 4) {
      setError('Enter a 4-digit PIN');
      return;
    }
    if (confirmPin !== newPin) {
      setError('PINs do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPinAfterVerification(newPin);
      reset();
      onReset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save PIN');
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === 'send'
      ? 'Forgot PIN?'
      : step === 'otp'
        ? 'Enter verification code'
        : step === 'new'
          ? 'Create new PIN'
          : 'Confirm new PIN';

  const subtitle =
    step === 'send'
      ? `We will send a code to your Google login email${userEmail ? ` (${userEmail})` : ''}.`
      : step === 'otp'
        ? `Code sent to ${maskedEmail || 'your email'}.`
        : step === 'new'
          ? 'Choose a new 4-digit PIN.'
          : 'Enter the same PIN again.';

  const onPrimary = () => {
    if (step === 'send') void onSendOtp();
    else if (step === 'otp') void onVerifyOtp();
    else if (step === 'new') {
      if (newPin.length !== 4) {
        setError('Enter a 4-digit PIN');
        return;
      }
      setError('');
      setStep('confirm');
    } else void onSave();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{subtitle}</Text>

          {step === 'otp' ? (
            <TextInput
              style={[styles.input, { borderColor: colors.borderMuted, color: colors.text }]}
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="6-digit code"
              placeholderTextColor={colors.textSecondary}
            />
          ) : step === 'new' || step === 'confirm' ? (
            <TextInput
              style={[styles.input, { borderColor: colors.borderMuted, color: colors.text }]}
              value={step === 'new' ? newPin : confirmPin}
              onChangeText={(v) =>
                (step === 'new' ? setNewPin : setConfirmPin)(v.replace(/\D/g, '').slice(0, 4))
              }
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              placeholderTextColor={colors.textSecondary}
            />
          ) : null}

          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <Pressable
            style={[styles.btn, { backgroundColor: colors.fab }, busy && styles.disabled]}
            onPress={onPrimary}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.fabIcon} />
            ) : (
              <Text style={[styles.btnText, { color: colors.fabIcon }]}>
                {step === 'send'
                  ? 'Send code'
                  : step === 'otp'
                    ? 'Verify code'
                    : step === 'new'
                      ? 'Continue'
                      : 'Save new PIN'}
              </Text>
            )}
          </Pressable>

          {step === 'otp' ? (
            <Pressable onPress={() => void onSendOtp()} disabled={busy}>
              <Text style={[styles.link, { color: colors.primary }]}>Resend code</Text>
            </Pressable>
          ) : null}

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
    fontSize: rs(18),
    textAlign: 'center',
  },
  btn: { paddingVertical: rs(14), borderRadius: rs(10), alignItems: 'center' },
  btnText: { fontWeight: '800' },
  disabled: { opacity: 0.7 },
  error: { fontSize: rs(12), textAlign: 'center' },
  link: { textAlign: 'center', fontSize: rs(13), fontWeight: '600' },
  cancel: { textAlign: 'center', fontSize: rs(13), paddingVertical: rs(8) },
});
