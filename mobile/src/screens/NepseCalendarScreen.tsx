import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  buildCalendarMonth,
  eventsForDate,
  nepalTodayIso,
  parseIso,
  type CalendarDay,
  type CalendarMonth,
} from '../services/nepse';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function DayCell({
  day,
  onPress,
  colors,
  styles,
}: {
  day: CalendarDay;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  let bg = 'transparent';
  let textColor = colors.textMuted;
  if (!day.inMonth) {
    textColor = colors.textDim;
  } else if (day.isToday) {
    bg = colors.primarySoft;
    textColor = colors.primary;
  } else if (day.isHoliday) {
    bg = `${colors.danger}22`;
    textColor = colors.danger;
  } else if (day.isWeekend) {
    bg = colors.surfaceAlt;
    textColor = colors.textSecondary;
  } else if (day.isTradingDay) {
    textColor = colors.text;
  }

  return (
    <Pressable
      style={[styles.dayCell, { backgroundColor: bg }]}
      onPress={onPress}
      disabled={!day.inMonth}
    >
      <Text
        style={[
          styles.dayNum,
          { color: textColor },
          day.isToday && styles.dayToday,
        ]}
      >
        {day.day}
      </Text>
      {day.inMonth && day.isHoliday ? (
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
      ) : day.inMonth && day.isTradingDay ? (
        <View style={[styles.dot, { backgroundColor: colors.accentGreen }]} />
      ) : null}
    </Pressable>
  );
}

export function NepseCalendarScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const today = parseIso(nepalTodayIso());
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedIso, setSelectedIso] = useState(nepalTodayIso());

  const cal: CalendarMonth = useMemo(
    () => buildCalendarMonth(year, month),
    [year, month],
  );

  const selectedEvents = useMemo(
    () => eventsForDate(selectedIso),
    [selectedIso],
  );

  const goPrev = () => {
    const n = shiftMonth(year, month, -1);
    setYear(n.year);
    setMonth(n.month);
  };
  const goNext = () => {
    const n = shiftMonth(year, month, 1);
    setYear(n.year);
    setMonth(n.month);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedIso(nepalTodayIso());
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>NEPSE Calendar</Text>
        <Pressable onPress={goToday} hitSlop={10}>
          <Text style={styles.todayBtn}>Today</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.todayCard}>
          <Text style={styles.todayLabel}>Today</Text>
          <Text style={styles.todayTitle}>{cal.todayStatus.label}</Text>
          <Text style={styles.todayDetail}>{cal.todayStatus.detail}</Text>
        </View>

        <View style={styles.monthNav}>
          <Pressable onPress={goPrev} hitSlop={12}>
            <Ionicons
              name="chevron-back"
              size={rs(22)}
              color={colors.text}
            />
          </Pressable>
          <Text style={styles.monthLabel}>{cal.label}</Text>
          <Pressable onPress={goNext} hitSlop={12}>
            <Ionicons
              name="chevron-forward"
              size={rs(22)}
              color={colors.text}
            />
          </Pressable>
        </View>

        <View style={styles.legend}>
          <LegendDot color={colors.accentGreen} label="Trading" colors={colors} />
          <LegendDot color={colors.danger} label="Holiday" colors={colors} />
          <LegendDot color={colors.textMuted} label="Weekend" colors={colors} />
        </View>

        <View style={styles.weekHead}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.weekHeadText}>
              {w}
            </Text>
          ))}
        </View>

        {cal.weeks.map((week, wi) => (
          <View key={`w${wi}`} style={styles.weekRow}>
            {week.map((day) => (
              <DayCell
                key={day.date}
                day={day}
                colors={colors}
                styles={styles}
                onPress={() => setSelectedIso(day.date)}
              />
            ))}
          </View>
        ))}

        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>{selectedIso}</Text>
          {selectedEvents.map((e) => (
            <Text key={e} style={styles.detailLine}>
              • {e}
            </Text>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Upcoming holidays</Text>
        {cal.upcomingHolidays.length === 0 ? (
          <Text style={styles.muted}>None in the next 60 days</Text>
        ) : (
          cal.upcomingHolidays.map((h) => (
            <View key={h.date} style={styles.holidayRow}>
              <Text style={styles.holidayDate}>{h.date}</Text>
              <Text style={styles.holidayTitle}>{h.title}</Text>
            </View>
          ))
        )}

        <Text style={styles.footnote}>
          NEPSE trades Sun–Thu, 11:00 AM – 3:00 PM NPT. Friday & Saturday are
          weekly off. Public holidays close the market.
        </Text>
      </ScrollView>
    </View>
  );
}

function LegendDot({
  color,
  label,
  colors,
}: {
  color: string;
  label: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(6) }}>
      <View
        style={{
          width: rs(8),
          height: rs(8),
          borderRadius: rs(4),
          backgroundColor: color,
        }}
      />
      <Text style={{ color: colors.textSecondary, fontSize: rs(11) }}>
        {label}
      </Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontSize: rs(17), fontWeight: '700' },
    todayBtn: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
    body: { padding: rs(14), paddingBottom: rs(40) },
    todayCard: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(12),
    },
    todayLabel: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    todayTitle: {
      color: c.text,
      fontSize: rs(18),
      fontWeight: '800',
      marginTop: rs(4),
    },
    todayDetail: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(10),
    },
    monthLabel: { color: c.text, fontSize: rs(16), fontWeight: '700' },
    legend: {
      flexDirection: 'row',
      gap: rs(14),
      marginBottom: rs(10),
    },
    weekHead: { flexDirection: 'row', marginBottom: rs(4) },
    weekHeadText: {
      flex: 1,
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(10),
      fontWeight: '700',
    },
    weekRow: { flexDirection: 'row', marginBottom: rs(4) },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      margin: rs(2),
      borderRadius: rs(8),
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNum: { fontSize: rs(13), fontWeight: '600' },
    dayToday: { fontWeight: '800' },
    dot: {
      width: rs(4),
      height: rs(4),
      borderRadius: rs(2),
      marginTop: rs(2),
    },
    detailCard: {
      marginTop: rs(12),
      backgroundColor: c.primarySoft,
      borderRadius: rs(12),
      padding: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    detailTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    detailLine: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(6),
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
      marginTop: rs(16),
      marginBottom: rs(8),
    },
    muted: { color: c.textMuted, fontSize: rs(12) },
    holidayRow: {
      flexDirection: 'row',
      gap: rs(10),
      paddingVertical: rs(8),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    holidayDate: {
      color: c.textMuted,
      fontSize: rs(12),
      width: rs(92),
      fontWeight: '600',
    },
    holidayTitle: { flex: 1, color: c.text, fontSize: rs(13) },
    footnote: {
      color: c.textDim,
      fontSize: rs(11),
      lineHeight: rs(16),
      marginTop: rs(16),
    },
  });
}
