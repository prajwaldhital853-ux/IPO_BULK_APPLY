import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';

/** Placeholder for design phase — full Services grids in next drop */
export function ServicesScreen() {
  const openDrawer = useOpenDrawer();

  return (
    <View style={styles.root}>
      <AppHeader onMenuPress={openDrawer} />
      <PromoBanner />
      <View style={styles.body}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Services</Text>
        </View>
        <Text style={styles.title}>Core shell placeholder</Text>
        <Text style={styles.sub}>
          Free / MeroShare / Premium service grids will match screenshots in the
          next design drop.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(28),
  },
  pill: {
    backgroundColor: colors.teal,
    paddingHorizontal: rs(16),
    paddingVertical: rs(6),
    borderRadius: rs(16),
    marginBottom: rs(16),
  },
  pillText: { color: colors.bg, fontWeight: '800', fontSize: rs(13) },
  title: { color: colors.text, fontSize: rs(18), fontWeight: '700' },
  sub: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: rs(10),
    lineHeight: rs(20),
  },
});
