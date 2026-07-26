import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import {
  PASSWORD_REQUIREMENT_LABELS,
  getPasswordChecks,
  passwordsMatch,
} from '../utils/passwordPolicy';

export function PasswordRequirementsLive({
  password,
  confirmPassword,
  colors,
  showConfirm = true,
}: {
  password: string;
  confirmPassword?: string;
  colors: ThemeColors;
  showConfirm?: boolean;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const checks = getPasswordChecks(password);
  const hasTyped = password.length > 0;
  const confirmTyped = (confirmPassword ?? '').length > 0;
  const match = passwordsMatch(password, confirmPassword ?? '');

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Password requirements</Text>
      {PASSWORD_REQUIREMENT_LABELS.map(({ key, label }) => {
        const ok = checks[key];
        const iconColor = !hasTyped
          ? colors.textMuted
          : ok
            ? '#1f9d55'
            : colors.danger;
        return (
          <View key={key} style={styles.row}>
            <Ionicons
              name={ok && hasTyped ? 'checkmark-circle' : 'ellipse-outline'}
              size={rs(16)}
              color={iconColor}
            />
            <Text
              style={[
                styles.label,
                hasTyped && ok && styles.labelOk,
                hasTyped && !ok && styles.labelBad,
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
      {showConfirm ? (
        <View style={[styles.row, styles.confirmRow]}>
          <Ionicons
            name={
              !confirmTyped
                ? 'ellipse-outline'
                : match
                  ? 'checkmark-circle'
                  : 'close-circle'
            }
            size={rs(16)}
            color={
              !confirmTyped
                ? colors.textMuted
                : match
                  ? '#1f9d55'
                  : colors.danger
            }
          />
          <Text
            style={[
              styles.label,
              confirmTyped && match && styles.labelOk,
              confirmTyped && !match && styles.labelBad,
            ]}
          >
            {!confirmTyped
              ? 'Confirm password matches'
              : match
                ? 'Passwords match'
                : 'Passwords do not match'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: rs(4),
      marginBottom: rs(12),
      padding: rs(12),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      gap: rs(8),
    },
    title: {
      color: c.textSecondary,
      fontWeight: '700',
      fontSize: rs(12),
      marginBottom: rs(2),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    confirmRow: {
      marginTop: rs(4),
      paddingTop: rs(8),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
    },
    label: {
      color: c.textMuted,
      fontSize: rs(12),
      flex: 1,
    },
    labelOk: { color: '#1f9d55', fontWeight: '600' },
    labelBad: { color: c.danger, fontWeight: '600' },
  });
}
