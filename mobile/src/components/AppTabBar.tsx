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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { pausePrefetch } from '../services/nepse/prefetchGate';
import { GHAR_GREEN, GLASS_GRADIENT, NEPSE_NAVY } from '../theme/glassUi';
import { rs } from '../utils/responsive';

const ICONS: Record<
  string,
  {
    ion?: keyof typeof Ionicons.glyphMap;
    ionOutline?: keyof typeof Ionicons.glyphMap;
    mci?: keyof typeof MaterialCommunityIcons.glyphMap;
    mciOutline?: keyof typeof MaterialCommunityIcons.glyphMap;
  }
> = {
  Home: { ion: 'home', ionOutline: 'home-outline' },
  Apply: { mci: 'bank', mciOutline: 'bank-outline' },
  Services: { ion: 'options', ionOutline: 'options-outline' },
  Check: { ion: 'checkmark-circle', ionOutline: 'checkmark-circle-outline' },
  Profile: { ion: 'person', ionOutline: 'person-outline' },
};

const SPRING = { damping: 26, stiffness: 420, mass: 0.4 };
const INK = NEPSE_NAVY;
const MUTED = '#64748B';

/** Pill height excluding safe-area inset — keep FAB/list padding in sync. */
export const FLOATING_TAB_BAR_HEIGHT = rs(52) + rs(6) + rs(5);
/** Extra lift so the pill clears the Android system navigation bar. */
export const TAB_BAR_BOTTOM_EXTRA = rs(6);
/** Gap between scroll content and the top of the floating tab bar. */
export const TAB_BAR_CONTENT_GAP = rs(14);

export function floatingTabBarClearance(bottomInset: number) {
  return (
    Math.max(bottomInset, rs(8)) +
    TAB_BAR_BOTTOM_EXTRA +
    FLOATING_TAB_BAR_HEIGHT +
    TAB_BAR_CONTENT_GAP
  );
}

function TabItem({
  label,
  focused,
  onPress,
  icon,
}: {
  label: string;
  focused: boolean;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  const progress = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, progress]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.7, 1]) }],
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
        <View style={styles.iconStage}>
          <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
            <LinearGradient
              colors={GLASS_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glowFill}
            />
          </Animated.View>
          {icon}
        </View>
        <Animated.Text
          style={[
            styles.label,
            {
              color: focused ? GHAR_GREEN : MUTED,
              fontWeight: focused ? '800' : '600',
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
        {focused ? <View style={styles.activeDot} /> : <View style={styles.activeDotSpacer} />}
      </Animated.View>
    </Pressable>
  );
}

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const iconSize = rs(20);
  const bottomPad = Math.max(insets.bottom, rs(8)) + TAB_BAR_BOTTOM_EXTRA;

  const pill = (
    <View style={[styles.pillShell, isDark && styles.pillShellDark]}>
      {Platform.OS === 'web' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? 'rgba(30,30,30,0.96)'
                : 'rgba(255,255,255,0.94)',
              borderRadius: rs(28),
            },
          ]}
        />
      ) : (
        <BlurView
          intensity={isDark ? 55 : 85}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { borderRadius: rs(28) }]}
        />
      )}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(40,40,40,0.92)', 'rgba(30,30,30,0.96)']
            : ['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.9)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: rs(28) }]}
        pointerEvents="none"
      />
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
          const ink = focused ? '#FFFFFF' : isDark ? '#B0BEC5' : INK;
          const icon = def.mci ? (
            <MaterialCommunityIcons
              name={(focused ? def.mci : def.mciOutline) ?? def.mci}
              size={iconSize}
              color={ink}
            />
          ) : (
            <Ionicons
              name={
                (focused ? def.ion : def.ionOutline) ??
                def.ion ??
                'ellipse-outline'
              }
              size={iconSize}
              color={ink}
            />
          );

          return (
            <TabItem
              key={route.key}
              label={label}
              focused={focused}
              onPress={onPress}
              icon={icon}
            />
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.outer, { paddingBottom: bottomPad }]} pointerEvents="box-none">
      {pill}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: rs(16),
    backgroundColor: 'transparent',
  },
  pillShell: {
    borderRadius: rs(28),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.98)',
    backgroundColor: 'rgba(255,255,255,0.88)',
    overflow: 'hidden',
    shadowColor: '#67E8F9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 8,
  },
  pillShellDark: {
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(30,30,30,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: rs(6),
    paddingBottom: rs(5),
    paddingHorizontal: rs(4),
    minHeight: rs(52),
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
  iconStage: {
    width: rs(40),
    height: rs(30),
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    overflow: 'hidden',
  },
  glowFill: {
    flex: 1,
    opacity: 0.95,
  },
  label: {
    fontSize: rs(9),
    marginBottom: 0,
    letterSpacing: 0.1,
  },
  activeDot: {
    width: rs(5),
    height: rs(5),
    borderRadius: rs(3),
    backgroundColor: GHAR_GREEN,
    marginTop: rs(1),
  },
  activeDotSpacer: {
    width: rs(5),
    height: rs(5),
    marginTop: rs(1),
  },
});
