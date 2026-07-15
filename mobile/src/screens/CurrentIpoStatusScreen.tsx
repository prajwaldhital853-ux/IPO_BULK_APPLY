import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function CurrentIpoStatusScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Current IPO Status</Text>
        <Ionicons
          name="information-circle-outline"
          size={rs(22)}
          color={colors.sage}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="bank"
            size={rs(16)}
            color={colors.textSecondary}
          />
          <Text style={styles.label}>Current Opening IPO/FPO/Right</Text>
        </View>
        <Pressable style={styles.dropdown}>
          <Text style={styles.dropdownText}>No Any Opening</Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>

        <Pressable style={styles.checkBtn}>
          <Text style={styles.checkText}>Check Bulk Status</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    gap: rs(10),
    backgroundColor: colors.bgElevated,
  },
  title: { flex: 1, color: colors.text, fontSize: rs(17), fontWeight: '600' },
  body: { paddingHorizontal: rs(16), paddingTop: rs(24) },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    marginBottom: rs(10),
  },
  label: { color: colors.textSecondary, fontSize: rs(13) },
  dropdown: {
    minHeight: rs(48),
    borderRadius: rs(24),
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: rs(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: { color: colors.textMuted, fontSize: rs(14) },
  checkBtn: {
    alignSelf: 'center',
    marginTop: rs(28),
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: rs(24),
    paddingHorizontal: rs(28),
    paddingVertical: rs(10),
  },
  checkText: { color: colors.sage, fontWeight: '700', fontSize: rs(14) },
});
