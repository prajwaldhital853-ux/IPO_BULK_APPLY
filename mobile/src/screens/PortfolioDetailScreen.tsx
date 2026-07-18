import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { fmtNum, loadMiniScreener } from '../services/nepse/screener';
import {
  addHolding,
  listPortfolios,
  removeHolding,
  type Portfolio,
} from '../storage/portfolioStorage';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

export function PortfolioDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PortfolioDetail'>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('');
  const [wacc, setWacc] = useState('');
  const [ltpMap, setLtpMap] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    const list = await listPortfolios();
    const p = list.find((x) => x.id === route.params.portfolioId) ?? null;
    setPortfolio(p);
    const screener = await loadMiniScreener();
    const map: Record<string, number> = {};
    for (const row of screener) {
      if (row.symbol && row.ltp != null) map[row.symbol] = row.ltp;
    }
    setLtpMap(map);
  }, [route.params.portfolioId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  usePollingRefresh(reload);

  const onAdd = async () => {
    if (!portfolio) return;
    const sym = symbol.trim().toUpperCase();
    const quantity = Number(qty);
    const cost = Number(wacc);
    if (!sym || !Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert('Enter symbol and quantity');
      return;
    }
    if (!Number.isFinite(cost) || cost <= 0) {
      Alert.alert('Enter valid WACC / buy price');
      return;
    }
    await addHolding(portfolio.id, {
      symbol: sym,
      qty: quantity,
      wacc: cost,
    });
    setSymbol('');
    setQty('');
    setWacc('');
    await reload();
  };

  if (!portfolio) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Portfolio not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {portfolio.name}
        </Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.form}>
        <TextInput
          value={symbol}
          onChangeText={setSymbol}
          placeholder="Symbol"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          style={[styles.input, { flex: 0.9 }]}
        />
        <TextInput
          value={qty}
          onChangeText={setQty}
          placeholder="Qty"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.input, { flex: 0.6 }]}
        />
        <TextInput
          value={wacc}
          onChangeText={setWacc}
          placeholder="WACC"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.input, { flex: 0.7 }]}
        />
        <Pressable style={styles.addBtn} onPress={() => void onAdd()}>
          <Ionicons name="add" size={rs(20)} color="#FFF" />
        </Pressable>
      </View>

      <FlatList
        data={portfolio.holdings}
        keyExtractor={(h) => h.symbol}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const ltp = ltpMap[item.symbol] ?? null;
          const invested = item.qty * item.wacc;
          const current = ltp != null ? item.qty * ltp : null;
          const pnl = current != null ? current - invested : null;
          return (
            <Pressable
              style={styles.row}
              onLongPress={() => {
                void removeHolding(portfolio.id, item.symbol).then(reload);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sym}>{item.symbol}</Text>
                <Text style={styles.sub}>
                  {item.qty} @ {fmtNum(item.wacc)} · LTP {fmtNum(ltp)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.val}>{fmtNum(current)}</Text>
                <Text
                  style={[
                    styles.pnl,
                    {
                      color:
                        pnl == null
                          ? colors.textMuted
                          : pnl >= 0
                            ? colors.accentGreen
                            : colors.danger,
                    },
                  ]}
                >
                  {pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}${fmtNum(pnl)}`}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.muted}>Add holdings using the form above</Text>
        }
      />
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
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontSize: rs(16), fontWeight: '800', flex: 1, textAlign: 'center' },
    form: {
      flexDirection: 'row',
      gap: rs(6),
      padding: rs(12),
      alignItems: 'center',
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(8),
      paddingHorizontal: rs(10),
      paddingVertical: rs(8),
      color: c.text,
      fontSize: rs(12),
    },
    addBtn: {
      backgroundColor: c.primary,
      width: rs(36),
      height: rs(36),
      borderRadius: rs(8),
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { padding: rs(12) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    sub: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    val: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    pnl: { fontSize: rs(11), fontWeight: '700', marginTop: rs(2) },
    muted: {
      color: c.textMuted,
      textAlign: 'center',
      padding: rs(24),
      fontSize: rs(13),
    },
  });
}
