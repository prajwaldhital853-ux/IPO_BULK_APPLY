import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

/** Kalash Stock Market — SmartKYC online DEMAT / TMS opening portal. */
export const KALASH_KYC_HOME_URL = 'https://kyc.kalashstock.com.np/Home';

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

export function OnlineDematTmsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const webRef = useRef<WebView>(null);

  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const reload = () => {
    setLoading(true);
    webRef.current?.reload();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Online DEMAT & TMS Opening
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            disabled={!canGoBack}
            onPress={() => webRef.current?.goBack()}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons
              name="chevron-back"
              size={rs(22)}
              color={canGoBack ? colors.text : colors.textDim}
            />
          </Pressable>
          <Pressable
            disabled={!canGoForward}
            onPress={() => webRef.current?.goForward()}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons
              name="chevron-forward"
              size={rs(22)}
              color={canGoForward ? colors.text : colors.textDim}
            />
          </Pressable>
          <Pressable onPress={reload} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="refresh" size={rs(22)} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.hint}>
        Kalash Stock Market — open DEMAT, Meroshare renewal, or TMS account
        without leaving the app.
      </Text>

      <View style={styles.webWrap}>
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading portal…</Text>
          </View>
        ) : null}
        <WebView
          ref={webRef}
          source={{ uri: KALASH_KYC_HOME_URL }}
          userAgent={CHROME_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(nav) => {
            setCanGoBack(nav.canGoBack);
            setCanGoForward(nav.canGoForward);
          }}
          style={styles.web}
        />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(10),
      gap: rs(8),
    },
    title: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      textAlign: 'center',
    },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    iconBtn: { paddingHorizontal: rs(4) },
    hint: {
      color: c.textSecondary,
      fontSize: rs(11),
      paddingHorizontal: rs(16),
      paddingBottom: rs(8),
      lineHeight: rs(15),
    },
    webWrap: { flex: 1, position: 'relative' },
    web: { flex: 1, backgroundColor: c.bg },
    loader: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg,
      zIndex: 2,
      gap: rs(10),
    },
    loaderText: { color: c.textSecondary, fontSize: rs(13) },
  });
}
