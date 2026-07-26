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

function niceTicks(minV: number, maxV: number): number[] {
  const span = Math.max(maxV - minV, 1);
  let step = span / 3;
  const pow = 10 ** Math.floor(Math.log10(Math.max(step, 1e-6)));
  const n = step / pow;
  step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  if (maxV > 500) {
    if (step < 5) step = 5;
    if (span >= 18 && step < 10) step = 10;
  }
  const start = Math.floor(minV / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= maxV + step * 0.001; v += step) {
    if (v >= minV - step * 0.2 && v <= maxV + step * 0.2) ticks.push(v);
  }
  return ticks.length >= 2 ? ticks : [minV, maxV];
}

function buildAreaPath(
  xs: number[],
  ys: number[],
  baselineY: number,
): { line: string; area: string } {
  if (xs.length < 2) return { line: '', area: '' };
  let line = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i += 1) {
    line += ` L ${xs[i]} ${ys[i]}`;
  }
  const area = `${line} L ${xs[xs.length - 1]} ${baselineY} L ${xs[0]} ${baselineY} Z`;
  return { line, area };
}

/**
 * Native interactive NEPSE area chart (SVG + gesture scrub).
 * Matches the reference: green area fill, clear axes, drag for value.
 */
export function NepseMarketChart({
  points,
  isDark,
  up = true,
  height = rs(230),
  loading = false,
  backgroundColor,
}: Props) {
  const lineColor = up ? (isDark ? '#66BB6A' : '#2E7D32') : '#EF5350';
  const bg = backgroundColor ?? (isDark ? '#121212' : '#F5F7F0');
  const grid = isDark ? '#3A3A3A' : '#C9D0C4';
  const axis = isDark ? '#B0B0B0' : '#5A6358';
  const tipBg = isDark ? '#2C2C2C' : '#1B2E1B';

  const [width, setWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length < 2 || width < 40) return null;
    const padL = 44;
    const padR = 12;
    const padT = 16;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    let dMin = Math.min(...points.map((p) => p.value));
    let dMax = Math.max(...points.map((p) => p.value));
    const span0 = dMax - dMin;
    const minSpan = Math.max(Math.abs(dMax) * 0.012, 24);
    if (span0 < minSpan) {
      const mid = (dMin + dMax) / 2;
      dMin = mid - minSpan / 2;
      dMax = mid + minSpan / 2;
    }
    const pad = (dMax - dMin) * 0.1;
    const min = dMin - pad;
    const max = dMax + pad;
    const span = max - min || 1;

    const xs = points.map((_, i) => padL + (i / (points.length - 1)) * plotW);
    const ys = points.map(
      (p) => padT + plotH - ((p.value - min) / span) * plotH,
    );
    const { line, area } = buildAreaPath(xs, ys, padT + plotH);
    const yTicks = niceTicks(dMin, dMax);
    const xCount = Math.min(6, points.length);
    const xTicks = Array.from({ length: xCount }, (_, t) => {
      const idx = Math.round((t / Math.max(xCount - 1, 1)) * (points.length - 1));
      return { idx, x: xs[idx]!, label: points[idx]!.label };
    });

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
    .onEnd(() => {
      // keep last point briefly so value is readable
    })
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
                <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={lineColor} stopOpacity={0.38} />
                  <Stop offset="0.55" stopColor={lineColor} stopOpacity={0.12} />
                  <Stop offset="1" stopColor={lineColor} stopOpacity={0.02} />
                </LinearGradient>
              </Defs>

              {/* Grid + Y labels */}
              {chart.yTicks.map((tick) => {
                const y =
                  chart.padT +
                  chart.plotH -
                  ((tick - chart.min) / chart.span) * chart.plotH;
                return (
                  <React.Fragment key={`y-${tick}`}>
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
                      y={y + 3}
                      fill={axis}
                      fontSize={10}
                      textAnchor="end"
                    >
                      {Math.round(tick)}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {/* Area + line */}
              <Path d={chart.area} fill="url(#areaFill)" />
              <Path
                d={chart.line}
                stroke={lineColor}
                strokeWidth={2.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* X labels */}
              {chart.xTicks.map((t, i) => (
                <SvgText
                  key={`x-${t.idx}`}
                  x={t.x}
                  y={height - 8}
                  fill={axis}
                  fontSize={9}
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

              {/* Scrub crosshair */}
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
                  />
                  <Circle
                    cx={active.x}
                    cy={active.y}
                    r={6}
                    fill="#fff"
                    stroke={lineColor}
                    strokeWidth={2.5}
                  />
                  {/* Tooltip */}
                  {(() => {
                    const tip = `${active.label}  ·  ${active.value.toFixed(2)}`;
                    const tipW = Math.min(width - 12, Math.max(128, tip.length * 7.2));
                    const tipH = 28;
                    const tipX = Math.min(
                      Math.max(active.x - tipW / 2, 6),
                      width - tipW - 6,
                    );
                    const tipY = Math.max(active.y - tipH - 14, 6);
                    return (
                      <>
                        <Rect
                          x={tipX}
                          y={tipY}
                          width={tipW}
                          height={tipH}
                          rx={8}
                          fill={tipBg}
                        />
                        <SvgText
                          x={tipX + tipW / 2}
                          y={tipY + tipH / 2 + 4}
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
  wrap: { width: '100%', overflow: 'hidden', borderRadius: rs(4) },
  empty: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: rs(12) },
});
