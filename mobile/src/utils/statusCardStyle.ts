/** Shared status accent colors — lighter tones for card rows. */
export const STATUS_VERIFIED = '#43A047';
export const STATUS_UNVERIFIED = '#FB8C00';
export const STATUS_REJECTED = '#EF5350';
export const STATUS_NOT_APPLIED = '#FF9800';

/** Brighter chip/filter colors (not dark forest tones). */
export const CHIP_GREEN = '#66BB6A';
export const CHIP_BLUE = '#42A5F5';
export const CHIP_RED = '#EF5350';
export const CHIP_ORANGE = '#FFA726';
export const CHIP_PURPLE = '#7986CB';

export function chipTint(accent: string, isDark: boolean): string {
  return isDark ? `${accent}33` : `${accent}1F`;
}

export type StatusCardStyle = {
  accent: string;
  borderColor: string;
  backgroundColor: string;
  iconBackground: string;
  iconColor: string;
  textColor: string;
  pillBackground: string;
  pillTextColor: string;
};

/** Card chrome for Verified / Unverified / Rejected rows. */
export function buildStatusCardStyle(
  accent: string,
  isDark: boolean,
): StatusCardStyle {
  return {
    accent,
    borderColor: isDark ? `${accent}55` : `${accent}38`,
    backgroundColor: isDark ? `${accent}16` : `${accent}0C`,
    iconBackground: isDark ? `${accent}28` : `${accent}1C`,
    iconColor: accent,
    textColor: accent,
    pillBackground: isDark ? `${accent}14` : `${accent}0A`,
    /** Full accent on a faint pill — readable but subtler than the title line. */
    pillTextColor: accent,
  };
}

export function chipActiveBackground(accent: string, isDark: boolean): string {
  return isDark ? `${accent}40` : `${accent}30`;
}
