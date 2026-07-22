import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rs } from '../utils/responsive';

const PROMO =
  'Add your MeroShare account to bulk apply for IPOs — tap here to get started';

type Props = {
  onPress?: () => void;
};

export function PromoBanner({ onPress }: Props) {
  const content = (
    <>
      <View style={styles.logo}>
        <Ionicons name="person-add-outline" size={rs(16)} color="#FFFFFF" />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {PROMO}
      </Text>
      {onPress ? (
        <Ionicons name="chevron-forward" size={rs(18)} color="#FFFFFF" />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.banner} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.banner}>{content}</View>;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    backgroundColor: '#1B5E20',
    paddingHorizontal: rs(14),
    paddingVertical: rs(11),
  },
  logo: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(14),
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: rs(12),
    fontWeight: '700',
    lineHeight: rs(16),
  },
});
