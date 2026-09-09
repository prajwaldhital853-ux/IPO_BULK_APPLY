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

export const RESULT_CARD_THEMES_DARK: readonly ResultCardTheme[] = [
  { bg: 'rgba(21,101,192,0.28)', accent: '#64B5F6' },
  { bg: 'rgba(46,125,50,0.28)', accent: '#81C784' },
  { bg: 'rgba(123,31,162,0.28)', accent: '#CE93D8' },
  { bg: 'rgba(239,108,0,0.28)', accent: '#FFB74D' },
  { bg: 'rgba(0,131,143,0.28)', accent: '#4DD0E1' },
  { bg: 'rgba(194,24,91,0.28)', accent: '#F48FB1' },
  { bg: 'rgba(57,73,171,0.28)', accent: '#9FA8DA' },
  { bg: 'rgba(104,159,56,0.28)', accent: '#AED581' },
  { bg: 'rgba(229,57,53,0.28)', accent: '#EF9A9A' },
];

export function accountRailColor(index: number): string {
  return ACCOUNT_RAIL_COLORS[index % ACCOUNT_RAIL_COLORS.length];
}

export function resultCardTheme(
  index: number,
  isDark = false,
): ResultCardTheme {
  const themes = isDark ? RESULT_CARD_THEMES_DARK : RESULT_CARD_THEMES;
  return themes[(index - 1) % themes.length];
}
