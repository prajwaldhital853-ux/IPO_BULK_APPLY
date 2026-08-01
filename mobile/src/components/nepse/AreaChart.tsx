import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { CandlePoint } from '../../services/nepse/screener';

type Props = {
  points: CandlePoint[];
  isDark: boolean;
  height?: number;
  up?: boolean;
  showAxes?: boolean;
  interactive?: boolean;
  /** Match parent card/surface (defaults to white / dark panel). */
  backgroundColor?: string;
  /** Parent ScrollView should disable while scrubbing (stops stuck/laggy drag). */
  onInteractionChange?: (active: boolean) => void;
};

/**
 * Tight Merolagani-style Y scale with padding so the series stays inside the plot.
 */
function buildYAxis(dMin: number, dMax: number): {
  min: number;
  max: number;
  ticks: number[];
} {
  const lo = Math.min(dMin, dMax);
  const hi = Math.max(dMin, dMax);
  const rawSpan = Math.max(hi - lo, 1);
  // Extra headroom so peaks/troughs never kiss the frame edge
  const pad = Math.max(rawSpan * 0.12, rawSpan <= 20 ? 1 : rawSpan * 0.08);
  const loP = lo - pad;
  const hiP = hi + pad;

  let step = (hiP - loP) / 5;
  const pow = 10 ** Math.floor(Math.log10(Math.max(step, 1e-6)));
  const n = step / pow;
  step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  if (hiP - loP <= 12) step = 1;
  else if (hiP - loP <= 25 && step > 2) step = 2;
  else if (hiP - loP <= 60 && step > 5) step = 5;

  let min = Math.floor(loP / step) * step;
  let max = Math.ceil(hiP / step) * step;
  while ((max - min) / step > 7) {
    if (hiP - min > max - loP) min += step;
    else max -= step;
  }
  while ((max - min) / step < 4) {
    min -= step;
    max += step;
  }

  const ticks: number[] = [];
  for (let v = min; v <= max + step * 0.001 && ticks.length < 9; v += step) {
    ticks.push(Number(v.toFixed(4)));
  }
  return { min, max, ticks };
}

function fmtAxisTime(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtTipTime(ts: number, spanMs: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  if (spanMs > 36 * 3600 * 1000) {
    return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
  }
  return fmtAxisTime(ts);
}

function fmtPrice(v: number): string {
  return `Rs. ${v.toLocaleString('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Monotone cubic (no overshoot past data min/max — fixes line spilling off chart). */
function buildSmoothAreaPath(
  xs: number[],
  ys: number[],
  baselineY: number,
): { line: string; area: string } {
  const n = xs.length;
  if (n < 2) return { line: '', area: '' };
  if (n === 2) {
    const line = `M ${xs[0]} ${ys[0]} L ${xs[1]} ${ys[1]}`;
    return {
      line,
      area: `${line} L ${xs[1]} ${baselineY} L ${xs[0]} ${baselineY} Z`,
    };
  }

  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dxi = xs[i + 1]! - xs[i]!;
    dx.push(dxi);
    m.push(dxi === 0 ? 0 : (ys[i + 1]! - ys[i]!) / dxi);
  }
  const slopes: number[] = new Array(n);
  slopes[0] = m[0]!;
  slopes[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    slopes[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (Math.abs(m[i]!) < 1e-12) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const a = slopes[i]! / m[i]!;
    const b = slopes[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      slopes[i] = t * a * m[i]!;
      slopes[i + 1] = t * b * m[i]!;
    }
  }

  let line = `M ${xs[0]} ${ys[0]}`;
  const clampSeg = (y: number, yA: number, yB: number) => {
    const lo = Math.min(yA, yB);
    const hi = Math.max(yA, yB);
    return Math.max(lo, Math.min(hi, y));
  };

  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i]!;
    const x1 = xs[i]!;
    const y1 = ys[i]!;
    const x2 = xs[i + 1]!;
    const y2 = ys[i + 1]!;
    const cp1x = x1 + h / 3;
    let cp1y = y1 + (slopes[i]! * h) / 3;
    const cp2x = x2 - h / 3;
    let cp2y = y2 - (slopes[i + 1]! * h) / 3;
    cp1y = clampSeg(cp1y, y1, y2);
    cp2y = clampSeg(cp2y, y1, y2);
    line += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`;
  }
  const last = n - 1;
  return {
    line,
    area: `${line} L ${xs[last]} ${baselineY} L ${xs[0]} ${baselineY} Z`,
  };
}

type Scrub = {
  x: number;
  y: number;
  price: number;
  time: number;
};

type ChartGeom = {
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  plotW: number;
  plotH: number;
  min: number;
  max: number;
  span: number;
  xs: number[];
  ys: number[];
  line: string;
  area: string;
  ticks: number[];
  xTicks: { idx: number; x: number; label: string }[];
  baselineY: number;
  spanMs: number;
};

type StaticProps = {
  width: number;
  height: number;
  chart: ChartGeom;
  showAxes: boolean;
  color: string;
  grid: string;
  axis: string;
};

/** Static layer — memoized so scrubbing does not redraw the full path. */
const StaticChartLayer = memo(function StaticChartLayer({
  width,
  height,
  chart,
  showAxes,
  color,
  grid,
  axis,
}: StaticProps) {
  const plotClipId = 'stockPlotClip';
  const frameClipId = 'stockFrameClip';
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="stockAreaFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.38} />
          <Stop offset="55%" stopColor={color} stopOpacity={0.12} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </LinearGradient>
        <ClipPath id={frameClipId}>
          <Rect x={0} y={0} width={width} height={height} />
        </ClipPath>
        <ClipPath id={plotClipId}>
          <Rect
            x={chart.padL}
            y={chart.padT}
            width={chart.plotW}
            height={chart.plotH}
          />
        </ClipPath>
      </Defs>

      <G clipPath={`url(#${frameClipId})`}>
      {showAxes
        ? chart.ticks.map((tick, yi) => {
            const y =
              chart.padT +
              chart.plotH -
              ((tick - chart.min) / chart.span) * chart.plotH;
            const label =
              Math.abs(tick - Math.round(tick)) < 0.01
                ? String(Math.round(tick))
                : tick.toFixed(1);
            return (
              <React.Fragment key={`y-${yi}-${tick}`}>
                <Line
                  x1={chart.padL}
                  y1={y}
                  x2={width - chart.padR}
                  y2={y}
                  stroke={grid}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <SvgText
                  x={chart.padL - 6}
                  y={y + 3.5}
                  fill={axis}
                  fontSize={10}
                  fontWeight="500"
                  textAnchor="end"
                >
                  {label}
                </SvgText>
              </React.Fragment>
            );
          })
        : null}

      <G clipPath={`url(#${plotClipId})`}>
        <Path d={chart.area} fill="url(#stockAreaFill)" />
        <Path
          d={chart.line}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>

      {showAxes
        ? chart.xTicks.map((t, i) => (
            <SvgText
              key={`x-${i}-${t.idx}-${t.label}`}
              x={t.x}
              y={height - 6}
              fill={axis}
              fontSize={9}
              fontWeight="500"
              textAnchor={
                i === 0
                  ? 'start'
                  : i === chart.xTicks.length - 1
                    ? 'end'
                    : 'middle'
              }
            >
              {t.label}
            </SvgText>
          ))
        : null}
      </G>
    </Svg>
  );
});

type TipProps = {
  width: number;
  height: number;
  tip: Scrub;
  chart: ChartGeom;
  color: string;
};

function ScrubOverlay({ width, height, tip, chart, color }: TipProps) {
  const priceLabel = fmtPrice(tip.price);
  const whenLabel = fmtTipTime(tip.time, chart.spanMs);
  const boxW = Math.max(
    96,
    Math.max(priceLabel.length, whenLabel.length) * 7.1 + 22,
  );
  const boxH = 40;
  let boxX = tip.x + 12;
  if (boxX + boxW > width - 4) boxX = tip.x - boxW - 12;
  let boxY = Math.max(4, tip.y - boxH / 2);
  if (boxY + boxH > chart.baselineY - 2) {
    boxY = chart.baselineY - boxH - 2;
  }

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Line
        x1={tip.x}
        y1={chart.padT}
        x2={tip.x}
        y2={chart.baselineY}
        stroke={color}
        strokeWidth={1.15}
        strokeDasharray="3 3"
        opacity={0.85}
      />
      <Circle
        cx={tip.x}
        cy={tip.y}
        r={5}
        fill="#fff"
        stroke={color}
        strokeWidth={2.2}
      />
      <Rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        rx={8}
        fill={color}
      />
      <SvgText
        x={boxX + 11}
        y={boxY + 17}
        fill="#fff"
        fontSize={12}
        fontWeight="700"
      >
        {priceLabel}
      </SvgText>
      <SvgText
        x={boxX + 11}
        y={boxY + 32}
        fill="rgba(255,255,255,0.92)"
        fontSize={10}
      >
        {whenLabel}
      </SvgText>
    </Svg>
  );
}

/**
 * Detailed stock Price Chart — fine Y ticks, smooth curve, continuous scrub
 * (matches Merolagani-style detail; native pan, not WebView).
 */
export function AreaChart({
  points,
  isDark,
  height = 290,
  up = true,
  showAxes = false,
  interactive = true,
  backgroundColor,
  onInteractionChange,
}: Props) {
  const color = up ? '#26a69a' : '#ef5350';
  const bg = backgroundColor ?? (isDark ? '#1A1C1A' : '#FFFFFF');
  const grid = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(90,100,80,0.22)';
  const axis = isDark ? '#A8B0A8' : '#6B7364';

  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<Scrub | null>(null);
  const scrubRef = useRef<Scrub | null>(null);
  const rafRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const onInteractionChangeRef = useRef(onInteractionChange);
  onInteractionChangeRef.current = onInteractionChange;

  const setInteracting = useCallback((active: boolean) => {
    if (interactingRef.current === active) return;
    interactingRef.current = active;
    onInteractionChangeRef.current?.(active);
  }, []);

  // Keep full intraday series (don't clip to 90 — that loses detail).
  const slice = useMemo(() => {
    if (points.length <= 260) return points;
    return points.slice(-260);
  }, [points]);

  const chart = useMemo((): ChartGeom | null => {
    if (slice.length < 2 || width < 40) return null;
    const padL = showAxes ? 38 : 8;
    const padR = 10;
    const padT = 14;
    const padB = showAxes ? 26 : 12;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const dMin = Math.min(...slice.map((p) => p.close));
    const dMax = Math.max(...slice.map((p) => p.close));
    const { min, max, ticks } = showAxes
      ? buildYAxis(dMin, dMax)
      : (() => {
          const span0 = Math.max(dMax - dMin, 1);
          const pad = span0 * 0.14;
          return {
            min: dMin - pad,
            max: dMax + pad,
            ticks: [] as number[],
          };
        })();
    const span = max - min || 1;

    const xs = slice.map(
      (_, i) => padL + (i / Math.max(slice.length - 1, 1)) * plotW,
    );
    const yTop = padT;
    const yBottom = padT + plotH;
    const ys = slice.map((p) => {
      const y = yTop + plotH - ((p.close - min) / span) * plotH;
      return Math.max(yTop, Math.min(yBottom, y));
    });
    const baselineY = padT + plotH;
    const { line, area } = buildSmoothAreaPath(xs, ys, baselineY);

    const want = 5;
    const xTicks: { idx: number; x: number; label: string }[] = [];
    const seen = new Set<string>();
    for (let t = 0; t < want; t += 1) {
      const idx = Math.round((t / Math.max(want - 1, 1)) * (slice.length - 1));
      const label = fmtAxisTime(slice[idx]!.time);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      xTicks.push({ idx, x: xs[idx]!, label });
    }
    if (xTicks.length < 2) {
      xTicks.length = 0;
      xTicks.push({
        idx: 0,
        x: xs[0]!,
        label: fmtAxisTime(slice[0]!.time),
      });
      xTicks.push({
        idx: slice.length - 1,
        x: xs[xs.length - 1]!,
        label: fmtAxisTime(slice[slice.length - 1]!.time),
      });
    }

    const firstTs = slice[0]!.time;
    const lastTs = slice[slice.length - 1]!.time;
    const spanMs = (lastTs - firstTs) * (firstTs > 1e12 ? 1 : 1000);

    return {
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      min,
      max,
      span,
      xs,
      ys,
      line,
      area,
      ticks,
      xTicks,
      baselineY,
      spanMs,
    };
  }, [slice, width, height, showAxes]);

  /** Continuous scrub along the polyline (smooth, not stuck on candle steps). */
  const sampleAtX = useCallback(
    (x: number): Scrub | null => {
      if (!chart || slice.length < 2) return null;
      const clamped = Math.max(
        chart.padL,
        Math.min(chart.padL + chart.plotW, x),
      );
      const t = (clamped - chart.padL) / chart.plotW;
      const f = t * (slice.length - 1);
      const i0 = Math.max(0, Math.min(slice.length - 2, Math.floor(f)));
      const i1 = i0 + 1;
      const frac = f - i0;
      const p0 = slice[i0]!;
      const p1 = slice[i1]!;
      const price = p0.close + (p1.close - p0.close) * frac;
      const time = p0.time + (p1.time - p0.time) * frac;
      const sx = chart.xs[i0]! + (chart.xs[i1]! - chart.xs[i0]!) * frac;
      const sy = chart.ys[i0]! + (chart.ys[i1]! - chart.ys[i0]!) * frac;
      return { x: sx, y: sy, price, time };
    },
    [chart, slice],
  );

  const publishScrub = useCallback((next: Scrub | null) => {
    scrubRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrub(scrubRef.current);
    });
  }, []);

  const pan = Gesture.Pan()
    .enabled(interactive)
    .minDistance(0)
    .averageTouches(true)
    .failOffsetY([-18, 18])
    .runOnJS(true)
    .onBegin((e) => {
      setInteracting(true);
      publishScrub(sampleAtX(e.x));
    })
    .onUpdate((e) => {
      publishScrub(sampleAtX(e.x));
    })
    .onFinalize(() => {
      publishScrub(null);
      setInteracting(false);
    });

  const tap = Gesture.Tap()
    .enabled(interactive)
    .maxDuration(220)
    .runOnJS(true)
    .onEnd((e) => {
      setInteracting(true);
      publishScrub(sampleAtX(e.x));
      setTimeout(() => {
        publishScrub(null);
        setInteracting(false);
      }, 1400);
    });

  const gesture = Gesture.Race(pan, tap);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  if (slice.length < 2) {
    return (
      <View style={[styles.empty, { height, backgroundColor: bg }]}>
        <Text style={[styles.emptyText, { color: isDark ? '#888' : '#666' }]}>
          Chart unavailable
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.wrap, { height, backgroundColor: bg }]}
      onLayout={onLayout}
      collapsable={false}
    >
      {width > 0 && chart ? (
        <GestureDetector gesture={gesture}>
          <View
            style={{ width, height, overflow: 'hidden' }}
            collapsable={false}
          >
            <StaticChartLayer
              width={width}
              height={height}
              chart={chart}
              showAxes={showAxes}
              color={color}
              grid={grid}
              axis={axis}
            />
            {scrub ? (
              <ScrubOverlay
                width={width}
                height={height}
                tip={scrub}
                chart={chart}
                color={color}
              />
            ) : null}
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', borderRadius: 12 },
  empty: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  emptyText: { fontSize: 12 },
});
