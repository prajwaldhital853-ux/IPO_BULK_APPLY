import React, { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { rs } from '../utils/responsive';

const ICONS: Record<
  string,
  { ion?: keyof typeof Ionicons.glyphMap; mci?: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  Home: { ion: 'home' },
  Apply: { mci: 'bank' },
  Services: { ion: 'options' },
  Check: { ion: 'checkmark-circle-outline' },
  Profile: { ion: 'person-outline' },
};

const SPRING = { damping: 18, stiffness: 280, mass: 0.55 };

function TabItem({
  label,
  focused,
  onPress,
  icon,
  activeBg,
  activeColor,
  inactiveColor,
}: {
  label: string;
  focused: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  activeBg: string;
  activeColor: string;
  inactiveColor: string;
}) {
  const progress = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(0,0,0,0)', activeBg],
    ),
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.86, 1]) },
    ],
    opacity: interpolate(progress.value, [0, 1], [0.75, 1]),
  }));

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [inactiveColor, activeColor],
    ),
    opacity: interpolate(progress.value, [0, 1], [0.85, 1]),
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(0.92, SPRING);
      }}
      onPressOut={() => {
        press.value = withSpring(1, SPRING);
      }}
      style={styles.item}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.itemInner, wrapStyle]}>
        <Animated.View style={[styles.iconPill, pillStyle]}>{icon}</Animated.View>
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const systemNav =
    (insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? rs(48) : 0) +
    (Platform.OS === 'android' ? rs(4) : 0);

  const barBg = isDark ? colors.bgElevated : colors.primaryMid;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: barBg,
          borderTopColor: colors.borderMuted,
        },
      ]}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const color = focused ? colors.tabActive : colors.tabInactive;
          const def = ICONS[route.name] ?? {};
          const icon = def.mci ? (
            <MaterialCommunityIcons name={def.mci} size={rs(22)} color={color} />
          ) : (
            <Ionicons name={def.ion ?? 'ellipse'} size={rs(22)} color={color} />
          );

          return (
            <TabItem
              key={route.key}
              label={label}
              focused={focused}
              onPress={onPress}
              icon={icon}
              activeBg={colors.tabActiveBg}
              activeColor={colors.tabActive}
              inactiveColor={colors.tabInactive}
            />
          );
        })}
      </View>
      <View style={{ height: systemNav, backgroundColor: barBg }} />
    </View>
  );
}

const styles = StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingTop: rs(8),
      paddingBottom: rs(6),
      paddingHorizontal: rs(4),
      minHeight: rs(64),
      backgroundColor: 'transparent',
    },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  itemInner: {
    alignItems: 'center',
    gap: rs(3),
  },
  iconPill: {
    minWidth: rs(48),
    height: rs(30),
    borderRadius: rs(16),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(14),
  },
  label: {
    fontSize: rs(11),
    fontWeight: '600',
    marginBottom: rs(2),
  },
});
