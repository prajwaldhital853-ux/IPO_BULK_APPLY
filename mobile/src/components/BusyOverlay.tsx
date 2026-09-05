import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { rs } from '../utils/responsive';

type Props = {
  visible: boolean;
  message?: string | null;
};

/**
 * Full-screen saving / loading overlay.
 * Modal-based so it renders correctly on Expo SDK 57+ (absolute overlays can show a blank gray sheet).
 */
export function BusyOverlay({ visible, message }: Props) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.bgElevated }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          {message ? (
            <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(24),
  },
  card: {
    borderRadius: rs(14),
    paddingHorizontal: rs(24),
    paddingVertical: rs(20),
    alignItems: 'center',
    gap: rs(10),
    minWidth: rs(180),
    maxWidth: '90%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  text: {
    fontSize: rs(13),
    fontWeight: '600',
    textAlign: 'center',
  },
});
