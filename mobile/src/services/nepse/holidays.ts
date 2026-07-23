import { NEPSE_WEEKEND_DAYS } from './config';
import type { NepseHoliday } from './types';

export type AdminClosedDay = {
  date: string;
  title: string;
  notice: string;
  color: string;
};

/**
 * NEPSE market holidays (public + exchange closures).
 * Source: NEPSE / Nepal Government holiday calendar — update yearly.
 */
const RAW: NepseHoliday[] = [
  // 2025
  { date: '2025-01-11', title: 'Prithvi Jayanti', kind: 'public' },
  { date: '2025-01-15', title: 'Maghe Sankranti', kind: 'public' },
  { date: '2025-01-29', title: 'Sonam Lhosar', kind: 'public' },
  { date: '2025-01-30', title: "Martyrs' Day", kind: 'public' },
  { date: '2025-02-26', title: 'Maha Shivaratri', kind: 'public' },
  { date: '2025-02-28', title: 'Gyalpo Lhosar', kind: 'public' },
  { date: '2025-03-08', title: "International Women's Day", kind: 'public' },
  { date: '2025-03-14', title: 'Fagu Purnima (Holi)', kind: 'public' },
  { date: '2025-03-30', title: 'Ram Navami', kind: 'public' },
  { date: '2025-04-14', title: 'Nepali New Year', kind: 'public' },
  { date: '2025-05-01', title: 'May Day / Buddha Jayanti', kind: 'public' },
  { date: '2025-05-29', title: 'Republic Day', kind: 'public' },
  { date: '2025-08-16', title: 'Janai Purnima', kind: 'public' },
  { date: '2025-10-02', title: 'Ghatasthapana (Dashain)', kind: 'public' },
  { date: '2025-10-03', title: 'Phulpati (Dashain)', kind: 'public' },
  { date: '2025-10-04', title: 'Maha Astami (Dashain)', kind: 'public' },
  { date: '2025-10-05', title: 'Maha Nawami (Dashain)', kind: 'public' },
  { date: '2025-10-06', title: 'Vijaya Dashami', kind: 'public' },
  { date: '2025-10-07', title: 'Ekadashi (Dashain)', kind: 'public' },
  { date: '2025-10-08', title: 'Dwadashi (Dashain)', kind: 'public' },
  { date: '2025-10-20', title: 'Laxmi Puja (Tihar)', kind: 'public' },
  { date: '2025-10-21', title: 'Gobhardan Puja', kind: 'public' },
  { date: '2025-10-22', title: 'Bhai Tika', kind: 'public' },
  { date: '2025-10-26', title: 'Chhath Parwa', kind: 'public' },
  { date: '2025-12-25', title: 'Christmas Day', kind: 'public' },
  // 2026
  { date: '2026-01-11', title: 'Prithvi Jayanti', kind: 'public' },
  { date: '2026-01-15', title: 'Maghe Sankranti', kind: 'public' },
  { date: '2026-01-19', title: 'Sonam Lhosar', kind: 'public' },
  { date: '2026-01-30', title: "Martyrs' Day", kind: 'public' },
  { date: '2026-02-15', title: 'Maha Shivaratri', kind: 'public' },
  { date: '2026-02-18', title: 'Gyalpo Lhosar', kind: 'public' },
  { date: '2026-02-19', title: 'Prajatantra Diwas', kind: 'public' },
  { date: '2026-03-02', title: 'Fagu Purnima (Holi)', kind: 'public' },
  { date: '2026-03-04', title: 'Election Holiday', kind: 'public' },
  { date: '2026-03-05', title: 'Election Holiday', kind: 'public' },
  { date: '2026-03-06', title: 'Election Holiday', kind: 'public' },
  { date: '2026-03-08', title: "International Women's Day", kind: 'public' },
  { date: '2026-03-27', title: 'Ram Navami', kind: 'public' },
  { date: '2026-04-14', title: 'Nepali New Year', kind: 'public' },
  { date: '2026-05-01', title: 'May Day / Buddha Jayanti', kind: 'public' },
  { date: '2026-05-29', title: 'Republic Day', kind: 'public' },
  { date: '2026-08-28', title: 'Janai Purnima', kind: 'public' },
  { date: '2026-10-20', title: 'Ghatasthapana (Dashain)', kind: 'public' },
  { date: '2026-10-21', title: 'Phulpati (Dashain)', kind: 'public' },
  { date: '2026-10-22', title: 'Maha Astami (Dashain)', kind: 'public' },
  { date: '2026-10-23', title: 'Maha Nawami (Dashain)', kind: 'public' },
  { date: '2026-10-24', title: 'Vijaya Dashami', kind: 'public' },
  { date: '2026-11-08', title: 'Laxmi Puja (Tihar)', kind: 'public' },
  { date: '2026-11-09', title: 'Gobhardan Puja', kind: 'public' },
  { date: '2026-11-10', title: 'Bhai Tika', kind: 'public' },
  { date: '2026-11-15', title: 'Chhath Parwa', kind: 'public' },
  { date: '2026-12-25', title: 'Christmas Day', kind: 'public' },
  // 2027 (partial — extend before year-end)
  { date: '2027-01-11', title: 'Prithvi Jayanti', kind: 'public' },
  { date: '2027-01-15', title: 'Maghe Sankranti', kind: 'public' },
];

const BY_DATE = new Map(RAW.map((h) => [h.date, h]));

/** Admin-marked unexpected closures (loaded from API). */
let ADMIN_CLOSED = new Map<string, AdminClosedDay>();

export function setAdminClosedDays(rows: AdminClosedDay[]): void {
  ADMIN_CLOSED = new Map(
    rows
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .map((r) => [
        r.date,
        {
          date: r.date,
          title: r.title || 'NEPSE Closed',
          notice: r.notice || '',
          color: r.color || '#E53935',
        },
      ]),
  );
}

export function getAdminClosedDay(dateIso: string): AdminClosedDay | undefined {
  return ADMIN_CLOSED.get(dateIso);
}

export function listAdminClosedDays(): AdminClosedDay[] {
  return [...ADMIN_CLOSED.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function getHoliday(dateIso: string): NepseHoliday | undefined {
  return BY_DATE.get(dateIso);
}

export function listHolidaysInRange(
  fromIso: string,
  toIso: string,
): NepseHoliday[] {
  return RAW.filter((h) => h.date >= fromIso && h.date <= toIso).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function listUpcomingHolidays(
  fromDate: Date,
  days = 45,
): NepseHoliday[] {
  const start = formatIso(fromDate);
  const endDate = new Date(fromDate);
  endDate.setDate(endDate.getDate() + days);
  return listHolidaysInRange(start, formatIso(endDate));
}

export function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Nepal local date parts (UTC+5:45). */
export function nepalNow(): Date {
  const utc = Date.now();
  return new Date(utc + (5 * 60 + 45) * 60 * 1000);
}

export function nepalTodayIso(): string {
  const n = nepalNow();
  return formatIso(
    new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())),
  );
}

export function isWeekendDay(date: Date): boolean {
  return NEPSE_WEEKEND_DAYS.has(date.getDay());
}
export function isTradingDay(dateIso: string): boolean {
  const d = parseIso(dateIso);
  if (isWeekendDay(d)) return false;
  if (getHoliday(dateIso)) return false;
  if (getAdminClosedDay(dateIso)) return false;
  return true;
}

export function parseIso(dateIso: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
