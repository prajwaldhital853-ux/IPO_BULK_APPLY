/**
 * Bikram Sambat (BS) ↔ Gregorian (AD) conversion for NEPSE Calendar UI.
 * Epoch: 2000-01-01 BS (Baisakh 1) = 1943-04-14 AD.
 * Month lengths cover BS 2000–2090.
 */

export type BsDate = { year: number; month: number; day: number };
export type AdDate = { year: number; month: number; day: number };

/** Baisakh … Chaitra */
export const BS_MONTH_NAMES_NP = [
  'बैशाख',
  'जेठ',
  'असार',
  'श्रावण',
  'भदौ',
  'असोज',
  'कार्तिक',
  'मंसिर',
  'पुष',
  'माघ',
  'फागुन',
  'चैत',
] as const;

export const BS_MONTH_NAMES_EN = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const;

/** Week starts Sunday — matches calendar UI */
export const WEEKDAYS_NP = [
  'आइत',
  'सोम',
  'मंगल',
  'बुध',
  'बिही',
  'शुक्र',
  'शनि',
] as const;

export const WEEKDAYS_EN_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAYS_NP_FULL = [
  'आइतबार',
  'सोमबार',
  'मंगलबार',
  'बुधबार',
  'बिहीबार',
  'शुक्रबार',
  'शनिबार',
] as const;

const NP_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/** Days in each BS month for years 2000–2090 (index 0 = Baisakh). */
const BS_MONTH_DAYS: Record<number, number[]> = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2029: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2031: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2035: [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2036: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2037: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2038: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2039: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2043: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2050: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2051: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2052: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2056: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2058: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2062: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
};

/** Calibrated so BS 2083-04-04 (Shrawan 4) = 2026-07-20 AD. */
const AD_EPOCH = Date.UTC(1943, 3, 13); // 1943-04-13 ≈ BS 2000-01-01

function daysInBsYear(year: number): number {
  const months = BS_MONTH_DAYS[year];
  if (!months) throw new Error(`BS year ${year} out of range`);
  return months.reduce((a, b) => a + b, 0);
}

export function daysInBsMonth(year: number, month: number): number {
  const months = BS_MONTH_DAYS[year];
  if (!months || month < 1 || month > 12) {
    throw new Error(`Invalid BS date ${year}-${month}`);
  }
  return months[month - 1];
}

function bsToAbsoluteDay(bs: BsDate): number {
  let total = 0;
  for (let y = 2000; y < bs.year; y++) total += daysInBsYear(y);
  for (let m = 1; m < bs.month; m++) total += daysInBsMonth(bs.year, m);
  return total + (bs.day - 1);
}

export function bsToAd(bs: BsDate): AdDate {
  const utc = AD_EPOCH + bsToAbsoluteDay(bs) * 86400000;
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function adToBs(ad: AdDate): BsDate {
  const utc = Date.UTC(ad.year, ad.month - 1, ad.day);
  let remaining = Math.round((utc - AD_EPOCH) / 86400000);
  if (remaining < 0) throw new Error('AD date before BS epoch');

  let year = 2000;
  while (year <= 2090) {
    const yDays = daysInBsYear(year);
    if (remaining < yDays) break;
    remaining -= yDays;
    year++;
  }
  let month = 1;
  while (month <= 12) {
    const mDays = daysInBsMonth(year, month);
    if (remaining < mDays) break;
    remaining -= mDays;
    month++;
  }
  return { year, month, day: remaining + 1 };
}

export function adIsoToBs(iso: string): BsDate {
  const [y, m, d] = iso.split('-').map(Number);
  return adToBs({ year: y, month: m, day: d });
}

export function bsToAdIso(bs: BsDate): string {
  const ad = bsToAd(bs);
  return `${ad.year}-${String(ad.month).padStart(2, '0')}-${String(ad.day).padStart(2, '0')}`;
}

export function toNepaliDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => NP_DIGITS[Number(d)]);
}

export function formatAdShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/** e.g. "४ श्रावण २०८३ · 20 Jul 2026" */
export function formatBsAdShort(iso: string): string {
  const bs = adIsoToBs(iso);
  const month = BS_MONTH_NAMES_NP[bs.month - 1];
  return `${toNepaliDigits(bs.day)} ${month} ${toNepaliDigits(bs.year)} · ${formatAdShort(iso)}`;
}

export function formatAdMonthRange(bsYear: number, bsMonth: number): string {
  const start = bsToAd({ year: bsYear, month: bsMonth, day: 1 });
  const endDay = daysInBsMonth(bsYear, bsMonth);
  const end = bsToAd({ year: bsYear, month: bsMonth, day: endDay });
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  if (start.year === end.year && start.month === end.month) {
    return `${months[start.month - 1]} ${start.year}`;
  }
  if (start.year === end.year) {
    return `${months[start.month - 1]} ${start.year} – ${months[end.month - 1]} ${end.year}`;
  }
  return `${months[start.month - 1]} ${start.year} – ${months[end.month - 1]} ${end.year}`;
}

export function bsMonthTitle(bsYear: number, bsMonth: number): string {
  return `${BS_MONTH_NAMES_NP[bsMonth - 1]} ${toNepaliDigits(bsYear)}`;
}

export function weekdayFromAdIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
}

export function shiftBsMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

export type BsCalendarCell = {
  bsDay: number;
  adDay: number;
  adIso: string;
  inMonth: boolean;
  isWeekend: boolean;
};

/** Build a Sunday-start grid for a BS month. */
export function buildBsMonthGrid(
  bsYear: number,
  bsMonth: number,
): BsCalendarCell[][] {
  const days = daysInBsMonth(bsYear, bsMonth);
  const firstIso = bsToAdIso({ year: bsYear, month: bsMonth, day: 1 });
  const startDow = weekdayFromAdIso(firstIso);

  const cells: BsCalendarCell[] = [];

  for (let i = 0; i < startDow; i++) {
    const prev = shiftBsMonth(bsYear, bsMonth, -1);
    const prevDays = daysInBsMonth(prev.year, prev.month);
    const bsDay = prevDays - startDow + i + 1;
    const adIso = bsToAdIso({
      year: prev.year,
      month: prev.month,
      day: bsDay,
    });
    const ad = bsToAd({ year: prev.year, month: prev.month, day: bsDay });
    const dow = weekdayFromAdIso(adIso);
    cells.push({
      bsDay,
      adDay: ad.day,
      adIso,
      inMonth: false,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  for (let day = 1; day <= days; day++) {
    const adIso = bsToAdIso({ year: bsYear, month: bsMonth, day });
    const ad = bsToAd({ year: bsYear, month: bsMonth, day });
    const dow = weekdayFromAdIso(adIso);
    cells.push({
      bsDay: day,
      adDay: ad.day,
      adIso,
      inMonth: true,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  const trailing = (7 - (cells.length % 7)) % 7;
  const next = shiftBsMonth(bsYear, bsMonth, 1);
  for (let i = 1; i <= trailing; i++) {
    const adIso = bsToAdIso({ year: next.year, month: next.month, day: i });
    const ad = bsToAd({ year: next.year, month: next.month, day: i });
    const dow = weekdayFromAdIso(adIso);
    cells.push({
      bsDay: i,
      adDay: ad.day,
      adIso,
      inMonth: false,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  const weeks: BsCalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
