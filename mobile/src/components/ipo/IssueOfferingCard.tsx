import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  formatOfferingDate,
  formatOfferingUnits,
  offeringStatusLabel,
  type PublicOffering,
} from '../../services/nepse/publicOffering';
import { rs } from '../../utils/responsive';

function GridCell({
  icon,
  label,
  value,
  colors,
  styles,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.cell}>
      <View style={styles.cellHead}>
        {icon}
        <Text style={[styles.cellLabel, { color: colors.textMuted }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.cellValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function IssueOfferingCard({ row }: { row: PublicOffering }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const status = offeringStatusLabel(row);

  const statusStyle =
    status.tone === 'open'
      ? styles.statusOpen
      : status.tone === 'soon'
        ? styles.statusSoon
        : status.tone === 'proposed'
          ? styles.statusProposed
          : styles.statusClosed;

  const statusTextStyle =
    status.tone === 'open'
      ? styles.statusTextOpen
      : status.tone === 'soon'
        ? styles.statusTextSoon
        : status.tone === 'proposed'
          ? styles.statusTextProposed
          : styles.statusTextClosed;

  return (
    <View style={styles.card}>
      <Text style={styles.title} numberOfLines={2}>
        {row.name}
      </Text>

      <View style={styles.grid}>
        <GridCell
          icon={
            <MaterialCommunityIcons
              name="chart-line"
              size={rs(13)}
              color={colors.textMuted}
            />
          }
          label="Symbol"
          value={row.symbol || '—'}
          colors={colors}
          styles={styles}
        />
        <GridCell
          icon={
            <MaterialCommunityIcons
              name="chart-bar"
              size={rs(13)}
              color={colors.textMuted}
            />
          }
          label="Issued Units"
          value={formatOfferingUnits(row.units)}
          colors={colors}
          styles={styles}
        />
        <GridCell
          icon={
            <Ionicons
              name="calendar-outline"
              size={rs(13)}
              color={colors.textMuted}
            />
          }
          label="Opening Date"
          value={formatOfferingDate(row.openingDate)}
          colors={colors}
          styles={styles}
        />
        <GridCell
          icon={
            <Ionicons
              name="time-outline"
              size={rs(13)}
              color={colors.textMuted}
            />
          }
          label="Closing Date"
          value={formatOfferingDate(row.closingDate)}
          colors={colors}
          styles={styles}
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.managerRow}>
        <Text style={styles.managerLabel}>Issue Manager:</Text>
        <Text style={styles.managerName} numberOfLines={2}>
          {row.issueManager || '—'}
        </Text>
        {row.rightShareRatio ? (
          <View style={styles.ratioBadge}>
            <Text style={styles.ratioText}>{row.rightShareRatio}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.price}>
          Issue Price:{' '}
          <Text style={styles.priceAmt}>
            Rs. {row.price != null ? row.price.toFixed(2) : '—'}
          </Text>
        </Text>
        <View style={[styles.statusPill, statusStyle]}>
          <Ionicons
            name="time-outline"
            size={rs(11)}
            color={
              status.tone === 'soon'
                ? '#FFA726'
                : status.tone === 'open'
                  ? colors.accentGreen
                  : '#EF5350'
            }
          />
          <Text style={[styles.statusText, statusTextStyle]}>{status.label}</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: '#2E5FA8',
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(12),
    },
    title: {
      color: c.tealHeader,
      fontWeight: '800',
      fontSize: rs(14),
      lineHeight: rs(19),
      marginBottom: rs(12),
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: rs(10),
    },
    cell: {
      width: '50%',
      paddingRight: rs(6),
    },
    cellHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      marginBottom: rs(3),
    },
    cellLabel: { fontSize: rs(10), fontWeight: '600' },
    cellValue: { fontSize: rs(12), fontWeight: '700' },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: rs(10),
    },
    managerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: rs(4),
      marginBottom: rs(10),
    },
    managerLabel: { color: c.textMuted, fontSize: rs(11) },
    managerName: {
      flex: 1,
      color: c.text,
      fontWeight: '700',
      fontSize: rs(11),
      minWidth: '40%',
    },
    ratioBadge: {
      backgroundColor: c.primarySoft,
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
      borderRadius: rs(8),
    },
    ratioText: { color: c.tealHeader, fontWeight: '800', fontSize: rs(10) },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(8),
    },
    price: { color: c.textSecondary, fontSize: rs(11), flex: 1 },
    priceAmt: { color: '#FFB74D', fontWeight: '800' },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      paddingHorizontal: rs(8),
      paddingVertical: rs(4),
      borderRadius: rs(12),
      borderWidth: 1,
    },
    statusOpen: { borderColor: '#4CAF5088' },
    statusSoon: { borderColor: '#FFA726' },
    statusProposed: { borderColor: c.tealHeader },
    statusClosed: { borderColor: '#EF5350' },
    statusText: { fontWeight: '800', fontSize: rs(9) },
    statusTextOpen: { color: c.accentGreen },
    statusTextSoon: { color: '#FFA726' },
    statusTextProposed: { color: c.tealHeader },
    statusTextClosed: { color: '#EF5350' },
  });
}
