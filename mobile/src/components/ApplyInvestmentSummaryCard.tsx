import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { GHAR_TEAL, NEPSE_GREEN, NEPSE_NAVY } from '../theme/glassUi';
import { rs } from '../utils/responsive';
import { GlassSurface } from './GlassSurface';

const CARD_ART = require('../../assets/promo-banner-accounts.png');

type Props = {
  displayName: string;
  currentValueText: string;
  plText: string;
  hideValues: boolean;
  onToggleHide: () => void;
  onOpenSummary: () => void;
};

function SummaryChartArt() {
  return (
    <Svg width={rs(72)} height={rs(56)} viewBox="0 0 72 56">
      <Rect x="8" y="30" width="10" height="18" rx="2" fill="#06B6D4" opacity={0.9} />
      <Rect x="24" y="22" width="10" height="26" rx="2" fill="#22C55E" opacity={0.95} />
      <Rect x="40" y="14" width="10" height="34" rx="2" fill="#0EA5E9" opacity={0.9} />
      <Rect x="56" y="8" width="10" height="40" rx="2" fill="#16A34A" opacity={0.95} />
      <Path
        d="M52 6 L62 2 L58 12 Z"
        fill="#22C55E"
      />
    </Svg>
  );
}

export function ApplyInvestmentSummaryCard({
  displayName,
  currentValueText,
  plText,
  hideValues,
  onToggleHide,
  onOpenSummary,
}: Props) {
  const { isDark, colors } = useTheme();
  const ink = isDark ? colors.text : NEPSE_NAVY;
  const valueColor = isDark ? '#86EFAC' : NEPSE_GREEN;

  return (
    <GlassSurface style={styles.card} borderRadius={rs(22)} intensity={48}>
      <ImageBackground
        source={CARD_ART}
        style={styles.artOverlay}
        imageStyle={styles.artImage}
        resizeMode="cover"
        pointerEvents="none"
      />
      <View style={styles.waveDecor} pointerEvents="none" />
      <View style={styles.chartDecor} pointerEvents="none">
        <SummaryChartArt />
      </View>

      <View style={styles.topRow}>
        <View style={styles.iconGlow}>
          <LinearGradient
            colors={['#4ADE80', '#06B6D4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <MaterialCommunityIcons
              name="chart-line"
              size={rs(20)}
              color="#FFFFFF"
            />
          </LinearGradient>
        </View>

        <View style={styles.titleCol}>
          <Text style={[styles.name, { color: ink }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Total current value
          </Text>
          <Text style={[styles.value, { color: valueColor }]}>
            {currentValueText}
          </Text>
        </View>

        <View style={styles.plPill}>
          <Text style={[styles.plText, { color: ink }]}>{plText}</Text>
          <Pressable onPress={onToggleHide} hitSlop={8}>
            <Ionicons
              name={hideValues ? 'eye-off-outline' : 'eye-outline'}
              size={rs(14)}
              color={ink}
            />
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.summaryBtn} onPress={onOpenSummary}>
        <MaterialCommunityIcons
          name="chart-bar"
          size={rs(15)}
          color={isDark ? '#86EFAC' : GHAR_TEAL}
        />
        <Text style={[styles.summaryBtnText, { color: isDark ? '#86EFAC' : GHAR_TEAL }]}>
          Current Investment Summary
        </Text>
        <Ionicons
          name="chevron-forward"
          size={rs(14)}
          color={isDark ? '#86EFAC' : GHAR_TEAL}
        />
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: rs(12),
    paddingHorizontal: rs(14),
    paddingTop: rs(14),
    paddingBottom: rs(12),
    minHeight: rs(148),
  },
  artOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  artImage: {
    borderRadius: rs(22),
  },
  waveDecor: {
    position: 'absolute',
    right: -rs(10),
    bottom: -rs(16),
    width: rs(140),
    height: rs(70),
    borderTopLeftRadius: rs(60),
    borderTopRightRadius: rs(40),
    backgroundColor: 'rgba(74,222,128,0.12)',
    transform: [{ rotate: '-12deg' }],
  },
  chartDecor: {
    position: 'absolute',
    right: rs(8),
    top: rs(36),
    opacity: 0.92,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs(10),
    marginBottom: rs(12),
    paddingRight: rs(56),
  },
  iconGlow: {
    borderRadius: rs(22),
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 4,
  },
  iconGradient: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(22),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: rs(2),
  },
  name: {
    fontWeight: '800',
    fontSize: rs(13),
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  label: {
    fontSize: rs(11),
    marginTop: rs(2),
    fontWeight: '500',
  },
  value: {
    fontWeight: '800',
    fontSize: rs(26),
    letterSpacing: -0.3,
    marginTop: rs(2),
  },
  plPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: rs(14),
    paddingHorizontal: rs(8),
    paddingVertical: rs(5),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  plText: {
    fontWeight: '600',
    fontSize: rs(10),
  },
  summaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.45)',
    borderRadius: rs(22),
    paddingVertical: rs(10),
    paddingHorizontal: rs(14),
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  summaryBtnText: {
    flex: 1,
    fontWeight: '700',
    fontSize: rs(12),
    textAlign: 'center',
  },
});
