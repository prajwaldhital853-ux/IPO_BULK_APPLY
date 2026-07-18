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

export const darkColors: ThemeColors = {
  bg: '#121212',
  bgElevated: '#1A1A1A',
  surface: '#1E1E1E',
  surfaceAlt: '#2A2A2A',
  border: '#333333',
  borderMuted: '#2C2C2C',

  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#808080',
  textDim: '#6B6B6B',

  primary: '#2E7D32',
  primarySoft: '#1B3A26',
  primaryMid: '#133318',
  accentGreen: '#4CAF50',
  sage: '#81C784',
  teal: '#26A69A',
  tealHeader: '#2BBBAD',

  badgeNew: '#E53935',
  badgeUpdated: '#FB8C00',

  promoBanner: '#1B5E20',
  fab: '#2E7D32',

  checkIconBrown: '#6D4C41',
  checkIconGreen: '#2E5A3C',
  checkIconBlue: '#37474F',
  checkIconPurple: '#5E35B1',

  meroRed: '#E53935',
  danger: '#C62828',

  tabInactive: '#9E9E9E',
  tabActive: '#FFFFFF',
  tabActiveBg: '#1B3A26',

  inputBg: '#121212',
  overlay: 'rgba(0,0,0,0.55)',

  searchBg: '#1E1E1E',
  pillFree: '#4FC3F7',
  pillMero: '#4DB6AC',
  pillPremiumStart: '#64B5F6',
  pillPremiumEnd: '#42A5F5',
  pillText: '#0A0A0A',
};

/** Light palette — exact match to client white-mode screenshots */
export const lightColors: ThemeColors = {
  bg: '#F7F9F7',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF5EE',
  border: '#E3E8E3',
  borderMuted: '#EDF0ED',

  text: '#1B1B1B',
  textSecondary: '#5F6B5F',
  textMuted: '#8A948A',
  textDim: '#B0B8B0',

  primary: '#2D5A27',
  primarySoft: '#D1EAD3',
  primaryMid: '#E8F5E9',
  accentGreen: '#3D7A36',
  sage: '#81C784',
  teal: '#26A69A',
  tealHeader: '#2BBBAD',

  badgeNew: '#E53935',
  badgeUpdated: '#FB8C00',

  promoBanner: '#1B5E20',
  fab: '#D1EAD3',

  checkIconBrown: '#EF6C00',
  checkIconGreen: '#43A047',
  checkIconBlue: '#1E88E5',
  checkIconPurple: '#7E57C2',

  meroRed: '#E53935',
  danger: '#C62828',

  tabInactive: '#7A847A',
  tabActive: '#2D5A27',
  tabActiveBg: '#D1EAD3',

  inputBg: '#F0F3F0',
  overlay: 'rgba(0,0,0,0.35)',

  searchBg: '#F0F3F0',
  pillFree: '#81D4FA',
  pillMero: '#80CBC4',
  pillPremiumStart: '#64B5F6',
  pillPremiumEnd: '#26C6DA',
  pillText: '#FFFFFF',
};

/** @deprecated Prefer useTheme().colors — kept for gradual migration */
export const colors = darkColors;
