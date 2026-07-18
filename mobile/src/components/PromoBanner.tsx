import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
    backgroundColor: '#1B5E20',
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
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: rs(14),
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: rs(12),
    lineHeight: rs(16),
  },
});
