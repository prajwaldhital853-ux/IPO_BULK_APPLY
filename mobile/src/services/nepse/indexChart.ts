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

function fmtClock(hour24: number, minute: number): string {
  const h12 = hour24 % 12 || 12;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function syntheticIntraday(
  current: number | null,
  change: number | null,
): ChartPoint[] {
  if (current == null || change == null) return [];
  const end = current;
  const start = end - change;
  const startMin = 11 * 60;
  const endMin = 15 * 60;
  const step = 5;
  const total = Math.floor((endMin - startMin) / step);
  const points: ChartPoint[] = [];
  for (let i = 0; i <= total; i += 1) {
    const mins = startMin + i * step;
    const t = i / total;
    const wave =
      Math.sin(t * Math.PI * 2.4) * Math.abs(end - start) * 0.12 +
      Math.sin(t * Math.PI * 5.1) * Math.abs(end - start) * 0.04;
    const value =
      i === total
        ? end
        : start + (end - start) * t + wave * (1 - Math.abs(t - 0.5) * 1.2);
    points.push({
      label: fmtClock(Math.floor(mins / 60), mins % 60),
      value,
    });
  }
  return points;
}

function ensureAmPmLabels(points: ChartPoint[]): ChartPoint[] {
  return points.map((p) => {
    if (/AM|PM/i.test(p.label)) return p;
    const m = /^(\d{1,2}):(\d{2})$/.exec(p.label.trim());
    if (!m) return p;
    const hour24 = Number(m[1]);
    const minute = Number(m[2]);
    if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return p;
    return { ...p, label: fmtClock(hour24, minute) };
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
    if (sym === 'NEPSE' && intradayFallback.length >= 2) {
      return ensureAmPmLabels(intradayFallback);
    }
    return syntheticIntraday(quote?.current ?? null, quote?.change ?? null);
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
        : fmtDayLabel(new Date(c.time).toISOString()),
    value: c.close,
  }));

  const maxPoints = range === '1M' ? 22 : range === '6M' ? 26 : 30;
  return pickLabels(maxPoints, mapped);
}
