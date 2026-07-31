import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  formatOfferingAmount,
  formatOfferingDateLong,
  formatOfferingUnits,
  offeringAudienceLabel,
  offeringStatusLabel,
  offeringSubscription,
  offeringTypeLabel,
  relativeFromNow,
  type PublicOffering,
} from '../../services/nepse/publicOffering';
import { rs } from '../../utils/responsive';

const OPEN_GREEN = '#2E7D32';
const CLOSE_RED = '#C62828';
const SOON_AMBER = '#EF6C00';

function Stat({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function IssueOfferingCard({
  row,
  updatedAt,
}: {
  row: PublicOffering;
  updatedAt?: number | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const status = offeringStatusLabel(row);
  const tone =
    status.tone === 'open'
      ? OPEN_GREEN
      : status.tone === 'closed'
        ? CLOSE_RED
        : SOON_AMBER;

  const live = row.cdsc;
  const symbol = live?.symbol ?? row.symbol;
  const issueManager = live?.issueManager ?? row.issueManager;
  const audience = live?.audience ?? offeringAudienceLabel(row);
  const subtitle = [live?.kind ?? offeringTypeLabel(row), audience]
    .filter(Boolean)
    .join(' - ');

  const subscription = offeringSubscription(row);
  const minInvestment =
    row.price != null ? formatOfferingAmount(row.price * 10) : '—';
  const highlightChip = subscription
    ? `${formatOfferingAmount(live?.appliedAmount ?? row.appliedAmount)} applied`
    : row.rightShareRatio
      ? `Ratio ${row.rightShareRatio}`
      : row.price != null
        ? `Rs. ${row.price.toFixed(0)} × 10 units`
        : '10 units minimum';

  const openRelative = relativeFromNow(live?.openDate ?? row.openingDate);
  const closeRelative = relativeFromNow(live?.closeDate ?? row.closingDate);
  const updatedRelative = relativeFromNow(live?.updatedAt ?? updatedAt ?? null);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>
          {live?.company ?? row.name}
          {symbol ? ` - ${symbol}` : ''}
          {subtitle ? (
            <Text style={styles.titleSub}> ({subtitle})</Text>
          ) : null}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: `${tone}1A` }]}>
          <Text style={[styles.statusText, { color: tone }]}>
            {status.label}
          </Text>
        </View>
      </View>

      <Text style={styles.manager} numberOfLines={2}>
        Issue Manager: {(issueManager || '—').toUpperCase()}
      </Text>

      <View style={styles.statRow}>
        <Stat
          label="Issued Units"
          value={formatOfferingUnits(row.units)}
          styles={styles}
        />
        {row.appliedUnits != null ? (
          <Stat
            label="Applied Units"
            value={formatOfferingUnits(row.appliedUnits)}
            styles={styles}
          />
        ) : (
          <Stat
            label="Issue Price"
            value={row.price != null ? `Rs. ${row.price.toFixed(0)}` : '—'}
            styles={styles}
          />
        )}
        {row.applicants != null ? (
          <Stat
            label="Applicants"
            value={formatOfferingUnits(row.applicants)}
            styles={styles}
          />
        ) : (
          <Stat
            label="Total Amount"
            value={formatOfferingAmount(row.totalAmount)}
            styles={styles}
          />
        )}
      </View>

      <View style={styles.highlight}>
        <Text style={styles.highlightLabel}>
          {subscription ? 'Subscription' : 'Min. Investment'}
        </Text>
        <View style={styles.highlightRow}>
          <Text style={styles.highlightValue}>
            {subscription ? subscription.label : minInvestment}
          </Text>
          <View style={styles.highlightChip}>
            <MaterialCommunityIcons
              name={subscription ? 'chart-line-variant' : 'file-document-outline'}
              size={rs(12)}
              color={OPEN_GREEN}
            />
            <Text style={styles.highlightChipText}>{highlightChip}</Text>
          </View>
        </View>
        {subscription ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, subscription.percent)}%` },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.dateRow}>
        <View style={[styles.dateBox, styles.dateBoxOpen]}>
          <Text style={[styles.dateLabel, { color: OPEN_GREEN }]}>
            Open Date
          </Text>
          <Text style={styles.dateValue}>
            {formatOfferingDateLong(live?.openDate ?? row.openingDate)}
          </Text>
          {openRelative ? (
            <Text style={styles.dateHint}>{openRelative}</Text>
          ) : null}
        </View>

        <View style={[styles.dateBox, styles.dateBoxClose]}>
          <Text style={[styles.dateLabel, { color: CLOSE_RED }]}>
            Close Date
          </Text>
          <Text style={styles.dateValue}>
            {formatOfferingDateLong(live?.closeDate ?? row.closingDate)}
          </Text>
          {closeRelative ? (
            <Text style={styles.dateHint}>{closeRelative}</Text>
          ) : null}
        </View>
      </View>

      {updatedRelative ? (
        <Text style={styles.updated}>Updated {updatedRelative}</Text>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(12),
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
    },
    title: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      lineHeight: rs(20),
    },
    titleSub: {
      color: c.textSecondary,
      fontWeight: '600',
      fontSize: rs(12),
    },
    statusPill: {
      paddingHorizontal: rs(10),
      paddingVertical: rs(3),
      borderRadius: rs(10),
    },
    statusText: { fontWeight: '800', fontSize: rs(10) },
    manager: {
      color: c.textMuted,
      fontSize: rs(11),
      lineHeight: rs(16),
      marginTop: rs(6),
    },
    statRow: {
      flexDirection: 'row',
      marginTop: rs(12),
      gap: rs(8),
    },
    stat: { flex: 1 },
    statLabel: { color: c.textMuted, fontSize: rs(10), fontWeight: '600' },
    statValue: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '800',
      marginTop: rs(3),
    },
    highlight: {
      marginTop: rs(12),
      borderRadius: rs(10),
      backgroundColor: c.primarySoft,
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
    },
    highlightLabel: {
      color: c.textSecondary,
      fontSize: rs(11),
      fontWeight: '700',
    },
    highlightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(8),
      marginTop: rs(6),
    },
    highlightValue: {
      flexShrink: 1,
      color: OPEN_GREEN,
      fontSize: rs(15),
      fontWeight: '800',
    },
    highlightChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
    },
    highlightChipText: {
      color: OPEN_GREEN,
      fontSize: rs(10),
      fontWeight: '700',
    },
    progressTrack: {
      height: rs(5),
      marginTop: rs(9),
      borderRadius: rs(3),
      backgroundColor: `${OPEN_GREEN}24`,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: rs(3),
      backgroundColor: OPEN_GREEN,
    },
    dateRow: {
      flexDirection: 'row',
      gap: rs(10),
      marginTop: rs(12),
    },
    dateBox: {
      flex: 1,
      borderWidth: 1,
      borderRadius: rs(10),
      paddingHorizontal: rs(10),
      paddingVertical: rs(8),
    },
    dateBoxOpen: {
      borderColor: `${OPEN_GREEN}55`,
      backgroundColor: `${OPEN_GREEN}0F`,
    },
    dateBoxClose: {
      borderColor: `${CLOSE_RED}55`,
      backgroundColor: `${CLOSE_RED}0F`,
    },
    dateLabel: { fontSize: rs(10), fontWeight: '800' },
    dateValue: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '800',
      marginTop: rs(4),
    },
    dateHint: {
      color: c.textMuted,
      fontSize: rs(10),
      marginTop: rs(2),
    },
    updated: {
      color: c.textMuted,
      fontSize: rs(10),
      fontStyle: 'italic',
      textAlign: 'right',
      marginTop: rs(10),
    },
  });
}
