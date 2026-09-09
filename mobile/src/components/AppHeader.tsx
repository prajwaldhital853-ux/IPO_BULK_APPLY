import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { GHAR_TEAL, HOME_TAGLINE, NEPSE_GREEN, NEPSE_NAVY, TAB_ACTIVE_GRADIENT } from '../theme/glassUi';
import { LinearGradient } from 'expo-linear-gradient';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';
import { BrandLogo } from './BrandLogo';

type Props = {
  title?: string;
  onMenuPress?: () => void;
  showActions?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Show NEPSE GHAR mark beside title */
  showLogo?: boolean;
  /** Home-only branded header (split wordmark, tagline, glass action wells). */
  variant?: 'default' | 'branded';
  /** Glass Calendar/News wells while keeping the default title layout. */
  glassActions?: boolean;
  onCalendarPress?: () => void;
  onNewsPress?: () => void;
  /** When set, shows a 3-dot options button in the actions row. */
  onOptionsPress?: () => void;
};

export function AppHeader({
  title = 'NEPSE GHAR',
  onMenuPress,
  showActions = true,
  showBack = false,
  onBack,
  right,
  showLogo = false,
  variant = 'default',
  glassActions = false,
  onCalendarPress,
  onNewsPress,
  onOptionsPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const branded = variant === 'branded';
  const glassWells = branded || glassActions;
  const headerBg =
    glassWells && !isDark ? 'transparent' : colors.bgElevated;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const openCalendar = () => {
    if (onCalendarPress) {
      onCalendarPress();
      return;
    }
    navigation.navigate('NepseCalendar');
  };

  const openNews = () => {
    if (onNewsPress) {
      onNewsPress();
      return;
    }
    navigation.navigate('FinancialNews');
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, rs(8)),
          backgroundColor: headerBg,
          borderBottomColor: branded ? 'transparent' : colors.borderMuted,
          borderBottomWidth: branded ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={showBack ? onBack : onMenuPress}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={showBack ? 'Go back' : 'Open menu'}
        >
          <Ionicons
            name={showBack ? 'arrow-back' : 'menu'}
            size={rs(24)}
            color={colors.text}
          />
        </Pressable>

        {branded ? (
          <View style={styles.brandBlock}>
            <BrandLogo variant="mark" height={rs(28)} />
            <View style={styles.brandTextCol}>
              <Text numberOfLines={1}>
                <Text
                  style={[
                    styles.brandNepse,
                    { color: isDark ? '#86EFAC' : NEPSE_GREEN },
                  ]}
                >
                  NEPSE{' '}
                </Text>
                <Text style={styles.brandGhar}>GHAR</Text>
              </Text>
              <Text
                style={[
                  styles.tagline,
                  { color: isDark ? colors.textMuted : '#90A4AE' },
                ]}
                numberOfLines={1}
              >
                {HOME_TAGLINE}
              </Text>
            </View>
          </View>
        ) : (
          <>
            {showLogo ? (
              <View style={styles.logoWrap}>
                <BrandLogo variant="mark" height={rs(28)} />
              </View>
            ) : null}
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
          </>
        )}

        {right ??
          (showActions ? (
            <View style={styles.actions}>
              {onOptionsPress ? (
                <Pressable
                  onPress={onOptionsPress}
                  hitSlop={8}
                  style={styles.actionItem}
                  accessibilityRole="button"
                  accessibilityLabel="More options"
                >
                  <View
                    style={[
                      styles.newsWrap,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="ellipsis-vertical"
                      size={rs(18)}
                      color={colors.text}
                    />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
                    More
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={openCalendar}
                hitSlop={8}
                style={styles.actionItem}
                accessibilityRole="button"
                accessibilityLabel="NEPSE Calendar"
              >
                {glassWells ? (
                  <LinearGradient
                    colors={[...TAB_ACTIVE_GRADIENT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.actionCardLarge}
                  >
                    <MaterialCommunityIcons
                      name="calendar-month-outline"
                      size={rs(18)}
                      color="#FFFFFF"
                    />
                  </LinearGradient>
                ) : (
                  <View style={[styles.calWrap, { backgroundColor: colors.primary }]}>
                    <MaterialCommunityIcons
                      name="calendar-month"
                      size={rs(20)}
                      color="#FFFFFF"
                    />
                  </View>
                )}
                <Text
                  style={[
                    styles.actionLabel,
                    { color: isDark ? colors.textMuted : NEPSE_NAVY },
                  ]}
                >
                  Calendar
                </Text>
              </Pressable>
              <Pressable
                onPress={openNews}
                hitSlop={8}
                style={styles.actionItem}
                accessibilityRole="button"
                accessibilityLabel="Financial News"
              >
                {glassWells ? (
                  <View
                    style={[
                      styles.actionCardLarge,
                      styles.actionCardNews,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.12)'
                          : '#FFFFFF',
                        borderColor: isDark
                          ? 'rgba(255,255,255,0.16)'
                          : 'rgba(255,255,255,0.98)',
                      },
                    ]}
                  >
                    <Ionicons
                      name="newspaper-outline"
                      size={rs(17)}
                      color={isDark ? '#E2E8F0' : NEPSE_NAVY}
                    />
                    <View style={styles.newsCountBadge}>
                      <Text style={styles.newsCountText}>3</Text>
                    </View>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.newsWrap,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="newspaper-outline"
                      size={rs(18)}
                      color={colors.text}
                    />
                    <View style={[styles.dot, { backgroundColor: colors.badgeNew }]} />
                  </View>
                )}
                <Text
                  style={[
                    styles.actionLabel,
                    { color: isDark ? colors.textMuted : NEPSE_NAVY },
                  ]}
                >
                  News
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actionsPlaceholder} />
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: rs(8),
    paddingHorizontal: rs(12),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: rs(48),
  },
  iconBtn: {
    width: rs(40),
    height: rs(40),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(2),
  },
  brandBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    minWidth: 0,
    marginBottom: rs(4),
  },
  brandLogoWell: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(10),
    padding: rs(3),
    overflow: 'hidden',
  },
  brandLogoWellDark: {
    backgroundColor: '#1A1A1A',
  },
  brandTextCol: {
    flex: 1,
    minWidth: 0,
  },
  brandNepse: {
    fontSize: rs(15),
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandGhar: {
    fontSize: rs(15),
    fontWeight: '800',
    color: GHAR_TEAL,
    letterSpacing: 0.2,
  },
  tagline: {
    fontSize: rs(9),
    fontWeight: '600',
    marginTop: rs(1),
    letterSpacing: 0.2,
  },
  actionCard: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#67E8F9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 3,
  },
  actionCardLarge: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  actionCardNews: {
    shadowColor: '#94A3B8',
    borderColor: 'rgba(255,255,255,0.98)',
  },
  actionWell: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsCountBadge: {
    position: 'absolute',
    top: rs(-3),
    right: rs(-3),
    minWidth: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(3),
  },
  newsCountText: {
    color: '#FFFFFF',
    fontSize: rs(7),
    fontWeight: '800',
  },
  logoWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(8),
    paddingHorizontal: rs(4),
    paddingVertical: rs(2),
    marginRight: rs(8),
    marginBottom: rs(2),
    overflow: 'hidden',
  },
  title: {
    flex: 1,
    fontSize: rs(17),
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: rs(10),
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: rs(6),
    paddingBottom: rs(2),
    flexShrink: 0,
  },
  actionItem: {
    alignItems: 'center',
    gap: rs(1),
    minWidth: rs(36),
  },
  actionLabel: {
    fontSize: rs(9),
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  actionsPlaceholder: {
    width: rs(80),
  },
  calWrap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsWrap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(8),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: rs(4),
    right: rs(4),
    width: rs(8),
    height: rs(8),
    borderRadius: rs(4),
  },
});
