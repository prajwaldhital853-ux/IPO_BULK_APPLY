import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  WEEKDAYS_NP,
  adIsoToBs,
  bsMonthTitle,
  buildBsMonthGrid,
  formatAdShort,
  formatBsAdShort,
  shiftBsMonth,
  toNepaliDigits,
} from '../utils/bsDate';
import { rs } from '../utils/responsive';

function todayAdIso(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = `${n.getMonth() + 1}`.padStart(2, '0');
  const d = `${n.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type Props = {
  visible: boolean;
  /** Selected DOB as AD `YYYY-MM-DD`, or empty */
  value: string;
  onSelect: (adIso: string) => void;
  onClose: () => void;
};

/**
 * Bikram Sambat month grid for picking date of birth.
 * Stores / returns Gregorian (AD) ISO for app storage.
 */
export function NepaliDobPicker({
  visible,
  value,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const maxIso = todayAdIso();

  const initial = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try {
        return adIsoToBs(value);
      } catch {
        /* fall through */
      }
    }
    // Default view ~12 years ago (typical minor age when opening picker)
    const d = new Date();
    d.setFullYear(d.getFullYear() - 12);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try {
      return adIsoToBs(iso);
    } catch {
      return { year: 2070, month: 1, day: 1 };
    }
  }, [value]);

  const [bsYear, setBsYear] = useState(initial.year);
  const [bsMonth, setBsMonth] = useState(initial.month);

  useEffect(() => {
    if (!visible) return;
    setBsYear(initial.year);
    setBsMonth(initial.month);
  }, [visible, initial.year, initial.month]);

  const weeks = useMemo(
    () => buildBsMonthGrid(bsYear, bsMonth),
    [bsYear, bsMonth],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, rs(14)) },
          ]}
        >
          <Text style={styles.title}>नेपाली पात्रो (BS)</Text>
          <Text style={styles.sub}>Pick date of birth · Bikram Sambat</Text>

          <View style={styles.nav}>
            <Pressable
              onPress={() => {
                setBsYear((y) => Math.max(2000, y - 1));
              }}
              hitSlop={8}
              style={styles.navBtn}
            >
              <Text style={styles.yearBtn}>वर्ष −</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const n = shiftBsMonth(bsYear, bsMonth, -1);
                setBsYear(n.year);
                setBsMonth(n.month);
              }}
              hitSlop={10}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-back" size={rs(22)} color={colors.text} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {bsMonthTitle(bsYear, bsMonth)}
            </Text>
            <Pressable
              onPress={() => {
                const n = shiftBsMonth(bsYear, bsMonth, 1);
                setBsYear(n.year);
                setBsMonth(n.month);
              }}
              hitSlop={10}
              style={styles.navBtn}
            >
              <Ionicons
                name="chevron-forward"
                size={rs(22)}
                color={colors.text}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                setBsYear((y) => Math.min(2090, y + 1));
              }}
              hitSlop={8}
              style={styles.navBtn}
            >
              <Text style={styles.yearBtn}>वर्ष +</Text>
            </Pressable>
          </View>

          <View style={styles.weekHead}>
            {WEEKDAYS_NP.map((w) => (
              <Text key={w} style={styles.weekHeadText}>
                {w}
              </Text>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={`w${wi}`} style={styles.weekRow}>
              {week.map((cell) => {
                const selected = cell.inMonth && value === cell.adIso;
                const future = cell.adIso > maxIso;
                const disabled = !cell.inMonth || future;
                return (
                  <Pressable
                    key={`${cell.adIso}-${cell.inMonth ? 'in' : 'out'}`}
                    style={styles.dayCell}
                    disabled={disabled}
                    onPress={() => {
                      if (disabled) return;
                      onSelect(cell.adIso);
                      onClose();
                    }}
                  >
                    <View
                      style={[
                        styles.dayInner,
                        selected && styles.daySelected,
                        future && cell.inMonth && styles.dayFuture,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayBs,
                          disabled && styles.dayMuted,
                          selected && styles.daySelectedText,
                        ]}
                      >
                        {toNepaliDigits(cell.bsDay)}
                      </Text>
                      <Text
                        style={[
                          styles.dayAd,
                          disabled && styles.dayMuted,
                          selected && styles.daySelectedText,
                        ]}
                      >
                        {cell.adDay}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {value ? (
            <Text style={styles.selectedHint}>{formatBsAdShort(value)}</Text>
          ) : null}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Display label for a stored AD ISO DOB. */
export function formatDobBsLabel(adIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adIso)) return '';
  try {
    return formatBsAdShort(adIso);
  } catch {
    return formatAdShort(adIso);
  }
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(14),
      paddingTop: rs(14),
    },
    title: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      textAlign: 'center',
    },
    sub: {
      color: c.textMuted,
      fontSize: rs(12),
      textAlign: 'center',
      marginTop: rs(4),
      marginBottom: rs(12),
    },
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(8),
      gap: rs(2),
    },
    navBtn: { padding: rs(4) },
    yearBtn: {
      color: c.primary,
      fontSize: rs(11),
      fontWeight: '800',
    },
    monthTitle: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
    },
    weekHead: {
      flexDirection: 'row',
      marginBottom: rs(4),
    },
    weekHeadText: {
      flex: 1,
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
    },
    weekRow: { flexDirection: 'row' },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      padding: rs(2),
    },
    dayInner: {
      flex: 1,
      borderRadius: rs(8),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? c.surfaceAlt : c.bgElevated,
    },
    daySelected: {
      backgroundColor: c.primary,
    },
    dayFuture: {
      opacity: 0.35,
    },
    dayBs: {
      color: c.text,
      fontSize: rs(13),
      fontWeight: '800',
    },
    dayAd: {
      color: c.textMuted,
      fontSize: rs(9),
      marginTop: 1,
    },
    dayMuted: {
      color: c.textDim,
    },
    daySelectedText: {
      color: '#FFFFFF',
    },
    selectedHint: {
      marginTop: rs(10),
      textAlign: 'center',
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '600',
    },
    closeBtn: {
      marginTop: rs(12),
      alignItems: 'center',
      paddingVertical: rs(10),
    },
    closeText: {
      color: c.primary,
      fontWeight: '800',
      fontSize: rs(14),
    },
  });
}
