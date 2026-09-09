/** Shared restyle tokens for drawer + Home (Accounts / Market). */

export const GLASS_GRADIENT = ['#4ADE80', '#06B6D4'] as const;
/** Home Accounts/Market pill — lime → emerald (SS2). */
export const TAB_ACTIVE_GRADIENT = ['#A3E635', '#22C55E', '#059669'] as const;
export const CHECK_BTN_GRADIENT = ['#42A5F5', '#1565C0'] as const;
export const NEPSE_NAVY = '#1B2A4A';
/** Home wordmark: NEPSE is vibrant green, GHAR is teal (3rd screenshot). */
export const NEPSE_GREEN = '#22C55E';
export const GHAR_TEAL = '#0F766E';
export const GHAR_GREEN = '#16A34A';
export const HOME_TAGLINE = 'Invest • Learn • Grow';

/** Bright cyan canvas used on Home / Apply / Check tabs. */
export const GLASS_PAGE_BG = '#F3FBFF';
export const GLASS_CARD_BG = 'rgba(255,255,255,0.72)';
export const GLASS_CARD_BORDER = 'rgba(255,255,255,0.95)';
export const GLASS_CYAN_GLOW = '#A5F3FC';

export const ACCOUNT_RAIL_COLORS = [
  '#22C55E',
  '#16A34A',
  '#059669',
  '#0D9488',
  '#10B981',
  '#4ADE80',
] as const;

export type ResultCardTheme = { bg: string; accent: string };

export const RESULT_CARD_THEMES: readonly ResultCardTheme[] = [
  { bg: '#E3F2FD', accent: '#1565C0' },
  { bg: '#E8F5E9', accent: '#2E7D32' },
  { bg: '#F3E5F5', accent: '#7B1FA2' },
  { bg: '#FFF3E0', accent: '#EF6C00' },
  { bg: '#E0F7FA', accent: '#00838F' },
  { bg: '#FCE4EC', accent: '#C2185B' },
  { bg: '#E8EAF6', accent: '#3949AB' },
  { bg: '#F1F8E9', accent: '#689F38' },
  { bg: '#FFEBEE', accent: '#E53935' },
];

export function accountRailColor(index: number): string {
  return ACCOUNT_RAIL_COLORS[index % ACCOUNT_RAIL_COLORS.length];
}

export function resultCardTheme(index: number): ResultCardTheme {
  return RESULT_CARD_THEMES[(index - 1) % RESULT_CARD_THEMES.length];
}
