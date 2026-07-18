import {
  fmtMcap,
  fmtNum,
  loadFloorsheet,
  loadHighDemand,
  loadHighSupply,
  loadMiniScreener,
  type FloorsheetRow,
  type MiniScreenerRow,
} from './screener';
import { formatRs } from './premiumAnalytics';

const DATA_BASE = 'https://sharehubnepal.com/data/api/v1';
const LIVE_V2 = 'https://sharehubnepal.com/live/api/v2/nepselive';

const CACHE_MS = 120_000;

export function invalidateBrokerAnalyticsCache(): void {
  brokerCache = null;
  brokerCacheAt = 0;
  floorsheetCache = null;
  floorsheetCacheAt = 0;
}

export type BrokerInfo = { code: string; name: string };

export type IntelMetric = { label: string; value: string; tone?: 'up' | 'down' | 'neutral' };

export type PremiumIntelRow = {
  rank: number;
  symbol: string;
  name: string;
  brokerCode: string | null;
  brokerName: string | null;
  ltp: number | null;
  changePct: number | null;
  quantity: number | null;
  amount: number | null;
  avgRate: number | null;
  netQty: number | null;
  netAmount: number | null;
  turnover: number | null;
  volume: number | null;
  sector: string | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  pctFromHigh: number | null;
  pctFromLow: number | null;
  score: number;
  signal: string;
  tags: string[];
  metrics: IntelMetric[];
};

export type PremiumIntelSnapshot = {
  title: string;
  subtitle: string;
  sessionDate: string | null;
  tradesScanned: number;
  brokerBreakdown: boolean;
  summary: IntelMetric[];
  rows: PremiumIntelRow[];
};

export type FiftyTwoWeekRow = {
  rank: number;
  symbol: string;
  name: string;
  ltp: number | null;
  high52: number | null;
  low52: number | null;
  pctFromHigh: number | null;
  pctFromLow: number | null;
  changePct: number | null;
  volume: number | null;
  turnover: number | null;
  sector: string | null;
  signal: string;
  metrics: IntelMetric[];
};

export type PremiumIntelKind =
  | 'top-buyers'
  | 'top-sellers'
  | 'top-holders'
  | 'top-releases'
  | 'broker-favorites'
  | 'broker-top-buy-sell';

type AggKey = string;

type SideAgg = {
  symbol: string;
  name: string;
  broker: string;
  qty: number;
  amount: number;
  rateSum: number;
  trades: number;
};

type NetAgg = SideAgg & { buyQty: number; sellQty: number; buyAmt: number; sellAmt: number };

type BrokerNet = {
  broker: string;
  buyAmt: number;
  sellAmt: number;
  buyQty: number;
  sellQty: number;
  symbols: Set<string>;
};

let brokerCache: BrokerInfo[] | null = null;
let brokerCacheAt = 0;
let floorsheetCache: FloorsheetRow[] | null = null;
let floorsheetCacheAt = 0;
let floorsheetMeta: { trades: number; date: string | null } = { trades: 0, date: null };

function brokerKey(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const m = t.match(/\d+/);
  return m ? m[0] : t;
}

function sideKey(symbol: string, broker: string): AggKey {
  return `${symbol.toUpperCase()}|${brokerKey(broker)}`;
}

async function loadBrokers(): Promise<BrokerInfo[]> {
  if (brokerCache && Date.now() - brokerCacheAt < CACHE_MS) return brokerCache;
  try {
    const res = await fetch(`${DATA_BASE}/broker?page=1&size=200`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return brokerCache ?? [];
    const json = (await res.json()) as {
      data?: { content?: Array<{ code?: string; name?: string }> };
    };
    brokerCache = (json.data?.content ?? [])
      .map((b) => ({ code: String(b.code ?? '').trim(), name: String(b.name ?? '').trim() }))
      .filter((b) => b.code);
    brokerCacheAt = Date.now();
    return brokerCache;
  } catch {
    return brokerCache ?? [];
  }
}

function brokerLabel(code: string, directory: Map<string, string>): string {
  const k = brokerKey(code);
  return directory.get(k) ?? (k ? `Broker ${k}` : 'Market');
}

async function loadSessionFloorsheet(force = false): Promise<FloorsheetRow[]> {
  if (!force && floorsheetCache && Date.now() - floorsheetCacheAt < CACHE_MS) {
    return floorsheetCache;
  }
  const all: FloorsheetRow[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 30) {
    const res = await loadFloorsheet(page, 100);
    all.push(...res.rows);
    hasNext = res.hasNext;
    page += 1;
    if (!res.rows.length) break;
  }
  floorsheetCache = all;
  floorsheetCacheAt = Date.now();
  floorsheetMeta = {
    trades: all.length,
    date: all[0]?.tradeTime?.slice(0, 10) ?? null,
  };
  return all;
}

function hasBrokerData(rows: FloorsheetRow[]): boolean {
  return rows.some((r) => brokerKey(r.buyerBroker) || brokerKey(r.sellerBroker));
}

function enrichRow(
  base: Omit<PremiumIntelRow, 'rank' | 'metrics' | 'tags'>,
  screener: Map<string, MiniScreenerRow>,
  extraMetrics: IntelMetric[] = [],
  extraTags: string[] = [],
): Omit<PremiumIntelRow, 'rank'> {
  const s = screener.get(base.symbol.toUpperCase());
  const high = s?.fiftyTwoWeekHigh ?? base.fiftyTwoWeekHigh;
  const low = s?.fiftyTwoWeekLow ?? base.fiftyTwoWeekLow;
  const ltp = s?.ltp ?? base.ltp;
  const pctFromHigh =
    high && ltp ? ((ltp - high) / high) * 100 : base.pctFromHigh;
  const pctFromLow =
    low && ltp ? ((ltp - low) / low) * 100 : base.pctFromLow;

  const metrics: IntelMetric[] = [
    { label: 'Amount', value: base.amount != null ? formatRs(base.amount) : '—' },
    { label: 'Qty', value: base.quantity != null ? fmtNum(base.quantity, 0) : '—' },
    { label: 'Avg rate', value: base.avgRate != null ? fmtNum(base.avgRate) : '—' },
    { label: 'LTP', value: ltp != null ? fmtNum(ltp) : '—' },
    {
      label: 'Change',
      value:
        (s?.changePercent ?? base.changePct) != null
          ? `${(s?.changePercent ?? base.changePct)! >= 0 ? '+' : ''}${(s?.changePercent ?? base.changePct)!.toFixed(2)}%`
          : '—',
      tone:
        (s?.changePercent ?? base.changePct ?? 0) >= 0 ? 'up' : 'down',
    },
    ...extraMetrics,
  ];

  const tags: string[] = [...extraTags];
  if (s?.sector) tags.push(s.sector);
  if (pctFromHigh != null && pctFromHigh >= -3) tags.push('Near 52W high');
  if (pctFromLow != null && pctFromLow <= 5) tags.push('Near 52W low');
  if ((s?.turnover ?? 0) > 500_000) tags.push('High turnover');

  return {
    ...base,
    name: s?.name ?? base.name,
    ltp,
    changePct: s?.changePercent ?? base.changePct,
    turnover: s?.turnover ?? base.turnover,
    volume: s?.volume ?? base.volume,
    sector: s?.sector ?? base.sector,
    fiftyTwoWeekHigh: high,
    fiftyTwoWeekLow: low,
    pctFromHigh,
    pctFromLow,
    metrics,
    tags,
  };
}

function rankRows(rows: Omit<PremiumIntelRow, 'rank'>[], limit: number): PremiumIntelRow[] {
  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function buildSideAgg(
  rows: FloorsheetRow[],
  side: 'buy' | 'sell',
): Map<AggKey, SideAgg> {
  const map = new Map<AggKey, SideAgg>();
  for (const r of rows) {
    const brokerRaw = side === 'buy' ? r.buyerBroker : r.sellerBroker;
    const broker = brokerKey(brokerRaw);
    if (!broker) continue;
    const qty = r.quantity ?? 0;
    const amt = r.amount ?? qty * (r.rate ?? 0);
    if (qty <= 0 && amt <= 0) continue;
    const key = sideKey(r.symbol, broker);
    const cur = map.get(key) ?? {
      symbol: r.symbol,
      name: r.name,
      broker,
      qty: 0,
      amount: 0,
      rateSum: 0,
      trades: 0,
    };
    cur.qty += qty;
    cur.amount += amt;
    cur.rateSum += r.rate ?? 0;
    cur.trades += 1;
    map.set(key, cur);
  }
  return map;
}

function buildNetAgg(rows: FloorsheetRow[]): Map<AggKey, NetAgg> {
  const map = new Map<AggKey, NetAgg>();
  for (const r of rows) {
    const qty = r.quantity ?? 0;
    const amt = r.amount ?? qty * (r.rate ?? 0);
    if (qty <= 0 && amt <= 0) continue;

    const apply = (brokerRaw: string, isBuy: boolean) => {
      const broker = brokerKey(brokerRaw);
      if (!broker) return;
      const key = sideKey(r.symbol, broker);
      const cur = map.get(key) ?? {
        symbol: r.symbol,
        name: r.name,
        broker,
        qty: 0,
        amount: 0,
        rateSum: 0,
        trades: 0,
        buyQty: 0,
        sellQty: 0,
        buyAmt: 0,
        sellAmt: 0,
      };
      if (isBuy) {
        cur.buyQty += qty;
        cur.buyAmt += amt;
      } else {
        cur.sellQty += qty;
        cur.sellAmt += amt;
      }
      cur.qty = cur.buyQty - cur.sellQty;
      cur.amount = cur.buyAmt - cur.sellAmt;
      cur.trades += 1;
      cur.rateSum += r.rate ?? 0;
      map.set(key, cur);
    };
    apply(r.buyerBroker, true);
    apply(r.sellerBroker, false);
  }
  return map;
}

function symbolSessionAgg(rows: FloorsheetRow[]): Map<string, SideAgg> {
  const map = new Map<string, SideAgg>();
  for (const r of rows) {
    const qty = r.quantity ?? 0;
    const amt = r.amount ?? qty * (r.rate ?? 0);
    if (!r.symbol || (qty <= 0 && amt <= 0)) continue;
    const key = r.symbol.toUpperCase();
    const cur = map.get(key) ?? {
      symbol: r.symbol,
      name: r.name,
      broker: '',
      qty: 0,
      amount: 0,
      rateSum: 0,
      trades: 0,
    };
    cur.qty += qty;
    cur.amount += amt;
    cur.rateSum += r.rate ?? 0;
    cur.trades += 1;
    map.set(key, cur);
  }
  return map;
}

async function screenerMap(): Promise<Map<string, MiniScreenerRow>> {
  const rows = await loadMiniScreener();
  return new Map(rows.map((r) => [r.symbol.toUpperCase(), r]));
}

function sideToIntel(
  agg: SideAgg,
  screener: Map<string, MiniScreenerRow>,
  directory: Map<string, string>,
  signal: string,
  scoreFn: (a: SideAgg, s?: MiniScreenerRow) => number,
): Omit<PremiumIntelRow, 'rank'> {
  const s = screener.get(agg.symbol.toUpperCase());
  const avgRate = agg.trades > 0 ? agg.rateSum / agg.trades : null;
  return enrichRow(
    {
      symbol: agg.symbol,
      name: agg.name,
      brokerCode: agg.broker || null,
      brokerName: agg.broker ? brokerLabel(agg.broker, directory) : null,
      ltp: s?.ltp ?? null,
      changePct: s?.changePercent ?? null,
      quantity: agg.qty,
      amount: agg.amount,
      avgRate,
      netQty: null,
      netAmount: null,
      turnover: s?.turnover ?? null,
      volume: s?.volume ?? null,
      sector: s?.sector ?? null,
      fiftyTwoWeekHigh: s?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: s?.fiftyTwoWeekLow ?? null,
      pctFromHigh: null,
      pctFromLow: null,
      score: scoreFn(agg, s),
      signal,
    },
    screener,
    [{ label: 'Trades', value: String(agg.trades) }],
  );
}

async function loadFromFloorsheetSide(
  side: 'buy' | 'sell',
  limit: number,
): Promise<PremiumIntelSnapshot> {
  const [rows, screener, brokers] = await Promise.all([
    loadSessionFloorsheet(),
    screenerMap(),
    loadBrokers(),
  ]);
  const directory = new Map(brokers.map((b) => [b.code, b.name]));
  const brokerMode = hasBrokerData(rows);
  const title = side === 'buy' ? 'Top Buyers' : 'Top Sellers';
  const subtitle = brokerMode
    ? `Session floorsheet · ranked by ${side === 'buy' ? 'buy' : 'sell'} value per broker & symbol`
    : 'Session buy pressure by symbol · broker IDs not in today\'s public feed';

  if (brokerMode) {
    const agg = buildSideAgg(rows, side);
    const intel = [...agg.values()].map((a) =>
      sideToIntel(
        a,
        screener,
        directory,
        side === 'buy' ? 'Active buyer on floorsheet' : 'Active seller on floorsheet',
        (x, s) =>
          x.amount * (1 + Math.max(0, (s?.changePercent ?? 0) / 20)) *
          Math.log10(Math.max(x.trades, 1) + 1),
      ),
    );
    return {
      title,
      subtitle,
      sessionDate: floorsheetMeta.date,
      tradesScanned: floorsheetMeta.trades,
      brokerBreakdown: true,
      summary: [
        { label: 'Trades scanned', value: String(floorsheetMeta.trades) },
        { label: 'Pairs ranked', value: String(intel.length) },
        { label: 'Source', value: 'Live floorsheet' },
      ],
      rows: rankRows(intel, limit),
    };
  }

  const symAgg = symbolSessionAgg(rows);
  const demand = await loadHighDemand();
  const demandSet = new Set(demand.map((d) => d.symbol.toUpperCase()));
  const intel = [...symAgg.values()]
    .map((a) => {
      const s = screener.get(a.symbol.toUpperCase());
      const ch = s?.changePercent ?? 0;
      if (side === 'buy' && ch < -0.5) return null;
      if (side === 'sell' && ch > 0.5) return null;
      const demandBoost = demandSet.has(a.symbol.toUpperCase()) ? 1.35 : 1;
      return sideToIntel(
        a,
        screener,
        directory,
        side === 'buy'
          ? 'Heavy session volume · buy-side bias'
          : 'Heavy session volume · sell-side bias',
        (x) =>
          x.amount *
          demandBoost *
          (side === 'buy' ? Math.max(0.5, 1 + ch / 15) : Math.max(0.5, 1 - ch / 15)),
      );
    })
    .filter(Boolean) as Omit<PremiumIntelRow, 'rank'>[];

  return {
    title,
    subtitle,
    sessionDate: floorsheetMeta.date,
    tradesScanned: floorsheetMeta.trades,
    brokerBreakdown: false,
    summary: [
      { label: 'Trades scanned', value: String(floorsheetMeta.trades) },
      { label: 'Symbols ranked', value: String(intel.length) },
      { label: 'Demand board', value: String(demand.length) },
    ],
    rows: rankRows(intel, limit),
  };
}

async function loadNetIntel(
  mode: 'holders' | 'releases',
  limit: number,
): Promise<PremiumIntelSnapshot> {
  const [rows, screener, brokers] = await Promise.all([
    loadSessionFloorsheet(),
    screenerMap(),
    loadBrokers(),
  ]);
  const directory = new Map(brokers.map((b) => [b.code, b.name]));
  const brokerMode = hasBrokerData(rows);
  const title = mode === 'holders' ? 'Top Holders' : 'Top Releases';
  const subtitle = brokerMode
    ? mode === 'holders'
      ? 'Net buyers still holding — buy qty minus sell qty on session floorsheet'
      : 'Net sellers releasing — sell qty minus buy qty on session floorsheet'
    : mode === 'holders'
      ? 'Accumulation candidates · demand + price strength proxy'
      : 'Distribution candidates · supply + price weakness proxy';

  if (brokerMode) {
    const net = buildNetAgg(rows);
    const filtered = [...net.values()].filter((n) =>
      mode === 'holders' ? n.qty > 0 : n.qty < 0,
    );
    const intel = filtered.map((n) => {
      const s = screener.get(n.symbol.toUpperCase());
      const avgRate = n.trades > 0 ? n.rateSum / n.trades : null;
      const netQty = Math.abs(n.qty);
      const netAmt = Math.abs(n.amount);
      return enrichRow(
        {
          symbol: n.symbol,
          name: n.name,
          brokerCode: n.broker,
          brokerName: brokerLabel(n.broker, directory),
          ltp: s?.ltp ?? null,
          changePct: s?.changePercent ?? null,
          quantity: netQty,
          amount: netAmt,
          avgRate,
          netQty: n.qty,
          netAmount: n.amount,
          turnover: s?.turnover ?? null,
          volume: s?.volume ?? null,
          sector: s?.sector ?? null,
          fiftyTwoWeekHigh: s?.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: s?.fiftyTwoWeekLow ?? null,
          pctFromHigh: null,
          pctFromLow: null,
          score: netAmt * Math.log10(netQty + 10),
          signal:
            mode === 'holders'
              ? 'Net accumulation on floorsheet'
              : 'Net distribution on floorsheet',
        },
        screener,
        [
          { label: 'Net qty', value: fmtNum(n.qty, 0) },
          { label: 'Buy', value: fmtNum(n.buyQty, 0) },
          { label: 'Sell', value: fmtNum(n.sellQty, 0) },
        ],
      );
    });
    return {
      title,
      subtitle,
      sessionDate: floorsheetMeta.date,
      tradesScanned: floorsheetMeta.trades,
      brokerBreakdown: true,
      summary: [
        { label: 'Net positions', value: String(intel.length) },
        { label: 'Trades scanned', value: String(floorsheetMeta.trades) },
        { label: 'Mode', value: mode === 'holders' ? 'Accumulation' : 'Release' },
      ],
      rows: rankRows(intel, limit),
    };
  }

  const [demand, supply] = await Promise.all([loadHighDemand(), loadHighSupply()]);
  const demandSet = new Set(demand.map((d) => d.symbol.toUpperCase()));
  const supplySet = new Set(supply.map((d) => d.symbol.toUpperCase()));
  const demandQty = new Map(
    demand.map((d) => [d.symbol.toUpperCase(), d.quantity ?? 0]),
  );
  const supplyQty = new Map(
    supply.map((d) => [d.symbol.toUpperCase(), d.quantity ?? 0]),
  );
  const mini = await loadMiniScreener();

  const buildProxyRow = (
    s: MiniScreenerRow,
    opts: {
      boardQty: number;
      boardLabel: string;
      signal: string;
      score: number;
      netSign: 1 | -1;
    },
  ): Omit<PremiumIntelRow, 'rank'> => {
    const vol = s.volume ?? 0;
    const turn = s.turnover ?? 0;
    return enrichRow(
      {
        symbol: s.symbol,
        name: s.name,
        brokerCode: null,
        brokerName: null,
        ltp: s.ltp,
        changePct: s.changePercent,
        quantity: opts.boardQty || vol,
        amount: turn,
        avgRate: s.ltp,
        netQty: vol * opts.netSign,
        netAmount: turn * opts.netSign,
        turnover: turn,
        volume: vol,
        sector: s.sector,
        fiftyTwoWeekHigh: s.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: s.fiftyTwoWeekLow,
        pctFromHigh: null,
        pctFromLow: null,
        score: opts.score,
        signal: opts.signal,
      },
      screener,
      [
        { label: opts.boardLabel, value: fmtNum(opts.boardQty, 0) },
        { label: 'Turnover', value: turn > 0 ? formatRs(turn) : '—' },
      ],
    );
  };

  let intel: Omit<PremiumIntelRow, 'rank'>[] = [];

  if (mode === 'holders') {
    intel = mini
      .filter((s) => demandSet.has(s.symbol.toUpperCase()))
      .map((s) => {
        const ch = s.changePercent ?? 0;
        const turn = s.turnover ?? 0;
        const boardQty = demandQty.get(s.symbol.toUpperCase()) ?? 0;
        const score =
          boardQty * 0.001 +
          turn * (1 + Math.max(0, ch) / 10) +
          Math.log10(Math.max(turn, 1000));
        const signal =
          ch > 0
            ? 'Demand board + rising price · holder proxy'
            : 'Demand board · accumulation interest (price flat/down)';
        return buildProxyRow(s, {
          boardQty,
          boardLabel: 'Demand qty',
          signal,
          score,
          netSign: 1,
        });
      });

    if (!intel.length) {
      intel = mini
        .filter((s) => (s.changePercent ?? 0) > 0 && (s.turnover ?? 0) > 0)
        .map((s) => {
          const ch = s.changePercent ?? 0;
          const turn = s.turnover ?? 0;
          return buildProxyRow(s, {
            boardQty: s.volume ?? 0,
            boardLabel: 'Volume',
            signal: 'Rising price + turnover · holder proxy (no demand board)',
            score: turn * (1 + ch / 10),
            netSign: 1,
          });
        });
    }
  } else {
    intel = mini
      .filter((s) => supplySet.has(s.symbol.toUpperCase()))
      .map((s) => {
        const ch = s.changePercent ?? 0;
        const turn = s.turnover ?? 0;
        const boardQty = supplyQty.get(s.symbol.toUpperCase()) ?? 0;
        const score =
          boardQty * 0.001 +
          turn * (1 + Math.max(0, -ch) / 10) +
          Math.log10(Math.max(turn, 1000));
        const signal =
          ch < 0
            ? 'Supply board + falling price · release proxy'
            : 'Supply board · sell-side pressure (price flat/up)';
        return buildProxyRow(s, {
          boardQty,
          boardLabel: 'Supply qty',
          signal,
          score,
          netSign: -1,
        });
      });

    if (!intel.length) {
      intel = mini
        .filter((s) => (s.changePercent ?? 0) < 0 && (s.turnover ?? 0) > 0)
        .map((s) => {
          const ch = s.changePercent ?? 0;
          const turn = s.turnover ?? 0;
          return buildProxyRow(s, {
            boardQty: s.volume ?? 0,
            boardLabel: 'Volume',
            signal: 'Falling price + turnover · release proxy (no supply board)',
            score: turn * (1 + Math.abs(ch) / 10),
            netSign: -1,
          });
        });
    }
  }

  return {
    title,
    subtitle,
    sessionDate: floorsheetMeta.date,
    tradesScanned: floorsheetMeta.trades,
    brokerBreakdown: false,
    summary: [
      { label: 'Universe', value: String(mini.length) },
      { label: 'Board filter', value: mode === 'holders' ? `${demand.length} demand` : `${supply.length} supply` },
      { label: 'Mode', value: mode === 'holders' ? 'Proxy' : 'Proxy' },
    ],
    rows: rankRows(intel, limit),
  };
}

async function loadBrokerFavorites(limit: number): Promise<PremiumIntelSnapshot> {
  const [screener, demand, mini] = await Promise.all([
    screenerMap(),
    loadHighDemand(),
    loadMiniScreener(),
  ]);
  const demandSet = new Set(demand.map((d) => d.symbol.toUpperCase()));
  const turnRes = await fetch(`${LIVE_V2}/top-turnover`, {
    headers: { Accept: 'application/json' },
  });
  const topTurn = turnRes.ok ? ((await turnRes.json()) as Array<{ symbol?: string; turnover?: number }>) : [];
  const turnSet = new Set(topTurn.map((t) => String(t.symbol ?? '').toUpperCase()));

  const intel = mini
    .map((s) => {
      const sym = s.symbol.toUpperCase();
      const ch = s.changePercent ?? 0;
      const turn = s.turnover ?? 0;
      const high = s.fiftyTwoWeekHigh;
      const ltp = s.ltp ?? 0;
      const nearHigh = high && ltp ? ltp / high >= 0.92 : false;
      let score = 0;
      if (demandSet.has(sym)) score += 40;
      if (turnSet.has(sym)) score += 35;
      if (ch > 1) score += ch * 3;
      if (nearHigh) score += 25;
      score += Math.log10(Math.max(turn, 1000));
      if (score < 50) return null;

      const tags = ['Convergence'];
      if (demandSet.has(sym)) tags.push('Demand');
      if (turnSet.has(sym)) tags.push('Top turnover');
      if (nearHigh) tags.push('52W zone');

      return enrichRow(
        {
          symbol: s.symbol,
          name: s.name,
          brokerCode: null,
          brokerName: null,
          ltp: s.ltp,
          changePct: s.changePercent,
          quantity: s.volume,
          amount: turn,
          avgRate: s.ltp,
          netQty: null,
          netAmount: null,
          turnover: turn,
          volume: s.volume,
          sector: s.sector,
          fiftyTwoWeekHigh: high,
          fiftyTwoWeekLow: s.fiftyTwoWeekLow,
          pctFromHigh: null,
          pctFromLow: null,
          score,
          signal: 'Multi-signal institutional interest · broker favorite candidate',
        },
        screener,
        [{ label: 'Score', value: score.toFixed(0) }],
        tags,
      );
    })
    .filter(Boolean) as Omit<PremiumIntelRow, 'rank'>[];

  return {
    title: 'Broker Favorites',
    subtitle:
      'Stocks where demand, turnover, momentum and 52-week strength converge — smart-money watchlist.',
    sessionDate: new Date().toISOString().slice(0, 10),
    tradesScanned: 0,
    brokerBreakdown: false,
    summary: [
      { label: 'Demand board', value: String(demand.length) },
      { label: 'Top turnover', value: String(topTurn.length) },
      { label: 'Candidates', value: String(intel.length) },
    ],
    rows: rankRows(intel, limit),
  };
}

async function loadBrokerTopBuySell(limit: number): Promise<PremiumIntelSnapshot> {
  const [rows, brokers, screener] = await Promise.all([
    loadSessionFloorsheet(),
    loadBrokers(),
    screenerMap(),
  ]);
  const directory = new Map(brokers.map((b) => [b.code, b.name]));

  if (hasBrokerData(rows)) {
    const netByBroker = new Map<string, BrokerNet>();
    for (const r of rows) {
      const qty = r.quantity ?? 0;
      const amt = r.amount ?? qty * (r.rate ?? 0);
      const apply = (raw: string, isBuy: boolean) => {
        const code = brokerKey(raw);
        if (!code) return;
        const cur = netByBroker.get(code) ?? {
          broker: code,
          buyAmt: 0,
          sellAmt: 0,
          buyQty: 0,
          sellQty: 0,
          symbols: new Set<string>(),
        };
        if (isBuy) {
          cur.buyAmt += amt;
          cur.buyQty += qty;
        } else {
          cur.sellAmt += amt;
          cur.sellQty += qty;
        }
        cur.symbols.add(r.symbol.toUpperCase());
        netByBroker.set(code, cur);
      };
      apply(r.buyerBroker, true);
      apply(r.sellerBroker, false);
    }

    const intel = [...netByBroker.values()].map((b) => {
      const net = b.buyAmt - b.sellAmt;
      const bias = net >= 0 ? 'Net buyer' : 'Net seller';
      return enrichRow(
        {
          symbol: `${b.symbols.size} stocks`,
          name: brokerLabel(b.broker, directory),
          brokerCode: b.broker,
          brokerName: brokerLabel(b.broker, directory),
          ltp: null,
          changePct: null,
          quantity: b.buyQty + b.sellQty,
          amount: b.buyAmt + b.sellAmt,
          avgRate: null,
          netQty: b.buyQty - b.sellQty,
          netAmount: net,
          turnover: null,
          volume: null,
          sector: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          pctFromHigh: null,
          pctFromLow: null,
          score: Math.abs(net) + b.buyAmt * 0.01,
          signal: `${bias} · ${b.symbols.size} symbols touched`,
        },
        screener,
        [
          { label: 'Buy', value: formatRs(b.buyAmt) },
          { label: 'Sell', value: formatRs(b.sellAmt) },
          { label: 'Net', value: formatRs(net), tone: net >= 0 ? 'up' : 'down' },
        ],
        [bias],
      );
    });

    return {
      title: 'Broker Top Buy / Sell',
      subtitle: 'Brokers ranked by session buy vs sell value across all floorsheet trades.',
      sessionDate: floorsheetMeta.date,
      tradesScanned: floorsheetMeta.trades,
      brokerBreakdown: true,
      summary: [
        { label: 'Brokers', value: String(intel.length) },
        { label: 'Trades', value: String(floorsheetMeta.trades) },
        { label: 'Source', value: 'Floorsheet' },
      ],
      rows: rankRows(intel, limit),
    };
  }

  const [demand, supply] = await Promise.all([loadHighDemand(), loadHighSupply()]);
  const buyVol = demand.reduce((s, d) => s + (d.quantity ?? 0), 0);
  const sellVol = supply.reduce((s, d) => s + (d.quantity ?? 0), 0);
  const mini = await loadMiniScreener();
  const up = mini.filter((s) => (s.changePercent ?? 0) > 0);
  const down = mini.filter((s) => (s.changePercent ?? 0) < 0);

  const intel: Omit<PremiumIntelRow, 'rank'>[] = [
    enrichRow(
      {
        symbol: 'MARKET',
        name: 'Buy-side pressure',
        brokerCode: null,
        brokerName: 'Session aggregate',
        ltp: null,
        changePct: null,
        quantity: buyVol,
        amount: up.reduce((s, r) => s + (r.turnover ?? 0), 0),
        avgRate: null,
        netQty: buyVol - sellVol,
        netAmount: null,
        turnover: null,
        volume: null,
        sector: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        pctFromHigh: null,
        pctFromLow: null,
        score: buyVol,
        signal: `${up.length} advancers · demand board ${fmtNum(buyVol, 0)} qty`,
      },
      screener,
      [{ label: 'Demand qty', value: fmtNum(buyVol, 0) }],
      ['Buy bias'],
    ),
    enrichRow(
      {
        symbol: 'MARKET',
        name: 'Sell-side pressure',
        brokerCode: null,
        brokerName: 'Session aggregate',
        ltp: null,
        changePct: null,
        quantity: sellVol,
        amount: down.reduce((s, r) => s + (r.turnover ?? 0), 0),
        avgRate: null,
        netQty: sellVol - buyVol,
        netAmount: null,
        turnover: null,
        volume: null,
        sector: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        pctFromHigh: null,
        pctFromLow: null,
        score: sellVol,
        signal: `${down.length} decliners · supply board ${fmtNum(sellVol, 0)} qty`,
      },
      screener,
      [{ label: 'Supply qty', value: fmtNum(sellVol, 0) }],
      ['Sell bias'],
    ),
  ];

  return {
    title: 'Broker Top Buy / Sell',
    subtitle:
      'Live buy vs sell pressure snapshot. Per-broker ranking activates when floorsheet broker IDs are published.',
    sessionDate: floorsheetMeta.date,
    tradesScanned: floorsheetMeta.trades,
    brokerBreakdown: false,
    summary: [
      { label: 'Demand', value: fmtNum(buyVol, 0) },
      { label: 'Supply', value: fmtNum(sellVol, 0) },
      { label: 'Brokers listed', value: String(brokers.length) },
    ],
    rows: rankRows(intel, limit),
  };
}

export async function loadPremiumIntel(
  kind: PremiumIntelKind,
  limit = 50,
): Promise<PremiumIntelSnapshot> {
  switch (kind) {
    case 'top-buyers':
      return loadFromFloorsheetSide('buy', limit);
    case 'top-sellers':
      return loadFromFloorsheetSide('sell', limit);
    case 'top-holders':
      return loadNetIntel('holders', limit);
    case 'top-releases':
      return loadNetIntel('releases', limit);
    case 'broker-favorites':
      return loadBrokerFavorites(limit);
    case 'broker-top-buy-sell':
      return loadBrokerTopBuySell(limit);
    default:
      return loadFromFloorsheetSide('buy', limit);
  }
}

export async function loadFiftyTwoWeekRows(
  mode: 'high' | 'low',
  limit = 60,
): Promise<{ rows: FiftyTwoWeekRow[]; summary: IntelMetric[] }> {
  const mini = await loadMiniScreener();
  const rows = mini
    .map((s) => {
      const ltp = s.ltp;
      const high = s.fiftyTwoWeekHigh;
      const low = s.fiftyTwoWeekLow;
      if (!ltp || !high || !low) return null;
      const pctFromHigh = ((ltp - high) / high) * 100;
      const pctFromLow = ((ltp - low) / low) * 100;
      if (mode === 'high') {
        if (pctFromHigh < -25) return null;
      } else if (pctFromLow > 25) return null;

      const score =
        mode === 'high'
          ? 100 + pctFromHigh + (s.changePercent ?? 0)
          : 100 - pctFromLow - Math.abs(s.changePercent ?? 0);

      const signal =
        mode === 'high'
          ? pctFromHigh >= -1
            ? 'At or breaking 52-week high zone'
            : `Within ${Math.abs(pctFromHigh).toFixed(1)}% of 52W high`
          : pctFromLow <= 1
            ? 'At or breaking 52-week low zone'
            : `Within ${Math.abs(pctFromLow).toFixed(1)}% of 52W low`;

      return {
        rank: 0,
        symbol: s.symbol,
        name: s.name,
        ltp,
        high52: high,
        low52: low,
        pctFromHigh,
        pctFromLow,
        changePct: s.changePercent,
        volume: s.volume,
        turnover: s.turnover,
        sector: s.sector,
        signal,
        score,
        metrics: [
          { label: '52W high', value: fmtNum(high) },
          { label: '52W low', value: fmtNum(low) },
          { label: 'Range', value: `${fmtNum(low)} – ${fmtNum(high)}` },
          {
            label: mode === 'high' ? 'From high' : 'From low',
            value:
              mode === 'high'
                ? `${pctFromHigh >= 0 ? '+' : ''}${pctFromHigh.toFixed(2)}%`
                : `${pctFromLow >= 0 ? '+' : ''}${pctFromLow.toFixed(2)}%`,
            tone: mode === 'high' ? (pctFromHigh >= 0 ? 'up' : 'neutral') : (pctFromLow <= 0 ? 'down' : 'neutral'),
          },
          { label: 'Turnover', value: s.turnover != null ? formatRs(s.turnover) : '—' },
          { label: 'Mcap', value: fmtMcap(s.marketCap) },
        ],
      };
    })
    .filter(Boolean) as Array<FiftyTwoWeekRow & { score: number }>;

  const sorted = rows
    .sort((a, b) =>
      mode === 'high' ? b.pctFromHigh! - a.pctFromHigh! : a.pctFromLow! - b.pctFromLow!,
    )
    .slice(0, limit)
    .map((r, i) => {
      const { score: _s, ...rest } = r;
      return { ...rest, rank: i + 1 };
    });

  return {
    rows: sorted,
    summary: [
      { label: 'Universe', value: String(mini.length) },
      { label: 'Matched', value: String(sorted.length) },
      { label: 'Mode', value: mode === 'high' ? 'Near 52W high' : 'Near 52W low' },
    ],
  };
}

export { formatRs, fmtNum, fmtMcap };
