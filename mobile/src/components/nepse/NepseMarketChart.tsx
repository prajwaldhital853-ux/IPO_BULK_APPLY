import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ChartPoint } from '../../services/nepse';
import { rs } from '../../utils/responsive';

type Props = {
  points: ChartPoint[];
  isDark: boolean;
  up?: boolean;
  height?: number;
  loading?: boolean;
};

/** NEPSE area chart with Y-axis price labels and X-axis time labels. */
export function NepseMarketChart({
  points,
  isDark,
  up = true,
  height = rs(200),
  loading = false,
}: Props) {
  const lineColor = up ? '#26a69a' : '#ef5350';
  const bg = isDark ? '#121212' : '#ffffff';
  const grid = isDark ? '#2a2a2a' : '#e8e8e8';
  const text = isDark ? '#888888' : '#666666';

  const html = useMemo(() => {
    const values = points.map((p) => p.value);
    const labels = points.map((p) => p.label);
    const chartHeight = Math.round(height);

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
  var data = ${JSON.stringify(values)};
  var labels = ${JSON.stringify(labels)};
  var color = '${lineColor}';
  var bg = '${bg}';
  var grid = '${grid}';
  var text = '${text}';
  var H = ${chartHeight};
  var canvas = document.getElementById('c');
  function draw(){
    var w = canvas.clientWidth || window.innerWidth || 320;
    canvas.width = w;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, H);
    if (data.length < 2) return;
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);
    var pad = (max - min) * 0.08 || 1;
    min -= pad; max += pad;
    var span = max - min || 1;
    var padL = 44, padR = 8, padT = 8, padB = 22;
    var plotW = w - padL - padR;
    var plotH = H - padT - padB;
    function x(i){ return padL + (i / (data.length - 1)) * plotW; }
    function y(v){ return padT + plotH - ((v - min) / span) * plotH; }
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    for (var g = 0; g < 4; g++) {
      var gv = min + (span * g / 3);
      var gy = y(gv);
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(w - padR, gy);
      ctx.stroke();
      ctx.fillText(gv.toFixed(gv >= 100 ? 0 : 2), padL - 4, gy + 3);
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
    for (var j = 1; j < data.length; j++) ctx.lineTo(x(j), y(data[j]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.textAlign = 'center';
    var step = Math.max(1, Math.floor((labels.length - 1) / 4));
    for (var k = 0; k < labels.length; k += step) {
      ctx.fillText(labels[k], x(k), H - 4);
    }
    if ((labels.length - 1) % step !== 0) {
      ctx.fillText(labels[labels.length - 1], x(labels.length - 1), H - 4);
    }
  }
  draw();
  window.addEventListener('resize', draw);
})();
</script></body></html>`;
  }, [points, isDark, up, height, lineColor, bg, grid, text]);

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
        <Text style={[styles.emptyText, { color: text }]}>Chart unavailable</Text>
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
  wrap: { width: '100%', overflow: 'hidden' },
  empty: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: rs(12) },
});
