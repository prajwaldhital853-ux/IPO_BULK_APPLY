import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';

export function LocalDisclaimer() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () => makeStyles(colors, isDark),
    [colors, isDark],
  );
  return (
    <View style={styles.box}>
      <Ionicons
        name="information-circle"
        size={rs(22)}
        color={isDark ? colors.sage : '#1B5E20'}
      />
      <Text style={styles.text}>
        We do not store your data on our server. All data is stored securely on
        your local device.
      </Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      backgroundColor: isDark ? colors.primarySoft : '#C8E6C9',
      borderRadius: rs(16),
      paddingVertical: rs(14),
      paddingHorizontal: rs(14),
      marginHorizontal: rs(16),
      marginTop: rs(14),
      marginBottom: rs(6),
    },
    text: {
      flex: 1,
      color: colors.text,
      fontSize: rs(13),
      lineHeight: rs(18),
      fontWeight: '600',
    },
  });
}
