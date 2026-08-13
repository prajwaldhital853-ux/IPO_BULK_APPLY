import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from './FormField';
import {
  NepaliDobPicker,
  formatDobBsLabel,
} from './NepaliDobPicker';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  formatCountdownLabel,
  formatDobTyping,
  daysUntilMajority,
  parseDobInput,
} from '../utils/minorAccount';
import { rs } from '../utils/responsive';

type Props = {
  dateOfBirth: string;
  onDateOfBirthChange: (next: string) => void;
  guardianName: string;
  onGuardianNameChange: (next: string) => void;
  /** Compact spacing when nested inside another card */
  compact?: boolean;
};

/** DOB via keypad (AD) or Nepali calendar icon — only needed if account is MINOR. */
export function MinorDobFields({
  dateOfBirth,
  onDateOfBirthChange,
  guardianName,
  onGuardianNameChange,
  compact,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const iso = parseDobInput(dateOfBirth) ?? (
    /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim()) ? dateOfBirth.trim() : null
  );
  const daysLeft = daysUntilMajority(iso);
  const isMinor = daysLeft != null && daysLeft > 0;
  const bsLabel = iso ? formatDobBsLabel(iso) : '';
  const hasPartial = Boolean(dateOfBirth.trim()) && !iso;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.label}>Date of birth</Text>
      <Text style={styles.hint}>
        If MINOR: type DOB or tap calendar. Otherwise ignore / don’t add.
      </Text>

      <FormField
        emphasized
        icon="calendar-outline"
        label="Enter DOB (AD)"
        value={dateOfBirth}
        onChangeText={(t) => onDateOfBirthChange(formatDobTyping(t))}
        placeholder="YYYY-MM-DD"
        keyboardType="number-pad"
        maxLength={10}
        trailingIcon="calendar"
        onPressTrailing={() => setPickerOpen(true)}
        trailingAccessibilityLabel="Choose from Nepali calendar"
      />

      {iso && bsLabel ? (
        <Text style={[styles.bsHint, compact && styles.bsHintCompact]}>
          {bsLabel}
        </Text>
      ) : null}

      {hasPartial ? (
        <Text style={styles.warn}>Enter a valid past date (YYYY-MM-DD).</Text>
      ) : null}

      {iso ? (
        <Pressable
          hitSlop={8}
          onPress={() => onDateOfBirthChange('')}
          style={styles.clearBtn}
        >
          <Text style={styles.clearText}>Clear DOB</Text>
        </Pressable>
      ) : null}

      {iso && isMinor ? (
        <Text style={styles.minorNote}>
          Minor · {formatCountdownLabel(daysLeft)}
        </Text>
      ) : null}

      {isMinor ? (
        <View style={styles.guardian}>
          <FormField
            emphasized
            icon="people-outline"
            label="Guardian name (optional)"
            value={guardianName}
            onChangeText={onGuardianNameChange}
            placeholder="Parent / guardian"
          />
        </View>
      ) : null}

      <NepaliDobPicker
        visible={pickerOpen}
        value={iso ?? ''}
        onSelect={(adIso) => onDateOfBirthChange(adIso)}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginHorizontal: rs(16),
      marginBottom: rs(12),
    },
    wrapCompact: {
      marginHorizontal: 0,
      marginBottom: 0,
      marginTop: rs(14),
    },
    label: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '600',
      marginBottom: rs(4),
    },
    hint: {
      color: c.danger || '#C62828',
      fontSize: rs(13),
      lineHeight: rs(18),
      fontWeight: '700',
      marginBottom: rs(10),
    },
    bsHint: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(6),
      marginHorizontal: rs(16),
    },
    bsHintCompact: {
      marginHorizontal: 0,
    },
    warn: {
      color: c.danger || '#C62828',
      fontSize: rs(12),
      fontWeight: '600',
      marginTop: rs(8),
    },
    clearBtn: {
      alignSelf: 'flex-start',
      marginTop: rs(8),
      paddingVertical: rs(2),
    },
    clearText: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '700',
    },
    minorNote: {
      color: c.danger || c.primary,
      fontSize: rs(12),
      fontWeight: '700',
      marginTop: rs(8),
    },
    guardian: {
      marginTop: rs(10),
    },
  });
}
