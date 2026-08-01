import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

type Props = {
  /** Current tab index (0-based). */
  index: number;
  /** Total number of tabs. */
  count: number;
  /** Called when the user swipes to another tab. */
  onIndexChange: (next: number) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Disable swipe (e.g. while a modal is open). */
  enabled?: boolean;
};

/**
 * Horizontal swipe (left = next, right = previous) to change section tabs.
 * Uses activeOffsetX so vertical lists still scroll normally.
 */
export function SwipeTabGesture({
  index,
  count,
  onIndexChange,
  children,
  style,
  enabled = true,
}: Props) {
  const gesture = useMemo(() => {
    if (!enabled || count < 2) {
      return Gesture.Pan().enabled(false);
    }
    const commit = (next: number) => {
      if (next < 0 || next >= count || next === index) return;
      onIndexChange(next);
    };
    return Gesture.Pan()
      .activeOffsetX([-28, 28])
      .failOffsetY([-18, 18])
      .onEnd((e) => {
        const dx = e.translationX;
        const vx = e.velocityX;
        if (dx < -48 || vx < -600) runOnJS(commit)(index + 1);
        else if (dx > 48 || vx > 600) runOnJS(commit)(index - 1);
      });
  }, [enabled, count, index, onIndexChange]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.fill, style]}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
