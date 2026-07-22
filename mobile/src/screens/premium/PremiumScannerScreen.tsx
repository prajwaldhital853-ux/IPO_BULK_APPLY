import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumGate } from '../../components/PremiumGate';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  loadAccumulationRows,
  loadDistributionRows,
  type SmartMoneyRow,
} from '../../services/nepse/premiumAnalytics';
import { BrokerFlowScreen } from './BrokerFlowScreen';
import { fmtNum } from '../../services/nepse/screener';
import { rs } from '../../utils/responsive';
import { usePollingRefresh } from '../../utils/usePollingRefresh';
import type { RootStackParamList } from '../../navigation/types';

export type PremiumScannerKind =
  | 'accumulation'
  | 'distribution';

const COPY: Record<
  PremiumScannerKind,
  { title: string; subtitle: string; load: () => Promise<SmartMoneyRow[]> }
> = {
  accumulation: {
    title: 'Accumulation',
    subtitle: 'Stocks with buy-side pressure and rising prices — smart-money accumulation signals.',
    load: loadAccumulationRows,
  },
  distribution: {
    title: 'Distribution',
    subtitle: 'Stocks with sell-side pressure and falling prices — distribution / exit signals.',
    load: loadDistributionRows,
  },
};

export function PremiumScannerScreen({ kind }: { kind: PremiumScannerKind }) {
  const copy = COPY[kind];
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<SmartMoneyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRows(await COPY[kind].load());
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const body = loading ? (
    <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
  ) : (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.symbol}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <Text style={styles.hint}>{copy.subtitle}</Text>
      }
      renderItem={({ item, index }) => (
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol })}
        >
          <Text style={styles.rank}>{index + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.sym}>{item.symbol}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.signal}>{item.signal}</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.ltp}>{item.ltp != null ? fmtNum(item.ltp) : '—'}</Text>
            <Text
              style={[
                styles.chg,
                {
                  color:
                    (item.changePct ?? 0) >= 0 ? colors.accentGreen : colors.danger,
                },
              ]}
            >
              {item.changePct != null
                ? `${item.changePct >= 0 ? '+' : ''}${item.changePct.toFixed(2)}%`
                : '—'}
            </Text>
            <Text style={styles.score}>Score {item.score.toFixed(1)}</Text>
          </View>
        </Pressable>
      )}
    />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{copy.title}</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <PremiumGate title={copy.title} subtitle={copy.subtitle}>
        {body}
      </PremiumGate>
    </View>
  );
}

export function AccumulationScreen() {
  return <BrokerFlowScreen mode="accumulation" />;
}

export function DistributionScreen() {
  return <BrokerFlowScreen mode="distribution" />;
}

export { AggressiveHoldersScreen } from './AggressiveHoldersScreen';

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
    hint: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginBottom: rs(12),
    },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(28) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      padding: rs(12),
      marginBottom: rs(8),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    rank: { color: c.textMuted, fontWeight: '800', width: rs(22), fontSize: rs(12) },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    name: { color: c.textSecondary, fontSize: rs(11) },
    signal: { color: c.tealHeader, fontSize: rs(10), marginTop: rs(3) },
    right: { alignItems: 'flex-end' },
    ltp: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    chg: { fontWeight: '700', fontSize: rs(11) },
    score: { color: c.textMuted, fontSize: rs(10), marginTop: rs(2) },
  });
}
