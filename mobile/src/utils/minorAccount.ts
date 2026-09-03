import type { AccountHolderType, AccountMeta } from '../types/account';

const MS_PER_DAY = 86_400_000;

/** Normalize typed DOB to ISO `YYYY-MM-DD`, or null if incomplete/invalid. */
export function parseDobInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  let y: number;
  let m: number;
  let d: number;

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else {
    const digits = s.replace(/\D/g, '');
    if (digits.length === 8) {
      // Prefer YYYYMMDD when year looks plausible; else DDMMYYYY.
      const asY = Number(digits.slice(0, 4));
      if (asY >= 1950 && asY <= 2100) {
        y = asY;
        m = Number(digits.slice(4, 6));
        d = Number(digits.slice(6, 8));
      } else {
        d = Number(digits.slice(0, 2));
        m = Number(digits.slice(2, 4));
        y = Number(digits.slice(4, 8));
      }
    } else {
      return null;
    }
  }

  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  const now = new Date();
  if (dt.getTime() > now.getTime()) return null;
  // Sanity: demat holder younger than ~1 day or older than 120y is invalid.
  const ageMs = now.getTime() - dt.getTime();
  if (ageMs < 0 || ageMs > 120 * 365.25 * MS_PER_DAY) return null;

  const mm = `${m}`.padStart(2, '0');
  const dd = `${d}`.padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Mask typed digits as YYYY-MM-DD while the user enters a DOB. */
export function formatDobTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseIsoDob(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** Exact age in whole years. */
export function ageYears(
  dobIso: string | undefined | null,
  now = new Date(),
): number | null {
  const dob = parseIsoDob(dobIso);
  if (!dob) return null;
  const today = startOfLocalDay(now);
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthday =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthday) age -= 1;
  return age < 0 ? null : age;
}

/** Date the holder turns 18 (local midnight). */
export function majorityDate(dobIso: string | undefined | null): Date | null {
  const dob = parseIsoDob(dobIso);
  if (!dob) return null;
  return new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate());
}

/**
 * Whole days until the 18th birthday.
 * 0 = turns 18 today; negative = already 18+.
 */
export function daysUntilMajority(
  dobIso: string | undefined | null,
  now = new Date(),
): number | null {
  const major = majorityDate(dobIso);
  if (!major) return null;
  const today = startOfLocalDay(now);
  const target = startOfLocalDay(major);
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

export function isMinorFromDob(
  dobIso: string | undefined | null,
  now = new Date(),
): boolean {
  const days = daysUntilMajority(dobIso, now);
  return days != null && days > 0;
}

/** True when this account belongs in the Minor Accounts section. */
export function isMinorAccount(
  account: Pick<AccountMeta, 'dateOfBirth' | 'holderType'>,
  now = new Date(),
): boolean {
  if (account.dateOfBirth) {
    return isMinorFromDob(account.dateOfBirth, now);
  }
  // Legacy manual flag (before DOB was required).
  return account.holderType === 'minor';
}

export function holderTypeFromDob(
  dobIso: string | undefined | null,
  now = new Date(),
): AccountHolderType {
  if (!dobIso) return 'major';
  return isMinorFromDob(dobIso, now) ? 'minor' : 'major';
}

export function formatCountdownLabel(daysLeft: number | null): string {
  if (daysLeft == null) return 'Add date of birth';
  if (daysLeft < 0) return 'Now major (18+)';
  if (daysLeft === 0) return 'Blocks today if not converted';
  if (daysLeft === 1) return '1 day left before block';
  return `${daysLeft} days left before block`;
}

/** Short chip for list rows. */
export function formatCountdownChip(daysLeft: number | null): string {
  if (daysLeft == null) return 'No DOB';
  if (daysLeft < 0) return '18+';
  if (daysLeft === 0) return 'Block today';
  return `${daysLeft}d left`;
}

export function formatDobDisplay(dobIso: string | undefined | null): string {
  const dob = parseIsoDob(dobIso);
  if (!dob) return '—';
  const y = dob.getFullYear();
  const m = `${dob.getMonth() + 1}`.padStart(2, '0');
  const d = `${dob.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Build YYYY-MM-DD for a holder who turns 18 in `daysLeft` days. */
export function dobWithDaysUntil18(daysLeft: number, now = new Date()): string {
  const major = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  major.setDate(major.getDate() + daysLeft);
  const dob = new Date(
    major.getFullYear() - 18,
    major.getMonth(),
    major.getDate(),
  );
  const y = dob.getFullYear();
  const m = `${dob.getMonth() + 1}`.padStart(2, '0');
  const d = `${dob.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DOB_KEY_ALIASES = new Set(
  [
    'dateofbirth',
    'dateofbirthstr',
    'dob',
    'dobstr',
    'birthdate',
    'birthdatestr',
    'dateofbirthad',
    'birthday',
    'customerdateofbirth',
    'accountholderdob',
  ].map((s) => s.toLowerCase()),
);

function walkRecords(
  raw: unknown,
  depth = 0,
  acc: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || depth > 3) {
    return acc;
  }
  const rec = raw as Record<string, unknown>;
  acc.push(rec);
  for (const value of Object.values(rec)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      walkRecords(value, depth + 1, acc);
    }
  }
  return acc;
}

function parseDobValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  const parsed = parseDobInput(String(value));
  if (parsed) return parsed;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      return parseDobInput(
        `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`,
      );
    }
  }
  return null;
}

function isDobKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_\s-]/g, '');
  if (DOB_KEY_ALIASES.has(k)) return true;
  // My Details labels / nested KYC — avoid expiry / password dates.
  return k.includes('dateofbirth');
}

/**
 * Pull DOB from MeroShare ownDetail or My Details (`dob`).
 * Returns ISO `YYYY-MM-DD` or null.
 */
export function extractDobFromOwnDetail(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== 'object') return null;
  for (const rec of walkRecords(raw)) {
    for (const [key, value] of Object.entries(rec)) {
      if (!isDobKey(key)) continue;
      const parsed = parseDobValue(value);
      if (parsed) return parsed;
    }
  }
  return null;
}

const GUARDIAN_KEY_ALIASES = new Set(
  [
    'fathermothername',
    'fathername',
    'mothername',
    'guardianname',
    'parentname',
    'guardian',
  ].map((s) => s.toLowerCase()),
);

const BANK_NAME_KEY_ALIASES = new Set(
  [
    'bankname',
    'bank',
    'accountbankname',
    'banknameen',
    'banknamenp',
    'asbabankname',
    'linkedbankname',
  ].map((s) => s.toLowerCase()),
);

const BRANCH_NAME_KEY_ALIASES = new Set(
  [
    'branchname',
    'accountbranchname',
    'bankbranchname',
    'branch',
    'branchnameen',
    'accountbranchnameen',
    'bankaccountbranchname',
  ].map((s) => s.toLowerCase()),
);

const BANK_ACCOUNT_NUMBER_KEY_ALIASES = new Set(
  [
    'bankaccountnumber',
    'bankaccountno',
    'asbaaccountnumber',
    'asbaaccountno',
    'accountbanknumber',
    'accountbankno',
    'linkedaccountnumber',
  ].map((s) => s.toLowerCase()),
);

const NESTED_BANK_ACCOUNT_KEYS = [
  'bankAccount',
  'asbaAccount',
  'account',
  'asba',
] as const;

const NESTED_ACCOUNT_NUMBER_KEYS = [
  'accountNumber',
  'accountNo',
  'number',
] as const;

function cleanProfileName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.toUpperCase() === 'N/A') return null;
  return name;
}

function normalizedProfileKey(key: string): string {
  return key.toLowerCase().replace(/[_\s-]/g, '');
}

/**
 * Bank + branch from MeroShare My Details (SS2), e.g.
 * `"NIC Asia Bank Ltd.-Tripureswor"`.
 * Prefers `bankName` (already includes branch) over DP name / ASBA list.
 */
export function extractBankWithBranchFromProfile(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const recs = walkRecords(raw);
  let bankName: string | null = null;
  let branchName: string | null = null;

  for (const rec of recs) {
    const preferred =
      cleanProfileName(rec.bankName) ||
      cleanProfileName(rec.accountBankName) ||
      cleanProfileName(rec.bankNameEn) ||
      cleanProfileName(rec.asbaBankName);
    if (preferred) {
      bankName = preferred;
      break;
    }
  }
  if (!bankName) {
    for (const rec of recs) {
      for (const [key, value] of Object.entries(rec)) {
        const k = normalizedProfileKey(key);
        if (!BANK_NAME_KEY_ALIASES.has(k)) continue;
        bankName = cleanProfileName(value);
        if (bankName) break;
      }
      if (bankName) break;
    }
  }
  for (const rec of recs) {
    for (const [key, value] of Object.entries(rec)) {
      const k = normalizedProfileKey(key);
      if (!BRANCH_NAME_KEY_ALIASES.has(k)) continue;
      branchName = cleanProfileName(value);
      if (branchName) break;
    }
    if (branchName) break;
  }
  if (!bankName) return null;
  if (
    branchName &&
    !bankName.toLowerCase().includes(branchName.toLowerCase())
  ) {
    return `${bankName}-${branchName}`;
  }
  return bankName;
}

function looksLikeDematNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  // CDSC demat / BOID is 16 digits and usually starts with 130.
  return digits.length === 16 && digits.startsWith('130');
}

function cleanBankAccountNumber(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim().replace(/\s+/g, '');
  if (!s || s.toUpperCase() === 'N/A') return null;
  if (looksLikeDematNumber(s)) return null;
  return s;
}

/**
 * ASBA bank account number from MeroShare My Details when present.
 * Avoids mistaking demat / BOID (`accountNumber` on ownDetail) for bank account.
 */
export function extractBankAccountNumberFromProfile(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== 'object') return null;

  for (const rec of walkRecords(raw)) {
    for (const nestKey of NESTED_BANK_ACCOUNT_KEYS) {
      const nested = rec[nestKey];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
        continue;
      }
      const n = nested as Record<string, unknown>;
      for (const key of NESTED_ACCOUNT_NUMBER_KEYS) {
        const num = cleanBankAccountNumber(n[key]);
        if (num) return num;
      }
    }
  }

  for (const rec of walkRecords(raw)) {
    for (const [key, value] of Object.entries(rec)) {
      const k = normalizedProfileKey(key);
      if (!BANK_ACCOUNT_NUMBER_KEY_ALIASES.has(k)) continue;
      const num = cleanBankAccountNumber(value);
      if (num) return num;
    }
  }

  for (const rec of walkRecords(raw)) {
    for (const key of ['accountNumber', 'accountNo'] as const) {
      const num = cleanBankAccountNumber(rec[key]);
      if (num) return num;
    }
  }

  return null;
}

/** Parent / guardian name from My Details when present. */
export function extractGuardianFromProfile(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== 'object') return null;
  for (const rec of walkRecords(raw)) {
    for (const [key, value] of Object.entries(rec)) {
      const k = key.toLowerCase().replace(/[_\s-]/g, '');
      if (!GUARDIAN_KEY_ALIASES.has(k)) continue;
      if (typeof value !== 'string') continue;
      const name = value.trim();
      if (name && name.toUpperCase() !== 'N/A') return name;
    }
  }
  return null;
}

/** Fields to persist when saving DOB / guardian. */
export function buildMinorMetaFields(
  dateOfBirthRaw: string,
  guardianNameRaw: string,
  now = new Date(),
): Pick<AccountMeta, 'dateOfBirth' | 'holderType' | 'guardianName'> {
  const dateOfBirth = parseDobInput(dateOfBirthRaw) ?? undefined;
  const holderType = holderTypeFromDob(dateOfBirth, now);
  return {
    dateOfBirth,
    holderType,
    guardianName:
      holderType === 'minor'
        ? guardianNameRaw.trim() || undefined
        : undefined,
  };
}
