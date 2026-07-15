import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';

type Props = {
  title?: string;
  onMenuPress?: () => void;
  showActions?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function AppHeader({
  title = 'IPO Bulk Apply',
  onMenuPress,
  showActions = true,
  showBack = false,
  onBack,
  right,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, rs(8)) }]}>
      <View style={styles.row}>
        <Pressable
          onPress={showBack ? onBack : onMenuPress}
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Ionicons
            name={showBack ? 'arrow-back' : 'menu'}
            size={rs(24)}
            color={colors.text}
          />
        </Pressable>

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        {right ??
          (showActions ? (
            <View style={styles.actions}>
              <View style={styles.calWrap}>
                <MaterialCommunityIcons
                  name="calendar-month"
                  size={rs(20)}
                  color={colors.text}
                />
              </View>
              <View style={styles.newsWrap}>
                <Ionicons name="newspaper-outline" size={rs(18)} color={colors.text} />
                <View style={styles.dot} />
              </View>
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
    backgroundColor: colors.bgElevated,
    paddingBottom: rs(10),
    paddingHorizontal: rs(12),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: rs(44),
  },
  iconBtn: {
    width: rs(40),
    height: rs(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: rs(18),
    fontWeight: '600',
    marginLeft: rs(4),
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
  },
  actionsPlaceholder: {
    width: rs(72),
  },
  calWrap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(8),
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsWrap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(8),
    backgroundColor: colors.surfaceAlt,
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
    backgroundColor: colors.badgeNew,
  },
});
