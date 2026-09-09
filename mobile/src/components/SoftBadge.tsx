import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rs } from '../utils/responsive';

type Props = {
  label: 'NEW' | 'UPDATED';
  /** Drawer = default; service grid tiles = tile (smaller than drawer, larger than tiny). */
  size?: 'default' | 'tile';
};

export function SoftBadge({ label, size = 'default' }: Props) {
  const bg = label === 'NEW' ? '#E53935' : '#FB8C00';
  const tile = size === 'tile';
  return (
    <View
      style={[
        styles.badge,
        tile ? styles.badgeTile : styles.badgeDefault,
        { backgroundColor: bg },
      ]}
    >
      <Text style={[styles.text, tile ? styles.textTile : styles.textDefault]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDefault: {
    paddingHorizontal: rs(9),
    paddingVertical: rs(4),
    borderRadius: rs(10),
    minWidth: rs(52),
  },
  badgeTile: {
    paddingHorizontal: rs(6),
    paddingVertical: rs(3),
    borderRadius: rs(8),
    minWidth: rs(38),
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 0.35,
  },
  textTile: {
    fontSize: rs(8),
    letterSpacing: 0.25,
    lineHeight: rs(10),
  },
  textDefault: {
    fontSize: rs(9),
  },
});
