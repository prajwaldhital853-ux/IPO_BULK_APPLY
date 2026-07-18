import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ThemeColors } from '../../theme/colors';
import type { CandlePoint } from '../../services/nepse/screener';

type Props = {
  candles: CandlePoint[];
  colors: ThemeColors;
  isDark: boolean;
  height?: number;
  fill?: boolean;
};

/** Candlestick + volume chart (ad-free local HTML, ShareHub API data). */
export function CandleChart({
  candles,
  colors: _colors,
  isDark,
  height,
  fill = false,
}: Props) {
  const bg = isDark ? '#0f1720' : '#ffffff';

  const html = useMemo(() => {
    const data = candles.map((c) => ({
      time: Math.floor(c.time / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const vol = candles.map((c) => ({
      time: Math.floor(c.time / 1000),
      value: c.volume ?? 0,
      color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
    }));

    const text = isDark ? '#9aa7b4' : '#4b5563';
    const grid = isDark ? '#1e2a36' : '#eef1f4';

    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>html,body,#c{margin:0;padding:0;height:100%;width:100%;background:${bg};overflow:hidden}</style>
<script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
</head>
<body>
<div id="c"></div>
<script>
  function draw(){
    if(!window.LightweightCharts){ setTimeout(draw,60); return; }
    var el=document.getElementById('c');
    var chart=LightweightCharts.createChart(el,{
      layout:{background:{color:'${bg}'},textColor:'${text}'},
      grid:{vertLines:{color:'${grid}'},horzLines:{color:'${grid}'}},
      rightPriceScale:{borderColor:'${grid}'},
      timeScale:{borderColor:'${grid}',timeVisible:true,secondsVisible:false},
      crosshair:{mode:1},
      handleScale:true,handleScroll:true
    });
    var candle=chart.addCandlestickSeries({
      upColor:'#26a69a',downColor:'#ef5350',borderVisible:false,
      wickUpColor:'#26a69a',wickDownColor:'#ef5350'
    });
    candle.setData(${JSON.stringify(data)});
    var volume=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:''});
    volume.priceScale().applyOptions({scaleMargins:{top:0.8,bottom:0}});
    volume.setData(${JSON.stringify(vol)});
    chart.timeScale().fitContent();
    function resize(){
      chart.applyOptions({width:el.clientWidth,height:el.clientHeight});
    }
    window.addEventListener('resize',resize);
    resize();
  }
  draw();
</script>
</body>
</html>`;
  }, [candles, isDark, bg]);

  return (
    <View
      style={[
        styles.wrap,
        fill ? styles.fill : null,
        height != null ? { height } : null,
      ]}
      collapsable={false}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={[styles.web, { backgroundColor: bg }]}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        nestedScrollEnabled={false}
        overScrollMode="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden' },
  fill: { flex: 1 },
  web: { flex: 1 },
});
