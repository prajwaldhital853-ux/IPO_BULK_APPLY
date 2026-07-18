import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { loadMarketPulse, type MarketPulse } from '../../services/nepse/premiumAnalytics';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

export function LiveMarketPulseScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pulse, setPulse] = useState<MarketPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setPulse(await loadMarketPulse());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const body = loading ? (
    <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
  ) : (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.scroll}
    >
      <View style={styles.statusCard}>
        <Ionicons name="pulse" size={rs(28)} color={colors.danger} />
        <Text style={styles.status}>{pulse?.status ?? '—'}</Text>
        <Text style={styles.asOf}>
          {pulse?.asOf ? new Date(pulse.asOf).toLocaleString() : 'Live NEPSE feed'}
        </Text>
      </View>

      {pulse?.breadth ? (
        <View style={styles.breadth}>
          <Text style={styles.section}>Market breadth</Text>
          <View style={styles.breadthRow}>
            <View style={styles.bItem}>
              <Text style={[styles.bNum, { color: colors.accentGreen }]}>
                {pulse.breadth.advanced}
              </Text>
              <Text style={styles.bLabel}>Advanced</Text>
            </View>
            <View style={styles.bItem}>
              <Text style={[styles.bNum, { color: colors.danger }]}>
                {pulse.breadth.declined}
              </Text>
              <Text style={styles.bLabel}>Declined</Text>
            </View>
            <View style={styles.bItem}>
              <Text style={styles.bNum}>{pulse.breadth.unchanged}</Text>
              <Text style={styles.bLabel}>Flat</Text>
            </View>
          </View>
          <Text style={styles.circuit}>
            Circuit: +{pulse.breadth.positiveCircuit} / −{pulse.breadth.negativeCircuit}
          </Text>
        </View>
      ) : null}

      <Text style={styles.section}>Session snapshot</Text>
      {(pulse?.summary ?? []).map((row) => (
        <View key={row.label} style={styles.sumRow}>
          <Text style={styles.sumLabel}>{row.label}</Text>
          <Text style={styles.sumVal}>{row.value}</Text>
        </View>
      ))}

      {pulse?.hotSymbols.length ? (
        <>
          <Text style={styles.section}>Hot demand symbols</Text>
          <View style={styles.chips}>
            {pulse.hotSymbols.map((sym) => (
              <Pressable
                key={sym}
                style={styles.chip}
                onPress={() => navigation.navigate('StockDetail', { symbol: sym })}
              >
                <Text style={styles.chipText}>{sym}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Live Market Pulse</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate title="Live Market Pulse">
        {body}
      </PremiumGate>
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
      paddingVertical: rs(12),
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    scroll: { padding: rs(16), paddingBottom: rs(32) },
    statusCard: {
      alignItems: 'center',
      padding: rs(20),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      marginBottom: rs(16),
    },
    status: { color: c.text, fontWeight: '800', fontSize: rs(22), marginTop: rs(8) },
    asOf: { color: c.textMuted, fontSize: rs(11), marginTop: rs(4) },
    section: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginBottom: rs(10),
      marginTop: rs(4),
    },
    breadth: {
      padding: rs(14),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      marginBottom: rs(16),
    },
    breadthRow: { flexDirection: 'row', justifyContent: 'space-around' },
    bItem: { alignItems: 'center' },
    bNum: { color: c.text, fontWeight: '800', fontSize: rs(20) },
    bLabel: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
    circuit: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(12), textAlign: 'center' },
    sumRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    sumLabel: { color: c.textSecondary, fontSize: rs(12), flex: 1 },
    sumVal: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8) },
    chip: {
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      borderRadius: rs(20),
      backgroundColor: c.primarySoft,
    },
    chipText: { color: c.text, fontWeight: '700', fontSize: rs(12) },
  });
}
