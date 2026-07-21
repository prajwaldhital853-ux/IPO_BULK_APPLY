import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { AccountMeta, LinkedAccount } from '../../types/account';

/** Account fields we back up / import (never includes secrets by design). */
export type ImportedAccount = {
  name: string;
  dpId: string;
  dpCode?: string;
  dpName: string;
  username: string;
  bankName?: string;
  demat?: string;
};

const CSV_HEADER = ['Name', 'DP', 'Username', 'DP Name', 'Bank', 'BOID'];

function csvCell(v: string): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

export function buildAccountsBackup(accounts: AccountMeta[]): string {
  return JSON.stringify(
    {
      app: 'NEPSE GHAR',
      type: 'accounts-backup',
      note: 'Passwords, CRN and PIN are NOT included. Re-enter them after import.',
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts: accounts.map((a) => ({
        name: a.name,
        dpId: a.dpId,
        dpCode: a.dpCode,
        dpName: a.dpName,
        username: a.username,
        bankName: a.bankName,
        demat: a.demat,
      })),
    },
    null,
    2,
  );
}

/** Minimal CSV row parser supporting quoted cells and escaped quotes. */
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
): ImportedAccount | null {
  const cleanName = name.trim();
  const cleanDp = dp.trim();
  const cleanUser = username.trim();
  if (!cleanUser || !cleanDp) return null;
  return {
    name: cleanName || cleanUser,
    // dpId resolves both the login clientId and the 5-digit code at runtime.
    dpId: cleanDp,
    dpCode: cleanDp,
    dpName: dpName.trim(),
    username: cleanUser,
    bankName: bankName?.trim() || undefined,
    demat: demat?.trim() || undefined,
  };
}

export function parseAccountsCsv(text: string): ImportedAccount[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const first = parseCsvLine(lines[0]);
  const looksLikeHeader = first.some((c) => /name|dp|user|bank|boid/i.test(c));
  const headers = looksLikeHeader
    ? first
    : ['Name', 'DP', 'Username', 'DP Name', 'Bank', 'BOID'];

  const iName = findCol(headers, 'name', 'account', 'holder');
  const iDp = findCol(headers, 'dp', 'dpcode', 'depository', 'clientid');
  const iUser = findCol(headers, 'username', 'user', 'boid', 'login');
  const iDpName = findCol(headers, 'dpname', 'depositoryname');
  const iBank = findCol(headers, 'bank');
  const iDemat = findCol(headers, 'boid', 'demat');

  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const out: ImportedAccount[] = [];
  for (const line of dataLines) {
    const cells = parseCsvLine(line);
    const get = (idx: number, fallback = '') =>
      idx >= 0 && idx < cells.length ? cells[idx] : fallback;
    // Fallback to positional order: Name, DP, Username, DP Name, Bank, BOID
    const acc = toAccount(
      get(iName >= 0 ? iName : 0),
      get(iDp >= 0 ? iDp : 1),
      get(iUser >= 0 ? iUser : 2),
      get(iDpName >= 0 ? iDpName : 3),
      get(iBank >= 0 ? iBank : 4) || undefined,
      get(iDemat >= 0 ? iDemat : 5) || undefined,
    );
    if (acc) out.push(acc);
  }
  return out;
}

export function parseAccountsBackup(text: string): ImportedAccount[] {
  const data = JSON.parse(text) as {
    accounts?: Array<Record<string, unknown>>;
  };
  const rows = Array.isArray(data?.accounts) ? data.accounts : [];
  const out: ImportedAccount[] = [];
  for (const r of rows) {
    const acc = toAccount(
      String(r.name ?? ''),
      String(r.dpCode ?? r.dpId ?? ''),
      String(r.username ?? ''),
      String(r.dpName ?? ''),
      r.bankName ? String(r.bankName) : undefined,
      r.demat ? String(r.demat) : undefined,
    );
    if (acc) out.push(acc);
  }
  return out;
}

/** Auto-detect JSON backup vs CSV/Excel export and parse accordingly. */
export function parseImportedAccounts(text: string): ImportedAccount[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseAccountsBackup(trimmed);
    } catch {
      // fall through to CSV
    }
  }
  return parseAccountsCsv(trimmed);
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
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: kind === 'csv' ? 'text/csv' : 'application/json',
      dialogTitle: 'Export NEPSE GHAR accounts',
      UTI:
        kind === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
    });
  }
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

/** Build the object addAccount() expects (secrets blank per design). */
export function toLinkedDraft(a: ImportedAccount): Omit<LinkedAccount, 'id'> {
  return {
    name: a.name,
    dpId: a.dpId,
    dpCode: a.dpCode,
    dpName: a.dpName,
    username: a.username,
    bankName: a.bankName,
    demat: a.demat,
    verified: false,
    crnPinVerified: false,
    password: '',
    crn: '',
    pin: '',
  };
}
