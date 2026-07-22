import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rs } from '../utils/responsive';

type Props = { label: 'NEW' | 'UPDATED' };

export function SoftBadge({ label }: Props) {
  const bg = label === 'NEW' ? '#E53935' : '#FB8C00';
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
    color: '#FFFFFF',
    fontSize: rs(9),
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
