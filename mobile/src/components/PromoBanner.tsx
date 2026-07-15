import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';

const PROMO =
  'Esewa वा Khalti बाट भुक्तानी गरेर प्रिमियम सुविधाहरू लिनुहोस्!🌟💰';

export function PromoBanner() {
  return (
    <View style={styles.banner}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>e</Text>
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {PROMO}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.promoBanner,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(8),
    paddingHorizontal: rs(12),
    gap: rs(10),
  },
  logo: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(14),
    backgroundColor: colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: rs(14),
  },
  text: {
    flex: 1,
    color: colors.text,
    fontSize: rs(12),
    lineHeight: rs(16),
  },
});
