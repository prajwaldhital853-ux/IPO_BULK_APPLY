/** Shared shape for light + dark palettes (client screenshot match) */
export type ThemeColors = {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderMuted: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;

  primary: string;
  primarySoft: string;
  primaryMid: string;
  accentGreen: string;
  sage: string;
  teal: string;
  tealHeader: string;

  badgeNew: string;
  badgeUpdated: string;

  promoBanner: string;
  fab: string;
  fabIcon: string;

  checkIconBrown: string;
  checkIconGreen: string;
  checkIconBlue: string;
  checkIconPurple: string;

  meroRed: string;
  danger: string;

  tabInactive: string;
  tabActive: string;
  tabActiveBg: string;

  inputBg: string;
  overlay: string;

  searchBg: string;
  pillFree: string;
  pillMero: string;
  pillPremiumStart: string;
  pillPremiumEnd: string;
  pillText: string;
};

/**
 * Client dark palette — layered so cards read clearly (not flat/dull):
 *   page #1E1E1E → cards #262626 → header #252724
 */
export const darkColors: ThemeColors = {
  bg: '#1E1E1E',
  bgElevated: '#252724',
  surface: '#262626',
  surfaceAlt: '#303030',
  border: '#3F3F3F',
  borderMuted: '#353535',

  text: '#FFFFFF',
  textSecondary: '#C8C8C8',
  textMuted: '#9A9A9A',
  textDim: '#757575',

  primary: '#2D8A39',
  primarySoft: '#2A2F2A',
  primaryMid: '#222826',
  accentGreen: '#4CAF50',
  sage: '#81C784',
  teal: '#26A69A',
  tealHeader: '#2BBBAD',

  badgeNew: '#E74C3C',
  badgeUpdated: '#FF9900',

  promoBanner: '#1B5E20',
  fab: '#2D8A39',
  fabIcon: '#FFFFFF',

  checkIconBrown: '#6D4C41',
  checkIconGreen: '#2E5A3C',
  checkIconBlue: '#37474F',
  checkIconPurple: '#5E35B1',

  meroRed: '#E74C3C',
  danger: '#C62828',

  tabInactive: '#9E9E9E',
  tabActive: '#FFFFFF',
  tabActiveBg: '#303730',

  inputBg: '#222826',
  overlay: 'rgba(0,0,0,0.55)',

  searchBg: '#262626',
  pillFree: '#6EA8D1',
  pillMero: '#53B3AC',
  pillPremiumStart: '#64B5F6',
  pillPremiumEnd: '#42A5F5',
  pillText: '#0A0A0A',
};

/**
 * Light mode — drawer palette: page #F5F6F2, surfaces #F0F3EE (drawer rows).
 */
export const lightColors: ThemeColors = {
  bg: '#F5F6F2',
  bgElevated: '#F0F3EE',
  surface: '#F0F3EE',
  surfaceAlt: '#FAFCF9',
  border: '#3D4F3A',
  borderMuted: '#6B7A64',

  text: '#121212',
  textSecondary: '#3A4338',
  textMuted: '#5A6556',
  textDim: '#7A8576',

  primary: '#1B5E20',
  primarySoft: '#E8F5E9',
  primaryMid: '#C8E6C9',
  accentGreen: '#2E7D32',
  sage: '#43A047',
  teal: '#00897B',
  tealHeader: '#00796B',

  badgeNew: '#C62828',
  badgeUpdated: '#EF6C00',

  promoBanner: '#1B5E20',
  fab: '#1B5E20',
  fabIcon: '#FFFFFF',

  checkIconBrown: '#E65100',
  checkIconGreen: '#2E7D32',
  checkIconBlue: '#1565C0',
  checkIconPurple: '#6A1B9A',

  meroRed: '#C62828',
  danger: '#B71C1C',

  tabInactive: '#5A6556',
  tabActive: '#1B5E20',
  tabActiveBg: '#E8F5E9',

  inputBg: '#F0F3EE',
  overlay: 'rgba(0,0,0,0.4)',

  searchBg: '#F0F3EE',
  pillFree: '#0288D1',
  pillMero: '#00897B',
  pillPremiumStart: '#1976D2',
  pillPremiumEnd: '#0097A7',
  pillText: '#FFFFFF',
};

/** @deprecated Prefer useTheme().colors — kept for gradual migration */
export const colors = darkColors;
