import {
  loadHighDemand,
  loadHighSupply,
  loadMiniScreener,
  fmtNum,
  type MiniScreenerRow,
} from './screener';
import { loadBulkPortfolioSnapshot } from '../../storage/bulkPortfolioStorage';
import { listPortfolios } from '../../storage/portfolioStorage';

const LIVE_V2 = 'https://sharehubnepal.com/live/api/v2/nepselive';

export type SmartMoneyRow = {
  symbol: string;
  name: string;
  ltp: number | null;
  changePct: number | null;
  volume: number | null;
  turnover: number | null;
  score: number;
  signal: string;
};

export type HoldingWeight = {
  symbol: string;
  name: string;
  value: number;
  pct: number;
  pl: number;
  plPct: number;
  dayChange: number | null;
  changePct: number | null;
  sector: string;
  qty: number;
};

export type AccountSlice = {
  accountId: string;
  accountName: string;
  value: number;
  pct: number;
  holdings: number;
  dayChange: number;
};

export type PortfolioInsight = {
  id: string;
  tone: 'good' | 'warn' | 'info' | 'bad';
  title: string;
  detail: string;
};

export type InvestmentSummary = {
  portfolios: number;
  holdings: number;
  uniqueSymbols: number;
  invested: number;
  currentValue: number;
  pl: number;
  plPct: number | null;
  /** Today's market move from Bulk Portfolio Check when available. */
  dayChange: number | null;
  dayChangePct: number | null;
  /** Where portfolio value was sourced. */
  valueSource: 'bulk' | 'saved';
  updatedAt: string | null;
  winners: number;
  losers: number;
  flat: number;
  top3ConcentrationPct: number;
  diversityScore: number;
  largestHolding: HoldingWeight | null;
  topGainers: Array<{ symbol: string; pl: number; plPct: number }>;
  topLosers: Array<{ symbol: string; pl: number; plPct: number }>;
  sectors: Array<{ sector: string; value: number; pct: number }>;
  topHoldings: HoldingWeight[];
  accounts: AccountSlice[];
  insights: PortfolioInsight[];
};

export type MarketPulse = {
  status: string;
  asOf: string | null;
  summary: Array<{ label: string; value: string }>;
  breadth: {
    advanced: number;
    declined: number;
    unchanged: number;
    positiveCircuit: number;
    negativeCircuit: number;
  } | null;
  hotSymbols: string[];
  demand: Array<{ symbol: string; quantity: number; price: number | null }>;
  supply: Array<{ symbol: string; quantity: number; price: number | null }>;
};

type HomePageApi = {
  marketStatus?: { status?: string; time?: string };
  marketSummary?: Array<{ name?: string; value?: number | string }>;
  stockSummary?: Record<string, number>;
  demand?: Array<Record<string, unknown>>;
  supply?: Array<Record<string, unknown>>;
};

async function fetchHomePage(): Promise<HomePageApi | null> {
  try {
    const res = await fetch(
      `${LIVE_V2}/home-page-data?_=${Date.now()}`,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as HomePageApi;
  } catch {
    return null;
  }
}

function scoreRow(
  row: MiniScreenerRow,
  mode: 'accumulation' | 'distribution' | 'aggressive',
): SmartMoneyRow | null {
  if (!row.symbol) return null;
  const ltp = row.ltp ?? 0;
  const ch = row.changePercent ?? 0;
  const vol = row.volume ?? 0;
  const turn = row.turnover ?? 0;
  if (mode === 'accumulation' && ch <= 0) return null;
  if (mode === 'distribution' && ch >= 0) return null;

  let score = Math.abs(ch) * Math.log10(Math.max(vol, 10) + 1);
  if (mode === 'aggressive') {
    if (ch <= 1.5) return null;
    score = ch * Math.log10(Math.max(turn, 1000) + 1);
  } else if (mode === 'distribution') {
    score = Math.abs(ch) * Math.log10(Math.max(vol, 10) + 1);
  }

  const signal =
    mode === 'accumulation'
      ? 'Buying pressure + rising price'
      : mode === 'distribution'
        ? 'Selling pressure + falling price'
        : 'High turnover momentum';

  return {
    symbol: row.symbol,
    name: row.name,
    ltp: row.ltp,
    changePct: row.changePercent,
    volume: row.volume,
    turnover: row.turnover,
    score,
    signal,
  };
}

export async function loadAccumulationRows(limit = 40): Promise<SmartMoneyRow[]> {
  const [screener, demand] = await Promise.all([
    loadMiniScreener(true),
    loadHighDemand(),
  ]);
  const demandSyms = new Set(demand.map((d) => d.symbol.toUpperCase()));
  const rows = screener
    .filter((r) => demandSyms.has(r.symbol.toUpperCase()) || (r.changePercent ?? 0) > 0)
    .map((r) => scoreRow(r, 'accumulation'))
    .filter(Boolean) as SmartMoneyRow[];
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function loadDistributionRows(limit = 40): Promise<SmartMoneyRow[]> {
  const [screener, supply] = await Promise.all([
    loadMiniScreener(true),
    loadHighSupply(),
  ]);
  const supplySyms = new Set(supply.map((d) => d.symbol.toUpperCase()));
  const rows = screener
    .filter((r) => supplySyms.has(r.symbol.toUpperCase()) || (r.changePercent ?? 0) < 0)
    .map((r) => scoreRow(r, 'distribution'))
    .filter(Boolean) as SmartMoneyRow[];
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function loadAggressiveHolderRows(limit = 40): Promise<SmartMoneyRow[]> {
  const screener = await loadMiniScreener(true);
  const rows = screener
    .map((r) => scoreRow(r, 'aggressive'))
    .filter(Boolean) as SmartMoneyRow[];
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function loadMarketPulse(): Promise<MarketPulse> {
  const home = await fetchHomePage();
  const summary = (home?.marketSummary ?? []).map((r) => ({
    label: String(r.name ?? '').replace(/:$/, ''),
    value:
      typeof r.value === 'number'
        ? fmtNum(r.value)
        : String(r.value ?? '—'),
  }));

  const ss = home?.stockSummary ?? null;
  const breadth = ss
    ? {
        advanced: Number(ss.advanced ?? 0),
        declined: Number(ss.declined ?? 0),
        unchanged: Number(ss.unchanged ?? 0),
        positiveCircuit: Number(ss.positiveCircuit ?? 0),
        negativeCircuit: Number(ss.negativeCircuit ?? 0),
      }
    : null;

  const demandRaw = home?.demand ?? [];
  const supplyRaw = home?.supply ?? [];
  const mapBook = (rows: Array<Record<string, unknown>>) =>
    rows
      .map((d) => ({
        symbol: String(d.symbol ?? '').trim(),
        quantity: Number(d.quantity ?? d.qty ?? d.volume ?? 0) || 0,
        price:
          d.price != null || d.ltp != null
            ? Number(d.price ?? d.ltp)
            : null,
      }))
      .filter((d) => d.symbol)
      .slice(0, 12);

  const demand = mapBook(demandRaw);
  const supply = mapBook(supplyRaw);
  const hotSymbols = demand.map((d) => d.symbol).slice(0, 8);

  return {
    status: home?.marketStatus?.status ?? 'UNKNOWN',
    asOf: home?.marketStatus?.time ?? null,
    summary,
    breadth,
    hotSymbols,
    demand,
    supply,
  };
}

function buildInsights(args: {
  currentValue: number;
  invested: number;
  pl: number;
  plPct: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  winners: number;
  losers: number;
  uniqueSymbols: number;
  top3ConcentrationPct: number;
  diversityScore: number;
  largest: HoldingWeight | null;
  sectors: Array<{ sector: string; pct: number }>;
}): PortfolioInsight[] {
  const out: PortfolioInsight[] = [];
  const {
    pl,
    plPct,
    dayChange,
    dayChangePct,
    winners,
    losers,
    uniqueSymbols,
    top3ConcentrationPct,
    diversityScore,
    largest,
    sectors,
  } = args;

  if (plPct != null) {
    if (plPct >= 10) {
      out.push({
        id: 'pl-strong',
        tone: 'good',
        title: 'Strong unrealized gain',
        detail: `Portfolio is up ${plPct.toFixed(1)}% vs cost (${formatRs(pl)}). Consider booking partial profits on stretched names.`,
      });
    } else if (plPct <= -10) {
      out.push({
        id: 'pl-weak',
        tone: 'bad',
        title: 'Deep drawdown vs cost',
        detail: `Down ${Math.abs(plPct).toFixed(1)}% overall. Review thesis on losers and avoid averaging blindly.`,
      });
    } else if (pl >= 0) {
      out.push({
        id: 'pl-mild',
        tone: 'info',
        title: 'Mildly profitable book',
        detail: `Unrealized P/L is ${formatRs(pl)} (${plPct.toFixed(1)}%). Stay disciplined on position sizing.`,
      });
    } else {
      out.push({
        id: 'pl-soft',
        tone: 'warn',
        title: 'Slightly underwater',
        detail: `Book is ${formatRs(pl)} (${plPct.toFixed(1)}%). Focus on risk and liquidity first.`,
      });
    }
  }

  if (dayChange != null && dayChangePct != null) {
    out.push({
      id: 'day-move',
      tone: dayChange >= 0 ? 'good' : 'bad',
      title: dayChange >= 0 ? 'Positive session so far' : 'Negative session so far',
      detail: `Today’s move: ${dayChange >= 0 ? '+' : ''}${formatRs(dayChange)} (${dayChangePct >= 0 ? '+' : ''}${dayChangePct.toFixed(2)}%). ${winners} up · ${losers} down.`,
    });
  }

  if (top3ConcentrationPct >= 55) {
    out.push({
      id: 'conc-high',
      tone: 'warn',
      title: 'High concentration risk',
      detail: `Top 3 holdings are ${top3ConcentrationPct.toFixed(0)}% of value${largest ? ` — led by ${largest.symbol}` : ''}. Diversify if this is unintended.`,
    });
  } else if (diversityScore >= 70) {
    out.push({
      id: 'div-good',
      tone: 'good',
      title: 'Healthy diversification',
      detail: `Diversity score ${diversityScore}/100 across ${uniqueSymbols} symbols. Concentration looks manageable.`,
    });
  }

  const topSector = sectors[0];
  if (topSector && topSector.pct >= 45) {
    out.push({
      id: 'sec-heavy',
      tone: 'warn',
      title: `${topSector.sector} heavy`,
      detail: `${topSector.pct.toFixed(0)}% of portfolio sits in ${topSector.sector}. Sector shock can hit hard.`,
    });
  }

  if (uniqueSymbols <= 2 && uniqueSymbols > 0) {
    out.push({
      id: 'few-names',
      tone: 'info',
      title: 'Very few names',
      detail: 'Only a couple of symbols — great for focus, fragile if one name gaps.',
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'neutral',
      tone: 'info',
      title: 'Portfolio snapshot ready',
      detail: 'Pull to refresh after Bulk Portfolio Check for the freshest day P/L.',
    });
  }

  return out.slice(0, 5);
}

function emptySummary(): InvestmentSummary {
  return {
    portfolios: 0,
    holdings: 0,
    uniqueSymbols: 0,
    invested: 0,
    currentValue: 0,
    pl: 0,
    plPct: null,
    dayChange: null,
    dayChangePct: null,
    valueSource: 'saved',
    updatedAt: null,
    winners: 0,
    losers: 0,
    flat: 0,
    top3ConcentrationPct: 0,
    diversityScore: 0,
    largestHolding: null,
    topGainers: [],
    topLosers: [],
    sectors: [],
    topHoldings: [],
    accounts: [],
    insights: [],
  };
}

function finalizeSummary(args: {
  portfolios: number;
  holdingsCount: number;
  invested: number;
  currentValue: number;
  dayChange: number | null;
  valueSource: 'bulk' | 'saved';
  updatedAt: string | null;
  holdingMap: Map<
    string,
    {
      symbol: string;
      name: string;
      value: number;
      cost: number;
      dayChange: number;
      qty: number;
      sector: string;
      changePct: number | null;
    }
  >;
  accountMap: Map<
    string,
    { accountId: string; accountName: string; value: number; holdings: number; dayChange: number }
  >;
}): InvestmentSummary {
  const {
    portfolios,
    holdingsCount,
    invested,
    currentValue,
    dayChange,
    valueSource,
    updatedAt,
    holdingMap,
    accountMap,
  } = args;

  const pl = currentValue - invested;
  const plPct = invested > 0 ? (pl / invested) * 100 : null;
  const dayChangePct =
    dayChange != null && currentValue - dayChange !== 0
      ? (dayChange / Math.max(Math.abs(currentValue - dayChange), 1)) * 100
      : dayChange != null && currentValue > 0
        ? (dayChange / currentValue) * 100
        : null;

  const topHoldings: HoldingWeight[] = [...holdingMap.values()]
    .map((h) => {
      const hPl = h.value - h.cost;
      const hPlPct = h.cost > 0 ? (hPl / h.cost) * 100 : 0;
      return {
        symbol: h.symbol,
        name: h.name,
        value: h.value,
        pct: currentValue > 0 ? (h.value / currentValue) * 100 : 0,
        pl: hPl,
        plPct: hPlPct,
        dayChange: valueSource === 'bulk' ? h.dayChange : null,
        changePct: h.changePct,
        sector: h.sector,
        qty: h.qty,
      };
    })
    .sort((a, b) => b.value - a.value);

  let winners = 0;
  let losers = 0;
  let flat = 0;
  for (const h of topHoldings) {
    if (h.pl > 1) winners += 1;
    else if (h.pl < -1) losers += 1;
    else flat += 1;
  }

  const top3ConcentrationPct = topHoldings
    .slice(0, 3)
    .reduce((s, h) => s + h.pct, 0);

  // Herfindahl-ish diversity: higher when weights are spread out.
  const hhi = topHoldings.reduce((s, h) => s + (h.pct / 100) ** 2, 0);
  const diversityScore = Math.round(
    Math.max(0, Math.min(100, (1 - hhi) * 120)),
  );

  const sectorMap = new Map<string, number>();
  for (const h of topHoldings) {
    sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.value);
  }
  const sectors = [...sectorMap.entries()]
    .map(([sector, value]) => ({
      sector,
      value,
      pct: currentValue > 0 ? (value / currentValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const accounts: AccountSlice[] = [...accountMap.values()]
    .map((a) => ({
      ...a,
      pct: currentValue > 0 ? (a.value / currentValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const byPl = [...topHoldings].sort((a, b) => b.pl - a.pl);

  const insights = buildInsights({
    currentValue,
    invested,
    pl,
    plPct,
    dayChange,
    dayChangePct,
    winners,
    losers,
    uniqueSymbols: topHoldings.length,
    top3ConcentrationPct,
    diversityScore,
    largest: topHoldings[0] ?? null,
    sectors,
  });

  return {
    portfolios,
    holdings: holdingsCount,
    uniqueSymbols: topHoldings.length,
    invested,
    currentValue,
    pl,
    plPct,
    dayChange,
    dayChangePct,
    valueSource,
    updatedAt,
    winners,
    losers,
    flat,
    top3ConcentrationPct,
    diversityScore,
    largestHolding: topHoldings[0] ?? null,
    topGainers: byPl
      .filter((r) => r.pl > 0)
      .slice(0, 6)
      .map((r) => ({ symbol: r.symbol, pl: r.pl, plPct: r.plPct })),
    topLosers: [...byPl]
      .sort((a, b) => a.pl - b.pl)
      .filter((r) => r.pl < 0)
      .slice(0, 6)
      .map((r) => ({ symbol: r.symbol, pl: r.pl, plPct: r.plPct })),
    sectors,
    topHoldings: topHoldings.slice(0, 12),
    accounts,
    insights,
  };
}

export async function loadInvestmentSummary(): Promise<InvestmentSummary> {
  const [portfolios, screener, bulk] = await Promise.all([
    listPortfolios(),
    loadMiniScreener(),
    loadBulkPortfolioSnapshot(),
  ]);
  const bySym = new Map(screener.map((r) => [r.symbol.toUpperCase(), r]));

  if (bulk && bulk.rows.length > 0) {
    let invested = 0;
    const holdingMap = new Map<
      string,
      {
        symbol: string;
        name: string;
        value: number;
        cost: number;
        dayChange: number;
        qty: number;
        sector: string;
        changePct: number | null;
      }
    >();
    const accountMap = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        value: number;
        holdings: number;
        dayChange: number;
      }
    >();

    for (const h of bulk.rows) {
      const cost = h.qty * (h.wacc || 0);
      invested += cost;
      const key = h.symbol.toUpperCase();
      const row = bySym.get(key);
      const sector = row?.sector ?? 'Other';
      const prev = holdingMap.get(key);
      if (prev) {
        prev.value += h.value;
        prev.cost += cost;
        prev.dayChange += h.dayChange;
        prev.qty += h.qty;
      } else {
        holdingMap.set(key, {
          symbol: h.symbol,
          name: h.name || row?.name || h.symbol,
          value: h.value,
          cost,
          dayChange: h.dayChange,
          qty: h.qty,
          sector,
          changePct: row?.changePercent ?? null,
        });
      }

      const acc = accountMap.get(h.accountId) ?? {
        accountId: h.accountId,
        accountName: h.accountName,
        value: 0,
        holdings: 0,
        dayChange: 0,
      };
      acc.value += h.value;
      acc.holdings += 1;
      acc.dayChange += h.dayChange;
      accountMap.set(h.accountId, acc);
    }

    return finalizeSummary({
      portfolios: Math.max(portfolios.length, bulk.accounts),
      holdingsCount: bulk.holdings,
      invested,
      currentValue: bulk.totalValue,
      dayChange: bulk.dayChange,
      valueSource: 'bulk',
      updatedAt: bulk.updatedAt,
      holdingMap,
      accountMap,
    });
  }

  let invested = 0;
  let currentValue = 0;
  let holdingsCount = 0;
  const holdingMap = new Map<
    string,
    {
      symbol: string;
      name: string;
      value: number;
      cost: number;
      dayChange: number;
      qty: number;
      sector: string;
      changePct: number | null;
    }
  >();
  const accountMap = new Map<
    string,
    {
      accountId: string;
      accountName: string;
      value: number;
      holdings: number;
      dayChange: number;
    }
  >();

  for (const p of portfolios) {
    let accVal = 0;
    let accHold = 0;
    for (const h of p.holdings) {
      if (h.qty <= 0) continue;
      holdingsCount += 1;
      const row = bySym.get(h.symbol.toUpperCase());
      const ltp = row?.ltp ?? h.wacc;
      const cost = h.qty * h.wacc;
      const cur = h.qty * ltp;
      invested += cost;
      currentValue += cur;
      accVal += cur;
      accHold += 1;
      const key = h.symbol.toUpperCase();
      const prev = holdingMap.get(key);
      if (prev) {
        prev.value += cur;
        prev.cost += cost;
        prev.qty += h.qty;
      } else {
        holdingMap.set(key, {
          symbol: h.symbol,
          name: h.name || row?.name || h.symbol,
          value: cur,
          cost,
          dayChange: 0,
          qty: h.qty,
          sector: row?.sector ?? 'Other',
          changePct: row?.changePercent ?? null,
        });
      }
    }
    if (accHold > 0) {
      accountMap.set(p.id, {
        accountId: p.id,
        accountName: p.name,
        value: accVal,
        holdings: accHold,
        dayChange: 0,
      });
    }
  }

  if (holdingsCount === 0) return emptySummary();

  return finalizeSummary({
    portfolios: portfolios.length,
    holdingsCount,
    invested,
    currentValue,
    dayChange: null,
    valueSource: 'saved',
    updatedAt: null,
    holdingMap,
    accountMap,
  });
}

export function formatRs(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_00_00_000) {
    return `Rs ${(n / 1_00_00_000).toFixed(2)} Cr`;
  }
  if (Math.abs(n) >= 1_00_000) {
    return `Rs ${(n / 1_00_000).toFixed(2)} L`;
  }
  return `Rs ${fmtNum(n)}`;
}
