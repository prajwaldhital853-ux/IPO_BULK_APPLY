import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TradingViewChart } from '../components/nepse/TradingViewChart';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function ChartsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Charts'>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const initialSymbol = (route.params?.symbol ?? 'NEPSE').toUpperCase();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [input, setInput] = useState(initialSymbol);
  const [landscape, setLandscape] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, []);

  const submitSymbol = () => {
    const s = input.trim().toUpperCase();
    if (s) {
      setSymbol(s);
      setSearchOpen(false);
    }
  };

  const toggleRotate = useCallback(async () => {
    if (landscape) {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
      setLandscape(false);
    } else {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      );
      setLandscape(true);
    }
  }, [landscape]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {!landscape ? (
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Charts</Text>
          <View style={styles.headerRight}>
            <Pressable onPress={toggleRotate} hitSlop={10}>
              <Ionicons
                name="phone-landscape-outline"
                size={rs(22)}
                color={colors.text}
              />
            </Pressable>
            <Pressable onPress={() => setSearchOpen(true)} hitSlop={10}>
              <Ionicons name="search" size={rs(22)} color={colors.text} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.landscapeBar} onPress={toggleRotate}>
          <Ionicons name="phone-portrait-outline" size={rs(18)} color="#fff" />
          <Text style={styles.landscapeText}>{symbol} · Tap to rotate back</Text>
        </Pressable>
      )}

      <View style={styles.chartWrap}>
        <TradingViewChart symbol={symbol} />
      </View>

      <Modal visible={searchOpen} animationType="fade" transparent>
        <Pressable
          style={styles.modalBg}
          onPress={() => setSearchOpen(false)}
        >
          <Pressable style={styles.searchSheet} onPress={() => {}}>
            <Text style={styles.searchTitle}>Search symbol</Text>
            <View style={styles.searchRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="NEPSE, NABIL, ADBL…"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                autoCapitalize="characters"
                autoFocus
                onSubmitEditing={submitSymbol}
              />
              <Pressable style={styles.goBtn} onPress={submitSymbol}>
                <Text style={styles.goText}>Go</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: rs(14) },
    chartWrap: { flex: 1 },
    landscapeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
      position: 'absolute',
      top: rs(4),
      right: rs(8),
      zIndex: 10,
      borderRadius: rs(16),
    },
    landscapeText: { color: '#fff', fontSize: rs(11), fontWeight: '600' },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: rs(24),
    },
    searchSheet: {
      backgroundColor: c.surface,
      borderRadius: rs(14),
      padding: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    searchTitle: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '800',
      marginBottom: rs(12),
    },
    searchRow: { flexDirection: 'row', gap: rs(8) },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
    },
    goBtn: {
      backgroundColor: c.primary,
      borderRadius: rs(10),
      paddingHorizontal: rs(16),
      justifyContent: 'center',
    },
    goText: { color: '#fff', fontWeight: '800' },
  });
}
