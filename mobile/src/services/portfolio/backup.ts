import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { readPickedFileAsString } from '../../utils/pickedFile';
import {
  listPortfolios,
  replaceAllPortfolios,
  type Portfolio,
  type PortfolioHolding,
} from '../../storage/portfolioStorage';

type BackupPayload = {
  app: string;
  type: 'portfolios-backup';
  version: number;
  exportedAt: string;
  portfolios: Portfolio[];
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function exportPortfoliosBackup(): Promise<void> {
  const portfolios = await listPortfolios();
  const payload: BackupPayload = {
    app: 'NEPSE GHAR',
    type: 'portfolios-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolios,
  };
  const content = JSON.stringify(payload, null, 2);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const fileUri = `${dir}nepse-ghar-portfolios-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Portfolios',
    });
  }
}

function parseHoldingsCsv(text: string): PortfolioHolding[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) =>
    h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
  );
  const symI = headers.findIndex((h) => h === 'symbol' || h === 'scrip');
  const qtyI = headers.findIndex(
    (h) => h === 'qty' || h === 'quantity' || h === 'units',
  );
  const waccI = headers.findIndex(
    (h) => h === 'wacc' || h === 'rate' || h === 'price' || h === 'avgcost',
  );
  const nameI = headers.findIndex((h) => h === 'name' || h === 'company');
  if (symI < 0 || qtyI < 0 || waccI < 0) {
    throw new Error('CSV needs Symbol, Qty, and WACC columns');
  }
  const out: PortfolioHolding[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const symbol = (cells[symI] ?? '').toUpperCase();
    const qty = Number(cells[qtyI]);
    const wacc = Number(cells[waccI]);
    if (!symbol || !Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(wacc) || wacc < 0) continue;
    out.push({
      symbol,
      name: (cells[nameI] ?? symbol).trim() || symbol,
      qty,
      wacc,
    });
  }
  return out;
}

export async function importPortfoliosBackup(): Promise<{
  count: number;
  mode: 'json' | 'csv';
}> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'application/json',
      'text/csv',
      'text/comma-separated-values',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) {
    return { count: 0, mode: 'json' };
  }
  const asset = res.assets[0];
  const content = await readPickedFileAsString(
    asset.uri,
    'utf8',
    asset.name ?? 'import',
  );
  const name = (asset.name ?? '').toLowerCase();

  if (name.endsWith('.csv') || content.includes('Symbol') || content.includes('symbol')) {
    // Try JSON first if it looks like JSON
    if (content.trim().startsWith('{')) {
      // fall through
    } else {
      const holdings = parseHoldingsCsv(content);
      if (!holdings.length) throw new Error('No holdings found in file');
      const existing = await listPortfolios();
      const portfolio: Portfolio = {
        id: uid(),
        name: `Imported ${new Date().toLocaleDateString()}`,
        holdings,
        createdAt: new Date().toISOString(),
      };
      await replaceAllPortfolios([portfolio, ...existing]);
      return { count: holdings.length, mode: 'csv' };
    }
  }

  const parsed = JSON.parse(content) as BackupPayload | Portfolio[];
  let portfolios: Portfolio[] = [];
  if (Array.isArray(parsed)) {
    portfolios = parsed;
  } else if (parsed?.type === 'portfolios-backup' && Array.isArray(parsed.portfolios)) {
    portfolios = parsed.portfolios;
  } else {
    throw new Error('Not a valid portfolio backup file');
  }

  const normalized = portfolios
    .filter((p) => p && typeof p.name === 'string')
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : uid(),
      name: p.name.trim() || 'Portfolio',
      holdings: Array.isArray(p.holdings)
        ? p.holdings
            .filter((h) => h?.symbol && Number(h.qty) > 0)
            .map((h) => ({
              symbol: String(h.symbol).toUpperCase(),
              name: String(h.name ?? h.symbol),
              qty: Number(h.qty),
              wacc: Number(h.wacc) || 0,
            }))
        : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
      sourceAccountId: p.sourceAccountId,
    }));

  await replaceAllPortfolios(normalized);
  return { count: normalized.length, mode: 'json' };
}

/** Import transactions/holdings CSV into a new portfolio (Excel-exported CSV). */
export async function importHoldingsFromExcelCsv(): Promise<{
  holdings: number;
  portfolioName: string;
}> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/*', 'application/*', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) {
    return { holdings: 0, portfolioName: '' };
  }
  const asset = res.assets[0];
  const content = await readPickedFileAsString(
    asset.uri,
    'utf8',
    asset.name ?? 'import',
  );
  const holdings = parseHoldingsCsv(content);
  if (!holdings.length) throw new Error('No holdings found — use columns Symbol, Qty, WACC');
  const portfolioName = `Excel ${new Date().toLocaleDateString()}`;
  const existing = await listPortfolios();
  await replaceAllPortfolios([
    {
      id: uid(),
      name: portfolioName,
      holdings,
      createdAt: new Date().toISOString(),
    },
    ...existing,
  ]);
  return { holdings: holdings.length, portfolioName };
}
