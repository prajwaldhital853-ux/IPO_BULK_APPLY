import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { loadForexRates, type ForexRow } from '../../services/nepse/extraData';
import { rs } from '../../utils/responsive';
import type { RootStackParamList } from '../../navigation/types';

type CalcTab = 'basic' | 'ipo' | 'forex';

const BASIC_KEYS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
] as const;

function evalBasic(expr: string): string {
  const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/%/g, '/100');
  if (!/^[\d.+\-*/()\s]+$/.test(cleaned)) return 'Error';
  try {
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${cleaned})`)() as number;
    if (!Number.isFinite(val)) return 'Error';
    const rounded = Math.round(val * 1e10) / 1e10;
    return String(rounded);
  } catch {
    return 'Error';
  }
}

export function CalculatorScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<CalcTab>('basic');
  const [display, setDisplay] = useState('0');
  const [kitta, setKitta] = useState('10');
  const [price, setPrice] = useState('100');
  const [forexRows, setForexRows] = useState<ForexRow[]>([]);
  const [fromAmt, setFromAmt] = useState('1');
  const [fromCur, setFromCur] = useState('USD');
  const [toCur, setToCur] = useState('NPR');

  useEffect(() => {
    void loadForexRates().then((snap) => setForexRows(snap.rows));
  }, []);

  const onBasicKey = useCallback((key: string) => {
    if (key === 'C') {
      setDisplay('0');
      return;
    }
    if (key === '⌫') {
      setDisplay((d) => (d.length <= 1 ? '0' : d.slice(0, -1)));
      return;
    }
    if (key === '=') {
      setDisplay((d) => evalBasic(d));
      return;
    }
    setDisplay((d) => {
      if (d === '0' && key !== '.') return key;
      if (key === '.' && d.includes('.')) return d;
      return d + key;
    });
  }, []);

  const ipoTotal = useMemo(() => {
    const k = parseFloat(kitta) || 0;
    const p = parseFloat(price) || 0;
    return k * p;
  }, [kitta, price]);

  const rateFor = useCallback(
    (iso: string) => {
      if (iso === 'NPR') return 1;
      const row = forexRows.find((r) => r.iso3 === iso);
      if (!row) return null;
      return row.mid / row.unit;
    },
    [forexRows],
  );

  const converted = useMemo(() => {
    const amt = parseFloat(fromAmt) || 0;
    const fromRate = rateFor(fromCur);
    const toRate = rateFor(toCur);
    if (fromRate == null || toRate == null) return null;
    const npr = amt * fromRate;
    return npr / toRate;
  }, [fromAmt, fromCur, toCur, rateFor]);

  const currencies = useMemo(() => {
    const list = forexRows.map((r) => r.iso3);
    return ['NPR', ...list];
  }, [forexRows]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Calculator</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['basic', 'Basic'],
            ['ipo', 'IPO / FPO'],
            ['forex', 'Forex'],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.tab, tab === id && styles.tabActive]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {tab === 'basic' ? (
          <>
            <View style={styles.displayBox}>
              <Text style={styles.display} numberOfLines={2}>
                {display}
              </Text>
            </View>
            <View style={styles.keypad}>
              {BASIC_KEYS.map((row, ri) => (
                <View key={ri} style={styles.keyRow}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      style={({ pressed }) => [
                        styles.key,
                        key === '0' && styles.keyZero,
                        pressed && styles.keyPressed,
                        ['+', '-', '×', '÷', '%', '='].includes(key) && styles.keyOp,
                      ]}
                      onPress={() => onBasicKey(key)}
                    >
                      <Text
                        style={[
                          styles.keyText,
                          ['+', '-', '×', '÷', '%', '='].includes(key) && styles.keyTextOp,
                        ]}
                      >
                        {key}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {tab === 'ipo' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Application amount</Text>
            <Text style={styles.panelHint}>
              Kitta × issue price (minimum 10 kitta for most IPOs).
            </Text>
            <Text style={styles.fieldLabel}>Kitta (units)</Text>
            <TextInput
              style={styles.input}
              value={kitta}
              onChangeText={setKitta}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>Price per unit (Rs.)</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Total payable</Text>
              <Text style={styles.resultVal}>
                Rs. {ipoTotal.toLocaleString('en-US')}
              </Text>
            </View>
          </View>
        ) : null}

        {tab === 'forex' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Currency converter</Text>
            <Text style={styles.panelHint}>
              Uses latest NRB mid rates. Check unit (e.g. INR per 100).
            </Text>
            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput
              style={styles.input}
              value={fromAmt}
              onChangeText={setFromAmt}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>From</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {currencies.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, fromCur === c && styles.chipActive]}
                  onPress={() => setFromCur(c)}
                >
                  <Text style={[styles.chipText, fromCur === c && styles.chipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>To</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {currencies.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, toCur === c && styles.chipActive]}
                  onPress={() => setToCur(c)}
                >
                  <Text style={[styles.chipText, toCur === c && styles.chipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Converted</Text>
              <Text style={styles.resultVal}>
                {converted != null
                  ? converted.toLocaleString('en-US', {
                      maximumFractionDigits: 4,
                    })
                  : '—'}{' '}
                {toCur}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: rs(16),
      paddingVertical: rs(10),
      gap: rs(8),
    },
    tab: {
      flex: 1,
      paddingVertical: rs(8),
      borderRadius: rs(10),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
    },
    tabActive: { backgroundColor: c.primarySoft },
    tabText: { color: c.textMuted, fontWeight: '700', fontSize: rs(12) },
    tabTextActive: { color: c.primary, fontWeight: '800' },
    scroll: { padding: rs(16), paddingBottom: rs(40) },
    displayBox: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(16),
      marginBottom: rs(12),
      minHeight: rs(72),
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    display: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(28),
      textAlign: 'right',
    },
    keypad: { gap: rs(8) },
    keyRow: { flexDirection: 'row', gap: rs(8) },
    key: {
      flex: 1,
      minHeight: rs(52),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyWide: { flex: 2.15 },
    keyZero: { flex: 2.15 },
    keyOp: { backgroundColor: c.primarySoft },
    keyPressed: { opacity: 0.75 },
    keyText: { color: c.text, fontWeight: '700', fontSize: rs(18) },
    keyTextOp: { color: c.primary },
    panel: { gap: rs(8) },
    panelTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    panelHint: { color: c.textSecondary, fontSize: rs(12), lineHeight: rs(17), marginBottom: rs(8) },
    fieldLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      marginTop: rs(8),
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      color: c.text,
      fontSize: rs(16),
      fontWeight: '600',
    },
    resultBox: {
      marginTop: rs(16),
      padding: rs(16),
      borderRadius: rs(12),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
    },
    resultLabel: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    resultVal: { color: c.text, fontWeight: '800', fontSize: rs(22), marginTop: rs(4) },
    chips: { marginVertical: rs(4) },
    chip: {
      marginRight: rs(8),
      paddingHorizontal: rs(14),
      paddingVertical: rs(8),
      borderRadius: rs(20),
      backgroundColor: c.surfaceAlt,
    },
    chipActive: { backgroundColor: c.primarySoft },
    chipText: { color: c.textMuted, fontWeight: '600', fontSize: rs(12) },
    chipTextActive: { color: c.primary, fontWeight: '800' },
  });
}
