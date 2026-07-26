export type PasswordRequirementKey =
  | 'minLength'
  | 'uppercase'
  | 'lowercase'
  | 'digit'
  | 'special';

export type PasswordChecks = Record<PasswordRequirementKey, boolean>;

export const PASSWORD_REQUIREMENT_LABELS: {
  key: PasswordRequirementKey;
  label: string;
}[] = [
  { key: 'minLength', label: 'At least 8 characters' },
  { key: 'uppercase', label: '1 uppercase letter (A–Z)' },
  { key: 'lowercase', label: '1 lowercase letter (a–z)' },
  { key: 'digit', label: '1 number (0–9)' },
  { key: 'special', label: '1 special character (!@#$%^&*…)' },
];

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordStrong(password: string): boolean {
  const c = getPasswordChecks(password);
  return Object.values(c).every(Boolean);
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return confirm.length > 0 && password === confirm;
}
