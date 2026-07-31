/**
 * Live subscription figures for open issues, scraped from CDSC's "Current Issue
 * Update" table. CDSC is the registry behind MeroShare, so these numbers are
 * authoritative and refresh every few hours.
 */
const CDSC_URL = 'https://cdsc.com.np/ipolist';

export type CdscIssueStat = {
  /** "7% Laxmi Sunrise Debenture 2092" */
  company: string;
  /** "LSBD2092" */
  symbol: string | null;
  /** "IPO", "FPO", "Right Share" — as CDSC labels it */
  kind: string | null;
  /** "For General Public", "RESERVED - FOREIGN EMPLOYMENT" */
  audience: string | null;
  issueManager: string | null;
  issuedUnits: number | null;
  applicants: number | null;
  appliedUnits: number | null;
  appliedAmount: number | null;
  openDate: string | null;
  closeDate: string | null;
  /** Epoch ms of CDSC's own "Last Update" column. */
  updatedAt: number | null;
};

let cache: { at: number; rows: CdscIssueStat[] } | null = null;
const CACHE_MS = 5 * 60_000;

export function invalidateCdscIssueCache(): void {
  cache = null;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "2026-07-31 09:22:49" is Nepal wall-clock time, same as the user's device. */
function toEpoch(raw: string): number | null {
  const m = raw.match(
    /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function isoDate(raw: string): string | null {
  const m = raw.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/**
 * CDSC packs three facts into one cell:
 * "7% Laxmi Sunrise Debenture 2092 - LSBD2092 (IPO - For General Public)"
 */
function parseCompanyCell(raw: string): {
  company: string;
  symbol: string | null;
  kind: string | null;
  audience: string | null;
} {
  let rest = raw;
  let kind: string | null = null;
  let audience: string | null = null;

  const paren = rest.match(/\(([^()]*)\)\s*$/);
  if (paren) {
    rest = rest.slice(0, paren.index).trim();
    const parts = paren[1].split(/\s+-\s+/);
    kind = parts[0]?.trim() || null;
    audience = parts.slice(1).join(' - ').trim() || null;
  }

  let symbol: string | null = null;
  const dash = rest.lastIndexOf(' - ');
  if (dash > 0) {
    const tail = rest.slice(dash + 3).trim();
    if (/^[A-Z0-9]{2,15}$/.test(tail)) {
      symbol = tail;
      rest = rest.slice(0, dash).trim();
    }
  }

  return { company: rest, symbol, kind, audience };
}

function parseTable(html: string): CdscIssueStat[] {
  const out: CdscIssueStat[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;

  while ((row = rowRe.exec(html))) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      cellText(m[1]),
    );
    if (cells.length < 10) continue;

    const parsed = parseCompanyCell(cells[1]);
    if (!parsed.company) continue;

    out.push({
      ...parsed,
      issueManager: cells[2] || null,
      issuedUnits: toNumber(cells[3]),
      applicants: toNumber(cells[4]),
      appliedUnits: toNumber(cells[5]),
      appliedAmount: toNumber(cells[6]),
      openDate: isoDate(cells[7]),
      closeDate: isoDate(cells[8]),
      updatedAt: toEpoch(cells[9]),
    });
  }

  return out;
}

export async function loadCdscIssueStats(
  force = false,
): Promise<CdscIssueStat[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.rows;
  }
  try {
    const res = await fetch(CDSC_URL, {
      headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return cache?.rows ?? [];
    const rows = parseTable(await res.text());
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cache?.rows ?? [];
  }
}

function slug(raw?: string | null): string {
  return (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "RESERVED - FOREIGN EMPLOYMENT" and "ForeignEmployment" both -> "foreignemployment" */
function audienceKey(raw?: string | null): string {
  return slug(raw).replace(/^reserved/, '').replace(/^for/, '');
}

export function matchCdscStat(
  stats: CdscIssueStat[],
  offering: { name: string; symbol: string; audience: string | null },
): CdscIssueStat | null {
  if (!stats.length) return null;
  const name = slug(offering.name);
  const symbol = slug(offering.symbol);
  const audience = audienceKey(offering.audience);

  const byName = stats.filter((s) => slug(s.company) === name);
  const pool = byName.length
    ? byName
    : stats.filter((s) => symbol && slug(s.symbol) === symbol);
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];

  return pool.find((s) => audienceKey(s.audience) === audience) ?? pool[0];
}
