import type { FloorsheetRow } from './screener';

const MERO_FLOOR = 'https://merolagani.com/Floorsheet.aspx';
/** 4 pages × ~500 trades is enough for Acc/Dis rankings and stays fast. */
export const MERO_FLOOR_FAST_PAGES = 4;

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

/** Fast row parser — split on </tr>, avoid one huge global regex on 600KB HTML. */
export function parseMerolaganiRows(html: string): FloorsheetRow[] {
  const rows: FloorsheetRow[] = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  const body = tbodyMatch?.[1] ?? html;
  const parts = body.split(/<\/tr>/i);

  for (const part of parts) {
    if (!part.includes('BrokerDetail') && !part.includes('symbol=')) continue;

    const contractM = part.match(/<td[^>]*>\s*(\d{12,})\s*<\/td>/i);
    if (!contractM) continue;

    const symbolM = part.match(
      /symbol=([A-Z0-9.]+)[^>]*(?:title='([^']*)')?[^>]*>\s*([A-Z0-9.]+)\s*</i,
    );
    if (!symbolM) continue;

    const brokerMs = [
      ...part.matchAll(/title='([^']*)'[\s\S]*?code=(\d+)/gi),
    ];
    if (brokerMs.length < 2) continue;

    const qtyM = part.match(
      /<\/a>\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>/i,
    );
    // Fallback: last three numeric cells
    let quantity = 0;
    let rate = 0;
    let amount = 0;
    if (qtyM) {
      quantity = num(qtyM[1]!);
      rate = num(qtyM[2]!);
      amount = num(qtyM[3]!);
    } else {
      const nums = [...part.matchAll(/<td[^>]*>\s*([\d,.]+)\s*<\/td>/gi)].map(
        (x) => x[1]!,
      );
      if (nums.length >= 3) {
        quantity = num(nums[nums.length - 3]!);
        rate = num(nums[nums.length - 2]!);
        amount = num(nums[nums.length - 1]!);
      }
    }

    const symbol = (symbolM[3] || symbolM[1] || '').toUpperCase();
    const buyerCode = brokerMs[0]![2]!.trim();
    const sellerCode = brokerMs[1]![2]!.trim();
    if (!symbol || !buyerCode) continue;

    rows.push({
      contractId: Number(contractM[1]),
      symbol,
      name: (symbolM[2] || symbol).trim(),
      buyerBroker: buyerCode,
      sellerBroker: sellerCode,
      buyerBrokerName: brokerMs[0]![1]!.trim() || null,
      sellerBrokerName: brokerMs[1]![1]!.trim() || null,
      rate,
      quantity,
      amount: amount || quantity * rate,
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

function stampAsOf(rows: FloorsheetRow[], asOf: string | null): void {
  if (!asOf) return;
  const t = `${asOf}T00:00:00`;
  for (const r of rows) {
    if (!r.tradeTime) r.tradeTime = t;
  }
}

async function postFloorPage(html: string, page: number): Promise<string> {
  const body = new URLSearchParams();
  body.set('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$PagerControl1$btnPaging');
  body.set('__EVENTARGUMENT', '');
  body.set('__VIEWSTATE', grabField(html, '__VIEWSTATE'));
  body.set('__VIEWSTATEGENERATOR', grabField(html, '__VIEWSTATEGENERATOR'));
  const ev = grabField(html, '__EVENTVALIDATION');
  if (ev) body.set('__EVENTVALIDATION', ev);
  body.set(
    'ctl00$ContentPlaceHolder1$PagerControl1$hdnCurrentPage',
    String(page),
  );
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

function yieldUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Live Merolagani floorsheet with real buyer/seller broker numbers + names.
 * Emits after page 1 immediately, then a few more pages with UI yields.
 */
export async function loadMerolaganiFloorsheetProgressive(
  onPartial: (
    rows: FloorsheetRow[],
    meta: { page: number; done: boolean; asOf: string | null },
  ) => void,
  maxPages = MERO_FLOOR_FAST_PAGES,
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
  await yieldUi();

  const asOf = parseAsOf(html);
  const totalPages = Math.min(parseTotalPages(html), maxPages);

  const all: FloorsheetRow[] = parseMerolaganiRows(html);
  stampAsOf(all, asOf);
  onPartial(all.slice(), { page: 1, done: totalPages <= 1, asOf });
  await yieldUi();

  for (let page = 2; page <= totalPages; page++) {
    html = await postFloorPage(html, page);
    await yieldUi();
    const chunk = parseMerolaganiRows(html);
    stampAsOf(chunk, asOf);
    all.push(...chunk);
    onPartial(all.slice(), {
      page,
      done: page >= totalPages,
      asOf,
    });
    await yieldUi();
    if (!chunk.length) break;
  }

  return { rows: all, asOf };
}
