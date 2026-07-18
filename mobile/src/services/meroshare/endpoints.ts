/** CDSC MeroShare web backend — confirmed from DevTools (2026). */
export const MEROSHARE_BASE = 'https://webbackend.cdsc.com.np';

/** Older host — used as fallback if webbackend returns HTML */
export const MEROSHARE_BASE_FALLBACK = 'https://backend.cdsc.com.np';

export const PATHS = {
  /** GET — public DP list; login clientId is row.id (not code) */
  capital: '/api/meroShare/capital/',
  /** POST { clientId, username, password } — no captcha in current portal */
  login: '/api/meroShare/auth/',
  captcha: '/api/meroShare/auth/captcha/',
  /** After login — GET with Authorization token */
  me: '/api/meroShare/ownDetail/',
  /** POST { sortBy, demat[], clientCode, page, size } — live share holdings */
  myPortfolio: '/api/meroShareView/myPortfolio/',
  /** POST filter body — searchable applicable issues */
  applicable: '/api/meroShare/companyShare/applicableIssue/',
  apply: '/api/meroShare/applicantForm/share/apply',
  banks: '/api/meroShare/bank/',
  bankById: (bankId: number | string) => `/api/meroShare/bank/${bankId}`,
  canApply: (companyShareId: number | string, demat: string) =>
    `/api/meroShare/applicantForm/customerType/${companyShareId}/${demat}`,
  applicationReport: '/api/meroShare/applicantForm/active/search/',
  oldApplication: '/api/meroShare/applicantForm/search/',
  migratedApplication: '/api/meroShare/migrated/applicantForm/search/',
  /** GET — menu/roles for the logged-in user (used to pick allowed searchRoleViewConstants) */
  navigation: '/api/meroShare/navigation/',
  reportDetail: (applicantFormId: number | string) =>
    `/api/meroShare/applicantForm/report/detail/${applicantFormId}`,
} as const;

/**
 * Minimal headers only.
 * Do NOT send Origin / Referer / User-Agent — on Android those often make
 * CDSC/CDN return an HTML error page instead of JSON (or HTTP 500).
 */
export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
};
