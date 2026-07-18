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
    paddingHorizontal: rs(5),
    paddingVertical: rs(1),
    borderRadius: rs(3),
  },
  text: {
    color: '#FFFFFF',
    fontSize: rs(8),
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
