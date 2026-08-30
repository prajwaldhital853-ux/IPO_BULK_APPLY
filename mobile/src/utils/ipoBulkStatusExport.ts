import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { humanizeApplicationStatus } from '../services/meroshare';
import type { ResultAccountStatus } from '../services/meroshare';
import type { AccountMeta } from '../types/account';
import { resolveBoidSync } from './boid';

export type IpoResultKind = 'allotted' | 'not' | 'rejected' | 'not_applied';

const HEADERS_ALLOTTED = [
  'S.N.',
  'Account Name',
  'BOID',
  'Company Name',
  'Symbol',
  'Apply Quantity',
  'Allotted Quantity',
  'Status',
] as const;

const HEADERS_NOT_ALLOTTED = [
  'S.N.',
  'Account Name',
  'BOID',
  'Company Name',
  'Symbol',
  'Apply Quantity',
  'Allotted Quantity',
  'Status',
  'Reason',
] as const;

export function classifyIpoResult(
  row: ResultAccountStatus,
): IpoResultKind {
  if (
    row.status === 'NOT_APPLIED' ||
    /no application found|not applied|have not applied/i.test(row.message)
  ) {
    return 'not_applied';
  }
  if (!row.ok) return 'rejected';
  const { code } = humanizeApplicationStatus(row.status, row.allotmentStatus);
  if (code === 'ALLOTTED') return 'allotted';
  if (code === 'NOT_APPLIED') return 'not_applied';
  if (code === 'NOT_ALLOTTED' || /NOT.?ALLOT/i.test(row.message)) return 'not';
  if (/REJECT|FAIL|ERROR|CANCEL/i.test(row.status + row.message)) return 'rejected';
  return 'not';
}

function appliedQty(row: ResultAccountStatus): number | '' {
  if (row.appliedKitta != null && Number.isFinite(row.appliedKitta)) {
    return row.appliedKitta;
  }
  const m = String(row.message || '').match(/quantity\s*:\s*(\d+)/i);
  if (m?.[1]) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : '';
  }
  return '';
}

function allottedQty(row: ResultAccountStatus, kind: IpoResultKind): number | '' {
  if (kind !== 'allotted') return 0;
  const applied = appliedQty(row);
  return applied === '' ? '' : applied;
}

function cleanReason(raw: string): string | null {
  const text = raw
    .replace(/\s*\(HTTP\s*\d+\)\s*$/i, '')
    .replace(/^rejected\s*\(\s*quantity\s*:\s*\d+\s*\)\s*[-–—]?\s*/i, '')
    .replace(/^rejected\s*[-–—:]\s*/i, '')
    .trim();
  if (!text) return null;
  if (/^rejected\.?$/i.test(text)) return null;
  if (/^not\s*allot/i.test(text)) return null;
  if (/^block\s*amount\s*status/i.test(text)) return null;
  if (/^\(?\s*quantity\s*:/i.test(text)) return null;
  return text;
}

function rejectReason(row: ResultAccountStatus): string | null {
  for (const candidate of [row.remarks, row.allotmentStatus, row.message]) {
    const text = cleanReason(String(candidate ?? ''));
    if (!text) continue;
    if (/insufficient|not enough|low balance|block[_\s-]?fail/i.test(text)) {
      return 'Insufficient Balance';
    }
    if (/block|frozen|suspend|disabled/i.test(text) && /account/i.test(text)) {
      return 'Account Blocked';
    }
    if (/\bcrn\b/i.test(text)) return 'CRN Mismatch';
    if (/\bpan\b/i.test(text)) return 'PAN Not Registered';
    if (/duplicate|already applied/i.test(text)) return 'Duplicate Application';
    if (/expire/i.test(text)) return 'Account Expired';
    return text.length > 80 ? `${text.slice(0, 78)}…` : text;
  }
  return null;
}

function notAllottedReason(row: ResultAccountStatus, kind: IpoResultKind): string {
  if (kind === 'not_applied') return 'Not Applied';
  if (kind === 'not') return 'Not Allotted';
  return rejectReason(row) ?? 'Rejected';
}

function statusLabel(kind: IpoResultKind): string {
  if (kind === 'allotted') return 'Allotted';
  if (kind === 'not_applied') return 'Not Applied';
  if (kind === 'rejected') return 'Rejected';
  return 'Not Allotted';
}

function boidForRow(
  row: ResultAccountStatus,
  accountById: Map<string, AccountMeta>,
): string {
  const account = accountById.get(row.accountId);
  if (!account) return row.username;
  return resolveBoidSync(account) ?? account.demat?.trim() ?? row.username;
}

function buildSheetRows(
  rows: ResultAccountStatus[],
  accountById: Map<string, AccountMeta>,
  companyName: string,
  symbol: string,
  includeReason: boolean,
): (string | number)[][] {
  const out: (string | number)[][] = [];
  rows.forEach((row, idx) => {
    const kind = classifyIpoResult(row);
    const base = [
      idx + 1,
      row.accountName,
      boidForRow(row, accountById),
      companyName,
      symbol,
      appliedQty(row),
      allottedQty(row, kind),
      statusLabel(kind),
    ];
    if (includeReason) {
      base.push(notAllottedReason(row, kind));
    }
    out.push(base);
  });
  return out;
}

function columnWidths(includeReason: boolean) {
  const widths = [
    { wch: 6 },
    { wch: 28 },
    { wch: 20 },
    { wch: 34 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
  ];
  if (includeReason) widths.push({ wch: 36 });
  return widths;
}

export async function shareIpoBulkStatusExcel(opts: {
  results: ResultAccountStatus[];
  accounts: AccountMeta[];
  companyName: string;
  symbol: string;
}): Promise<void> {
  const { results, accounts, companyName, symbol } = opts;
  if (!results.length) {
    throw new Error('Run IPO Bulk Status first.');
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const allottedRows = results.filter((r) => classifyIpoResult(r) === 'allotted');
  const notAllottedRows = results.filter((r) => classifyIpoResult(r) !== 'allotted');

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const meta = [
    ['IPO Bulk Status Export'],
    ['Company', companyName],
    ['Symbol', symbol || '—'],
    ['Generated', new Date().toLocaleString()],
    [],
  ];

  const wb = XLSX.utils.book_new();

  const allottedAoa = [
    ...meta,
    [...HEADERS_ALLOTTED],
    ...buildSheetRows(
      allottedRows,
      accountById,
      companyName,
      symbol,
      false,
    ),
  ];
  const allottedWs = XLSX.utils.aoa_to_sheet(allottedAoa);
  allottedWs['!cols'] = columnWidths(false);
  XLSX.utils.book_append_sheet(wb, allottedWs, 'Allotted');

  const notAoa = [
    ...meta,
    [...HEADERS_NOT_ALLOTTED],
    ...buildSheetRows(
      notAllottedRows,
      accountById,
      companyName,
      symbol,
      true,
    ),
  ];
  const notWs = XLSX.utils.aoa_to_sheet(notAoa);
  notWs['!cols'] = columnWidths(true);
  XLSX.utils.book_append_sheet(wb, notWs, 'Not Allotted');

  const base64 = XLSX.write(wb, {
    type: 'base64',
    bookType: 'xlsx',
  }) as string;

  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) {
    throw new Error('Storage is not available on this device.');
  }

  const safeSymbol = (symbol || 'IPO').replace(/[^\w.-]+/g, '_');
  const fileUri = `${dir}IPO_Bulk_Status_${safeSymbol}_${stamp}.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`Excel file saved at:\n${fileUri}`);
  }

  await Sharing.shareAsync(fileUri, {
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Share IPO Bulk Status Excel',
    UTI: 'com.microsoft.excel.xlsx',
  });
}
