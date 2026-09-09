import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import {
  GLASS_CARD_BG,
  GLASS_CARD_BORDER,
  GLASS_CYAN_GLOW,
} from '../theme/glassUi';
import { rs } from '../utils/responsive';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  borderRadius?: number;
};

/**
 * Frosted glass panel — blur + translucent fill + soft border.
 * `style` applies to the inner content row/box (flex layout), not the outer shell.
 */
export function GlassSurface({
  children,
  style,
  intensity = 42,
  borderRadius = rs(20),
}: Props) {
  const { isDark } = useTheme();
  const radius = borderRadius;

  if (isDark) {
    return (
      <View style={[styles.darkShell, { borderRadius: radius }]}>
        {Platform.OS !== 'web' ? (
          <BlurView
            intensity={48}
            tint="dark"
            style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          />
        ) : null}
        <LinearGradient
          colors={['rgba(40,40,40,0.88)', 'rgba(28,28,28,0.78)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          pointerEvents="none"
        />
        <View style={[styles.content, style]}>{children}</View>
      </View>
    );
  }

  const shellVisual = {
    borderRadius: radius,
    borderColor: GLASS_CARD_BORDER,
    shadowColor: GLASS_CYAN_GLOW,
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.shell, shellVisual, { backgroundColor: GLASS_CARD_BG }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.82)', 'rgba(255,255,255,0.45)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          pointerEvents="none"
        />
        <View style={[styles.content, style]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.shell, shellVisual]}>
      <BlurView
        intensity={intensity}
        tint="light"
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.78)', 'rgba(255,255,255,0.42)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.35)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 3,
  },
  darkShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(30,30,30,0.75)',
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
