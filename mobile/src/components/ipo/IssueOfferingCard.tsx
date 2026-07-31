import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  loadOfferingDetail,
  peekOfferingDetail,
  type OfferingDetailStats,
} from '../../services/nepse/offeringDetail';
import {
  formatOfferingAmount,
  formatOfferingDateLong,
  formatOfferingUnits,
  offeringAllotmentChance,
  offeringAudienceLabel,
  offeringMinimumUnits,
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

/**
 * ShareHub's list endpoint omits applicant and subscription figures, so each
 * card pulls its own detail row unless CDSC already supplied live numbers.
 */
function useOfferingStats(row: PublicOffering): OfferingDetailStats | null {
  const slug = row.slug;
  const needsFetch = slug != null && row.cdsc == null;
  const [stats, setStats] = useState<OfferingDetailStats | null>(() =>
    needsFetch ? (peekOfferingDetail(slug) ?? null) : null,
  );

  useEffect(() => {
    if (!needsFetch || !slug) {
      setStats(null);
      return;
    }
    const cached = peekOfferingDetail(slug);
    if (cached !== undefined) {
      setStats(cached);
      return;
    }
    let alive = true;
    void loadOfferingDetail(slug).then((next) => {
      if (alive) setStats(next);
    });
    return () => {
      alive = false;
    };
  }, [needsFetch, slug]);

  return stats;
}

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

  const stats = useOfferingStats(row);
  const appliedUnits =
    live?.appliedUnits ?? row.appliedUnits ?? stats?.appliedUnits ?? null;
  const applicants =
    live?.applicants ?? row.applicants ?? stats?.applicants ?? null;
  const subscription = offeringSubscription(row, stats);
  const allotment = offeringAllotmentChance(row, stats);
  const minimumUnits = offeringMinimumUnits(row, stats);
  const hasMinimum = minimumUnits != null && row.price != null;
  const minInvestment = hasMinimum
    ? formatOfferingAmount(row.price! * minimumUnits!)
    : null;
  // Null hides the chip entirely rather than showing a placeholder.
  const fallbackChip = subscription
    ? hasMinimum
      ? `Min. ${minInvestment}`
      : null
    : row.rightShareRatio
      ? `Ratio ${row.rightShareRatio}`
      : hasMinimum
        ? `Rs. ${row.price!.toFixed(0)} × ${formatOfferingUnits(minimumUnits)} units`
        : null;
  const showHighlight = subscription != null || minInvestment != null;

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
          value={formatOfferingUnits(live?.issuedUnits ?? row.units)}
          styles={styles}
        />
        {appliedUnits != null ? (
          <Stat
            label="Applied Units"
            value={formatOfferingUnits(appliedUnits)}
            styles={styles}
          />
        ) : (
          <Stat
            label="Issue Price"
            value={row.price != null ? `Rs. ${row.price.toFixed(0)}` : '—'}
            styles={styles}
          />
        )}
        {applicants != null ? (
          <Stat
            label="Applicants"
            value={formatOfferingUnits(applicants)}
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

      {showHighlight ? (
        <View style={styles.highlight}>
          <Text style={styles.highlightLabel}>
            {subscription ? 'Subscription' : 'Min. Investment'}
          </Text>
          <View style={styles.highlightRow}>
            <Text style={styles.highlightValue}>
              {subscription ? subscription.label : minInvestment}
            </Text>
            {allotment ? (
              <View style={styles.highlightChip}>
                <MaterialCommunityIcons
                  name="chart-line-variant"
                  size={rs(12)}
                  color={OPEN_GREEN}
                />
                <Text style={styles.highlightChipText}>{allotment.label}</Text>
                <Text style={styles.highlightChipMuted}>
                  ({allotment.ratio})
                </Text>
              </View>
            ) : fallbackChip ? (
              <View style={styles.highlightChip}>
                <MaterialCommunityIcons
                  name={
                    subscription ? 'chart-line-variant' : 'file-document-outline'
                  }
                  size={rs(12)}
                  color={OPEN_GREEN}
                />
                <Text style={styles.highlightChipText}>{fallbackChip}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

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
      fontSize: rs(12),
      fontWeight: '600',
    },
    highlightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(8),
      marginTop: rs(8),
    },
    highlightValue: {
      flexShrink: 1,
      color: OPEN_GREEN,
      fontSize: rs(18),
      fontWeight: '800',
    },
    highlightChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: c.surface,
      borderRadius: rs(999),
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
    },
    highlightChipText: {
      color: OPEN_GREEN,
      fontSize: rs(12),
      fontWeight: '800',
    },
    highlightChipMuted: {
      color: c.textSecondary,
      fontSize: rs(11),
      fontWeight: '600',
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
