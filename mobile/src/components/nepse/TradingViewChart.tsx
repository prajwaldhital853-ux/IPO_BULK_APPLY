import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  symbol: string;
  height?: number | `${number}%`;
};

/** ShareHub's full TradingView technical chart page (same as their website). */
export function TradingViewChart({ symbol, height = '100%' }: Props) {
  const uri = useMemo(
    () =>
      `https://sharehubnepal.com/technical-chart/${encodeURIComponent(
        symbol.toUpperCase(),
      )}`,
    [symbol],
  );

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        source={{ uri }}
        style={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', flex: 1 },
  web: { flex: 1, backgroundColor: '#fff' },
});
