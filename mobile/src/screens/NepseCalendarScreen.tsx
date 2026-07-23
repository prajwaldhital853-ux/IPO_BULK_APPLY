import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  getAdminClosedDay,
  getHoliday,
  listAdminClosedDays,
  listUpcomingHolidays,
  nepalTodayIso,
  parseIso,
  setAdminClosedDays,
} from '../services/nepse';
import { fetchMarketClosures } from '../services/nepse/marketClosures';
import {
  loadPublicOfferingsByType,
  type PublicOffering,
} from '../services/nepse/publicOffering';
import {
  WEEKDAYS_EN_FULL,
  WEEKDAYS_NP,
  WEEKDAYS_NP_FULL,
  adIsoToBs,
  adToBs,
  bsMonthTitle,
  buildBsMonthGrid,
  formatAdMonthRange,
  formatAdShort,
  formatBsAdShort,
  shiftBsMonth,
  toNepaliDigits,
  type BsCalendarCell,
} from '../utils/bsDate';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type FilterId = 'all' | 'holidays' | 'ipo' | 'fpo' | 'rights';
type DetailTab = 'selected' | 'upcoming';

type CalEvent = {
  id: string;
  date: string;
  title: string;
  kind: 'open' | 'close' | 'holiday' | 'closed' | 'ipo' | 'fpo' | 'rights';
  subtitle?: string;
  color?: string;
};

const FILTERS: {
  id: FilterId;
  label: string;
  color: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { id: 'all', label: 'All', color: '#2E7D32', icon: 'view-grid-outline' },
  { id: 'holidays', label: 'Holidays', color: '#8D6E63', icon: 'calendar-blank' },
  { id: 'ipo', label: 'IPO', color: '#7E57C2', icon: 'rocket-launch-outline' },
  { id: 'fpo', label: 'FPO', color: '#00897B', icon: 'chart-line' },
  { id: 'rights', label: 'Rights', color: '#F9A825', icon: 'source-fork' },
];

const DOT = {
  open: '#43A047',
  close: '#E53935',
  holiday: '#FB8C00',
  closed: '#E53935',
};

function isoDay(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function offeringEvents(rows: PublicOffering[], kind: 'ipo' | 'fpo' | 'rights'): CalEvent[] {
  const out: CalEvent[] = [];
  for (const row of rows) {
    const open = isoDay(row.openingDate);
    const close = isoDay(row.closingDate);
    const name = row.symbol || row.name || 'Issue';
    if (open) {
      out.push({
        id: `${kind}-open-${row.id}-${open}`,
        date: open,
        title: `${name} opens`,
        kind: 'open',
        subtitle: row.name,
      });
    }
    if (close) {
      out.push({
        id: `${kind}-close-${row.id}-${close}`,
        date: close,
        title: `${name} closes`,
        kind: 'close',
        subtitle: row.name,
      });
    }
  }
  return out;
}

export function NepseCalendarScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const todayIso = nepalTodayIso();
  const todayBs = useMemo(() => adIsoToBs(todayIso), [todayIso]);

  const [bsYear, setBsYear] = useState(todayBs.year);
  const [bsMonth, setBsMonth] = useState(todayBs.month);
  const [selectedIso, setSelectedIso] = useState(todayIso);
  const [filter, setFilter] = useState<FilterId>('all');
  const [detailTab, setDetailTab] = useState<DetailTab>('selected');
  const [offerings, setOfferings] = useState<{
    ipo: PublicOffering[];
    fpo: PublicOffering[];
    rights: PublicOffering[];
  }>({ ipo: [], fpo: [], rights: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [closuresTick, setClosuresTick] = useState(0);

  const load = useCallback(async (force = false) => {
    try {
      const [ipo, fpo, rights, closures] = await Promise.all([
        loadPublicOfferingsByType('Ipo', force),
        loadPublicOfferingsByType('Fpo', force),
        loadPublicOfferingsByType('Right', force),
        fetchMarketClosures().catch(() => []),
      ]);
      setOfferings({ ipo, fpo, rights });
      setAdminClosedDays(
        closures.map((c) => ({
          date: c.date,
          title: c.title,
          notice: c.notice,
          color: c.color,
        })),
      );
      setClosuresTick((n) => n + 1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const allEvents = useMemo(() => {
    const holidayMap = new Map<string, CalEvent>();
    for (const h of listUpcomingHolidays(parseIso(todayIso), 400)) {
      holidayMap.set(h.date, {
        id: `hol-${h.date}`,
        date: h.date,
        title: h.title,
        kind: 'holiday',
      });
    }
    const monthCells = buildBsMonthGrid(bsYear, bsMonth)
      .flat()
      .filter((c) => c.inMonth);
    for (const cell of monthCells) {
      const h = getHoliday(cell.adIso);
      if (h && !holidayMap.has(cell.adIso)) {
        holidayMap.set(cell.adIso, {
          id: `hol-${cell.adIso}`,
          date: cell.adIso,
          title: h.title,
          kind: 'holiday',
        });
      }
    }

    const closedEvents: CalEvent[] = listAdminClosedDays().map((c) => ({
      id: `closed-${c.date}`,
      date: c.date,
      title: c.title,
      kind: 'closed',
      subtitle: c.notice || undefined,
      color: c.color,
    }));

    const tag = (kind: 'ipo' | 'fpo' | 'rights', label: string) =>
      offeringEvents(
        kind === 'ipo'
          ? offerings.ipo
          : kind === 'fpo'
            ? offerings.fpo
            : offerings.rights,
        kind,
      ).map((e) => ({
        ...e,
        subtitle: `${label} · ${e.subtitle ?? e.title}`,
      }));

    return [
      ...holidayMap.values(),
      ...closedEvents,
      ...tag('ipo', 'IPO'),
      ...tag('fpo', 'FPO'),
      ...tag('rights', 'Rights'),
    ];
  }, [offerings, todayIso, bsYear, bsMonth, closuresTick]);

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return allEvents;
    if (filter === 'holidays') {
      return allEvents.filter(
        (e) => e.kind === 'holiday' || e.kind === 'closed',
      );
    }
    return allEvents.filter((e) => e.id.startsWith(`${filter}-`));
  }, [allEvents, filter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of visibleEvents) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [visibleEvents]);

  const weeks = useMemo(
    () => buildBsMonthGrid(bsYear, bsMonth),
    [bsYear, bsMonth],
  );

  const isThisMonth =
    bsYear === todayBs.year && bsMonth === todayBs.month;

  const selectedEvents = useMemo(
    () => eventsByDate.get(selectedIso) ?? [],
    [eventsByDate, selectedIso],
  );

  const upcomingEvents = useMemo(() => {
    return visibleEvents
      .filter((e) => e.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 40);
  }, [visibleEvents, todayIso]);

  const selectedBs = useMemo(() => adIsoToBs(selectedIso), [selectedIso]);
  const selectedClosed = useMemo(
    () => getAdminClosedDay(selectedIso),
    [selectedIso, closuresTick],
  );
  const selectedDow = useMemo(() => {
    const [y, m, d] = selectedIso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }, [selectedIso]);

  const goPrev = () => {
    const n = shiftBsMonth(bsYear, bsMonth, -1);
    setBsYear(n.year);
    setBsMonth(n.month);
  };
  const goNext = () => {
    const n = shiftBsMonth(bsYear, bsMonth, 1);
    setBsYear(n.year);
    setBsMonth(n.month);
  };
  const goToday = () => {
    setBsYear(todayBs.year);
    setBsMonth(todayBs.month);
    setSelectedIso(todayIso);
    setDetailTab('selected');
  };

  const onRefresh = () => {
    setRefreshing(true);
    void load(true);
  };

  const dotsFor = (iso: string) => {
    const list = eventsByDate.get(iso) ?? [];
    const kinds = new Set(list.map((e) => e.kind));
    const dots: string[] = [];
    if (kinds.has('open')) dots.push(DOT.open);
    if (kinds.has('close')) dots.push(DOT.close);
    if (kinds.has('holiday')) dots.push(DOT.holiday);
    const closed = list.find((e) => e.kind === 'closed');
    if (closed) dots.push(closed.color || DOT.closed);
    return dots.slice(0, 3);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerIconBtn}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>NEPSE Calendar</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={onRefresh} hitSlop={10} style={styles.headerIconBtn}>
            {refreshing || loading ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons name="refresh" size={rs(20)} color={colors.text} />
            )}
          </Pressable>
          <Pressable onPress={goToday} style={styles.todayPill} hitSlop={6}>
            <Ionicons name="calendar-outline" size={rs(14)} color="#FFF" />
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.filterChip,
                { backgroundColor: active ? f.color : `${f.color}33` },
                active && styles.filterChipActive,
              ]}
            >
              <MaterialCommunityIcons
                name={f.icon}
                size={rs(15)}
                color={active ? '#FFF' : f.color}
              />
              <Text
                style={[
                  styles.filterLabel,
                  { color: active ? '#FFF' : colors.text },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.monthNav}>
          <Pressable onPress={goPrev} style={styles.navCircle} hitSlop={8}>
            <Ionicons name="chevron-back" size={rs(20)} color={colors.text} />
          </Pressable>
          <View style={styles.monthCenter}>
            <View style={styles.monthTitleRow}>
              <Text style={styles.monthTitle}>{bsMonthTitle(bsYear, bsMonth)}</Text>
              {isThisMonth ? (
                <View style={styles.thisMonthBadge}>
                  <Text style={styles.thisMonthText}>This Month</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.monthSub}>
              {formatAdMonthRange(bsYear, bsMonth)}
            </Text>
          </View>
          <Pressable onPress={goNext} style={styles.navCircle} hitSlop={8}>
            <Ionicons name="chevron-forward" size={rs(20)} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.weekHead}>
          {WEEKDAYS_NP.map((w, i) => (
            <Text
              key={w}
              style={[
                styles.weekHeadText,
                (i === 0 || i === 6) && styles.weekHeadWeekend,
              ]}
            >
              {w}
            </Text>
          ))}
        </View>

        {weeks.map((week, wi) => (
          <View key={`w${wi}`} style={styles.weekRow}>
            {week.map((cell) => {
              const closed =
                cell.inMonth ? getAdminClosedDay(cell.adIso) : undefined;
              return (
                <DayCell
                  key={`${cell.adIso}-${cell.inMonth ? 'in' : 'out'}`}
                  cell={cell}
                  selected={cell.adIso === selectedIso && cell.inMonth}
                  isToday={cell.adIso === todayIso && cell.inMonth}
                  closedColor={closed?.color}
                  dots={cell.inMonth ? dotsFor(cell.adIso) : []}
                  styles={styles}
                  onPress={() => {
                    if (!cell.inMonth) return;
                    setSelectedIso(cell.adIso);
                    setDetailTab('selected');
                  }}
                />
              );
            })}
          </View>
        ))}

        <View style={styles.legend}>
          <LegendDot color={DOT.open} label="Opens" colors={colors} />
          <LegendDot color={DOT.close} label="Closes" colors={colors} />
          <LegendDot color={DOT.holiday} label="Holiday" colors={colors} />
          <LegendDot color={DOT.closed} label="Closed" colors={colors} />
        </View>

        {selectedClosed ? (
          <View
            style={[
              styles.closureNotice,
              { borderLeftColor: selectedClosed.color || DOT.closed },
            ]}
          >
            <View style={styles.closureNoticeHead}>
              <Ionicons
                name="alert-circle"
                size={rs(18)}
                color={selectedClosed.color || DOT.closed}
              />
              <Text style={styles.closureNoticeTitle}>
                {selectedClosed.title}
              </Text>
            </View>
            {selectedClosed.notice ? (
              <Text style={styles.closureNoticeBody}>
                {selectedClosed.notice}
              </Text>
            ) : (
              <Text style={styles.closureNoticeBody}>
                NEPSE is closed on this day.
              </Text>
            )}
          </View>
        ) : null}

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setDetailTab('selected')}
            style={[
              styles.tabBtn,
              detailTab === 'selected' && styles.tabBtnActive,
            ]}
          >
            <Ionicons
              name="calendar"
              size={rs(16)}
              color={detailTab === 'selected' ? '#FFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                detailTab === 'selected' && styles.tabTextActive,
              ]}
            >
              Selected Day
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDetailTab('upcoming')}
            style={[
              styles.tabBtn,
              detailTab === 'upcoming' && styles.tabBtnActive,
            ]}
          >
            <Ionicons
              name="file-tray-full-outline"
              size={rs(16)}
              color={detailTab === 'upcoming' ? '#FFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                detailTab === 'upcoming' && styles.tabTextActive,
              ]}
            >
              Upcoming
            </Text>
            {upcomingEvents.length > 0 ? (
              <View
                style={[
                  styles.tabBadge,
                  detailTab === 'upcoming' && styles.tabBadgeActive,
                ]}
              >
                <Text style={styles.tabBadgeText}>
                  {Math.min(upcomingEvents.length, 99)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {detailTab === 'selected' ? (
          <>
            <View style={styles.dateCard}>
              <View style={styles.dateCardIcon}>
                <Ionicons name="calendar" size={rs(22)} color="#FFF" />
              </View>
              <View style={styles.dateCardBody}>
                <Text style={styles.dateCardNp}>
                  {WEEKDAYS_NP_FULL[selectedDow]},{' '}
                  {toNepaliDigits(selectedBs.day)}{' '}
                  {bsMonthTitle(selectedBs.year, selectedBs.month).split(' ')[0]}{' '}
                  {toNepaliDigits(selectedBs.year)}
                </Text>
                <Text style={styles.dateCardEn}>
                  {WEEKDAYS_EN_FULL[selectedDow]}, {formatAdShort(selectedIso)}
                </Text>
              </View>
              <View style={styles.eventCountPill}>
                <Text style={styles.eventCountText}>
                  {selectedEvents.length} event
                  {selectedEvents.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {selectedEvents.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="calendar-outline"
                  size={rs(56)}
                  color={colors.textDim}
                />
                <Text style={styles.emptyText}>No events on this day.</Text>
              </View>
            ) : (
              selectedEvents.map((ev) => (
                <EventRow key={ev.id} ev={ev} styles={styles} colors={colors} />
              ))
            )}
          </>
        ) : upcomingEvents.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="file-tray-outline"
              size={rs(56)}
              color={colors.textDim}
            />
            <Text style={styles.emptyText}>No upcoming events.</Text>
          </View>
        ) : (
          upcomingEvents.map((ev) => (
            <Pressable
              key={ev.id}
              onPress={() => {
                const bs = adToBs({
                  year: Number(ev.date.slice(0, 4)),
                  month: Number(ev.date.slice(5, 7)),
                  day: Number(ev.date.slice(8, 10)),
                });
                setBsYear(bs.year);
                setBsMonth(bs.month);
                setSelectedIso(ev.date);
                setDetailTab('selected');
              }}
            >
              <EventRow ev={ev} styles={styles} colors={colors} showDate />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function DayCell({
  cell,
  selected,
  isToday,
  closedColor,
  dots,
  onPress,
  styles,
}: {
  cell: BsCalendarCell;
  selected: boolean;
  isToday: boolean;
  closedColor?: string;
  dots: string[];
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const weekendBg = cell.inMonth && cell.isWeekend;
  return (
    <Pressable
      style={styles.dayCell}
      onPress={onPress}
      disabled={!cell.inMonth}
    >
      <View
        style={[
          styles.dayInner,
          weekendBg && styles.dayWeekend,
          closedColor
            ? {
                backgroundColor: `${closedColor}33`,
                borderWidth: 1,
                borderColor: closedColor,
              }
            : null,
          selected && styles.daySelected,
          isToday && !selected && styles.dayTodayRing,
        ]}
      >
        {selected ? (
          <Ionicons
            name="star"
            size={rs(9)}
            color="#FFD54F"
            style={styles.dayStar}
          />
        ) : null}
        <Text
          style={[
            styles.dayBs,
            !cell.inMonth && styles.dayMuted,
            cell.isWeekend && cell.inMonth && styles.dayWeekendText,
            closedColor ? { color: closedColor, fontWeight: '800' } : null,
            selected && styles.daySelectedText,
          ]}
        >
          {toNepaliDigits(cell.bsDay)}
        </Text>
        <Text
          style={[
            styles.dayAd,
            !cell.inMonth && styles.dayMuted,
            closedColor ? { color: closedColor } : null,
            selected && styles.daySelectedText,
          ]}
        >
          {cell.adDay}
        </Text>
      </View>
      {cell.inMonth && dots.length > 0 ? (
        <View style={styles.dotsRow}>
          {dots.map((c, i) => (
            <View key={`${c}${i}`} style={[styles.dot, { backgroundColor: c }]} />
          ))}
        </View>
      ) : (
        <View style={styles.dotsSpacer} />
      )}
    </Pressable>
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

function EventRow({
  ev,
  styles,
  colors,
  showDate,
}: {
  ev: CalEvent;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  showDate?: boolean;
}) {
  const color =
    ev.kind === 'closed'
      ? ev.color || DOT.closed
      : ev.kind === 'holiday'
        ? DOT.holiday
        : ev.kind === 'close'
          ? DOT.close
          : DOT.open;
  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventDotLg, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle}>{ev.title}</Text>
        {showDate ? (
          <Text style={styles.eventSub}>{formatBsAdShort(ev.date)}</Text>
        ) : ev.subtitle ? (
          <Text style={styles.eventSub} numberOfLines={1}>
            {ev.subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(10),
      paddingVertical: rs(10),
      gap: rs(6),
    },
    headerIconBtn: {
      width: rs(36),
      height: rs(36),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      color: c.text,
      fontSize: rs(17),
      fontWeight: '700',
      textAlign: 'center',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
    },
    todayPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: '#2E7D32',
      paddingHorizontal: rs(10),
      paddingVertical: rs(7),
      borderRadius: rs(10),
    },
    todayPillText: {
      color: '#FFF',
      fontWeight: '700',
      fontSize: rs(12),
    },
    filterScroll: { flexGrow: 0 },
    filterRow: {
      paddingHorizontal: rs(12),
      paddingBottom: rs(8),
      gap: rs(8),
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      borderRadius: rs(20),
    },
    filterChipActive: {
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 2,
    },
    filterLabel: { fontSize: rs(12), fontWeight: '700' },
    body: { paddingHorizontal: rs(12), paddingBottom: rs(40) },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: rs(12),
      marginTop: rs(4),
    },
    navCircle: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(18),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthCenter: { flex: 1, alignItems: 'center', paddingHorizontal: rs(8) },
    monthTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    monthTitle: {
      color: c.text,
      fontSize: rs(20),
      fontWeight: '800',
    },
    thisMonthBadge: {
      backgroundColor: '#2E7D32',
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
      borderRadius: rs(8),
    },
    thisMonthText: {
      color: '#FFF',
      fontSize: rs(10),
      fontWeight: '700',
    },
    monthSub: {
      color: c.textMuted,
      fontSize: rs(12),
      marginTop: rs(2),
    },
    weekHead: { flexDirection: 'row', marginBottom: rs(6) },
    weekHeadText: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontSize: rs(11),
      fontWeight: '700',
    },
    weekHeadWeekend: { color: '#E53935' },
    weekRow: { flexDirection: 'row', marginBottom: rs(2) },
    dayCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: rs(2),
    },
    dayInner: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayWeekend: {
      backgroundColor: isDark
        ? 'rgba(229, 57, 53, 0.18)'
        : 'rgba(198, 40, 40, 0.16)',
    },
    daySelected: {
      backgroundColor: '#2E7D32',
    },
    dayTodayRing: {
      borderWidth: 1.5,
      borderColor: '#2E7D32',
    },
    dayStar: {
      position: 'absolute',
      top: rs(2),
      right: rs(4),
    },
    dayBs: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '700',
      lineHeight: rs(18),
    },
    dayAd: {
      color: c.textMuted,
      fontSize: rs(9),
      fontWeight: '600',
      marginTop: -rs(1),
    },
    dayMuted: { color: c.textDim, opacity: 0.45 },
    dayWeekendText: {
      color: isDark ? '#EF9A9A' : '#C62828',
      fontWeight: '800',
    },
    daySelectedText: { color: '#FFF' },
    dotsRow: {
      flexDirection: 'row',
      gap: rs(3),
      height: rs(8),
      alignItems: 'center',
      marginTop: rs(1),
    },
    dotsSpacer: { height: rs(8) },
    dot: {
      width: rs(5),
      height: rs(5),
      borderRadius: rs(2.5),
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: rs(14),
      marginTop: rs(10),
      marginBottom: rs(10),
    },
    closureNotice: {
      borderLeftWidth: rs(4),
      backgroundColor: isDark ? 'rgba(229,57,53,0.12)' : 'rgba(229,57,53,0.08)',
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(14),
      gap: rs(6),
    },
    closureNoticeHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    closureNoticeTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      flex: 1,
    },
    closureNoticeBody: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    tabRow: {
      flexDirection: 'row',
      gap: rs(10),
      marginBottom: rs(12),
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      backgroundColor: c.surfaceAlt,
      paddingVertical: rs(12),
      borderRadius: rs(14),
    },
    tabBtnActive: { backgroundColor: '#2E7D32' },
    tabText: {
      color: c.textSecondary,
      fontWeight: '700',
      fontSize: rs(13),
    },
    tabTextActive: { color: '#FFF' },
    tabBadge: {
      minWidth: rs(20),
      height: rs(20),
      borderRadius: rs(10),
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(5),
    },
    tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
    tabBadgeText: {
      color: c.text,
      fontSize: rs(10),
      fontWeight: '800',
    },
    dateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(12),
      gap: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      marginBottom: rs(12),
    },
    dateCardIcon: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(12),
      backgroundColor: '#2E7D32',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateCardBody: { flex: 1 },
    dateCardNp: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
    },
    dateCardEn: {
      color: c.textMuted,
      fontSize: rs(12),
      marginTop: rs(2),
    },
    eventCountPill: {
      backgroundColor: '#1B5E20',
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(12),
    },
    eventCountText: {
      color: '#A5D6A7',
      fontSize: rs(11),
      fontWeight: '700',
    },
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: rs(28),
      gap: rs(10),
    },
    emptyText: {
      color: c.textMuted,
      fontSize: rs(14),
      fontWeight: '600',
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(8),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    eventDotLg: {
      width: rs(10),
      height: rs(10),
      borderRadius: rs(5),
    },
    eventTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
    },
    eventSub: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(2),
    },
  });
}
