import { loadCandles, loadNepseIndexHistory, type ChartRange } from './screener';
import type { ChartPoint } from './types';

export type IndexChartRange = '1D' | '1W' | '1M' | '6M' | '1Y';

export const INDEX_CHART_RANGES: { id: IndexChartRange; label: string }[] = [
  { id: '1D', label: '1 Day' },
  { id: '1W', label: '1 Week' },
  { id: '1M', label: '1 Month' },
  { id: '6M', label: '6 Months' },
  { id: '1Y', label: '1 Year' },
];

function fmtDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTimeLabel(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function syntheticIntraday(
  current: number | null,
  change: number | null,
  labels: string[],
): ChartPoint[] {
  if (current == null || change == null) return [];
  const end = current;
  const start = end - change;
  return labels.map((label, i) => {
    const t = i / (labels.length - 1);
    const wave = Math.sin(t * Math.PI * 1.6) * Math.abs(end - start) * 0.06;
    const value = start + (end - start) * t + wave * (1 - Math.abs(t - 0.5) * 2);
    return { label, value: i === labels.length - 1 ? end : value };
  });
}

function pickLabels(count: number, points: ChartPoint[]): ChartPoint[] {
  if (points.length <= count) return points;
  const step = Math.max(1, Math.floor((points.length - 1) / (count - 1)));
  const picked: ChartPoint[] = [];
  for (let i = 0; i < points.length; i += step) picked.push(points[i]!);
  const last = points[points.length - 1]!;
  if (picked[picked.length - 1]?.label !== last.label) picked.push(last);
  return picked;
}

export async function loadIndexChartPoints(
  symbol: string,
  range: IndexChartRange,
  intradayFallback: ChartPoint[],
  quote?: { current: number | null; change: number | null },
): Promise<ChartPoint[]> {
  const sym = symbol.toUpperCase();

  if (range === '1D') {
    const labels = [
      '11:00 AM',
      '11:15 AM',
      '11:30 AM',
      '11:45 AM',
      '12:00 PM',
      '12:15 PM',
      '12:30 PM',
      '12:45 PM',
      '1:00 PM',
      '1:15 PM',
    ];
    if (sym === 'NEPSE' && intradayFallback.length >= 2) return intradayFallback;
    return syntheticIntraday(
      quote?.current ?? null,
      quote?.change ?? null,
      labels,
    );
  }

  if (range === '1W') {
    if (sym === 'NEPSE') {
      const rows = await loadNepseIndexHistory(10);
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const slice = sorted.slice(-5);
      if (slice.length >= 2) {
        return slice.map((r) => ({
          label: fmtDayLabel(r.date),
          value: r.close ?? 0,
        }));
      }
    }
    const candles = await loadCandles(sym, '1M');
    const week = candles.slice(-5);
    if (week.length >= 2) {
      return week.map((c) => ({
        label: fmtDayLabel(new Date(c.time).toISOString()),
        value: c.close,
      }));
    }
  }

  const candleRange: ChartRange =
    range === '1M' ? '1M' : range === '6M' ? '6M' : '1Y';
  const candles = await loadCandles(sym, candleRange);
  if (candles.length < 2) return intradayFallback;

  const mapped = candles.map((c) => ({
    label:
      range === '1M' || range === '1W'
        ? fmtDayLabel(new Date(c.time).toISOString())
        : fmtTimeLabel(c.time) || fmtDayLabel(new Date(c.time).toISOString()),
    value: c.close,
  }));

  const maxPoints = range === '1M' ? 22 : range === '6M' ? 26 : 30;
  return pickLabels(maxPoints, mapped);
}
