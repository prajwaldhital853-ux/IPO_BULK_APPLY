import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CHECK_BTN_GRADIENT } from '../theme/glassUi';
import { rs } from '../utils/responsive';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function GlassPrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: Props) {
  return (
    <Pressable
      style={[styles.wrap, (disabled || loading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      <LinearGradient
        colors={[...CHECK_BTN_GRADIENT]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.btn}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="search" size={rs(18)} color="#FFFFFF" />
            <Text style={styles.text}>{label}</Text>
            <Ionicons name="chevron-forward" size={rs(18)} color="#FFFFFF" />
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: rs(22),
    overflow: 'hidden',
    marginBottom: rs(10),
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  disabled: { opacity: 0.55 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(10),
    minHeight: rs(48),
    paddingHorizontal: rs(16),
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: rs(15),
    flex: 1,
    textAlign: 'center',
  },
});
