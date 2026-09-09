import React from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { DEFAULT_HOME_PROMO } from '../services/app/publicSettingsApi';
import { HOME_H_PAD } from './home/homeLayout';
import { NEPSE_NAVY } from '../theme/glassUi';
import { rs } from '../utils/responsive';

export type PromoBannerArt = 'accounts' | 'market' | 'home';

type Props = {
  text?: string;
  color?: string;
  onPress?: () => void;
  /** Home Accounts / Market glass art. Other tabs omit this and keep the solid strip. */
  art?: PromoBannerArt;
};

const ART_SOURCES: Record<PromoBannerArt, number> = {
  accounts: require('../../assets/promo-banner-accounts.png'),
  market: require('../../assets/promo-banner-market.png'),
  home: require('../../assets/promo-banner-home.png'),
};

export function PromoBanner({ text, color, onPress, art }: Props) {
  const { isDark } = useTheme();
  const label = (text ?? '').trim() || DEFAULT_HOME_PROMO.text;
  const bg = (color ?? '').trim() || DEFAULT_HOME_PROMO.color;

  if (art) {
    const homeLike = art === 'home' || art === 'market';
    const lightText = isDark || homeLike;
    const textColor = lightText ? '#FFFFFF' : NEPSE_NAVY;
    const inner = (
      <ImageBackground
        source={ART_SOURCES[art]}
        style={styles.artBg}
        imageStyle={styles.artImage}
        resizeMode="cover"
      >
        {isDark ? <View style={styles.artDim} /> : null}
        <View
          style={[
            styles.artContent,
            homeLike ? styles.artContentHome : styles.artContentAccounts,
          ]}
        >
          <Text
            style={[styles.artText, { color: textColor }]}
            numberOfLines={3}
          >
            {label}
          </Text>
          {onPress ? (
            <View
              style={[
                styles.artChevron,
                { backgroundColor: lightText ? 'rgba(255,255,255,0.92)' : '#FFFFFF' },
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={rs(16)}
                color={lightText ? '#334155' : NEPSE_NAVY}
              />
            </View>
          ) : null}
        </View>
      </ImageBackground>
    );

    if (onPress) {
      return (
        <Pressable style={styles.artWrap} onPress={onPress}>
          {inner}
        </Pressable>
      );
    }
    return <View style={styles.artWrap}>{inner}</View>;
  }

  const content = (
    <>
      <View style={styles.logo}>
        <Ionicons name="person-add-outline" size={rs(16)} color="#FFFFFF" />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {label}
      </Text>
      {onPress ? (
        <Ionicons name="chevron-forward" size={rs(18)} color="#FFFFFF" />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={[styles.banner, { backgroundColor: bg }]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.banner, { backgroundColor: bg }]}>{content}</View>;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    backgroundColor: '#1B5E20',
    paddingHorizontal: rs(14),
    paddingVertical: rs(11),
  },
  logo: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(14),
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: rs(12),
    fontWeight: '700',
    lineHeight: rs(16),
  },
  artWrap: {
    marginHorizontal: HOME_H_PAD,
    marginTop: rs(8),
    marginBottom: rs(4),
    borderRadius: rs(20),
    overflow: 'hidden',
    height: rs(96),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    shadowColor: '#22D3EE',
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.32,
    shadowRadius: rs(10),
    elevation: 6,
  },
  artBg: {
    flex: 1,
    justifyContent: 'center',
  },
  artImage: {
    borderRadius: rs(18),
  },
  artDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  artContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    paddingVertical: rs(12),
  },
  artContentAccounts: {
    paddingLeft: rs(16),
    paddingRight: rs(88),
  },
  artContentHome: {
    paddingLeft: rs(72),
    paddingRight: rs(100),
  },
  artText: {
    flex: 1,
    fontSize: rs(12),
    fontWeight: '700',
    lineHeight: rs(16),
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  artChevron: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(14),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
