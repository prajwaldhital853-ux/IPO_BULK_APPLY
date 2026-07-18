import {
  loadHighDemand,
  loadHighSupply,
  loadMiniScreener,
  fmtNum,
  type MiniScreenerRow,
} from './screener';
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

export type InvestmentSummary = {
  portfolios: number;
  holdings: number;
  invested: number;
  currentValue: number;
  pl: number;
  plPct: number | null;
  topGainers: Array<{ symbol: string; pl: number; plPct: number }>;
  topLosers: Array<{ symbol: string; pl: number; plPct: number }>;
  sectors: Array<{ sector: string; value: number; pct: number }>;
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

  const demand = home?.demand ?? [];
  const hotSymbols = demand
    .slice(0, 8)
    .map((d) => String((d as { symbol?: string }).symbol ?? ''))
    .filter(Boolean);

  return {
    status: home?.marketStatus?.status ?? 'UNKNOWN',
    asOf: home?.marketStatus?.time ?? null,
    summary,
    breadth,
    hotSymbols,
  };
}

export async function loadInvestmentSummary(): Promise<InvestmentSummary> {
  const [portfolios, screener] = await Promise.all([
    listPortfolios(),
    loadMiniScreener(),
  ]);
  const bySym = new Map(
    screener.map((r) => [r.symbol.toUpperCase(), r]),
  );

  let invested = 0;
  let currentValue = 0;
  let holdings = 0;
  const plRows: Array<{ symbol: string; pl: number; plPct: number; sector: string }> =
    [];
  const sectorMap = new Map<string, number>();

  for (const p of portfolios) {
    for (const h of p.holdings) {
      if (h.qty <= 0) continue;
      holdings += 1;
      const row = bySym.get(h.symbol.toUpperCase());
      const ltp = row?.ltp ?? h.wacc;
      const cost = h.qty * h.wacc;
      const cur = h.qty * ltp;
      invested += cost;
      currentValue += cur;
      const pl = cur - cost;
      const plPct = cost > 0 ? (pl / cost) * 100 : 0;
      plRows.push({
        symbol: h.symbol,
        pl,
        plPct,
        sector: row?.sector ?? 'Other',
      });
      const sec = row?.sector ?? 'Other';
      sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + cur);
    }
  }

  plRows.sort((a, b) => b.pl - a.pl);
  const sectors = [...sectorMap.entries()]
    .map(([sector, value]) => ({
      sector,
      value,
      pct: currentValue > 0 ? (value / currentValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const pl = currentValue - invested;

  return {
    portfolios: portfolios.length,
    holdings,
    invested,
    currentValue,
    pl,
    plPct: invested > 0 ? (pl / invested) * 100 : null,
    topGainers: plRows.filter((r) => r.pl > 0).slice(0, 5),
    topLosers: [...plRows].sort((a, b) => a.pl - b.pl).slice(0, 5),
    sectors,
  };
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
