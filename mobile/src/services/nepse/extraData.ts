import { fetchSharehubSnapshot } from './sharehub';

const ECONOMY_BASE = 'https://sharehubnepal.com/data/api/v1/economy';
const NRB_FOREX = 'https://www.nrb.org.np/api/forex/v1/rates';
const NOC_RETAIL = 'https://noc.org.np/retailprice';

export type ExtraToolKind =
  | 'global-indices'
  | 'indicators'
  | 'forex'
  | 'fuel'
  | 'gold-silver';

export type GlobalIndexRow = {
  symbol: string;
  name: string;
  country: string;
  currentValue: number;
  change: number;
  changePercent: number;
  status: string;
  technicalRating: string | null;
  flagUrl: string | null;
  lastUpdate: string;
};

export type GlobalIndicesRegion = {
  regionName: string;
  indices: GlobalIndexRow[];
};

export type ForexRow = {
  iso3: string;
  name: string;
  unit: number;
  buy: number;
  sell: number;
  mid: number;
};

export type FuelRegionPrice = {
  region: string;
  petrol: number;
  diesel: number;
  kerosene: number | null;
  lpg: number | null;
};

export type GoldSilverRow = {
  name: string;
  symbol: string;
  price: number;
  unit: string;
  change: number;
  changePercent: number;
  icon: string | null;
  lastUpdated: string;
};

export type MarketIndicatorRow = {
  label: string;
  value: string;
  change?: number | null;
  changePercent?: number | null;
  group: 'index' | 'breadth' | 'summary';
};

type ApiWrap<T> = {
  success?: boolean;
  data?: T;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadGlobalIndices(): Promise<{
  regions: GlobalIndicesRegion[];
  asOf: string;
}> {
  const raw = await fetchJson<ApiWrap<unknown[]>>(`${ECONOMY_BASE}/global-indices`);
  const regions: GlobalIndicesRegion[] = [];
  for (const item of raw?.data ?? []) {
    const row = item as {
      regionName?: string;
      globalIndices?: unknown;
    };
    const list = Array.isArray(row.globalIndices) ? row.globalIndices : [];
    regions.push({
      regionName: row.regionName ?? 'Market',
      indices: list.map((x) => {
        const i = x as Record<string, unknown>;
        return {
          symbol: String(i.symbol ?? ''),
          name: String(i.name ?? ''),
          country: String(i.country ?? ''),
          currentValue: num(i.currentValue),
          change: num(i.change),
          changePercent: num(i.changePercent),
          status: String(i.status ?? ''),
          technicalRating: i.technicalRating ? String(i.technicalRating) : null,
          flagUrl: i.flagUrl ? String(i.flagUrl) : null,
          lastUpdate: String(i.lastUpdate ?? new Date().toISOString()),
        };
      }),
    });
  }
  const latest = regions
    .flatMap((r) => r.indices)
    .map((i) => i.lastUpdate)
    .sort()
    .pop();
  return { regions, asOf: latest ?? new Date().toISOString() };
}

export async function loadGoldSilver(): Promise<{
  rows: GoldSilverRow[];
  asOf: string;
}> {
  const raw = await fetchJson<
    ApiWrap<
      Array<{
        name: string;
        symbol: string;
        price: number;
        unit: string;
        change: number;
        changePercent: number;
        icon?: string;
        lastUpdated?: string;
      }>
    >
  >(`${ECONOMY_BASE}/gold-silver`);
  const rows = (raw?.data ?? []).map((r) => ({
    name: r.name.trim(),
    symbol: r.symbol,
    price: num(r.price),
    unit: r.unit,
    change: num(r.change),
    changePercent: num(r.changePercent),
    icon: r.icon ?? null,
    lastUpdated: r.lastUpdated ?? new Date().toISOString(),
  }));
  const asOf =
    rows.map((r) => r.lastUpdated).sort().pop() ?? new Date().toISOString();
  return { rows, asOf };
}

export async function loadForexRates(): Promise<{
  rows: ForexRow[];
  date: string;
  asOf: string;
}> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 14);
  const url =
    `${NRB_FOREX}?from=${fmtDate(from)}&to=${fmtDate(to)}&page=1&per_page=1`;
  const raw = await fetchJson<{
    status?: { code?: number };
    data?: {
      payload?: Array<{
        date?: string;
        rates?: Array<{
          currency?: { iso3?: string; name?: string; unit?: number };
          buy?: string;
          sell?: string;
        }>;
      }>;
    };
  }>(url);

  const latest = raw?.data?.payload?.[0];
  const date = latest?.date ?? fmtDate(to);
  const rows: ForexRow[] = (latest?.rates ?? []).map((r) => {
    const buy = num(r.buy);
    const sell = num(r.sell);
    return {
      iso3: r.currency?.iso3 ?? '',
      name: r.currency?.name ?? '',
      unit: num(r.currency?.unit) || 1,
      buy,
      sell,
      mid: (buy + sell) / 2,
    };
  });
  return { rows, date, asOf: new Date().toISOString() };
}


export async function loadFuelPrices(): Promise<{
  regions: FuelRegionPrice[];
  effectiveDate: string | null;
  asOf: string;
}> {
  try {
    const res = await fetch(NOC_RETAIL, {
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) throw new Error('noc fetch failed');
    const html = await res.text();
    const regions: FuelRegionPrice[] = [];
    const regionRe =
      /\(([^)]+)\)\s*Petrol\(MS\):NRs\s*([\d.]+)\/L[^L]*Diesel\(HSD\):NRs\s*([\d.]+)\/L(?:[^L]*Kerosene\(SKO\):NRs\s*([\d.]+)\/L)?(?:[^L]*LP Gas:NRs\s*([\d.]+))?/gi;
    let m: RegExpExecArray | null;
    while ((m = regionRe.exec(html)) !== null) {
      regions.push({
        region: m[1].replace(/\s+/g, ' ').trim(),
        petrol: num(m[2]),
        diesel: num(m[3]),
        kerosene: m[4] ? num(m[4]) : null,
        lpg: m[5] ? num(m[5]) : null,
      });
    }
    const dateMatch = html.match(
      /(\d{4}\.\d{2}\.\d{2})\s*\|\s*(\d{2}:\d{2})\s*hrs\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
    );
    const effectiveDate = dateMatch ? dateMatch[1] : null;
    if (regions.length === 0) {
      throw new Error('parse failed');
    }
    return { regions, effectiveDate, asOf: new Date().toISOString() };
  } catch {
    return {
      regions: [
        {
          region: 'Kathmandu, Pokhara, Dipayal',
          petrol: 197,
          diesel: 195,
          kerosene: 195,
          lpg: 1030,
        },
        {
          region: 'Charali, Biratnagar, Birgunj & others',
          petrol: 194.5,
          diesel: 192.5,
          kerosene: 192.5,
          lpg: 1030,
        },
        {
          region: 'Surkhet, Dang',
          petrol: 196,
          diesel: 194,
          kerosene: 194,
          lpg: 1030,
        },
      ],
      effectiveDate: null,
      asOf: new Date().toISOString(),
    };
  }
}

function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export async function loadMarketIndicators(): Promise<{
  rows: MarketIndicatorRow[];
  asOf: string;
}> {
  const snap = await fetchSharehubSnapshot();
  const rows: MarketIndicatorRow[] = [];
  if (!snap) {
    return { rows, asOf: new Date().toISOString() };
  }

  for (const idx of snap.indices) {
    rows.push({
      label: idx.name,
      value: idx.current != null ? idx.current.toFixed(2) : '—',
      change: idx.change,
      changePercent: idx.pct,
      group: 'index',
    });
  }

  for (const sub of snap.subIndices ?? []) {
    rows.push({
      label: sub.name,
      value: sub.current != null ? sub.current.toFixed(2) : '—',
      change: sub.change,
      changePercent: sub.pct,
      group: 'index',
    });
  }

  const s = snap.summary;
  if (s.turnover != null) {
    rows.push({
      label: 'Turnover',
      value: `Rs. ${fmtCompact(s.turnover)}`,
      group: 'summary',
    });
  }
  if (s.tradedShares != null) {
    rows.push({
      label: 'Traded shares',
      value: fmtCompact(s.tradedShares),
      group: 'summary',
    });
  }
  if (s.transactions != null) {
    rows.push({
      label: 'Transactions',
      value: fmtCompact(s.transactions),
      group: 'summary',
    });
  }
  if (s.advanced != null) {
    rows.push({
      label: 'Advanced',
      value: String(s.advanced),
      group: 'breadth',
    });
  }
  if (s.declined != null) {
    rows.push({
      label: 'Declined',
      value: String(s.declined),
      group: 'breadth',
    });
  }
  if (s.unchanged != null) {
    rows.push({
      label: 'Unchanged',
      value: String(s.unchanged),
      group: 'breadth',
    });
  }

  return { rows, asOf: snap.asOf ?? new Date().toISOString() };
}

export const EXTRA_TOOL_COPY: Record<
  ExtraToolKind,
  { title: string; subtitle: string }
> = {
  'global-indices': {
    title: 'Global Indices',
    subtitle: 'Major world market indices with live values and technical ratings.',
  },
  indicators: {
    title: 'Indicators',
    subtitle: 'NEPSE main & sub-indices plus session breadth and turnover.',
  },
  forex: {
    title: 'Forex Data',
    subtitle: 'Official Nepal Rastra Bank exchange rates (buy / sell).',
  },
  fuel: {
    title: 'Fuel Price',
    subtitle: 'Nepal Oil Corporation retail prices by region.',
  },
  'gold-silver': {
    title: 'Gold & Silver Price',
    subtitle: 'Daily bullion rates in Nepal with change tracking.',
  },
};
