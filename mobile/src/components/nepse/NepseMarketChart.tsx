import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
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
import type { ChartPoint } from '../../services/nepse';
import { rs } from '../../utils/responsive';

type Props = {
  points: ChartPoint[];
  isDark: boolean;
  up?: boolean;
  height?: number;
  loading?: boolean;
  backgroundColor?: string;
  /** Scrub driven by an overlay hit layer (via ref). */
  externalScrub?: boolean;
};

export type NepseMarketChartHandle = {
  scrubToX: (x: number) => void;
  clearScrub: (delayMs?: number) => void;
};

/**
 * Nice Y scale with ~4–5 ticks for any range (1D step-5 or 6M/1Y wider steps).
 */
function niceStep(span: number, targetTicks: number): number {
  const rough = span / Math.max(targetTicks, 1);
  const pow = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)));
  const n = rough / pow;
  if (n <= 1) return 1 * pow;
  if (n <= 2) return 2 * pow;
  if (n <= 5) return 5 * pow;
  return 10 * pow;
}

function buildYAxis(dMin: number, dMax: number): {
  min: number;
  max: number;
  ticks: number[];
} {
  const lo = Math.min(dMin, dMax);
  const hi = Math.max(dMin, dMax);
  const pad = Math.max((hi - lo) * 0.1, hi > 400 ? 3 : 0.5);
  const a = lo - pad;
  const b = hi + pad;
  const span = Math.max(b - a, hi > 400 ? 10 : 1);

  let step = niceStep(span, 4);
  // Tight NEPSE day charts look best with step 5 (e.g. 2651…2671).
  if (hi > 400 && span <= 35 && step < 5) step = 5;

  let min = Math.floor(a / step) * step;
  let max = Math.ceil(b / step) * step;

  // Keep at most 5 intervals (6 labels). Widen step if still too dense.
  let guard = 0;
  while ((max - min) / step > 5 && guard < 8) {
    step = niceStep(max - min, 4);
    if ((max - min) / step > 5) {
      const pow = 10 ** Math.floor(Math.log10(Math.max(step, 1)));
      const bumped =
        [1, 2, 5, 10, 20, 25, 50, 100]
          .map((x) => x * pow)
          .find((x) => x > step + 1e-9) ?? step * 2;
      step = bumped;
    }
    min = Math.floor(a / step) * step;
    max = Math.ceil(b / step) * step;
    guard += 1;
  }

  const ticks: number[] = [];
  for (let v = min; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v));
    if (ticks.length >= 7) break; // hard safety against axis spam
  }
  return { min, max, ticks };
}

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

function pickXTicks(
  points: ChartPoint[],
  xs: number[],
  count: number,
): { idx: number; x: number; label: string }[] {
  const idxs = buildXTickIndices(count, points.length);
  return idxs.map((idx) => ({
    idx,
    x: xs[idx]!,
    label: points[idx]!.label.trim() || points[idx]!.label,
  }));
}

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
    // Tighter control points = less smoothing, more up/down detail
    const cp1x = x1 + (x2 - x0) / 14;
    const cp1y = y1 + (y2 - y0) / 14;
    const cp2x = x2 - (x3 - x1) / 14;
    const cp2y = y2 - (y3 - y1) / 14;
    line += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`;
  }
  const last = xs.length - 1;
  const area = `${line} L ${xs[last]} ${baselineY} L ${xs[0]} ${baselineY} Z`;
  return { line, area };
}

function buildLinearAreaPath(
  xs: number[],
  ys: number[],
  baselineY: number,
): { line: string; area: string } {
  if (xs.length < 2) return { line: '', area: '' };
  let line = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i += 1) {
    line += ` L ${xs[i]} ${ys[i]}`;
  }
  const last = xs.length - 1;
  const area = `${line} L ${xs[last]} ${baselineY} L ${xs[0]} ${baselineY} Z`;
  return { line, area };
}

const TIP_W = 104;
const TIP_H = 44;

/**
 * Native NEPSE area chart — Merolagani SS look (1D / 1W / longer).
 */
export const NepseMarketChart = forwardRef<NepseMarketChartHandle, Props>(
  function NepseMarketChart(
    {
      points,
      isDark,
      up = true,
      height = rs(250),
      loading = false,
      backgroundColor,
      externalScrub = false,
    },
    ref,
  ) {
    const lineColor = up
      ? isDark
        ? '#66BB6A'
        : '#5AB35A'
      : isDark
        ? '#EF5350'
        : '#C62828';
    const bg = backgroundColor ?? (isDark ? '#121212' : '#F9FAF2');
    const grid = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(140,140,140,0.28)';
    const axis = isDark ? '#A0A0A0' : '#8C8C8C';
    const tipBg = up
      ? isDark
        ? '#4CAF50'
        : '#5AB35A'
      : isDark
        ? '#EF5350'
        : '#C62828';
    const crosshair = isDark ? 'rgba(180,180,180,0.85)' : 'rgba(110,110,110,0.75)';

    const [width, setWidth] = useState(0);
    const [tip, setTip] = useState<{ value: string; time: string } | null>(null);

    const cursorX = useSharedValue(0);
    const cursorY = useSharedValue(0);
    const tipLeft = useSharedValue(0);
    const tipTop = useSharedValue(0);
    const scrubOpacity = useSharedValue(0);
    const lastIdxRef = useRef(-1);
    const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const chartGeom = useRef<{
      padL: number;
      plotW: number;
      padT: number;
      baselineY: number;
      xs: number[];
      ys: number[];
    } | null>(null);

    const chart = useMemo(() => {
      if (points.length < 2 || width < 40) return null;
      const padL = 42;
      const padR = 8;
      const padT = 14;
      const padB = 28;
      const plotW = width - padL - padR;
      const plotH = height - padT - padB;

      const dMin = Math.min(...points.map((p) => p.value));
      const dMax = Math.max(...points.map((p) => p.value));
      const { min, max, ticks: yTicks } = buildYAxis(dMin, dMax);
      const span = max - min || 1;

      const xs = points.map((_, i) => padL + (i / (points.length - 1)) * plotW);
      const ys = points.map((p) => {
        const y = padT + plotH - ((p.value - min) / span) * plotH;
        return Math.min(padT + plotH, Math.max(padT, y));
      });
      const { line, area } =
        points.length >= 90
          ? buildLinearAreaPath(xs, ys, padT + plotH)
          : buildSmoothAreaPath(xs, ys, padT + plotH);
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

    chartGeom.current = chart
      ? {
          padL: chart.padL,
          plotW: chart.plotW,
          padT: chart.padT,
          baselineY: chart.baselineY,
          xs: chart.xs,
          ys: chart.ys,
        }
      : null;

    const idxFromX = useCallback(
      (x: number) => {
        const g = chartGeom.current;
        if (!g || points.length < 2) return 0;
        const rel = (x - g.padL) / g.plotW;
        return Math.max(
          0,
          Math.min(points.length - 1, Math.round(rel * (points.length - 1))),
        );
      },
      [points.length],
    );

    const hideScrub = useCallback(() => {
      scrubOpacity.value = withTiming(0, { duration: 160 });
      lastIdxRef.current = -1;
      setTip(null);
    }, [scrubOpacity]);

    const applyIdx = useCallback(
      (idx: number) => {
        const g = chartGeom.current;
        if (!g || !points[idx]) return;
        const x = g.xs[idx]!;
        const y = g.ys[idx]!;
        cursorX.value = x;
        cursorY.value = y;

        let tX = x + 10;
        if (tX + TIP_W > width - 6) tX = x - TIP_W - 10;
        tX = Math.max(6, Math.min(tX, width - TIP_W - 6));
        const tY = Math.max(
          g.padT,
          Math.min(y - TIP_H / 2, g.baselineY - TIP_H - 4),
        );
        tipLeft.value = tX;
        tipTop.value = tY;
        scrubOpacity.value = 1;

        if (lastIdxRef.current === idx) return;
        lastIdxRef.current = idx;
        const p = points[idx]!;
        setTip({
          value: p.value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          time: p.label.trim(),
        });
      },
      [cursorX, cursorY, points, scrubOpacity, tipLeft, tipTop, width],
    );

    const scrubToX = useCallback(
      (x: number) => {
        if (clearTimer.current) {
          clearTimeout(clearTimer.current);
          clearTimer.current = null;
        }
        const idx = idxFromX(x);
        // Skip duplicate index — keeps scrub buttery (no tip re-render).
        if (idx === lastIdxRef.current && scrubOpacity.value > 0) {
          return;
        }
        applyIdx(idx);
      },
      [applyIdx, idxFromX, scrubOpacity],
    );

    const clearScrub = useCallback(
      (delayMs = 1800) => {
        if (clearTimer.current) clearTimeout(clearTimer.current);
        if (delayMs <= 0) {
          hideScrub();
          return;
        }
        clearTimer.current = setTimeout(() => hideScrub(), delayMs);
      },
      [hideScrub],
    );

    useImperativeHandle(ref, () => ({ scrubToX, clearScrub }), [
      scrubToX,
      clearScrub,
    ]);

    const pan = Gesture.Pan()
      .minDistance(0)
      .activeOffsetX([-2, 2])
      .failOffsetY([-22, 22])
      .onBegin((e) => {
        'worklet';
        runOnJS(scrubToX)(e.x);
      })
      .onUpdate((e) => {
        'worklet';
        runOnJS(scrubToX)(e.x);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(clearScrub)(1800);
      });

    const tap = Gesture.Tap()
      .maxDuration(320)
      .onEnd((e) => {
        'worklet';
        runOnJS(scrubToX)(e.x);
        runOnJS(clearScrub)(2200);
      });

    const gesture = Gesture.Exclusive(pan, tap);

    const crosshairStyle = useAnimatedStyle(() => ({
      opacity: scrubOpacity.value,
      transform: [{ translateX: cursorX.value }],
    }));

    const dotStyle = useAnimatedStyle(() => ({
      opacity: scrubOpacity.value,
      transform: [
        { translateX: cursorX.value - 5 },
        { translateY: cursorY.value - 5 },
      ],
    }));

    const tipStyle = useAnimatedStyle(() => ({
      opacity: scrubOpacity.value,
      transform: [
        { translateX: tipLeft.value },
        { translateY: tipTop.value },
      ],
    }));

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

    return (
      <View
        style={[styles.wrap, { height, backgroundColor: bg }]}
        onLayout={onLayout}
        collapsable={false}
      >
        {width > 0 && chart ? (
          <View style={{ width, height, overflow: 'hidden' }}>
            <Svg width={width} height={height} pointerEvents="none">
              <Defs>
                <LinearGradient id="nepseAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop
                    offset="0%"
                    stopColor={lineColor}
                    stopOpacity={isDark ? 0.28 : 0.22}
                  />
                  <Stop
                    offset="55%"
                    stopColor={lineColor}
                    stopOpacity={isDark ? 0.1 : 0.08}
                  />
                  <Stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                </LinearGradient>
                <ClipPath id="nepsePlotClip">
                  <Rect
                    x={chart.padL}
                    y={chart.padT}
                    width={chart.plotW}
                    height={chart.plotH}
                  />
                </ClipPath>
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

              <G clipPath="url(#nepsePlotClip)">
                <Path d={chart.area} fill="url(#nepseAreaFill)" />
                <Path
                  d={chart.line}
                  stroke={lineColor}
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </G>

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
            </Svg>

            {/* Reanimated scrub overlay — moves on UI thread, tip text only on index change */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.crosshair,
                {
                  top: chart.padT,
                  height: chart.plotH,
                  backgroundColor: crosshair,
                },
                crosshairStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.dot,
                { borderColor: lineColor },
                dotStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.tip, { backgroundColor: tipBg }, tipStyle]}
            >
              {tip ? (
                <>
                  <Text style={styles.tipValue}>{tip.value}</Text>
                  <Text style={styles.tipTime}>{tip.time}</Text>
                </>
              ) : null}
            </Animated.View>

            {!externalScrub ? (
              <GestureDetector gesture={gesture}>
                <View style={StyleSheet.absoluteFillObject} collapsable={false} />
              </GestureDetector>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  },
);

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
  crosshair: {
    position: 'absolute',
    left: 0,
    width: StyleSheet.hairlineWidth * 2,
    marginLeft: -1,
  },
  dot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    borderWidth: 2.2,
  },
  tip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TIP_W,
    height: TIP_H,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tipValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  tipTime: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
