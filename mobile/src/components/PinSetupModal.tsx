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
import { rs } from '../utils/responsive';

export function PinSetupModal({
  visible,
  onComplete,
  onCancel,
}: {
  visible: boolean;
  onComplete: (pin: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setStep('enter');
    setPin('');
    setConfirm('');
    setError('');
  };

  const onNext = () => {
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter a 4-digit PIN');
      return;
    }
    setError('');
    setStep('confirm');
  };

  const onSave = () => {
    if (pin !== confirm) {
      setError('PINs do not match');
      return;
    }
    onComplete(pin);
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>Create step-up PIN</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            A 4-digit PIN protects bulk apply, result checks, and saved credentials on this device.
          </Text>
          {step === 'enter' ? (
            <>
              <TextInput
                style={[styles.input, { borderColor: colors.borderMuted, color: colors.text }]}
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={colors.textSecondary}
              />
              <Pressable style={[styles.btn, { backgroundColor: colors.fab }]} onPress={onNext}>
                <Text style={styles.btnText}>Continue</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                style={[styles.input, { borderColor: colors.borderMuted, color: colors.text }]}
                value={confirm}
                onChangeText={(v) => setConfirm(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                placeholder="Confirm PIN"
                placeholderTextColor={colors.textSecondary}
              />
              <Pressable style={[styles.btn, { backgroundColor: colors.fab }]} onPress={onSave}>
                <Text style={styles.btnText}>Save PIN</Text>
              </Pressable>
            </>
          )}
          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : null}
          <Pressable onPress={() => { reset(); onCancel(); }}>
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
  card: {
    borderRadius: rs(16),
    padding: rs(20),
    gap: rs(12),
  },
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
  btn: {
    paddingVertical: rs(14),
    borderRadius: rs(10),
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
  error: { fontSize: rs(12), textAlign: 'center' },
  cancel: { textAlign: 'center', fontSize: rs(13), paddingVertical: rs(8) },
});
