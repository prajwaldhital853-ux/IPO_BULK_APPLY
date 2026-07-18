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
import { rs } from '../utils/responsive';

export function PinPromptModal({
  visible,
  title = 'Enter PIN',
  subtitle = 'Confirm this sensitive action with your 4-digit PIN.',
  busy = false,
  error,
  onSubmit,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  busy?: boolean;
  error?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const { colors } = useTheme();
  const [pin, setPin] = useState('');

  const submit = () => {
    if (pin.length === 4) onSubmit(pin);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onShow={() => setPin('')}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{subtitle}</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.borderMuted, color: colors.text }]}
            value={pin}
            onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
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
            style={[styles.btn, { backgroundColor: colors.fab }, busy && styles.disabled]}
            onPress={submit}
            disabled={busy || pin.length !== 4}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Confirm</Text>
            )}
          </Pressable>
          <Pressable onPress={onCancel} disabled={busy}>
            <Text style={[styles.cancel, { color: colors.textSecondary }]}>{cancelLabel}</Text>
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
  disabled: { opacity: 0.7 },
  error: { fontSize: rs(12), textAlign: 'center' },
  cancel: { textAlign: 'center', fontSize: rs(13), paddingVertical: rs(8) },
});
