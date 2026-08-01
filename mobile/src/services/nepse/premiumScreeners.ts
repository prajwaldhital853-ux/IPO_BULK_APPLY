import {
  fmtMcap,
  fmtNum,
  iconUri,
  loadMiniScreener,
  type MiniScreenerRow,
} from './screener';
import { loadPublicOfferingsByType } from './publicOffering';

export type PremiumScreenerKind =
  | 'small-caps'
  | 'rising-stocks'
  | 'price-droppers'
  | 'value-pick'
  | 'unlock-period'
  | 'hydropower-leaders'
  | 'microfinance-leaders'
  | 'development-leaders'
  | 'finance-leaders'
  | 'strong-reserves'
  | 'high-earners';

export type PremiumScreenerRow = {
  rank: number;
  symbol: string;
  name: string;
  ltp: number | null;
  changePct: number | null;
  volume: number | null;
  turnover: number | null;
  mcap: number | null;
  pe: number | null;
  pb: number | null;
  sector: string | null;
  score: number;
  insight: string;
  iconUrl: string | null;
  tags: string[];
  /** Session / swing high (Price Droppers table). */
  swingHigh?: number | null;
  /** Session / swing low (Price Droppers table). */
  swingLow?: number | null;
  high52?: number | null;
  low52?: number | null;
  /** Drop from swing high % — used by Price Droppers ranking/display. */
  dropFromHighPct?: number | null;
};

export type PremiumScreenerSnapshot = {
  kind: PremiumScreenerKind;
  title: string;
  subtitle: string;
  asOf: string;
  summary: Array<{ label: string; value: string }>;
  rows: PremiumScreenerRow[];
};

const COPY: Record<
  PremiumScreenerKind,
  { title: string; subtitle: string }
> = {
  'small-caps': {
    title: 'Small Caps',
    subtitle:
      'Lower market-cap names with live liquidity — where retail finds asymmetric moves before the crowd.',
  },
  'rising-stocks': {
    title: 'Rising Stocks',
    subtitle:
      'Today’s strongest gainers with real volume — momentum leaders updating live from NEPSE.',
  },
  'price-droppers': {
    title: 'Price Droppers',
    subtitle:
      'Biggest drops from swing high — with LTP, swing range, % change, and 52-week levels.',
  },
  'value-pick': {
    title: 'Value Pick',
    subtitle:
      'Quality at a discount — low P/E & P/B names with fundamentals, ranked by value score.',
  },
  'unlock-period': {
    title: 'Unlock Period',
    subtitle:
      'Recent listings & lock-up proximity — where supply events often create opportunity or risk.',
  },
  'hydropower-leaders': {
    title: 'Hydropower Leaders',
    subtitle:
      'Top hydropower names by size and session strength — Nepal’s most traded power sector.',
  },
  'microfinance-leaders': {
    title: 'Microfinance Leaders',
    subtitle:
      'Leading microfinance / laghubitta stocks ranked by market cap and live price action.',
  },
  'development-leaders': {
    title: 'Development Leaders',
    subtitle:
      'Development bank sector leaders — liquidity, size, and today’s performance combined.',
  },
  'finance-leaders': {
    title: 'Finance Leaders',
    subtitle:
      'Non-bank finance sector standouts — NBFCs and finance companies leading the session.',
  },
  'strong-reserves': {
    title: 'Strong Reserves',
    subtitle:
      'Balance-sheet strength — high book value and conservative P/B names with live prices.',
  },
  'high-earners': {
    title: 'High Earners',
    subtitle:
      'Top EPS earners on NEPSE today — profitability leaders ranked by earnings power.',
  },
};

function sectorOf(row: MiniScreenerRow): string {
  return (row.sector ?? 'Other').trim();
}

function sectorMatch(sector: string, ...needles: string[]): boolean {
  const s = sector.toLowerCase();
  return needles.some((n) => s.includes(n.toLowerCase()));
}

function baseRow(
  row: MiniScreenerRow,
  score: number,
  insight: string,
  tags: string[] = [],
): Omit<PremiumScreenerRow, 'rank'> {
  return {
    symbol: row.symbol,
    name: row.name,
    ltp: row.ltp,
    changePct: row.changePercent,
    volume: row.volume,
    turnover: row.turnover,
    mcap: row.marketCap,
    pe: row.peRatio,
    pb: row.pricePerBookValue,
    sector: row.sector,
    score,
    insight,
    iconUrl: iconUri(row.iconUrl),
    tags,
  };
}

function rankRows(
  rows: Omit<PremiumScreenerRow, 'rank'>[],
  limit: number,
): PremiumScreenerRow[] {
  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function buildSummary(
  rows: PremiumScreenerRow[],
  extra: Array<{ label: string; value: string }> = [],
): Array<{ label: string; value: string }> {
  const adv = rows.filter((r) => (r.changePct ?? 0) > 0).length;
  const avgCh =
    rows.length > 0
      ? rows.reduce((s, r) => s + (r.changePct ?? 0), 0) / rows.length
      : 0;
  return [
    { label: 'Tracked', value: String(rows.length) },
    { label: 'Advancing', value: String(adv) },
    { label: 'Avg chg', value: `${avgCh >= 0 ? '+' : ''}${avgCh.toFixed(2)}%` },
    ...extra,
  ];
}

function loadSmallCaps(rows: MiniScreenerRow[], limit: number): PremiumScreenerRow[] {
  const liquid = rows.filter(
    (r) => r.symbol && (r.volume ?? 0) > 500 && (r.marketCap ?? 0) > 0,
  );
  const caps = liquid.map((r) => r.marketCap ?? 0).sort((a, b) => a - b);
  const cutoff = caps[Math.floor(caps.length * 0.35)] ?? 5e8;

  const picked = liquid
    .filter((r) => (r.marketCap ?? 0) <= Math.max(cutoff, 5e8))
    .map((r) => {
      const turn = r.turnover ?? 0;
      const ch = r.changePercent ?? 0;
      const score = Math.log10(Math.max(turn, 1000) + 1) * 2 + Math.abs(ch);
      return baseRow(
        r,
        score,
        `Mcap ${fmtMcap(r.marketCap)} · Vol ${fmtNum(r.volume, 0)}`,
        ['Small cap', r.sector ?? ''].filter(Boolean),
      );
    });

  return rankRows(picked, limit);
}

function loadRisingStocks(rows: MiniScreenerRow[], limit: number): PremiumScreenerRow[] {
  const picked = rows
    .filter((r) => r.symbol && (r.changePercent ?? 0) > 0 && (r.volume ?? 0) > 0)
    .map((r) => {
      const ch = r.changePercent ?? 0;
      const vol = r.volume ?? 0;
      const score = ch * Math.log10(vol + 10);
      return baseRow(
        r,
        score,
        `+${ch.toFixed(2)}% · Vol ${fmtNum(vol, 0)}`,
        ['Gainer'],
      );
    });
  return rankRows(picked, limit);
}

function loadPriceDroppers(rows: MiniScreenerRow[], limit: number): PremiumScreenerRow[] {
  const picked = rows
    .filter((r) => {
      if (!r.symbol || !(r.ltp && r.ltp > 0)) return false;
      const swingHigh = r.high ?? r.fiftyTwoWeekHigh;
      if (swingHigh == null || swingHigh <= 0) return false;
      // Meaningful drop from the session/swing high.
      const dropPct = ((r.ltp - swingHigh) / swingHigh) * 100;
      return dropPct < -1;
    })
    .map((r) => {
      const swingHigh = r.high ?? r.fiftyTwoWeekHigh!;
      const swingLow = r.low ?? r.fiftyTwoWeekLow;
      const dropPct = ((r.ltp! - swingHigh) / swingHigh) * 100;
      const vol = r.volume ?? 0;
      const dayCh = r.changePercent ?? 0;
      const score = Math.abs(dropPct) * Math.log10(vol + 10);
      return {
        ...baseRow(
          r,
          score,
          `${dropPct.toFixed(1)}% from swing high · Day ${dayCh.toFixed(2)}%`,
          ['Dropper'],
        ),
        swingHigh,
        swingLow,
        high52: r.fiftyTwoWeekHigh,
        low52: r.fiftyTwoWeekLow,
        dropFromHighPct: dropPct,
        // Table "% Change" shows drop from swing high (matches SS).
        changePct: dropPct,
      };
    });
  return rankRows(picked, limit);
}

function loadValuePick(rows: MiniScreenerRow[], limit: number): PremiumScreenerRow[] {
  const picked = rows
    .filter((r) => {
      if (!r.symbol) return false;
      const pe = r.peRatio;
      const pb = r.pricePerBookValue;
      return (
        pe != null &&
        pe > 0 &&
        pe <= 28 &&
        pb != null &&
        pb > 0 &&
        pb <= 3.5 &&
        (r.ltp ?? 0) > 0
      );
    })
    .map((r) => {
      const pe = r.peRatio ?? 99;
      const pb = r.pricePerBookValue ?? 99;
      const yieldBonus = (r.oneYearYield ?? 0) * 0.15;
      const score =
        (28 - pe) / 28 + (3.5 - pb) / 3.5 + yieldBonus;
      return baseRow(
        r,
        score,
        `P/E ${fmtNum(pe)} · P/B ${fmtNum(pb)}`,
        ['Value', (r.oneYearYield ?? 0) > 3 ? 'Yield' : ''].filter(Boolean),
      );
    });
  return rankRows(picked, limit);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

async function loadUnlockPeriod(
  rows: MiniScreenerRow[],
  limit: number,
): Promise<PremiumScreenerRow[]> {
  const ipos = await loadPublicOfferingsByType('Ipo', true);
  const recent = new Map<string, number>();
  for (const o of ipos) {
    if (o.status !== 'Closed' || !o.symbol) continue;
    const days = daysSince(o.closingDate);
    if (days == null || days > 400) continue;
    recent.set(o.symbol.toUpperCase(), days);
  }

  const picked = rows
    .filter((r) => {
      if (!r.symbol || !r.ltp) return false;
      const sym = r.symbol.toUpperCase();
      const ipoDays = recent.get(sym);
      const low = r.fiftyTwoWeekLow;
      const high = r.fiftyTwoWeekHigh;
      const nearLow =
        low != null && low > 0 && (r.ltp - low) / low <= 0.15;
      const farFromHigh =
        high != null && high > 0 && (high - r.ltp) / high >= 0.25;
      return ipoDays != null || nearLow || farFromHigh;
    })
    .map((r) => {
      const sym = r.symbol.toUpperCase();
      const ipoDays = recent.get(sym);
      const low = r.fiftyTwoWeekLow;
      const pctFromLow =
        low != null && low > 0 && r.ltp != null
          ? ((r.ltp - low) / low) * 100
          : null;
      let score = 0;
      if (ipoDays != null) score += Math.max(0, 180 - Math.abs(ipoDays - 120)) / 10;
      if (pctFromLow != null) score += Math.max(0, 15 - pctFromLow);
      score += Math.abs(r.changePercent ?? 0) * 0.5;

      const tags = ['Unlock watch'];
      if (ipoDays != null) tags.push(`IPO ${ipoDays}d ago`);
      if (pctFromLow != null && pctFromLow <= 10) tags.push('Near 52w low');

      const insight =
        ipoDays != null
          ? `Listed ${ipoDays}d ago · LTP ${fmtNum(r.ltp)}`
          : pctFromLow != null
            ? `${pctFromLow.toFixed(1)}% above 52w low`
            : `Range reset · ${fmtNum(r.ltp)}`;

      return baseRow(r, score, insight, tags);
    });

  return rankRows(picked, limit);
}

function loadSectorLeaders(
  rows: MiniScreenerRow[],
  sectorNeedles: string[],
  sectorLabel: string,
  limit: number,
): PremiumScreenerRow[] {
  const picked = rows
    .filter(
      (r) =>
        r.symbol &&
        sectorMatch(sectorOf(r), ...sectorNeedles) &&
        (r.marketCap ?? 0) > 0,
    )
    .map((r) => {
      const mcap = r.marketCap ?? 0;
      const ch = r.changePercent ?? 0;
      const turn = r.turnover ?? 0;
      const score =
        Math.log10(mcap + 1) * 3 +
        Math.max(0, ch) * 2 +
        Math.log10(Math.max(turn, 1000) + 1);
      return baseRow(
        r,
        score,
        `${sectorLabel} · Mcap ${fmtMcap(mcap)}`,
        [sectorLabel],
      );
    });
  return rankRows(picked, limit);
}

function loadFinanceLeaders(rows: MiniScreenerRow[], limit: number): PremiumScreenerRow[] {
  const picked = rows
    .filter((r) => {
      if (!r.symbol || !(r.marketCap ?? 0)) return false;
      const s = sectorOf(r).toLowerCase();
      if (s.includes('commercial bank') || s.includes('development bank')) {
        return false;
      }
      return s.includes('finance') || s.includes('nbfc');
    })
    .map((r) => {
      const mcap = r.marketCap ?? 0;
      const ch = r.changePercent ?? 0;
      const score =
        Math.log10(mcap + 1) * 3 +
        Math.max(0, ch) * 2 +
        Math.log10(Math.max(r.turnover ?? 0, 1000) + 1);
      return baseRow(
        r,
        score,
        `Finance · Mcap ${fmtMcap(mcap)}`,
        ['Finance'],
      );
    });
  return rankRows(picked, limit);
}

function loadStrongReserves(rows: MiniScreenerRow[], limit: number): PremiumScreenerRow[] {
  const picked = rows
    .filter((r) => {
      if (!r.symbol || !r.ltp || !r.bookValue) return false;
      return r.bookValue > 0 && r.ltp > 0;
    })
    .map((r) => {
      const bv = r.bookValue ?? 0;
      const pb = r.pricePerBookValue ?? bv / (r.ltp ?? 1);
      const capRatio =
        r.paidUpCapital && r.paidUpCapital > 0 ? bv / r.paidUpCapital : null;
      const score =
        Math.log10(bv + 1) * 2.5 +
        (pb > 0 && pb < 5 ? (5 - pb) * 1.2 : 0) +
        (capRatio != null ? Math.min(capRatio, 3) : 0) +
        Math.log10(Math.max(r.marketCap ?? 0, 1) + 1);
      const tags = ['Strong BV'];
      if (pb > 0 && pb <= 2) tags.push('Low P/B');
      if ((r.sector ?? '').toLowerCase().includes('bank')) tags.push('Banking');
      return baseRow(
        r,
        score,
        `BV ${fmtNum(bv)} · P/B ${fmtNum(pb)}`,
        tags,
      );
    });
  return rankRows(picked, limit);
}

function loadHighEarners(rows: MiniScreenerRow[], limit: number): PremiumScreenerRow[] {
  const picked = rows
    .filter((r) => r.symbol && (r.eps ?? 0) > 0)
    .map((r) => {
      const eps = r.eps ?? 0;
      const pe = r.peRatio ?? (eps > 0 && r.ltp ? r.ltp / eps : null);
      const score =
        eps * 3 +
        Math.log10(Math.max(r.marketCap ?? 0, 1) + 1) +
        Math.max(0, r.changePercent ?? 0) * 0.5;
      return baseRow(
        r,
        score,
        `EPS ${fmtNum(eps)}${pe != null ? ` · P/E ${fmtNum(pe)}` : ''}`,
        ['High EPS'],
      );
    });
  return rankRows(picked, limit);
}

export async function loadPremiumScreener(
  kind: PremiumScreenerKind,
  limit = 50,
): Promise<PremiumScreenerSnapshot> {
  const rows = await loadMiniScreener();
  const copy = COPY[kind];
  const asOf = new Date().toISOString();

  let result: PremiumScreenerRow[] = [];
  switch (kind) {
    case 'small-caps':
      result = loadSmallCaps(rows, limit);
      break;
    case 'rising-stocks':
      result = loadRisingStocks(rows, limit);
      break;
    case 'price-droppers':
      result = loadPriceDroppers(rows, limit);
      break;
    case 'value-pick':
      result = loadValuePick(rows, limit);
      break;
    case 'unlock-period':
      result = await loadUnlockPeriod(rows, limit);
      break;
    case 'hydropower-leaders':
      result = loadSectorLeaders(
        rows,
        ['hydropower', 'hydro power', 'hydro'],
        'Hydropower',
        limit,
      );
      break;
    case 'microfinance-leaders':
      result = loadSectorLeaders(
        rows,
        ['microfinance', 'laghubitta', 'micro finance'],
        'Microfinance',
        limit,
      );
      break;
    case 'development-leaders':
      result = loadSectorLeaders(
        rows,
        ['development bank'],
        'Dev Bank',
        limit,
      );
      break;
    case 'finance-leaders':
      result = loadFinanceLeaders(rows, limit);
      break;
    case 'strong-reserves':
      result = loadStrongReserves(rows, limit);
      break;
    case 'high-earners':
      result = loadHighEarners(rows, limit);
      break;
  }

  const extraSummary =
    kind === 'value-pick'
      ? [{ label: 'Avg P/E', value: avgMetric(result, (r) => r.pe) }]
      : kind === 'small-caps'
        ? [{ label: 'Avg mcap', value: avgMcap(result) }]
        : kind === 'high-earners'
          ? [{ label: 'Leaders', value: String(result.length) }]
          : kind === 'strong-reserves'
            ? [{ label: 'Avg P/B', value: avgMetric(result, (r) => r.pb) }]
            : [];

  return {
    kind,
    title: copy.title,
    subtitle: copy.subtitle,
    asOf,
    summary: buildSummary(result, extraSummary),
    rows: result,
  };
}

function avgMetric(
  rows: PremiumScreenerRow[],
  pick: (r: PremiumScreenerRow) => number | null,
): string {
  const vals = rows.map(pick).filter((v): v is number => v != null && v > 0);
  if (!vals.length) return '—';
  return fmtNum(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function avgMcap(rows: PremiumScreenerRow[]): string {
  const vals = rows.map((r) => r.mcap).filter((v): v is number => v != null && v > 0);
  if (!vals.length) return '—';
  return fmtMcap(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function premiumScreenerTitle(kind: PremiumScreenerKind): string {
  return COPY[kind].title;
}
