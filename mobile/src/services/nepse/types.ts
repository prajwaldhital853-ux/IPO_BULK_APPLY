export type MarketStatus = 'open' | 'closed' | 'unknown';

export type NepseHoliday = {
  date: string; // YYYY-MM-DD
  title: string;
  kind: 'public' | 'nepse';
};

export type MarketSummary = {
  businessDate: string | null;
  index: number | null;
  indexChange: number | null;
  indexPct: number | null;
  turnover: number | null;
  tradedShares: number | null;
  transactions: number | null;
  scripsTraded: number | null;
  advanced: number | null;
  declined: number | null;
  unchanged: number | null;
};

export type IndexQuote = {
  name: string;
  symbol?: string;
  current: number | null;
  change: number | null;
  pct: number | null;
};

export type SecurityQuote = {
  symbol: string;
  name: string;
  ltp: number | null;
  change: number | null;
  pct: number | null;
  qty: number | null;
  iconUrl?: string | null;
};

export type TurnoverRow = {
  symbol: string;
  name: string;
  turnover: number | null;
  ltp: number | null;
  pct: number | null;
  iconUrl: string | null;
};

export type TransactionRow = {
  symbol: string;
  name: string;
  ltp: number | null;
  trades: number | null;
  pct: number | null;
  iconUrl: string | null;
};

export type TradedShareRow = {
  symbol: string;
  name: string;
  ltp: number | null;
  shares: number | null;
  pct: number | null;
  iconUrl: string | null;
};

export type ChartPoint = {
  label: string;
  value: number;
};

export type MoverRow = {
  symbol: string;
  name: string;
  ltp: number | null;
  change: number | null;
  pct: number | null;
  iconUrl: string | null;
};

export type NepseMarketSnapshot = {
  status: MarketStatus;
  statusNote: string;
  asOf: string | null;
  summary: MarketSummary;
  indices: IndexQuote[];
  gainers: MoverRow[];
  losers: MoverRow[];
  turnovers: TurnoverRow[];
  transactions: TransactionRow[];
  tradedShares: TradedShareRow[];
  subIndices: IndexQuote[];
  securities: SecurityQuote[];
  chartPoints: ChartPoint[];
  fetchedAt: string;
  source: 'live' | 'cached' | 'offline';
};

export type CalendarDay = {
  date: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayTitle?: string;
  isTradingDay: boolean;
};

export type CalendarMonth = {
  year: number;
  month: number; // 1-12
  label: string;
  weeks: CalendarDay[][];
  todayStatus: {
    isTradingDay: boolean;
    label: string;
    detail: string;
  };
  upcomingHolidays: NepseHoliday[];
};
