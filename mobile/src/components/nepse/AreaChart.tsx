import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { CandlePoint } from '../../services/nepse/screener';

type Props = {
  points: CandlePoint[];
  isDark: boolean;
  height?: number;
  up?: boolean;
  /** Show Y-axis ticks + X labels + dashed grid (Stock Detail SS). */
  showAxes?: boolean;
};

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const rawStep = span / Math.max(count - 1, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step =
    (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.01 && ticks.length < 8; v += step) {
    if (v >= min - step * 0.05) ticks.push(Number(v.toFixed(4)));
  }
  if (ticks.length < 2) return [min, max];
  return ticks;
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

/** Mini area chart for the stock info tab (inline canvas, no CDN). */
export function AreaChart({
  points,
  isDark,
  height = 180,
  up = true,
  showAxes = false,
}: Props) {
  const color = up ? '#26a69a' : '#ef5350';
  const bg = isDark ? '#1A1C1A' : '#FFFFFF';
  const grid = isDark ? '#3A3F3A' : '#D5DED0';
  const axis = isDark ? '#9A9A9A' : '#8A9480';

  const html = useMemo(() => {
    const slice = points.slice(-90);
    const data = slice.map((p) => p.close);
    const times = slice.map((p) => fmtAxisTime(p.time));
    const chartHeight = Math.round(height);
    const padLeft = showAxes ? 40 : 8;
    const padRight = 10;
    const padTop = 12;
    const padBottom = showAxes ? 22 : 10;

    let yMin = Math.min(...data);
    let yMax = Math.max(...data);
    const pad = (yMax - yMin) * 0.08 || yMax * 0.01 || 1;
    yMin -= pad;
    yMax += pad;
    const ticks = showAxes ? niceTicks(yMin, yMax, 4) : [];

    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:${chartHeight}px; overflow:hidden; background:${bg}; }
  canvas { display:block; width:100%; height:${chartHeight}px; }
</style>
</head><body>
<canvas id="c"></canvas>
<script>
(function(){
  var data = ${JSON.stringify(data)};
  var times = ${JSON.stringify(times)};
  var ticks = ${JSON.stringify(ticks)};
  var color = '${color}';
  var bg = '${bg}';
  var grid = '${grid}';
  var axis = '${axis}';
  var showAxes = ${showAxes ? 'true' : 'false'};
  var H = ${chartHeight};
  var padL = ${padLeft}, padR = ${padRight}, padT = ${padTop}, padB = ${padBottom};
  var yMin = ${yMin}, yMax = ${yMax};
  var canvas = document.getElementById('c');
  function draw(){
    var w = canvas.clientWidth || window.innerWidth || 320;
    canvas.width = w;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, H);
    if (data.length < 2) return;
    var plotW = w - padL - padR;
    var plotH = H - padT - padB;
    var span = yMax - yMin || 1;
    function x(i){ return padL + (i / (data.length - 1)) * plotW; }
    function y(v){ return padT + plotH - ((v - yMin) / span) * plotH; }

    if (showAxes && ticks.length) {
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = axis;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var t = 0; t < ticks.length; t++) {
        var ty = y(ticks[t]);
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, ty);
        ctx.lineTo(w - padR, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        var label = ticks[t] >= 100
          ? Math.round(ticks[t]).toLocaleString('en-NP')
          : Number(ticks[t]).toFixed(2);
        ctx.fillText(label, padL - 6, ty);
      }
    }

    var grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '08');
    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0]));
    for (var i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i]));
    ctx.lineTo(x(data.length - 1), H - padB);
    ctx.lineTo(x(0), H - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0]));
    for (var i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    if (showAxes && times.length >= 2) {
      var idxs = [0];
      if (times.length > 4) {
        idxs.push(Math.floor((times.length - 1) * 0.25));
        idxs.push(Math.floor((times.length - 1) * 0.5));
        idxs.push(Math.floor((times.length - 1) * 0.75));
      } else if (times.length > 2) {
        idxs.push(Math.floor((times.length - 1) / 2));
      }
      idxs.push(times.length - 1);
      ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = axis;
      ctx.textBaseline = 'top';
      for (var k = 0; k < idxs.length; k++) {
        var ii = idxs[k];
        var label = times[ii];
        if (!label) continue;
        ctx.textAlign = k === 0 ? 'left' : k === idxs.length - 1 ? 'right' : 'center';
        ctx.fillText(label, x(ii), H - padB + 4);
      }
    }
  }
  draw();
  window.addEventListener('resize', draw);
})();
</script></body></html>`;
  }, [points, isDark, up, height, color, bg, grid, axis, showAxes]);

  if (points.length < 2) {
    return (
      <View style={[styles.empty, { height, backgroundColor: bg }]}>
        <Text style={[styles.emptyText, { color: isDark ? '#888' : '#666' }]}>
          Chart unavailable
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} collapsable={false}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ width: '100%', height, backgroundColor: bg }}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        nestedScrollEnabled={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
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
