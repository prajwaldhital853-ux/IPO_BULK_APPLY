import type { FloorsheetRow } from './screener';

const MERO_FLOOR = 'https://merolagani.com/Floorsheet.aspx';
const MAX_PAGES = 10; // 500 rows/page → up to 5,000 real broker trades

function num(v: string): number {
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function grabField(html: string, name: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `name="${esc}"[^>]*value="([^"]*)"|value="([^"]*)"[^>]*name="${esc}"`,
    'i',
  );
  const m = html.match(re);
  return m?.[1] ?? m?.[2] ?? '';
}

function parseMerolaganiRows(html: string): FloorsheetRow[] {
  const rows: FloorsheetRow[] = [];
  const re =
    /<tr>\s*<td[^>]*>\s*\d+\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>[\s\S]*?symbol=([A-Z0-9.]+)[^>]*(?:title='([^']*)')?[^>]*>\s*([A-Z0-9.]+)\s*<\/a>[\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*?title='([^']*)'[\s\S]*?code=(\d+)[\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*?title='([^']*)'[\s\S]*?code=(\d+)[\s\S]*?<\/td>\s*<td[^>]*>\s*([\d,]+)\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>\s*<\/tr>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const contractId = Number(m[1]);
    const symbol = (m[4] || m[2] || '').toUpperCase();
    const companyName = (m[3] || symbol).trim();
    const buyerName = (m[5] || '').trim();
    const buyerCode = (m[6] || '').trim();
    const sellerName = (m[7] || '').trim();
    const sellerCode = (m[8] || '').trim();
    const quantity = num(m[9] || '0');
    const rate = num(m[10] || '0');
    const amount = num(m[11] || '0') || quantity * rate;
    if (!symbol || !buyerCode) continue;
    rows.push({
      contractId,
      symbol,
      name: companyName,
      buyerBroker: buyerCode,
      sellerBroker: sellerCode,
      buyerBrokerName: buyerName || null,
      sellerBrokerName: sellerName || null,
      rate,
      quantity,
      amount,
      tradeTime: '',
      iconUrl: null,
    });
  }
  return rows;
}

function parseAsOf(html: string): string | null {
  const m = html.match(/As of\s+(\d{4})\/(\d{2})\/(\d{2})/i);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseTotalPages(html: string): number {
  const m = html.match(/Total pages:\s*(\d+)/i);
  return m ? Math.max(1, Number(m[1]) || 1) : 1;
}

async function postFloorPage(
  html: string,
  page: number,
): Promise<string> {
  const body = new URLSearchParams();
  body.set('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$PagerControl1$btnPaging');
  body.set('__EVENTARGUMENT', '');
  body.set('__VIEWSTATE', grabField(html, '__VIEWSTATE'));
  body.set('__VIEWSTATEGENERATOR', grabField(html, '__VIEWSTATEGENERATOR'));
  const ev = grabField(html, '__EVENTVALIDATION');
  if (ev) body.set('__EVENTVALIDATION', ev);
  body.set('ctl00$ContentPlaceHolder1$PagerControl1$hdnCurrentPage', String(page));
  body.set('ctl00$ContentPlaceHolder1$PagerControl1$hdnPCID', 'PC1');

  const res = await fetch(MERO_FLOOR, {
    method: 'POST',
    headers: {
      Accept: 'text/html',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Merolagani floorsheet page ${page} failed`);
  return res.text();
}

/**
 * Live Merolagani floorsheet with real buyer/seller broker numbers + names.
 * Emits after each page so Acc/Dis can paint early.
 */
export async function loadMerolaganiFloorsheetProgressive(
  onPartial: (
    rows: FloorsheetRow[],
    meta: { page: number; done: boolean; asOf: string | null },
  ) => void,
  maxPages = MAX_PAGES,
): Promise<{ rows: FloorsheetRow[]; asOf: string | null }> {
  const firstRes = await fetch(MERO_FLOOR, {
    headers: {
      Accept: 'text/html',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      'Cache-Control': 'no-cache',
    },
  });
  if (!firstRes.ok) throw new Error('Merolagani floorsheet unavailable');
  let html = await firstRes.text();
  const asOf = parseAsOf(html);
  const totalPages = Math.min(parseTotalPages(html), maxPages);

  const all: FloorsheetRow[] = parseMerolaganiRows(html);
  if (asOf) {
    for (const r of all) {
      if (!r.tradeTime) r.tradeTime = `${asOf}T00:00:00`;
    }
  }
  onPartial(all.slice(), { page: 1, done: totalPages <= 1, asOf });

  for (let page = 2; page <= totalPages; page++) {
    html = await postFloorPage(html, page);
    const chunk = parseMerolaganiRows(html);
    if (asOf) {
      for (const r of chunk) {
        if (!r.tradeTime) r.tradeTime = `${asOf}T00:00:00`;
      }
    }
    all.push(...chunk);
    onPartial(all.slice(), {
      page,
      done: page >= totalPages,
      asOf,
    });
    if (!chunk.length) break;
  }

  return { rows: all, asOf };
}
