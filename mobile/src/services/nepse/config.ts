/** Official NEPSE web API mirrors (try in order). */
export const NEPSE_API_BASES = [
  'https://www.nepalstock.com.np/api/nots',
  'https://newweb.nepalstock.com/api/nots',
  'https://newweb.nepse.com.np/api/nots',
] as const;

/** NEPSE trades Sunday–Thursday; Friday–Saturday are weekly off. */
export const NEPSE_WEEKEND_DAYS = new Set([5, 6]); // Fri=5, Sat=6 (JS getDay)

/** Regular session in Nepal Time (UTC+5:45). */
export const NEPSE_SESSION = {
  openHour: 11,
  openMinute: 0,
  closeHour: 15,
  closeMinute: 0,
} as const;
