import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
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
  dropdown?: boolean;
  onPressDropdown?: () => void;
  counter?: string;
  editable?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  maxLength?: number;
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
  dropdown,
  onPressDropdown,
  counter,
  editable = true,
  keyboardType,
  maxLength,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        {icon ? (
          <Ionicons name={icon} size={rs(16)} color={colors.textSecondary} />
        ) : null}
        <Text style={styles.label}>{label}</Text>
      </View>

      {dropdown ? (
        <Pressable style={styles.field} onPress={onPressDropdown}>
          <Text
            style={[styles.value, !value && styles.placeholder]}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
        </Pressable>
      ) : (
        <View style={styles.field}>
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
          />
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

const styles = StyleSheet.create({
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
  },
  field: {
    minHeight: rs(48),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: rs(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
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
