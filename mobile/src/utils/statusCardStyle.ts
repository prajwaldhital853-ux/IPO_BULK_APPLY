/** Shared status accent colors — saturated enough to read clearly on cards. */
export const STATUS_VERIFIED = '#1B7A3D';
export const STATUS_UNVERIFIED = '#EF6C00';
export const STATUS_REJECTED = '#E53935';
export const STATUS_NOT_APPLIED = '#F57C00';

export type StatusCardStyle = {
  accent: string;
  borderColor: string;
  backgroundColor: string;
  iconBackground: string;
  iconColor: string;
  textColor: string;
  pillBackground: string;
};

/** Card chrome for Verified / Unverified / Rejected rows (not ultra-pale washes). */
export function buildStatusCardStyle(
  accent: string,
  isDark: boolean,
): StatusCardStyle {
  return {
    accent,
    borderColor: accent,
    backgroundColor: isDark ? `${accent}32` : `${accent}24`,
    iconBackground: accent,
    iconColor: '#FFFFFF',
    textColor: accent,
    pillBackground: isDark ? `${accent}45` : `${accent}35`,
  };
}

export function chipActiveBackground(accent: string, isDark: boolean): string {
  return isDark ? `${accent}40` : `${accent}30`;
}
