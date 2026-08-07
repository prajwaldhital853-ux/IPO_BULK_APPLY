import React, { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  placeholder?: string;
  onChangeText?: (t: string) => void;
  secure?: boolean;
  showEye?: boolean;
  onToggleEye?: () => void;
  /** Trailing action icon inside the field (e.g. calendar). */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  onPressTrailing?: () => void;
  trailingAccessibilityLabel?: string;
  dropdown?: boolean;
  onPressDropdown?: () => void;
  counter?: string;
  editable?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  maxLength?: number;
  onFocus?: TextInputProps['onFocus'];
  /** Stronger border + label contrast (Add Capital / CRN screens). */
  emphasized?: boolean;
};

export function FormField({
  icon,
  label,
  value,
  placeholder,
  onChangeText,
  secure,
  showEye,
  onToggleEye,
  trailingIcon,
  onPressTrailing,
  trailingAccessibilityLabel,
  dropdown,
  onPressDropdown,
  counter,
  editable = true,
  keyboardType,
  maxLength,
  onFocus,
  emphasized = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fieldStyle = [styles.field, emphasized && styles.fieldEmphasized];
  const labelColor = emphasized ? colors.text : colors.textSecondary;
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        {icon ? (
          <Ionicons name={icon} size={rs(16)} color={labelColor} />
        ) : null}
        <Text style={[styles.label, emphasized && styles.labelEmphasized]}>
          {label}
        </Text>
      </View>

      {dropdown ? (
        <Pressable style={fieldStyle} onPress={onPressDropdown}>
          <Text
            style={[styles.value, !value && styles.placeholder]}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>
      ) : (
        <View style={fieldStyle}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={secure}
            editable={editable}
            keyboardType={keyboardType}
            maxLength={maxLength}
            autoCapitalize="none"
            onFocus={onFocus}
          />
          {trailingIcon && onPressTrailing ? (
            <Pressable
              onPress={onPressTrailing}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={trailingAccessibilityLabel}
            >
              <Ionicons
                name={trailingIcon}
                size={rs(22)}
                color={colors.primary}
              />
            </Pressable>
          ) : null}
          {showEye ? (
            <Pressable onPress={onToggleEye} hitSlop={10}>
              <Ionicons
                name={secure ? 'eye-off-outline' : 'eye-outline'}
                size={rs(20)}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      )}
      {counter ? <Text style={styles.counter}>{counter}</Text> : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  wrap: {
    marginHorizontal: rs(16),
    marginTop: rs(14),
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    marginBottom: rs(8),
  },
  label: {
    color: colors.textSecondary,
    fontSize: rs(13),
    fontWeight: '600',
  },
  labelEmphasized: {
    color: colors.text,
    fontSize: rs(14),
    fontWeight: '700',
  },
  field: {
    minHeight: rs(48),
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: rs(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
  },
  fieldEmphasized: {
    borderWidth: 2,
    borderColor: colors.textDim,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: rs(15),
    paddingVertical: rs(10),
  },
  value: {
    flex: 1,
    color: colors.text,
    fontSize: rs(15),
  },
  placeholder: {
    color: colors.textMuted,
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.textMuted,
    fontSize: rs(11),
    marginTop: rs(4),
  },
  });
}
