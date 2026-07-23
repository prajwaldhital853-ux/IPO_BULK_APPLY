import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';

export function LocalDisclaimer() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.box}>
      <Ionicons name="information-circle" size={rs(20)} color={colors.sage} />
      <Text style={styles.text}>
        We do not store your data on our server. All data is stored securely on
        your local device.
      </Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs(10),
    backgroundColor: colors.surface,
    borderRadius: rs(10),
    borderWidth: 1.5,
    borderColor: colors.sage,
    padding: rs(12),
    marginHorizontal: rs(16),
    marginTop: rs(12),
    marginBottom: rs(8),
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
