import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { ChartPoint } from '../../services/nepse';
import { rs } from '../../utils/responsive';

type Props = {
  points: ChartPoint[];
  isDark: boolean;
  up?: boolean;
  height?: number;
  loading?: boolean;
  backgroundColor?: string;
};

/**
 * Merolagani-style Y scale: ~4 ticks at nice step (often 10),
 * with room above/below the series (e.g. 2714…2744).
 */
function buildYAxis(dMin: number, dMax: number): {
  min: number;
  max: number;
  ticks: number[];
} {
  const lo = Math.min(dMin, dMax);
  const hi = Math.max(dMin, dMax);
  const rawSpan = Math.max(hi - lo, 8);
  let step = rawSpan / 3;
  const pow = 10 ** Math.floor(Math.log10(Math.max(step, 1e-6)));
  const n = step / pow;
  step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  if (hi > 400) {
    if (step < 5) step = 5;
    if (rawSpan >= 15 && step < 10) step = 10;
  }

  let min = Math.floor(lo / step) * step - step;
  let max = Math.ceil(hi / step) * step + step;
  // Keep about 4 tick marks like the SS
  while ((max - min) / step > 4) {
    if (hi - min > max - lo) min += step;
    else max -= step;
  }
  while ((max - min) / step < 3) {
    min -= step;
    max += step;
  }

  const ticks: number[] = [];
  for (let v = min; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v));
  }
  return { min, max, ticks };
}

/** Unique, evenly spaced X tick indices (fixes duplicate key `x-2`). */
function buildXTickIndices(count: number, length: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  const want = Math.min(count, length);
  const idxs: number[] = [];
  const seen = new Set<number>();
  for (let t = 0; t < want; t += 1) {
    const idx = Math.round((t / Math.max(want - 1, 1)) * (length - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      idxs.push(idx);
    }
  }
  if (!seen.has(0)) idxs.unshift(0);
  if (!seen.has(length - 1)) idxs.push(length - 1);
  return [...new Set(idxs)].sort((a, b) => a - b);
}

/** Prefer labeled points for X axis when series was densified. */
function pickXTicks(
  points: ChartPoint[],
  xs: number[],
  count: number,
): { idx: number; x: number; label: string }[] {
  const labeled = points
    .map((p, idx) => ({ idx, label: p.label.trim() }))
    .filter((p) => p.label.length > 0);

  if (labeled.length >= 2 && labeled.length <= count + 1) {
    return labeled.map(({ idx, label }) => ({
      idx,
      x: xs[idx]!,
      label,
    }));
  }

  const idxs = buildXTickIndices(count, points.length);
  return idxs.map((idx) => {
    // Walk to nearest non-empty label for densified series
    let label = points[idx]!.label.trim();
    if (!label) {
      for (let d = 1; d < points.length; d += 1) {
        const L = points[idx - d]?.label.trim();
        const R = points[idx + d]?.label.trim();
        if (L) {
          label = L;
          break;
        }
        if (R) {
          label = R;
          break;
        }
      }
    }
    return { idx, x: xs[idx]!, label: label || points[idx]!.label };
  });
}

/** Catmull-Rom → cubic Bezier. */
function buildSmoothAreaPath(
  xs: number[],
  ys: number[],
  baselineY: number,
): { line: string; area: string } {
  if (xs.length < 2) return { line: '', area: '' };
  if (xs.length === 2) {
    const line = `M ${xs[0]} ${ys[0]} L ${xs[1]} ${ys[1]}`;
    const area = `${line} L ${xs[1]} ${baselineY} L ${xs[0]} ${baselineY} Z`;
    return { line, area };
  }

  let line = `M ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[Math.max(0, i - 1)]!;
    const y0 = ys[Math.max(0, i - 1)]!;
    const x1 = xs[i]!;
    const y1 = ys[i]!;
    const x2 = xs[i + 1]!;
    const y2 = ys[i + 1]!;
    const x3 = xs[Math.min(xs.length - 1, i + 2)]!;
    const y3 = ys[Math.min(ys.length - 1, i + 2)]!;
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    line += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`;
  }
  const last = xs.length - 1;
  const area = `${line} L ${xs[last]} ${baselineY} L ${xs[0]} ${baselineY} Z`;
  return { line, area };
}

/**
 * Native NEPSE area chart — Merolagani SS look (1D / 1W / longer).
 */
export function NepseMarketChart({
  points,
  isDark,
  up = true,
  height = rs(250),
  loading = false,
  backgroundColor,
}: Props) {
  const lineColor = up
    ? isDark
      ? '#4CAF50'
      : '#2E7D32'
    : isDark
      ? '#EF5350'
      : '#C62828';
  // Match page cream-sage; SS chart sits on same soft ground
  const bg = backgroundColor ?? (isDark ? '#121212' : '#FFFFFF');
  const grid = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(90,100,80,0.22)';
  const axis = isDark ? '#A0A0A0' : '#6B7364';
  const tipBg = isDark ? '#2C2C2C' : '#1B2E1B';

  const [width, setWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length < 2 || width < 40) return null;
    const padL = 42;
    const padR = 8;
    const padT = 12;
    const padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const dMin = Math.min(...points.map((p) => p.value));
    const dMax = Math.max(...points.map((p) => p.value));
    const { min, max, ticks: yTicks } = buildYAxis(dMin, dMax);
    const span = max - min || 1;

    const xs = points.map((_, i) => padL + (i / (points.length - 1)) * plotW);
    const ys = points.map(
      (p) => padT + plotH - ((p.value - min) / span) * plotH,
    );
    const { line, area } = buildSmoothAreaPath(xs, ys, padT + plotH);
    const xTicks = pickXTicks(points, xs, 6);

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
      yTicks,
      xTicks,
      baselineY: padT + plotH,
    };
  }, [points, width, height]);

  const idxFromX = (x: number) => {
    if (!chart || points.length < 2) return 0;
    const rel = (x - chart.padL) / chart.plotW;
    return Math.max(
      0,
      Math.min(points.length - 1, Math.round(rel * (points.length - 1))),
    );
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-18, 18])
    .runOnJS(true)
    .onBegin((e) => setActiveIdx(idxFromX(e.x)))
    .onUpdate((e) => setActiveIdx(idxFromX(e.x)))
    .onFinalize(() => {
      setTimeout(() => setActiveIdx(null), 1200);
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      setActiveIdx(idxFromX(e.x));
      setTimeout(() => setActiveIdx(null), 1800);
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  if (loading) {
    return (
      <View style={[styles.empty, { height, backgroundColor: bg }]}>
        <ActivityIndicator color={lineColor} />
      </View>
    );
  }

  if (points.length < 2) {
    return (
      <View style={[styles.empty, { height, backgroundColor: bg }]}>
        <Text style={[styles.emptyText, { color: axis }]}>Chart unavailable</Text>
      </View>
    );
  }

  const active =
    activeIdx != null && chart
      ? {
          idx: activeIdx,
          x: chart.xs[activeIdx]!,
          y: chart.ys[activeIdx]!,
          label: points[activeIdx]!.label,
          value: points[activeIdx]!.value,
        }
      : null;

  return (
    <View style={[styles.wrap, { height, backgroundColor: bg }]} onLayout={onLayout}>
      {width > 0 && chart ? (
        <GestureDetector gesture={gesture}>
          <View style={{ width, height }}>
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id="nepseAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop
                    offset="0%"
                    stopColor={lineColor}
                    stopOpacity={isDark ? 0.36 : 0.34}
                  />
                  <Stop
                    offset="55%"
                    stopColor={lineColor}
                    stopOpacity={isDark ? 0.12 : 0.14}
                  />
                  <Stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                </LinearGradient>
              </Defs>

              {chart.yTicks.map((tick, yi) => {
                const y =
                  chart.padT +
                  chart.plotH -
                  ((tick - chart.min) / chart.span) * chart.plotH;
                return (
                  <React.Fragment key={`y-tick-${yi}-${tick}`}>
                    <Line
                      x1={chart.padL}
                      y1={y}
                      x2={width - chart.padR}
                      y2={y}
                      stroke={grid}
                      strokeWidth={1}
                      strokeDasharray="5 5"
                    />
                    <SvgText
                      x={chart.padL - 7}
                      y={y + 3.5}
                      fill={axis}
                      fontSize={10}
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {Math.round(tick)}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              <Path d={chart.area} fill="url(#nepseAreaFill)" />
              <Path
                d={chart.line}
                stroke={lineColor}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {chart.xTicks.map((t, i) => (
                <SvgText
                  key={`x-tick-${i}-${t.idx}`}
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
              ))}

              {active ? (
                <>
                  <Line
                    x1={active.x}
                    y1={chart.padT}
                    x2={active.x}
                    y2={chart.baselineY}
                    stroke={lineColor}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.7}
                  />
                  <Circle
                    cx={active.x}
                    cy={active.y}
                    r={5.5}
                    fill="#fff"
                    stroke={lineColor}
                    strokeWidth={2.4}
                  />
                  {(() => {
                    const tip = `${active.label}  ·  ${active.value.toFixed(2)}`;
                    const tipW = Math.min(width - 12, Math.max(128, tip.length * 7.1));
                    const tipH = 26;
                    const tipX = Math.min(
                      Math.max(active.x - tipW / 2, 6),
                      width - tipW - 6,
                    );
                    const tipY = Math.max(active.y - tipH - 12, 4);
                    return (
                      <>
                        <Rect
                          x={tipX}
                          y={tipY}
                          width={tipW}
                          height={tipH}
                          rx={7}
                          fill={tipBg}
                        />
                        <SvgText
                          x={tipX + tipW / 2}
                          y={tipY + tipH / 2 + 3.5}
                          fill="#fff"
                          fontSize={11}
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {tip}
                        </SvgText>
                      </>
                    );
                  })()}
                </>
              ) : null}
            </Svg>
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
  },
  empty: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: rs(12) },
});
