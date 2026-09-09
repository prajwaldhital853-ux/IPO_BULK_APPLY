import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NEPSE_NAVY, resultCardTheme } from '../theme/glassUi';
import type { ThemeColors } from '../theme/colors';
import type { StatusCardStyle } from '../utils/statusCardStyle';
import { rs } from '../utils/responsive';

type Props = {
  index: number;
  accountName: string;
  statusText: string;
  remarks?: string | null;
  isDark: boolean;
  colors: ThemeColors;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  statusTextColor?: string;
  /** Semantic status colors (verified / allotted / rejected). Omit for rotating IPO result themes. */
  statusCard?: StatusCardStyle;
};

export function GlassStatusResultRow({
  index,
  accountName,
  statusText,
  remarks,
  isDark,
  colors,
  icon,
  trailing,
  statusTextColor,
  statusCard,
}: Props) {
  const pastel = resultCardTheme(index, isDark);
  const ink = statusCard?.textColor ?? (isDark ? colors.text : NEPSE_NAVY);
  const cardBg = statusCard?.backgroundColor ?? pastel.bg;
  const cardBorder = statusCard?.borderColor ?? `${pastel.accent}33`;
  const badgeBg = statusCard?.iconBackground ?? pastel.accent;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
    >
      <View style={[styles.indexBadge, { backgroundColor: badgeBg }]}>
        <Text style={styles.indexText}>{index}</Text>
      </View>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: ink }]} numberOfLines={1}>
          {accountName.toUpperCase()}
        </Text>
        <Text
          style={[
            styles.status,
            { color: statusTextColor ?? ink },
          ]}
          numberOfLines={2}
        >
          {statusText}
        </Text>
        {remarks ? (
          <View
            style={[
              styles.remarkPill,
              {
                backgroundColor:
                  statusCard?.pillBackground ??
                  (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)'),
              },
            ]}
          >
            <Text
              style={[styles.remarkText, { color: ink }]}
              numberOfLines={4}
            >
              {remarks}
            </Text>
          </View>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs(8),
    borderWidth: 1,
    borderRadius: rs(16),
    paddingHorizontal: rs(10),
    paddingVertical: rs(12),
    minHeight: rs(72),
    marginBottom: rs(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  indexBadge: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(10),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rs(2),
  },
  indexText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: rs(14),
  },
  iconWrap: {
    width: rs(24),
    height: rs(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rs(6),
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    fontWeight: '800',
    fontSize: rs(13),
    lineHeight: rs(17),
    letterSpacing: 0.15,
  },
  status: {
    fontSize: rs(12),
    fontWeight: '700',
    marginTop: rs(3),
    lineHeight: rs(16),
  },
  remarkPill: {
    alignSelf: 'flex-start',
    borderRadius: rs(10),
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
    marginTop: rs(6),
  },
  remarkText: {
    fontSize: rs(11),
    fontWeight: '600',
    lineHeight: rs(15),
  },
});
