import React, { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
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
import { pausePrefetch } from '../services/nepse/prefetchGate';
import { rs } from '../utils/responsive';

const ICONS: Record<
  string,
  { ion?: keyof typeof Ionicons.glyphMap; mci?: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  Home: { ion: 'home' },
  Apply: { mci: 'bank-outline' },
  Services: { ion: 'options-outline' },
  Check: { ion: 'checkmark-circle-outline' },
  Profile: { ion: 'person-outline' },
};

const SPRING = { damping: 26, stiffness: 420, mass: 0.4 };

function TabItem({
  label,
  focused,
  onPress,
  icon,
  activeBg,
  ink,
}: {
  label: string;
  focused: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  activeBg: string;
  ink: string;
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
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.92, 1]) }],
  }));

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
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
        <Animated.Text
          style={[
            styles.label,
            { color: ink, fontWeight: focused ? '800' : '700' },
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const systemNav = Math.max(
    Platform.OS === 'android' ? rs(6) : 0,
    (insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? rs(36) : 0) -
      (Platform.OS === 'android' ? rs(10) : 0),
  );

  const barBg = isDark ? '#252724' : '#F8FBF2';
  const ink = isDark ? '#F2F2F2' : '#000000';
  const pill = isDark ? '#3A5340' : '#C5DCC8';
  const iconSize = rs(24);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: barBg,
          borderTopColor: isDark ? '#3A3A3A' : '#E0E0DC',
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
              pausePrefetch(2500);
              navigation.jumpTo(route.name);
            }
          };

          const def = ICONS[route.name] ?? {};
          const icon = def.mci ? (
            <MaterialCommunityIcons name={def.mci} size={iconSize} color={ink} />
          ) : (
            <Ionicons name={def.ion ?? 'ellipse-outline'} size={iconSize} color={ink} />
          );

          return (
            <TabItem
              key={route.key}
              label={label}
              focused={focused}
              onPress={onPress}
              icon={icon}
              activeBg={pill}
              ink={ink}
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
    paddingTop: rs(4),
    paddingBottom: rs(2),
    paddingHorizontal: rs(2),
    minHeight: rs(58),
    backgroundColor: 'transparent',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  itemInner: {
    alignItems: 'center',
    gap: rs(2),
  },
  iconPill: {
    minWidth: rs(58),
    height: rs(32),
    borderRadius: rs(16),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(14),
  },
  label: {
    fontSize: rs(12),
    marginBottom: 0,
    letterSpacing: 0.1,
  },
});
