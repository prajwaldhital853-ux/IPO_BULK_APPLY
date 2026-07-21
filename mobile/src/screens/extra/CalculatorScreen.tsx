import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { rs } from '../../utils/responsive';
import type { RootStackParamList } from '../../navigation/types';

type TabId = 'buy' | 'sell' | 'bonus' | 'right' | 'avg';

const TABS: { id: TabId; label: string }[] = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
  { id: 'bonus', label: 'Bonus Share' },
  { id: 'right', label: 'Right Share' },
  { id: 'avg', label: 'Averaging' },
];

const ACCENT = '#A5D6A7';
const PAID_UP_OPTIONS = [100, 50, 10];

/** Nepal secondary-market broker commission (common slabs). */
function brokerCommission(amount: number): number {
  if (amount <= 0) return 0;
  let rate = 0.004;
  if (amount > 10_000_000) rate = 0.0027;
  else if (amount > 2_000_000) rate = 0.003;
  else if (amount > 500_000) rate = 0.0034;
  else if (amount > 50_000) rate = 0.0037;
  return Math.max(amount * rate, 10);
}

function sebonFee(amount: number): number {
  return amount * 0.00015;
}

const DP_FEE = 25;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-NP', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function num(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

type AvgRow = { id: string; units: string; price: string };

export function CalculatorScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<TabId>('buy');
  const [showResult, setShowResult] = useState(false);

  // Buy
  const [buyPrice, setBuyPrice] = useState('');
  const [buyUnits, setBuyUnits] = useState('');

  // Sell
  const [sellPurchase, setSellPurchase] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellUnits, setSellUnits] = useState('');
  const [entity, setEntity] = useState<'individual' | 'institutional'>(
    'individual',
  );
  const [holding, setHolding] = useState<'short' | 'long'>('short');

  // Bonus
  const [bonusMp, setBonusMp] = useState('');
  const [bonusPct, setBonusPct] = useState('');

  // Right
  const [rightMp, setRightMp] = useState('');
  const [rightPct, setRightPct] = useState('');
  const [paidUp, setPaidUp] = useState(100);

  // Averaging
  const [avgRows, setAvgRows] = useState<AvgRow[]>([
    { id: '1', units: '', price: '' },
  ]);

  const result = useMemo(() => {
    if (tab === 'buy') {
      const price = num(buyPrice);
      const units = num(buyUnits);
      const amount = price * units;
      const broker = brokerCommission(amount);
      const sebon = sebonFee(amount);
      const total = amount + broker + sebon + DP_FEE;
      return {
        title: 'Buy calculation',
        rows: [
          { label: 'Transaction amount', value: `Rs. ${fmt(amount)}` },
          { label: 'Broker commission', value: `Rs. ${fmt(broker)}` },
          { label: 'SEBON fee (0.015%)', value: `Rs. ${fmt(sebon)}` },
          { label: 'DP charge', value: `Rs. ${fmt(DP_FEE)}` },
          { label: 'Total payable', value: `Rs. ${fmt(total)}`, bold: true },
          {
            label: 'Effective cost / share',
            value: units ? `Rs. ${fmt(total / units)}` : '—',
          },
        ],
      };
    }

    if (tab === 'sell') {
      const cost = num(sellPurchase);
      const price = num(sellPrice);
      const units = num(sellUnits);
      const amount = price * units;
      const costBasis = cost * units;
      const broker = brokerCommission(amount);
      const sebon = sebonFee(amount);
      const fees = broker + sebon + DP_FEE;
      const netProceeds = amount - fees;
      const gain = netProceeds - costBasis;
      const cgtRate =
        entity === 'individual'
          ? holding === 'short'
            ? 0.1
            : 0.075
          : holding === 'short'
            ? 0.1
            : 0.075;
      const cgt = Math.max(gain, 0) * cgtRate;
      const net = netProceeds - cgt;
      return {
        title: 'Sell calculation',
        rows: [
          { label: 'Sale amount', value: `Rs. ${fmt(amount)}` },
          { label: 'Cost basis', value: `Rs. ${fmt(costBasis)}` },
          { label: 'Broker + SEBON + DP', value: `Rs. ${fmt(fees)}` },
          {
            label: `Capital gain tax (${(cgtRate * 100).toFixed(1)}%)`,
            value: `Rs. ${fmt(cgt)}`,
          },
          {
            label: gain >= 0 ? 'Profit after tax' : 'Loss',
            value: `Rs. ${fmt(net - costBasis)}`,
            bold: true,
          },
          { label: 'Net receivable', value: `Rs. ${fmt(net)}`, bold: true },
        ],
      };
    }

    if (tab === 'bonus') {
      const mp = num(bonusMp);
      const pct = num(bonusPct.replace(/%/g, ''));
      const adjusted = pct >= 0 ? mp / (1 + pct / 100) : 0;
      return {
        title: 'Bonus share',
        rows: [
          { label: 'Market price (before)', value: `Rs. ${fmt(mp)}` },
          { label: 'Bonus %', value: `${fmt(pct)}%` },
          {
            label: 'Adjusted price (theoretical)',
            value: `Rs. ${fmt(adjusted)}`,
            bold: true,
          },
        ],
      };
    }

    if (tab === 'right') {
      const mp = num(rightMp);
      const pct = num(rightPct.replace(/%/g, ''));
      const r = pct / 100;
      const adjusted = r >= 0 ? (mp + r * paidUp) / (1 + r) : 0;
      return {
        title: 'Right share',
        rows: [
          { label: 'Market price (before)', value: `Rs. ${fmt(mp)}` },
          { label: 'Right %', value: `${fmt(pct)}%` },
          { label: 'Paid-up value', value: `Rs. ${fmt(paidUp)}` },
          {
            label: 'Adjusted price (theoretical)',
            value: `Rs. ${fmt(adjusted)}`,
            bold: true,
          },
        ],
      };
    }

    // averaging
    const parsed = avgRows
      .map((r) => ({ u: num(r.units), p: num(r.price) }))
      .filter((r) => r.u > 0 && r.p > 0);
    const totalUnits = parsed.reduce((s, r) => s + r.u, 0);
    const totalCost = parsed.reduce((s, r) => s + r.u * r.p, 0);
    const avg = totalUnits ? totalCost / totalUnits : 0;
    return {
      title: 'Averaging',
      rows: [
        { label: 'Lots', value: String(parsed.length) },
        { label: 'Total units', value: fmt(totalUnits) },
        { label: 'Total cost', value: `Rs. ${fmt(totalCost)}` },
        {
          label: 'Average price / unit',
          value: `Rs. ${fmt(avg)}`,
          bold: true,
        },
      ],
    };
  }, [
    tab,
    buyPrice,
    buyUnits,
    sellPurchase,
    sellPrice,
    sellUnits,
    entity,
    holding,
    bonusMp,
    bonusPct,
    rightMp,
    rightPct,
    paidUp,
    avgRows,
  ]);

  const onCalculate = () => setShowResult(true);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>Share Calculator</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                setTab(t.id);
                setShowResult(false);
              }}
              style={styles.tabBtn}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
              {active ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'buy' ? (
          <>
            <Field
              icon="currency-inr"
              label="Buying Price (Per Unit)"
              value={buyPrice}
              onChange={setBuyPrice}
              placeholder="e.g 500"
              styles={styles}
            />
            <Field
              icon="pound"
              label="Units"
              value={buyUnits}
              onChange={setBuyUnits}
              placeholder="e.g 100"
              styles={styles}
            />
          </>
        ) : null}

        {tab === 'sell' ? (
          <>
            <Field
              icon="currency-inr"
              label="Purchased Price (Per Unit)"
              value={sellPurchase}
              onChange={setSellPurchase}
              placeholder="e.g 500"
              styles={styles}
            />
            <Field
              icon="currency-inr"
              label="Selling Price (Per Unit)"
              value={sellPrice}
              onChange={setSellPrice}
              placeholder="e.g 580"
              styles={styles}
            />
            <Field
              icon="pound"
              label="Units"
              value={sellUnits}
              onChange={setSellUnits}
              placeholder="e.g 100"
              styles={styles}
            />

            <View style={styles.radioRow}>
              <Radio
                label="Individual"
                selected={entity === 'individual'}
                onPress={() => setEntity('individual')}
                styles={styles}
              />
              <Radio
                label="Institutional"
                selected={entity === 'institutional'}
                onPress={() => setEntity('institutional')}
                styles={styles}
              />
            </View>

            <Text style={styles.holdingLabel}>Holding :</Text>
            <View style={styles.radioRow}>
              <Radio
                label="< 1 Year (10%)"
                selected={holding === 'short'}
                onPress={() => setHolding('short')}
                styles={styles}
              />
              <Radio
                label="≥ 1 Year (7.5%)"
                selected={holding === 'long'}
                onPress={() => setHolding('long')}
                styles={styles}
              />
            </View>
          </>
        ) : null}

        {tab === 'bonus' ? (
          <>
            <Field
              icon="currency-inr"
              label="Market Price (Before Book Closure)"
              value={bonusMp}
              onChange={setBonusMp}
              placeholder="e.g 500"
              styles={styles}
            />
            <Field
              icon="pound"
              label="Bonus Share Percentage"
              value={bonusPct}
              onChange={setBonusPct}
              placeholder="e.g 30%"
              styles={styles}
            />
          </>
        ) : null}

        {tab === 'right' ? (
          <>
            <Field
              icon="currency-inr"
              label="Market Price (Before Book Closure)"
              value={rightMp}
              onChange={setRightMp}
              placeholder="e.g 500"
              styles={styles}
            />
            <Field
              icon="pound"
              label="Right Share Percentage"
              value={rightPct}
              onChange={setRightPct}
              placeholder="e.g 10%"
              styles={styles}
            />
            <Text style={styles.fieldLabel}>
              <MaterialCommunityIcons name="pound" size={rs(14)} color={ACCENT} />{' '}
              Paid-up Value per Share
            </Text>
            <View style={styles.paidUpRow}>
              {PAID_UP_OPTIONS.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setPaidUp(v)}
                  style={[
                    styles.paidUpChip,
                    paidUp === v && styles.paidUpChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.paidUpText,
                      paidUp === v && styles.paidUpTextActive,
                    ]}
                  >
                    Rs. {v}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {tab === 'avg' ? (
          <>
            {avgRows.map((row, idx) => (
              <View key={row.id} style={styles.avgRow}>
                <TextInput
                  value={row.units}
                  onChangeText={(t) =>
                    setAvgRows((prev) =>
                      prev.map((r) =>
                        r.id === row.id ? { ...r, units: t } : r,
                      ),
                    )
                  }
                  placeholder="Units"
                  placeholderTextColor="#6B6B6B"
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.avgInput]}
                />
                <TextInput
                  value={row.price}
                  onChangeText={(t) =>
                    setAvgRows((prev) =>
                      prev.map((r) =>
                        r.id === row.id ? { ...r, price: t } : r,
                      ),
                    )
                  }
                  placeholder="Price"
                  placeholderTextColor="#6B6B6B"
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.avgInput]}
                />
                <Pressable
                  onPress={() =>
                    setAvgRows((prev) =>
                      prev.length <= 1
                        ? prev
                        : prev.filter((r) => r.id !== row.id),
                    )
                  }
                  hitSlop={8}
                  style={styles.trashBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={rs(20)}
                    color={idx === 0 && avgRows.length === 1 ? '#555' : ACCENT}
                  />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addMore}
              onPress={() =>
                setAvgRows((prev) => [
                  ...prev,
                  { id: `${Date.now()}`, units: '', price: '' },
                ])
              }
            >
              <Ionicons name="add" size={rs(18)} color={ACCENT} />
              <Text style={styles.addMoreText}>ADD MORE</Text>
            </Pressable>
          </>
        ) : null}

        <Pressable style={styles.calcBtn} onPress={onCalculate}>
          <MaterialCommunityIcons
            name="calculator-variant"
            size={rs(18)}
            color={ACCENT}
          />
          <Text style={styles.calcBtnText}>CALCULATE</Text>
        </Pressable>

        {showResult ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{result.title}</Text>
            {result.rows.map((r) => (
              <View key={r.label} style={styles.resultRow}>
                <Text style={styles.resultLabel}>{r.label}</Text>
                <Text
                  style={[styles.resultValue, r.bold && styles.resultBold]}
                >
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  styles,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        <MaterialCommunityIcons name={icon} size={rs(14)} color={ACCENT} />{' '}
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#6B6B6B"
        keyboardType="decimal-pad"
        style={styles.input}
      />
    </View>
  );
}

function Radio({
  label,
  selected,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={styles.radioItem}>
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: '#121212' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
      backgroundColor: '#1E2A1E',
    },
    title: {
      color: '#FFF',
      fontSize: rs(17),
      fontWeight: '700',
    },
    tabScroll: { flexGrow: 0, backgroundColor: '#1A1A1A' },
    tabRow: {
      paddingHorizontal: rs(12),
      gap: rs(18),
      paddingTop: rs(10),
    },
    tabBtn: { paddingBottom: rs(10) },
    tabText: {
      color: '#9E9E9E',
      fontSize: rs(14),
      fontWeight: '600',
    },
    tabTextActive: { color: '#FFF' },
    tabUnderline: {
      marginTop: rs(8),
      height: rs(3),
      borderRadius: 2,
      backgroundColor: ACCENT,
    },
    body: {
      paddingHorizontal: rs(16),
      paddingTop: rs(18),
      paddingBottom: rs(40),
    },
    fieldBlock: { marginBottom: rs(16) },
    fieldLabel: {
      color: '#EEE',
      fontSize: rs(13),
      fontWeight: '600',
      marginBottom: rs(8),
    },
    input: {
      borderWidth: 1,
      borderColor: '#5A5A5A',
      borderRadius: rs(24),
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      color: '#FFF',
      fontSize: rs(14),
      backgroundColor: '#121212',
    },
    radioRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(20),
      marginBottom: rs(14),
      marginTop: rs(4),
    },
    radioItem: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
    radioOuter: {
      width: rs(20),
      height: rs(20),
      borderRadius: rs(10),
      borderWidth: 1.5,
      borderColor: '#CCC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterOn: { borderColor: ACCENT },
    radioInner: {
      width: rs(10),
      height: rs(10),
      borderRadius: rs(5),
      backgroundColor: ACCENT,
    },
    radioLabel: { color: '#EEE', fontSize: rs(13), fontWeight: '600' },
    holdingLabel: {
      color: '#EEE',
      fontSize: rs(13),
      fontWeight: '600',
      marginBottom: rs(8),
    },
    paidUpRow: {
      flexDirection: 'row',
      gap: rs(10),
      marginBottom: rs(16),
    },
    paidUpChip: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#5A5A5A',
      borderRadius: rs(24),
      paddingVertical: rs(12),
      alignItems: 'center',
    },
    paidUpChipActive: {
      borderColor: ACCENT,
      backgroundColor: 'rgba(165,214,167,0.12)',
    },
    paidUpText: { color: '#BDBDBD', fontWeight: '700', fontSize: rs(13) },
    paidUpTextActive: { color: ACCENT },
    avgRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(12),
    },
    avgInput: { flex: 1 },
    trashBtn: { padding: rs(6) },
    addMore: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      borderWidth: 1,
      borderColor: ACCENT,
      borderRadius: rs(24),
      paddingHorizontal: rs(18),
      paddingVertical: rs(10),
      marginTop: rs(4),
      marginBottom: rs(18),
    },
    addMoreText: {
      color: ACCENT,
      fontWeight: '800',
      fontSize: rs(13),
      letterSpacing: 0.4,
    },
    calcBtn: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1.5,
      borderColor: ACCENT,
      borderRadius: rs(24),
      paddingHorizontal: rs(28),
      paddingVertical: rs(12),
      marginTop: rs(8),
    },
    calcBtnText: {
      color: ACCENT,
      fontWeight: '800',
      fontSize: rs(14),
      letterSpacing: 0.6,
    },
    resultCard: {
      marginTop: rs(22),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: '#333',
      backgroundColor: '#1A1A1A',
      padding: rs(14),
    },
    resultTitle: {
      color: ACCENT,
      fontWeight: '800',
      fontSize: rs(14),
      marginBottom: rs(10),
    },
    resultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: rs(12),
      paddingVertical: rs(6),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#2A2A2A',
    },
    resultLabel: { color: '#BDBDBD', fontSize: rs(12), flex: 1 },
    resultValue: {
      color: '#FFF',
      fontSize: rs(13),
      fontWeight: '600',
    },
    resultBold: { color: ACCENT, fontWeight: '800', fontSize: rs(14) },
  });
}
