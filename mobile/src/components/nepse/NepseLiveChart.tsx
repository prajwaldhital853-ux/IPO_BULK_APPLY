import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import type { ChartPoint } from '../../services/nepse';
import { rs } from '../../utils/responsive';

type Props = {
  points: ChartPoint[];
  colors: ThemeColors;
};

export function NepseLiveChart({ points, colors }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { bars, labels } = useMemo(() => {
    if (points.length < 2) return { bars: [] as number[], labels: [] as string[] };
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const bars = values.map((v) => ((v - min) / span) * 100);
    const step = Math.max(1, Math.floor(points.length / 5));
    const labels = points
      .filter((_, i) => i % step === 0 || i === points.length - 1)
      .map((p) => p.label);
    return { bars, labels };
  }, [points]);

  if (bars.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Chart unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.plot}>
        {bars.map((h, i) => (
          <View key={`bar-${i}`} style={styles.col}>
            <View style={[styles.fill, { height: `${Math.max(8, h)}%` }]} />
            <View style={[styles.dot, { bottom: `${Math.max(8, h)}%` }]} />
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {labels.map((label) => (
          <Text key={label} style={styles.label}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      height: rs(170),
      marginTop: rs(8),
    },
    plot: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      paddingHorizontal: rs(4),
    },
    col: {
      flex: 1,
      height: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
      position: 'relative',
    },
    fill: {
      width: '88%',
      backgroundColor: c.primarySoft,
      borderTopLeftRadius: rs(2),
      borderTopRightRadius: rs(2),
      opacity: 0.85,
    },
    dot: {
      position: 'absolute',
      width: rs(5),
      height: rs(5),
      borderRadius: rs(3),
      backgroundColor: c.accentGreen,
      marginBottom: -rs(2),
    },
    labels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: rs(6),
      paddingHorizontal: rs(2),
    },
    label: {
      color: c.textMuted,
      fontSize: rs(9),
    },
    empty: {
      height: rs(120),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderMuted,
      borderRadius: rs(8),
      marginTop: rs(8),
    },
    emptyText: {
      color: c.textMuted,
      fontSize: rs(12),
    },
  });
}
