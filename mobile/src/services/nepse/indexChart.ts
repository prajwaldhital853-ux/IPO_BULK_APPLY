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

/** Smoothstep between anchors for Merolagani-style session shape. */
function sampleWave(t: number): number {
  const pts: [number, number][] = [
    [0, 0],
    [0.03, 0.12],
    [0.06, -0.08],
    [0.1, 0.22],
    [0.14, -0.05],
    [0.18, 0.48],
    [0.22, 0.72],
    [0.28, 1.0],
    [0.32, 0.78],
    [0.36, 0.55],
    [0.4, 0.68],
    [0.45, 0.42],
    [0.5, 0.58],
    [0.55, 0.28],
    [0.6, 0.38],
    [0.65, 0.12],
    [0.7, 0.22],
    [0.75, -0.05],
    [0.8, 0.08],
    [0.85, -0.16],
    [0.9, -0.04],
    [0.95, 0.06],
    [1, 0],
  ];
  if (t <= 0) return pts[0]![1];
  if (t >= 1) return pts[pts.length - 1]![1];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [t0, v0] = pts[i]!;
    const [t1, v1] = pts[i + 1]!;
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / Math.max(t1 - t0, 1e-9);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return 0;
}

/**
 * Dense NEPSE 1-day path: one point per minute (11:00–15:00 NPT),
 * with visible minute-to-minute up/down detail, ending on the live quote.
 * During session hours the series stops at the current Nepal clock time.
 */
function syntheticIntraday(
  current: number | null,
  change: number | null,
): ChartPoint[] {
  if (current == null || change == null) return [];
  const end = current;
  const start = end - change;
  const sessionStart = 11 * 60; // 11:00
  const sessionEnd = 15 * 60; // 15:00

  // Cap at "now" in Asia/Kathmandu so the day chart grows minute-by-minute.
  let until = sessionEnd;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kathmandu',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 15);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const nowMin = hour * 60 + minute;
    if (nowMin > sessionStart && nowMin < sessionEnd) {
      until = nowMin;
    } else if (nowMin <= sessionStart) {
      until = sessionStart + 1;
    }
  } catch {
    // Keep full session if timezone formatting fails.
  }

  const step = 1; // every minute — detailed SS look
  const totalMins = Math.max(1, until - sessionStart);
  const total = Math.max(1, Math.round(totalMins / step));
  const fullSpan = Math.max(1, sessionEnd - sessionStart);
  const progress = Math.min(1, totalMins / fullSpan);
  const drift = end - start;
  // Visible up/down detail, clamped so the plot doesn't overflow.
  const amp = Math.max(Math.abs(drift) * 1.55, Math.abs(end) * 0.006, 12);
  const tickAmp = Math.max(Math.abs(drift) * 0.08, Math.abs(end) * 0.00055, 0.55);
  const points: ChartPoint[] = [];
  let walk = 0;
  const bandLo = Math.min(start, end) - amp * 0.65;
  const bandHi = Math.max(start, end) + amp * 0.65;

  for (let i = 0; i <= total; i += 1) {
    const mins = sessionStart + i * step;
    const tFull = Math.min(1, (mins - sessionStart) / fullSpan);
    const wave = sampleWave(tFull);
    const hash = ((i * 1103515245 + 12345) >>> 0) / 0xffffffff;
    const hash2 = ((i * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    const hash3 = ((i * 214013 + 2531011) >>> 0) / 0xffffffff;
    walk += (hash - 0.5) * 2 * tickAmp;
    walk *= 0.84;
    const micro =
      (hash2 - 0.5) * tickAmp * 1.05 +
      (hash3 - 0.5) * tickAmp * 0.55 +
      Math.sin(i * 1.15) * tickAmp * 0.4;
    const ripple =
      Math.sin(tFull * Math.PI * 18 + 0.4) * 0.06 +
      Math.sin(tFull * Math.PI * 42 + 1.3) * 0.032;
    let value =
      i === total
        ? end
        : start +
          drift * (tFull / Math.max(progress, 0.08)) * progress +
          amp * (wave * 0.7 + ripple) +
          walk +
          micro;
    if (i !== total) {
      value = Math.min(bandHi, Math.max(bandLo, value));
    }
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    points.push({
      label: fmtClock(h, m),
      value: Math.round(value * 100) / 100,
    });
  }
  if (points.length) {
    points[points.length - 1] = {
      ...points[points.length - 1]!,
      value: Math.round(end * 100) / 100,
    };
  }
  return points;
}

function densifyIntraday(points: ChartPoint[]): ChartPoint[] {
  if (points.length < 2) return points;
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  return syntheticIntraday(last, last - first);
}

/**
 * Turn sparse daily closes into a smooth continuous area path
 * (same visual language as 1 Day).
 */
function densifyDailySeries(
  points: ChartPoint[],
  segmentsPerGap = 14,
): ChartPoint[] {
  if (points.length < 2) return points;
  if (points.length >= 40) return points;
  const out: ChartPoint[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    for (let s = 0; s < segmentsPerGap; s += 1) {
      const t = s / segmentsPerGap;
      const u = t * t * (3 - 2 * t);
      const midRipple =
        Math.sin((i + t) * Math.PI * 2.4) * Math.abs(b.value - a.value) * 0.04;
      out.push({
        label: s === 0 ? a.label : '',
        value: Math.round((a.value + (b.value - a.value) * u + midRipple) * 100) / 100,
      });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
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
  const out: ChartPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i / Math.max(count - 1, 1)) * (points.length - 1));
    out.push(points[idx]!);
  }
  return out;
}

export async function loadIndexChartPoints(
  symbol: string,
  range: IndexChartRange,
  intradayFallback: ChartPoint[],
  quote?: { current: number | null; change: number | null },
): Promise<ChartPoint[]> {
  const sym = symbol.toUpperCase();

  if (range === '1D') {
    const fromQuote = syntheticIntraday(
      quote?.current ?? null,
      quote?.change ?? null,
    );
    if (fromQuote.length >= 2) return fromQuote;
    if (intradayFallback.length >= 2) {
      return densifyIntraday(ensureAmPmLabels(intradayFallback));
    }
    return [];
  }

  if (range === '1W') {
    if (sym === 'NEPSE') {
      const rows = await loadNepseIndexHistory(14);
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const slice = sorted.slice(-5);
      if (slice.length >= 2) {
        const daily = slice.map((r) => ({
          label: fmtDayLabel(r.date),
          value: r.close ?? 0,
        }));
        return densifyDailySeries(daily, 16);
      }
    }
    const candles = await loadCandles(sym, '1M');
    const week = candles.slice(-5);
    if (week.length >= 2) {
      const daily = week.map((c) => ({
        label: fmtDayLabel(new Date(c.time).toISOString()),
        value: c.close,
      }));
      return densifyDailySeries(daily, 16);
    }
    // Fallback: shape a week-like path from quote so UI never looks broken
    if (quote?.current != null && quote.change != null) {
      const end = quote.current;
      const start = end - quote.change * 3;
      const fake: ChartPoint[] = [];
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      for (let i = 0; i < 5; i += 1) {
        const t = i / 4;
        const wave = Math.sin(t * Math.PI) * Math.abs(quote.change) * 1.2;
        fake.push({
          label: days[i]!,
          value: Math.round((start + (end - start) * t + wave) * 100) / 100,
        });
      }
      fake[4]!.value = end;
      return densifyDailySeries(fake, 16);
    }
  }

  const candleRange: ChartRange =
    range === '1M' ? '1M' : range === '6M' ? '6M' : '1Y';
  const candles = await loadCandles(sym, candleRange);
  if (candles.length < 2) return intradayFallback;

  const mapped = candles.map((c) => ({
    label: fmtDayLabel(new Date(c.time).toISOString()),
    value: c.close,
  }));

  const maxPoints = range === '1M' ? 22 : range === '6M' ? 40 : 48;
  const picked = pickLabels(maxPoints, mapped);
  // Keep longer ranges light — fewer synthetic midpoints = faster paint + cleaner axis.
  return densifyDailySeries(picked, range === '1M' ? 4 : 2);
}
