import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';

export type AppPressVariant = 'scale' | 'pushDown';

type Props = PressableProps & {
  loading?: boolean;
  loadingColor?: string;
  /** When true, spinner replaces children while loading. */
  loadingReplacesContent?: boolean;
  pressEffect?: boolean;
  /** scale = shrink; pushDown = button moves down like a physical press. */
  pressVariant?: AppPressVariant;
  pushOffset?: number;
  style?: StyleProp<ViewStyle>;
};

export function AppPressable({
  loading = false,
  loadingColor = '#FFFFFF',
  loadingReplacesContent = false,
  pressEffect = true,
  pressVariant = 'scale',
  pushOffset = 3,
  disabled,
  style,
  children,
  ...rest
}: Props) {
  const inactive = Boolean(disabled || loading);

  return (
    <Pressable
      {...rest}
      disabled={inactive}
      style={({ pressed }) => {
        const showPressedLook =
          pressEffect &&
          !disabled &&
          (pressed || (loading && pressVariant === 'pushDown'));
        return [
          style,
          showPressedLook &&
            (pressVariant === 'pushDown'
              ? {
                  transform: [{ translateY: pushOffset }],
                  opacity: 0.92,
                }
              : styles.pressedScale),
          disabled && styles.disabled,
        ];
      }}
    >
      {loading && loadingReplacesContent ? (
        <ActivityIndicator color={loadingColor} />
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressedScale: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.58,
  },
});
