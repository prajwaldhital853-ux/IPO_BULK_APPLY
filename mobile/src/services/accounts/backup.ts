import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { AccountMeta, LinkedAccount } from '../../types/account';

export type ImportedAccount = {
  name: string;
  dpId: string;
  dpCode?: string;
  dpName: string;
  username: string;
  bankName?: string;
  demat?: string;
  dateOfBirth?: string;
  holderType?: 'major' | 'minor';
  guardianName?: string;
  password?: string;
  crn?: string;
  pin?: string;
};

/** Full device backup row — includes secrets (Excel / JSON export). */
export type FullAccountExportRow = {
  sn: number;
  name: string;
  dp: string;
  client: string;
  password: string;
  crn: string;
  pin: string;
  dpName?: string;
  bankName?: string;
  demat?: string;
  dateOfBirth?: string;
  holderType?: 'major' | 'minor';
  guardianName?: string;
};

const CSV_HEADER = ['Name', 'DP', 'Username', 'DP Name', 'Bank', 'BOID'];

const FULL_CSV_HEADER = [
  'S.N.',
  'Name',
  'DP',
  'Client',
  'Password',
  'CRN',
  'PIN',
  'DP Name',
  'Bank',
  'BOID',
];

function csvCell(v: string): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export function buildAccountsCsv(accounts: AccountMeta[]): string {
  const rows = accounts.map((a) => [
    a.name ?? '',
    a.dpCode ?? a.dpId ?? '',
    a.username ?? '',
    a.dpName ?? '',
    a.bankName ?? '',
    a.demat ?? '',
  ]);
  return [CSV_HEADER, ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');
}

/** Full Excel-friendly CSV with password / CRN / PIN. */
export function buildFullAccountsCsv(rows: FullAccountExportRow[]): string {
  const body = rows.map((r) => [
    String(r.sn),
    r.name ?? '',
    r.dp ?? '',
    r.client ?? '',
    r.password ?? '',
    r.crn ?? '',
    r.pin ?? '',
    r.dpName ?? '',
    r.bankName ?? '',
    r.demat ?? '',
  ]);
  return (
    '\uFEFF' +
    [FULL_CSV_HEADER, ...body]
      .map((r) => r.map(csvCell).join(','))
      .join('\r\n')
  );
}

export function buildFullAccountsBackup(
  rows: FullAccountExportRow[],
): string {
  return JSON.stringify(
    {
      app: 'NEPSE GHAR',
      type: 'accounts-backup',
      version: 2,
      includesSecrets: true,
      note: 'Contains passwords, CRN and PIN. Keep this file private.',
      exportedAt: new Date().toISOString(),
      accounts: rows.map((r) => ({
        name: r.name,
        dpId: r.dp,
        dpCode: r.dp,
        dpName: r.dpName ?? '',
        username: r.client,
        bankName: r.bankName,
        demat: r.demat,
        dateOfBirth: r.dateOfBirth,
        holderType: r.holderType,
        guardianName: r.guardianName,
        password: r.password,
        crn: r.crn,
        pin: r.pin,
      })),
    },
    null,
    2,
  );
}

/** Legacy JSON export without secrets (kept for compatibility). */
export function buildAccountsBackup(accounts: AccountMeta[]): string {
  return JSON.stringify(
    {
      app: 'NEPSE GHAR',
      type: 'accounts-backup',
      version: 1,
      includesSecrets: false,
      note: 'Passwords, CRN and PIN are NOT included. Re-enter them after import.',
      exportedAt: new Date().toISOString(),
      accounts: accounts.map((a) => ({
        name: a.name,
        dpId: a.dpId,
        dpCode: a.dpCode,
        dpName: a.dpName,
        username: a.username,
        bankName: a.bankName,
        demat: a.demat,
        dateOfBirth: a.dateOfBirth,
        holderType: a.holderType,
        guardianName: a.guardianName,
      })),
    },
    null,
    2,
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function findCol(headers: string[], ...candidates: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const cand of candidates) {
    const key = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = norm.findIndex((h) => h === key || h.includes(key));
    if (idx !== -1) return idx;
  }
  return -1;
}

function toAccount(
  name: string,
  dp: string,
  username: string,
  dpName: string,
  bankName?: string,
  demat?: string,
  holderType?: string,
  guardianName?: string,
  dateOfBirth?: string,
  secrets?: { password?: string; crn?: string; pin?: string },
): ImportedAccount | null {
  const cleanName = name.trim();
  const cleanDp = dp.trim();
  const cleanUser = username.trim();
  if (!cleanUser || !cleanDp) return null;
  const dob = dateOfBirth?.trim() || undefined;
  const ht =
    holderType?.trim().toLowerCase() === 'minor'
      ? ('minor' as const)
      : holderType?.trim().toLowerCase() === 'major'
        ? ('major' as const)
        : undefined;
  return {
    name: cleanName || cleanUser,
    dpId: cleanDp,
    dpCode: cleanDp,
    dpName: dpName.trim(),
    username: cleanUser,
    bankName: bankName?.trim() || undefined,
    demat: demat?.trim() || undefined,
    dateOfBirth: dob,
    holderType: ht,
    guardianName:
      ht === 'minor' ? guardianName?.trim() || undefined : undefined,
    password: secrets?.password?.trim() || undefined,
    crn: secrets?.crn?.trim() || undefined,
    pin: secrets?.pin?.trim() || undefined,
  };
}

function isFullCsvHeaders(headers: string[]): boolean {
  return (
    findCol(headers, 'password') >= 0 ||
    (findCol(headers, 'client') >= 0 && findCol(headers, 'username') < 0)
  );
}

export function parseAccountsCsv(text: string): ImportedAccount[] {
  const lines = stripBom(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const first = parseCsvLine(lines[0]);
  const looksLikeHeader = first.some((c) => /name|dp|user|bank|boid|client|password/i.test(c));
  const headers = looksLikeHeader
    ? first
    : ['Name', 'DP', 'Username', 'DP Name', 'Bank', 'BOID'];
  const fullFormat = isFullCsvHeaders(headers);

  const iName = findCol(headers, 'name', 'account', 'holder');
  const iDp = findCol(headers, 'dp', 'dpcode', 'depository', 'clientid');
  const iUser = fullFormat
    ? findCol(headers, 'client', 'username', 'user', 'login')
    : findCol(headers, 'username', 'user', 'client', 'login');
  const iDpName = findCol(headers, 'dpname', 'depositoryname');
  const iBank = findCol(headers, 'bank');
  const iDemat = findCol(headers, 'boid', 'demat');
  const iPassword = findCol(headers, 'password', 'pass');
  const iCrn = findCol(headers, 'crn');
  const iPin = findCol(headers, 'pin', 'tpin');
  const iDob = findCol(headers, 'dateofbirth', 'dob');
  const iHolder = findCol(headers, 'holdertype', 'type');
  const iGuardian = findCol(headers, 'guardian', 'guardianname');

  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const out: ImportedAccount[] = [];
  for (const line of dataLines) {
    const cells = parseCsvLine(line);
    const get = (idx: number, fallback = '') =>
      idx >= 0 && idx < cells.length ? cells[idx] : fallback;

    if (fullFormat) {
      const acc = toAccount(
        get(iName >= 0 ? iName : 1),
        get(iDp >= 0 ? iDp : 2),
        get(iUser >= 0 ? iUser : 3),
        get(iDpName >= 0 ? iDpName : 7),
        get(iBank >= 0 ? iBank : 8) || undefined,
        get(iDemat >= 0 ? iDemat : 9) || undefined,
        get(iHolder >= 0 ? iHolder : -1) || undefined,
        get(iGuardian >= 0 ? iGuardian : -1) || undefined,
        get(iDob >= 0 ? iDob : -1) || undefined,
        {
          password: get(iPassword >= 0 ? iPassword : 4),
          crn: get(iCrn >= 0 ? iCrn : 5),
          pin: get(iPin >= 0 ? iPin : 6),
        },
      );
      if (acc) out.push(acc);
      continue;
    }

    const acc = toAccount(
      get(iName >= 0 ? iName : 0),
      get(iDp >= 0 ? iDp : 1),
      get(iUser >= 0 ? iUser : 2),
      get(iDpName >= 0 ? iDpName : 3),
      get(iBank >= 0 ? iBank : 4) || undefined,
      get(iDemat >= 0 ? iDemat : 5) || undefined,
      get(iHolder >= 0 ? iHolder : -1) || undefined,
      get(iGuardian >= 0 ? iGuardian : -1) || undefined,
      get(iDob >= 0 ? iDob : -1) || undefined,
    );
    if (acc) out.push(acc);
  }
  return out;
}

function rowToImportedAccount(r: Record<string, unknown>): ImportedAccount | null {
  return toAccount(
    String(r.name ?? ''),
    String(r.dpCode ?? r.dpId ?? r.dp ?? ''),
    String(r.username ?? r.client ?? ''),
    String(r.dpName ?? ''),
    r.bankName ? String(r.bankName) : undefined,
    r.demat ? String(r.demat) : undefined,
    r.holderType ? String(r.holderType) : undefined,
    r.guardianName ? String(r.guardianName) : undefined,
    r.dateOfBirth ? String(r.dateOfBirth) : undefined,
    {
      password: r.password != null ? String(r.password) : undefined,
      crn: r.crn != null ? String(r.crn) : undefined,
      pin: r.pin != null ? String(r.pin) : undefined,
    },
  );
}

export function parseAccountsBackup(text: string): ImportedAccount[] {
  const data = JSON.parse(stripBom(text)) as {
    accounts?: Array<Record<string, unknown>>;
  };
  const rows = Array.isArray(data?.accounts) ? data.accounts : [];
  const out: ImportedAccount[] = [];
  for (const r of rows) {
    const acc = rowToImportedAccount(r);
    if (acc) out.push(acc);
  }
  return out;
}

export function parseImportedAccounts(text: string): ImportedAccount[] {
  const trimmed = stripBom(text).trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseAccountsBackup(trimmed);
    } catch {
      // fall through to CSV
    }
  }
  return parseAccountsCsv(trimmed);
}

export function importIncludesSecrets(accounts: ImportedAccount[]): boolean {
  return accounts.some(
    (a) =>
      Boolean(a.password?.trim()) ||
      Boolean(a.crn?.trim()) ||
      Boolean(a.pin?.trim()),
  );
}

async function shareBackupFile(
  fileUri: string,
  mimeType: string,
  dialogTitle: string,
  uti: string,
): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle,
      UTI: uti,
    });
  }
}

/** Write accounts to a file and open the system share sheet. */
export async function exportAccountsFile(
  accounts: AccountMeta[],
  kind: 'csv' | 'json',
): Promise<void> {
  const content =
    kind === 'csv' ? buildAccountsCsv(accounts) : buildAccountsBackup(accounts);
  const ext = kind === 'csv' ? 'csv' : 'json';
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const fileUri = `${dir}nepse-ghar-accounts-${stamp}.${ext}`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await shareBackupFile(
    fileUri,
    kind === 'csv' ? 'text/csv' : 'application/json',
    'Export NEPSE GHAR accounts',
    kind === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
  );
}

/** Full JSON backup with passwords, CRN and PIN restored on import. */
export async function exportFullAccountsBackup(
  rows: FullAccountExportRow[],
): Promise<void> {
  if (!rows.length) {
    throw new Error('No accounts to export');
  }
  const content = buildFullAccountsBackup(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const fileUri = `${dir}nepse-ghar-accounts-full-${stamp}-${rows.length}.json`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await shareBackupFile(
    fileUri,
    'application/json',
    `Save ${rows.length} accounts backup`,
    'public.json',
  );
}

/**
 * Export every saved account (incl. password, CRN, PIN) as a UTF-8 CSV
 * Excel can open without the “extension doesn’t match” warning.
 */
export async function exportFullAccountsExcel(
  rows: FullAccountExportRow[],
): Promise<string> {
  if (!rows.length) {
    throw new Error('No accounts to export');
  }
  const content = buildFullAccountsCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const fileUri = `${dir}nepse-ghar-accounts-full-${stamp}-${rows.length}.csv`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await shareBackupFile(
    fileUri,
    'text/csv',
    `Save ${rows.length} accounts Excel file`,
    'public.comma-separated-values-text',
  );
  return fileUri;
}

export function accountMetaToFullExportRow(
  account: AccountMeta,
  index: number,
  secrets: { password?: string; crn?: string; pin?: string } | null,
): FullAccountExportRow {
  return {
    sn: index + 1,
    name: account.name ?? '',
    dp: account.dpCode ?? account.dpId ?? '',
    client: account.username ?? '',
    password: secrets?.password ?? '',
    crn: secrets?.crn ?? '',
    pin: secrets?.pin ?? '',
    dpName: account.dpName,
    bankName: account.bankName,
    demat: account.demat,
    dateOfBirth: account.dateOfBirth,
    holderType: account.holderType,
    guardianName: account.guardianName,
  };
}

/** Open the document picker and return the selected file's text content. */
export async function pickAccountsFile(): Promise<{
  name: string;
  content: string;
} | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv',
      'text/comma-separated-values',
      'application/vnd.ms-excel',
      'application/json',
      'text/plain',
      '*/*',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const content = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { name: asset.name ?? 'file', content };
}

export function toLinkedDraft(a: ImportedAccount): Omit<LinkedAccount, 'id'> {
  const password = a.password ?? '';
  const crn = a.crn ?? '';
  const pin = a.pin ?? '';
  const hasCrnPin = Boolean(crn.trim() || pin.trim());
  return {
    name: a.name,
    dpId: a.dpId,
    dpCode: a.dpCode,
    dpName: a.dpName,
    username: a.username,
    bankName: a.bankName,
    demat: a.demat,
    dateOfBirth: a.dateOfBirth,
    holderType: a.holderType,
    guardianName: a.holderType === 'minor' ? a.guardianName : undefined,
    verified: false,
    crnPinVerified: hasCrnPin,
    password,
    crn,
    pin,
  };
}
