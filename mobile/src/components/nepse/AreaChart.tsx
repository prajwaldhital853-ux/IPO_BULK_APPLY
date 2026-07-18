import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { CandlePoint } from '../../services/nepse/screener';

type Props = {
  points: CandlePoint[];
  isDark: boolean;
  height?: number;
  up?: boolean;
};

/** Mini area chart for the stock info tab (inline canvas, no CDN). */
export function AreaChart({ points, isDark, height = 180, up = true }: Props) {
  const color = up ? '#26a69a' : '#ef5350';
  const bg = isDark ? '#121212' : '#ffffff';

  const html = useMemo(() => {
    const data = points.slice(-60).map((p) => p.close);
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
  var data = ${JSON.stringify(data)};
  var color = '${color}';
  var bg = '${bg}';
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
    var span = max - min || 1;
    var padX = 6, padY = 10;
    var plotW = w - padX * 2;
    var plotH = H - padY * 2;
    function x(i){ return padX + (i / (data.length - 1)) * plotW; }
    function y(v){ return padY + plotH - ((v - min) / span) * plotH; }
    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0]));
    for (var i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i]));
    ctx.lineTo(x(data.length - 1), H);
    ctx.lineTo(x(0), H);
    ctx.closePath();
    ctx.fillStyle = color + '40';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0]));
    for (var i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  draw();
  window.addEventListener('resize', draw);
})();
</script></body></html>`;
  }, [points, isDark, up, height, color, bg]);

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
  wrap: { width: '100%', overflow: 'hidden' },
  empty: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  emptyText: { fontSize: 12 },
});
