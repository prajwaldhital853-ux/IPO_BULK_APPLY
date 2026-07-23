import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';

/** Amber notice when broker floorsheet is still on the prior session. */
export function PriorSessionBanner({ reason }: { reason: string | null }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const iconColor = isDark ? '#F0C14A' : '#B8860B';
  if (!reason) return null;
  return (
    <View style={styles.wrap}>
      <Ionicons name="information-circle" size={rs(16)} color={iconColor} />
      <Text style={styles.text}>{reason}</Text>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
      marginBottom: rs(10),
      marginHorizontal: rs(0),
      paddingHorizontal: rs(10),
      paddingVertical: rs(9),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: isDark ? '#8D6E32' : '#E0B44E',
      backgroundColor: isDark ? '#2A2418' : '#FFF8E7',
    },
    text: {
      flex: 1,
      color: isDark ? '#F5E6C8' : '#5C4A1F',
      fontSize: rs(11),
      lineHeight: rs(15),
      fontWeight: '600',
    },
  });
}
