import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface } from './GlassSurface';
import { useTheme } from '../context/ThemeContext';
import { NEPSE_GREEN, NEPSE_NAVY } from '../theme/glassUi';
import { rs } from '../utils/responsive';

type IconKind = 'accounts' | 'ipo';

type Props = {
  label: string;
  placeholder?: boolean;
  onPress: () => void;
  disabled?: boolean;
  icon: IconKind;
  loading?: boolean;
};

export function GlassIpoPickerField({
  label,
  placeholder,
  onPress,
  disabled,
  icon,
  loading,
}: Props) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <GlassSurface style={styles.picker} borderRadius={rs(18)}>
        <View style={[styles.iconWell, isDark && styles.iconWellDark]}>
          <MaterialCommunityIcons
            name={icon === 'accounts' ? 'view-grid-outline' : 'calendar-month-outline'}
            size={rs(16)}
            color={icon === 'accounts' ? (isDark ? '#86EFAC' : NEPSE_GREEN) : isDark ? '#67E8F9' : '#1565C0'}
          />
        </View>
        <Text
          style={[
            styles.text,
            { color: isDark ? colors.text : NEPSE_NAVY },
            placeholder && styles.placeholder,
            placeholder && { color: colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="chevron-down" size={rs(16)} color={colors.textMuted} />
        )}
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    marginBottom: rs(10),
    gap: rs(10),
    minHeight: rs(48),
  },
  iconWell: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(10),
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(186,230,253,0.9)',
  },
  iconWellDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    flex: 1,
    fontWeight: '700',
    fontSize: rs(13),
    lineHeight: rs(18),
  },
  placeholder: {
    fontWeight: '600',
  },
});
