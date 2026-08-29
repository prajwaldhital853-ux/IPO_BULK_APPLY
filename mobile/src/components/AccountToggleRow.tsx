import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  note: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
};

export function AccountToggleRow({
  icon,
  label,
  note,
  value,
  onValueChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.labelRow}>
          <Ionicons name={icon} size={rs(16)} color={colors.text} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor="#FFFFFF"
        />
      </View>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginHorizontal: rs(16),
      marginTop: rs(18),
      paddingBottom: rs(4),
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(12),
    },
    labelRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    label: {
      color: colors.text,
      fontSize: rs(14),
      fontWeight: '700',
      flexShrink: 1,
    },
    note: {
      marginTop: rs(6),
      color: colors.sage ?? '#1565C0',
      fontSize: rs(11),
      lineHeight: rs(15),
    },
  });
}
