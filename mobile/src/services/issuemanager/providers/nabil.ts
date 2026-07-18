import { companyKey, imFetch } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

const PAGE = 'https://result.nabilinvest.com.np/search/ipo-share';
const ORIGIN = 'https://result.nabilinvest.com.np';

function extractToken(html: string): string | null {
  const m =
    html.match(/name="_token"\s+value="([^"]+)"/) ??
    html.match(/name="_token"[^>]*value="([^"]+)"/) ??
    html.match(/value="([^"]+)"\s+name="_token"/);
  return m?.[1] ?? null;
}

function extractCompanies(html: string): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  const re =
    /<option[^>]*value="([^"]+)"[^>]*>([^<]*)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1].trim();
    const name = m[2].trim();
    if (!id || !name || name.toLowerCase().includes('select')) continue;
    out.push({ id, name });
  }
  return out;
}

async function loadPage(): Promise<string> {
  const res = await imFetch(PAGE, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      Origin: ORIGIN,
      Referer: ORIGIN + '/',
    },
  });
  if (res.status !== 200 || !res.text) {
    throw new Error(
      `Nabil Invest: page load failed (HTTP ${res.status})`,
    );
  }
  return res.text;
}

async function listCompanies(): Promise<IssueManagerCompany[]> {
  const html = await loadPage();
  const rows = extractCompanies(html);
  if (!rows.length) {
    throw new Error('Nabil Invest: no companies listed');
  }
  return rows.map((r) => ({
    key: companyKey('nabil', r.id),
    provider: 'nabil',
    rawId: r.id,
    name: r.name,
    providerLabel: 'Nabil Investment Banking',
  }));
}

async function checkBoid(
  company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  // Fresh GET so Laravel session + CSRF cookie stay valid for POST
  const html = await loadPage();
  const token = extractToken(html);
  if (!token) {
    return {
      ok: false,
      allotted: false,
      message: 'Nabil Invest: CSRF token missing',
    };
  }

  const body = new URLSearchParams({
    _token: token,
    company: company.rawId,
    boid,
  }).toString();

  const res = await imFetch(PAGE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml',
      Origin: ORIGIN,
      Referer: PAGE,
    },
    body,
  });

  const text = res.text || '';
  const lower = text.toLowerCase();

  if (lower.includes('csrf token mismatch')) {
    return {
      ok: false,
      allotted: false,
      message: 'Nabil Invest: session/CSRF failed — retry',
    };
  }

  if (
    lower.includes('you have not been allotted') ||
    lower.includes('not been allotted') ||
    lower.includes('not allotted') ||
    lower.includes('not alloted')
  ) {
    return { ok: true, allotted: false, message: 'Not allotted' };
  }

  if (
    lower.includes('congrat') ||
    lower.includes('have been allotted') ||
    lower.includes('allotted kitta') ||
    lower.includes('alloted kitta')
  ) {
    const qtyMatch =
      text.match(/allott?ed[^0-9]{0,40}(\d+)/i) ??
      text.match(/kitta[^0-9]{0,20}(\d+)/i);
    const quantity = qtyMatch ? Number(qtyMatch[1]) : undefined;
    return {
      ok: true,
      allotted: true,
      quantity: Number.isFinite(quantity) ? quantity : undefined,
      message:
        quantity != null && Number.isFinite(quantity)
          ? `Allotted ${quantity} kitta`
          : 'Allotted',
    };
  }

  if (res.status !== 200) {
    return {
      ok: false,
      allotted: false,
      message: `Nabil check failed (HTTP ${res.status})`,
    };
  }

  return {
    ok: false,
    allotted: false,
    message: 'Nabil Invest: could not parse result page',
  };
}

export const nabilProvider: IssueManagerProvider = {
  id: 'nabil',
  label: 'Nabil Investment Banking',
  listCompanies,
  checkBoid,
};
