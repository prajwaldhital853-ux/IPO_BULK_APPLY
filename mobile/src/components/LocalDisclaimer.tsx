import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';

export function LocalDisclaimer() {
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

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs(10),
    backgroundColor: colors.primarySoft,
    borderRadius: rs(10),
    padding: rs(12),
    marginHorizontal: rs(16),
    marginTop: rs(12),
    marginBottom: rs(8),
  },
  text: {
    flex: 1,
    color: colors.sage,
    fontSize: rs(13),
    lineHeight: rs(18),
  },
});
