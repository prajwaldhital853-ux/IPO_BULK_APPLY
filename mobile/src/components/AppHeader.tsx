import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
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
  onCalendarPress,
  onNewsPress,
  onOptionsPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
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
          backgroundColor: colors.bgElevated,
          borderBottomColor: colors.borderMuted,
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

        {showLogo ? (
          <View style={styles.logoWrap}>
            <BrandLogo variant="mark" height={rs(28)} />
          </View>
        ) : null}

        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>

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
                <View style={[styles.calWrap, { backgroundColor: colors.primary }]}>
                  <MaterialCommunityIcons
                    name="calendar-month"
                    size={rs(20)}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
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
                <View
                  style={[
                    styles.newsWrap,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons name="newspaper-outline" size={rs(18)} color={colors.text} />
                  <View style={[styles.dot, { backgroundColor: colors.badgeNew }]} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    gap: rs(12),
    paddingBottom: rs(2),
  },
  actionItem: {
    alignItems: 'center',
    gap: rs(2),
    minWidth: rs(44),
  },
  actionLabel: {
    fontSize: rs(9),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  actionsPlaceholder: {
    width: rs(96),
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
