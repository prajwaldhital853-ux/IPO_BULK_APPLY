import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import type { AccountMeta, LinkedAccount } from '../../types/account';
import { resolveBoidSync } from '../../utils/boid';
import { readPickedFileAsString } from '../../utils/pickedFile';
import { getSecrets } from '../../storage/accountsStorage';
import {
  backupFolderHint,
  pickBackupFileFromFolder,
  saveBackupFile,
  type SavedBackupResult,
} from './backupStorage';

export { backupFolderHint, type SavedBackupResult } from './backupStorage';

/** Parallel SecureStore reads above this often crash the app on large lists. */
const SECRET_LOAD_BATCH = 8;
/** Parsed backup text larger than this is rejected (accounts CSV/JSON only). */
const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

export type ImportedAccount = {
  name: string;
  dpId: string;
  dpCode?: string;
  dpName: string;
  username: string;
  bankName?: string;
  /** Linked ASBA bank account number from MeroShare */
  accountNumber?: string;
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
  accountNumber?: string;
  demat?: string;
  dateOfBirth?: string;
  holderType?: 'major' | 'minor';
  guardianName?: string;
};

const CSV_HEADER = ['Name', 'DP', 'Username', 'DP Name', 'Bank', 'Account No', 'BOID'];

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
  'Account No',
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
    a.accountNumber ?? '',
    a.demat || resolveBoidSync(a) || '',
  ]);
  return [CSV_HEADER, ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');
}

/** Full Excel-friendly CSV with password / CRN / PIN. */
export function buildFullAccountsCsv(rows: FullAccountExportRow[]): string {
  const body = fullExportRowsToAoa(rows).slice(1);
  return (
    '\uFEFF' +
    [FULL_CSV_HEADER, ...body.map((r) => r.map((c) => String(c ?? '')))]
      .map((r) => r.map(csvCell).join(','))
      .join('\r\n')
  );
}

export function fullExportRowsToAoa(
  rows: FullAccountExportRow[],
): (string | number)[][] {
  return [
    FULL_CSV_HEADER,
    ...rows.map((r) => [
      r.sn,
      r.name ?? '',
      r.dp ?? '',
      r.client ?? '',
      r.password ?? '',
      r.crn ?? '',
      r.pin ?? '',
      r.dpName ?? '',
      r.bankName ?? '',
      r.accountNumber ?? '',
      r.demat ?? '',
    ]),
  ];
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
        accountNumber: r.accountNumber,
        demat: r.demat,
        boid: r.demat,
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
        accountNumber: a.accountNumber,
        demat: a.demat || resolveBoidSync(a) || undefined,
        boid: a.demat || resolveBoidSync(a) || undefined,
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

/** Detect 16-digit CDSC demat / BOID (130 + DP + username). */
function looksLikeBoid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 16 && digits.startsWith('130');
}

/**
 * Fix older exports that wrote BOID into the Account No column and left BOID blank.
 * Also handles swapped bank-account / BOID columns on import.
 */
function reconcileImportAccountNoAndBoid(
  accountNo?: string,
  demat?: string,
): { accountNumber?: string; demat?: string } {
  const acct = accountNo?.trim() || '';
  const boid = demat?.trim() || '';
  const acctDigits = acct.replace(/\D/g, '');
  const boidDigits = boid.replace(/\D/g, '');

  if (looksLikeBoid(acctDigits) && !boid) {
    return { accountNumber: undefined, demat: acctDigits };
  }
  if (looksLikeBoid(acctDigits) && boid && !looksLikeBoid(boidDigits)) {
    return { accountNumber: boid, demat: acctDigits };
  }
  return {
    accountNumber: acct || undefined,
    demat: boid || undefined,
  };
}

function toAccount(
  name: string,
  dp: string,
  username: string,
  dpName: string,
  bankName?: string,
  accountNumber?: string,
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
    accountNumber: accountNumber?.trim() || undefined,
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
    : ['Name', 'DP', 'Username', 'DP Name', 'Bank', 'Account No', 'BOID'];
  const fullFormat = isFullCsvHeaders(headers);

  const iName = findCol(headers, 'name', 'holder');
  const iDp = findCol(headers, 'dp', 'dpcode', 'depository', 'clientid');
  const iUser = fullFormat
    ? findCol(headers, 'client', 'username', 'user', 'login')
    : findCol(headers, 'username', 'user', 'client', 'login');
  const iDpName = findCol(headers, 'dpname', 'depositoryname');
  const iBank = findCol(headers, 'bank');
  const iAccountNo = findCol(
    headers,
    'accountno',
    'accountnumber',
    'bankaccount',
    'bankaccountno',
  );
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
      const rawAccountNo =
        iAccountNo >= 0 ? get(iAccountNo) || undefined : get(9) || undefined;
      const rawDemat =
        iDemat >= 0 ? get(iDemat) || undefined : get(10) || undefined;
      const { accountNumber, demat: dematVal } = reconcileImportAccountNoAndBoid(
        rawAccountNo,
        rawDemat,
      );
      const acc = toAccount(
        get(iName >= 0 ? iName : 1),
        get(iDp >= 0 ? iDp : 2),
        get(iUser >= 0 ? iUser : 3),
        get(iDpName >= 0 ? iDpName : 7),
        get(iBank >= 0 ? iBank : 8) || undefined,
        accountNumber,
        dematVal,
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

    const rawAccountNo =
      iAccountNo >= 0 ? get(iAccountNo) || undefined : get(5) || undefined;
    const rawDemat =
      iDemat >= 0 ? get(iDemat) || undefined : get(6) || undefined;
    const { accountNumber, demat: dematVal } = reconcileImportAccountNoAndBoid(
      rawAccountNo,
      rawDemat,
    );
    const acc = toAccount(
      get(iName >= 0 ? iName : 0),
      get(iDp >= 0 ? iDp : 1),
      get(iUser >= 0 ? iUser : 2),
      get(iDpName >= 0 ? iDpName : 3),
      get(iBank >= 0 ? iBank : 4) || undefined,
      accountNumber,
      dematVal,
      get(iHolder >= 0 ? iHolder : -1) || undefined,
      get(iGuardian >= 0 ? iGuardian : -1) || undefined,
      get(iDob >= 0 ? iDob : -1) || undefined,
    );
    if (acc) out.push(acc);
  }
  return out;
}

function rowToImportedAccount(r: Record<string, unknown>): ImportedAccount | null {
  const { accountNumber, demat } = reconcileImportAccountNoAndBoid(
    r.accountNumber != null ? String(r.accountNumber) : undefined,
    r.demat || r.boid ? String(r.demat ?? r.boid) : undefined,
  );
  return toAccount(
    String(r.name ?? ''),
    String(r.dpCode ?? r.dpId ?? r.dp ?? ''),
    String(r.username ?? r.client ?? ''),
    String(r.dpName ?? ''),
    r.bankName ? String(r.bankName) : undefined,
    accountNumber,
    demat,
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

async function readBackupFileContent(
  uri: string,
  fileName: string,
): Promise<string> {
  if (isSpreadsheetFile(fileName)) {
    const base64 = await readPickedFileAsString(uri, 'base64', fileName);
    const wb = XLSX.read(base64, { type: 'base64' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return '';
    const sheet = wb.Sheets[sheetName];
    return sheet ? XLSX.utils.sheet_to_csv(sheet) : '';
  }
  return readPickedFileAsString(uri, 'utf8', fileName);
}

/** Write accounts to a file in Download/Nepse Ghar (or app backup folder on iOS). */
export async function exportAccountsFile(
  accounts: AccountMeta[],
  kind: 'csv' | 'json',
): Promise<SavedBackupResult> {
  const content =
    kind === 'csv' ? buildAccountsCsv(accounts) : buildAccountsBackup(accounts);
  const ext = kind === 'csv' ? 'csv' : 'json';
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `NEPSE-GHAR-accounts-${stamp}.${ext}`;
  return saveBackupFile(fileName, { kind: 'text', content });
}

/** Full JSON backup with passwords, CRN and PIN restored on import. */
export async function exportFullAccountsBackup(
  rows: FullAccountExportRow[],
): Promise<SavedBackupResult> {
  if (!rows.length) {
    throw new Error('No accounts to export');
  }
  const content = buildFullAccountsBackup(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `NEPSE-GHAR-accounts-${stamp}-${rows.length}.json`;
  return saveBackupFile(fileName, { kind: 'text', content });
}

/**
 * Export every saved account (incl. password, CRN, PIN) as a real .xlsx file.
 */
export async function exportFullAccountsExcel(
  rows: FullAccountExportRow[],
): Promise<SavedBackupResult> {
  if (!rows.length) {
    throw new Error('No accounts to export');
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(fullExportRowsToAoa(rows));
  ws['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 10 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Accounts');

  const base64 = XLSX.write(wb, {
    type: 'base64',
    bookType: 'xlsx',
  }) as string;

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `NEPSE-GHAR-accounts-${stamp}-${rows.length}.xlsx`;
  return saveBackupFile(fileName, { kind: 'base64', content: base64 });
}

/**
 * Export every saved account (incl. password, CRN, PIN) as a UTF-8 .csv file.
 */
export async function exportFullAccountsCsv(
  rows: FullAccountExportRow[],
): Promise<SavedBackupResult> {
  if (!rows.length) {
    throw new Error('No accounts to export');
  }
  const content = buildFullAccountsCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `NEPSE-GHAR-accounts-${stamp}-${rows.length}.csv`;
  return saveBackupFile(fileName, { kind: 'text', content });
}

export async function loadFullExportRows(
  accounts: AccountMeta[],
  onProgress?: (done: number, total: number) => void,
): Promise<FullAccountExportRow[]> {
  const rows: FullAccountExportRow[] = [];
  const total = accounts.length;
  for (let i = 0; i < total; i += SECRET_LOAD_BATCH) {
    const chunk = accounts.slice(i, i + SECRET_LOAD_BATCH);
    const chunkRows = await Promise.all(
      chunk.map(async (account, j) => {
        const index = i + j;
        let secrets: { password?: string; crn?: string; pin?: string } | null =
          null;
        try {
          secrets = await getSecrets(account.id);
        } catch {
          secrets = null;
        }
        return accountMetaToFullExportRow(account, index, secrets);
      }),
    );
    rows.push(...chunkRows);
    onProgress?.(Math.min(i + chunk.length, total), total);
  }
  return rows;
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
    accountNumber: account.accountNumber,
    demat: account.demat || resolveBoidSync(account) || undefined,
    dateOfBirth: account.dateOfBirth,
    holderType: account.holderType,
    guardianName: account.guardianName,
  };
}

function isSpreadsheetFile(name: string, mimeType?: string | null): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.json') || lower.endsWith('.txt')) {
    return false;
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return true;
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('csv') || mime.includes('json') || mime === 'text/plain') {
    return false;
  }
  return (
    mime.includes('spreadsheetml') ||
    mime.includes('openxmlformats-officedocument.spreadsheetml') ||
    (mime.includes('ms-excel') && !mime.includes('csv'))
  );
}

function parseAccountsWorkbook(wb: XLSX.WorkBook): ImportedAccount[] {
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return parseAccountsCsv(XLSX.utils.sheet_to_csv(sheet));
}

async function readSpreadsheetWorkbook(
  uri: string,
  fileName?: string,
): Promise<XLSX.WorkBook> {
  const base64 = await readPickedFileAsString(uri, 'base64', fileName);
  return XLSX.read(base64, { type: 'base64' });
}

/** Open the document picker and return the selected file's text content. */
export async function pickAccountsFile(): Promise<{
  name: string;
  content: string;
} | null> {
  const fromBackupFolder = await pickBackupFileFromFolder();
  if (fromBackupFolder === 'canceled') return null;
  if (fromBackupFolder) {
    const content = await readBackupFileContent(
      fromBackupFolder.uri,
      fromBackupFolder.name,
    );
    if (!content.trim()) {
      throw new Error('That backup file is empty or could not be read.');
    }
    if (content.length > MAX_IMPORT_BYTES) {
      throw new Error('That backup file is too large to import.');
    }
    return { name: fromBackupFolder.name, content };
  }

  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv',
      'text/comma-separated-values',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json',
      'text/plain',
      '*/*',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const name = asset.name ?? 'file';
  const spreadsheet = isSpreadsheetFile(name, asset.mimeType);
  if (spreadsheet) {
    const wb = await readSpreadsheetWorkbook(asset.uri, name);
    const accounts = parseAccountsWorkbook(wb);
    if (!accounts.length) {
      throw new Error(
        'No accounts found in that Excel file. Use a NEPSE GHAR accounts export.',
      );
    }
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    const content = sheet ? XLSX.utils.sheet_to_csv(sheet) : '';
    if (!content.trim()) {
      throw new Error('That Excel file is empty or could not be read.');
    }
    if (content.length > MAX_IMPORT_BYTES) {
      throw new Error('That Excel file is too large to import.');
    }
    return { name, content };
  }
  const content = await readPickedFileAsString(asset.uri, 'utf8', name);
  if (!content.trim()) {
    throw new Error('That file is empty or could not be read.');
  }
  if (content.length > MAX_IMPORT_BYTES) {
    throw new Error(
      'That backup file is too large to import. Try exporting again from NEPSE GHAR.',
    );
  }
  return { name, content };
}

export function toLinkedDraft(a: ImportedAccount): Omit<LinkedAccount, 'id'> {
  const password = a.password ?? '';
  const crn = a.crn ?? '';
  const pin = a.pin ?? '';
  const hasCrnPin = Boolean(crn.trim() || pin.trim());
  const hasPassword = Boolean(password.trim());
  return {
    name: a.name,
    dpId: a.dpId,
    dpCode: a.dpCode,
    dpName: a.dpName,
    username: a.username,
    bankName: a.bankName,
    accountNumber: a.accountNumber,
    demat: a.demat,
    dateOfBirth: a.dateOfBirth,
    holderType: a.holderType,
    guardianName: a.holderType === 'minor' ? a.guardianName : undefined,
    verified: hasPassword,
    crnPinVerified: hasCrnPin,
    password,
    crn,
    pin,
  };
}
