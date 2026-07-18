/** Public CDSC same-day IPO result portal */
export const IPORESULT_BASE = 'https://iporesult.cdsc.com.np';

export const IPORESULT_PATHS = {
  /** Company dropdown used by the official result site */
  companies: '/result/companyShares/fileUploaded',
  /** Alternate companies payload (older clients) */
  companiesAlt: '/result/companyShares/file.json',
  check: '/result/result/check',
} as const;

/**
 * Minimal headers only — same rule as MeroShare:
 * Origin / Referer / User-Agent often make CDSC/WAF return HTML on Android.
 */
export const IPORESULT_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
};

export const IPORESULT_POST_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
};
