import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Design reference width (typical Android phone from screenshots) */
const BASE_W = 390;

export const screenWidth = SCREEN_W;
export const screenHeight = SCREEN_H;

/** Scale size relative to phone width — keeps layout mobile-true on tablets */
export function rs(size: number): number {
  const scaled = (SCREEN_W / BASE_W) * size;
  // Clamp so tablets don’t blow up UI
  const capped = Math.min(scaled, size * 1.15);
  return Math.round(PixelRatio.roundToNearestPixel(capped));
}

export function wp(percent: number): number {
  return Math.round((SCREEN_W * percent) / 100);
}

export const isSmallPhone = SCREEN_W < 360;
export const isTablet = SCREEN_W >= 768;

export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

export const shadowSoft = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  android: { elevation: 3 },
  default: {},
});
