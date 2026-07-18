import { NEPSE_SESSION } from './config';
import {
  formatIso,
  getHoliday,
  isTradingDay,
  isWeekendDay,
  listUpcomingHolidays,
  monthLabel,
  nepalNow,
  nepalTodayIso,
  parseIso,
} from './holidays';
import type { CalendarDay, CalendarMonth } from './types';

function buildTodayStatus(todayIso: string) {
  const hol = getHoliday(todayIso);
  const d = parseIso(todayIso);
  if (isWeekendDay(d)) {
    return {
      isTradingDay: false,
      label: 'Weekly off',
      detail: 'NEPSE is closed on Friday & Saturday.',
    };
  }
  if (hol) {
    return {
      isTradingDay: false,
      label: 'Holiday',
      detail: hol.title,
    };
  }
  const session = sessionStatus();
  if (session === 'open') {
    return {
      isTradingDay: true,
      label: 'Trading day',
      detail: 'Regular session 11:00 AM – 3:00 PM (NPT).',
    };
  }
  if (session === 'before') {
    return {
      isTradingDay: true,
      label: 'Pre-market',
      detail: 'Market opens at 11:00 AM NPT.',
    };
  }
  return {
    isTradingDay: true,
    label: 'After hours',
    detail: 'Session ended for today (3:00 PM NPT).',
  };
}

export function sessionStatus(): 'before' | 'open' | 'after' | 'closed' {
  const n = nepalNow();
  const h = n.getUTCHours();
  const m = n.getUTCMinutes();
  const mins = h * 60 + m;
  const open = NEPSE_SESSION.openHour * 60 + NEPSE_SESSION.openMinute;
  const close = NEPSE_SESSION.closeHour * 60 + NEPSE_SESSION.closeMinute;
  const today = nepalTodayIso();
  if (!isTradingDay(today)) return 'closed';
  if (mins < open) return 'before';
  if (mins >= open && mins < close) return 'open';
  return 'after';
}

export function buildCalendarMonth(
  year: number,
  month: number,
): CalendarMonth {
  const todayIso = nepalTodayIso();
  const first = new Date(year, month - 1, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: CalendarDay[] = [];
  // leading blanks from previous month
  for (let i = 0; i < startDow; i++) {
    const prev = new Date(year, month - 1, -startDow + i + 1);
    const iso = formatIso(prev);
    cells.push(dayCell(iso, prev.getDate(), false, todayIso));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = formatIso(new Date(year, month - 1, day));
    cells.push(dayCell(iso, day, true, todayIso));
  }
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  for (let i = cells.length; i < totalCells; i++) {
    const dayNum = i - startDow - daysInMonth + 1;
    const next = new Date(year, month, dayNum);
    const iso = formatIso(next);
    cells.push(dayCell(iso, next.getDate(), false, todayIso));
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return {
    year,
    month,
    label: monthLabel(year, month),
    weeks,
    todayStatus: buildTodayStatus(todayIso),
    upcomingHolidays: listUpcomingHolidays(parseIso(todayIso), 60),
  };
}

function dayCell(
  iso: string,
  day: number,
  inMonth: boolean,
  todayIso: string,
): CalendarDay {
  const d = parseIso(iso);
  const weekend = isWeekendDay(d);
  const hol = getHoliday(iso);
  const trading = inMonth && isTradingDay(iso);
  return {
    date: iso,
    day,
    inMonth,
    isToday: iso === todayIso,
    isWeekend: weekend,
    isHoliday: Boolean(hol),
    holidayTitle: hol?.title,
    isTradingDay: trading,
  };
}

export function eventsForDate(dateIso: string): string[] {
  const d = parseIso(dateIso);
  const out: string[] = [];
  if (isWeekendDay(d)) out.push('Weekly off (Fri/Sat)');
  const hol = getHoliday(dateIso);
  if (hol) out.push(hol.title);
  if (!isWeekendDay(d) && !hol) out.push('Scheduled trading day');
  return out;
}
