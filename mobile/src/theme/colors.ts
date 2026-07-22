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

/** Soft sage-green light palette (~#E4EAD9) — easier on eyes, matches client SS. */
export const lightColors: ThemeColors = {
  bg: '#E4EAD9',
  bgElevated: '#E7ECE0',
  surface: '#EEF2E6',
  surfaceAlt: '#DCE5D0',
  border: '#C5D0B5',
  borderMuted: '#D5DEC8',

  text: '#1B1B1B',
  textSecondary: '#5F6B5F',
  textMuted: '#7A8570',
  textDim: '#9AA390',

  primary: '#2D5A27',
  primarySoft: '#D0DDBF',
  primaryMid: '#D8E2C8',
  accentGreen: '#3D7A36',
  sage: '#81C784',
  teal: '#26A69A',
  tealHeader: '#2BBBAD',

  badgeNew: '#E53935',
  badgeUpdated: '#FB8C00',

  promoBanner: '#1B5E20',
  fab: '#2D5A27',
  fabIcon: '#FFFFFF',

  checkIconBrown: '#EF6C00',
  checkIconGreen: '#43A047',
  checkIconBlue: '#1E88E5',
  checkIconPurple: '#7E57C2',

  meroRed: '#E53935',
  danger: '#C62828',

  tabInactive: '#6F7A65',
  tabActive: '#2D5A27',
  tabActiveBg: '#D0DDBF',

  inputBg: '#DCE5D0',
  overlay: 'rgba(0,0,0,0.35)',

  searchBg: '#EEF2E6',
  pillFree: '#81D4FA',
  pillMero: '#80CBC4',
  pillPremiumStart: '#64B5F6',
  pillPremiumEnd: '#26C6DA',
  pillText: '#FFFFFF',
};

/** @deprecated Prefer useTheme().colors — kept for gradual migration */
export const colors = darkColors;
