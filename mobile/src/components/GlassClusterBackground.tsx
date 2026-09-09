import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { rs } from '../utils/responsive';

export type GlassClusterVariant = 'default' | 'apply' | 'check';

type Props = {
  variant?: GlassClusterVariant;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const VARIANT_GRADIENTS: Record<
  GlassClusterVariant,
  readonly [string, string, string, string]
> = {
  default: ['#E0F7FA', '#ECFDF5', '#F0FDFA', '#FFFFFF'],
  apply: ['#DDFCE7', '#CFFAFE', '#E0F2FE', '#F8FFFE'],
  check: ['#BAF8FF', '#CFFAFE', '#D1FAE5', '#F0FDFA'],
};

const VARIANT_BLOBS: Record<
  GlassClusterVariant,
  Array<{ top?: number; left?: number; right?: number; bottom?: number; size: number; color: string }>
> = {
  default: [
    { top: -rs(50), left: -rs(70), size: rs(220), color: 'rgba(74,222,128,0.28)' },
    { top: rs(120), right: -rs(40), size: rs(180), color: 'rgba(6,182,212,0.22)' },
    { bottom: rs(80), left: -rs(30), size: rs(160), color: 'rgba(34,197,94,0.18)' },
  ],
  apply: [
    { top: -rs(40), left: -rs(80), size: rs(240), color: 'rgba(74,222,128,0.32)' },
    { top: rs(90), right: -rs(50), size: rs(200), color: 'rgba(14,165,233,0.24)' },
    { bottom: rs(40), left: rs(20), size: rs(170), color: 'rgba(16,185,129,0.2)' },
    { bottom: -rs(30), right: -rs(20), size: rs(190), color: 'rgba(6,182,212,0.18)' },
  ],
  check: [
    { top: -rs(60), left: -rs(50), size: rs(250), color: 'rgba(6,182,212,0.35)' },
    { top: rs(60), right: -rs(70), size: rs(220), color: 'rgba(74,222,128,0.3)' },
    { bottom: rs(100), left: -rs(60), size: rs(200), color: 'rgba(34,211,238,0.22)' },
    { bottom: -rs(40), right: rs(10), size: rs(180), color: 'rgba(52,211,153,0.2)' },
  ],
};

/**
 * Soft cyan/mint cluster canvas behind glass cards (Apply / Check / Result tabs).
 */
export function GlassClusterBackground({
  variant = 'default',
  children,
  style,
}: Props) {
  const { isDark, colors } = useTheme();
  const blobs = VARIANT_BLOBS[variant];
  const gradient = VARIANT_GRADIENTS[variant];

  if (isDark) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }, style]}>
        {blobs.map((blob, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.blob,
              {
                width: blob.size,
                height: blob.size,
                borderRadius: blob.size / 2,
                backgroundColor: blob.color.replace(/[\d.]+\)$/, '0.12)'),
                top: blob.top,
                left: blob.left,
                right: blob.right,
                bottom: blob.bottom,
              },
            ]}
          />
        ))}
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={[...gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {blobs.map((blob, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.blob,
            {
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              backgroundColor: blob.color,
              top: blob.top,
              left: blob.left,
              right: blob.right,
              bottom: blob.bottom,
            },
          ]}
        />
      ))}
      <View pointerEvents="none" style={styles.waveBand} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
  },
  waveBand: {
    position: 'absolute',
    left: -rs(40),
    right: -rs(40),
    top: '38%',
    height: rs(120),
    borderRadius: rs(80),
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ rotate: '-8deg' }],
  },
});
