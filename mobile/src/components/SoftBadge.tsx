import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';

type Props = { label: 'NEW' | 'UPDATED' };

export function SoftBadge({ label }: Props) {
  const bg = label === 'NEW' ? colors.badgeNew : colors.badgeUpdated;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: rs(6),
    paddingVertical: rs(2),
    borderRadius: rs(4),
  },
  text: {
    color: colors.text,
    fontSize: rs(9),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
