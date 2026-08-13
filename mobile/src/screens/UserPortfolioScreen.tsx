import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import {
  importPortfolioFromMeroshare,
  type ImportedHolding,
} from '../services/meroshare';
import { loadMiniScreener, iconUri } from '../services/nepse/screener';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import { rs } from '../utils/responsive';

type HoldingView = ImportedHolding & {
  iconUrl: string | null;
  value: number;
  dayChange: number;
};

function holdingValue(h: ImportedHolding): number {
  if (h.ltp != null) return h.qty * h.ltp;
  if (h.previousClosingPrice != null) return h.qty * h.previousClosingPrice;
  return h.qty * (h.wacc ?? 0);
}

function holdingChange(h: ImportedHolding): number {
  if (h.ltp == null || h.previousClosingPrice == null) return 0;
  return h.qty * (h.ltp - h.previousClosingPrice);
}

function fmtRs(n: number, hidden: boolean): string {
  if (hidden) return 'Rs. •••••';
  return `Rs. ${Math.abs(n).toLocaleString('en-NP', { maximumFractionDigits: 0 })}`;
}

function SymLogo({
  symbol,
  iconUrl,
  styles,
}: {
  symbol: string;
  iconUrl: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);
  if (iconUrl && !failed) {
    return (
      <Image
        source={{ uri: iconUrl }}
        style={styles.logoImg}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.logoFallback}>
      <Text style={styles.logoLetter}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

export function UserPortfolioScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { usableAccounts: accounts } = useActiveAccounts();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingView[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!selectedId && accounts.length > 0) {
      setSelectedId(accounts[0]!.id);
    }
  }, [accounts, selectedId]);

  const selected: AccountMeta | null =
    accounts.find((a) => a.id === selectedId) ?? null;

  const revealProgressively = useCallback((rows: HoldingView[]) => {
    setHoldings(rows);
    setVisibleCount(0);
    if (rows.length === 0) return;
    // First holding immediately, then one-by-one downward.
    setVisibleCount(1);
    if (rows.length <= 1) return;
    let shown = 1;
    const tick = () => {
      shown = Math.min(rows.length, shown + 1);
      setVisibleCount(shown);
      if (shown < rows.length) {
        setTimeout(tick, 100);
      }
    };
    setTimeout(tick, 120);
  }, []);

  const checkPortfolio = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setChecked(false);
    setHoldings([]);
    setVisibleCount(0);
    try {
      const [result, screener] = await Promise.all([
        importPortfolioFromMeroshare(selected),
        loadMiniScreener().catch(() => []),
      ]);
      const iconMap = new Map(
        screener.map((s) => [
          s.symbol.toUpperCase(),
          iconUri(s.iconUrl) ?? s.iconUrl,
        ]),
      );
      const rows: HoldingView[] = result.holdings.map((h) => ({
        ...h,
        iconUrl: iconMap.get(h.symbol.toUpperCase()) ?? null,
        value: holdingValue(h),
        dayChange: holdingChange(h),
      }));
      rows.sort((a, b) => b.value - a.value);
      setChecked(true);
      revealProgressively(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load portfolio');
      setChecked(true);
    } finally {
      setLoading(false);
    }
  }, [selected, revealProgressively]);

  const visible = holdings.slice(0, visibleCount);
  const totals = useMemo(() => {
    const value = holdings.reduce((s, h) => s + h.value, 0);
    const change = holdings.reduce((s, h) => s + h.dayChange, 0);
    return { value, change };
  }, [holdings]);

  return (
    <ProtectedPersonalScreen title="Sign in to view portfolio">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>User Portfolio</Text>
          <Pressable hitSlop={12} onPress={() => setHidden((v) => !v)}>
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={rs(22)}
              color={colors.text}
            />
          </Pressable>
        </View>

        <View style={styles.controls}>
          <Pressable
            style={styles.dropdown}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.dropdownText} numberOfLines={1}>
              {selected
                ? `${selected.name} - ${selected.username}`
                : 'Select account'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={rs(16)}
              color={colors.textMuted}
            />
          </Pressable>

          <Pressable
            style={[styles.checkBtn, (!selected || loading) && { opacity: 0.5 }]}
            disabled={!selected || loading}
            onPress={() => void checkPortfolio()}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.accentGreen} />
            ) : (
              <Text style={styles.checkBtnText}>Check Portfolio</Text>
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {checked && !loading && holdings.length > 0 ? (
          <View style={styles.summary}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Value</Text>
              <Text style={styles.summaryVal}>
                {fmtRs(totals.value, hidden)}
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Day change</Text>
              <Text
                style={[
                  styles.summaryVal,
                  {
                    color:
                      totals.change > 0
                        ? colors.accentGreen
                        : totals.change < 0
                          ? colors.danger
                          : colors.text,
                  },
                ]}
              >
                {hidden
                  ? '••••'
                  : `${totals.change >= 0 ? '+' : ''}${fmtRs(totals.change, false).replace('Rs. ', 'Rs. ')}`}
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Holdings</Text>
              <Text style={styles.summaryVal}>
                {visibleCount}/{holdings.length}
              </Text>
            </View>
          </View>
        ) : null}

        <FlatList
          data={visible}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            checked && !loading ? (
              <Text style={styles.empty}>No holdings on this account.</Text>
            ) : (
              <Text style={styles.hint}>
                Pick an account and tap Check Portfolio.
              </Text>
            )
          }
          ListFooterComponent={
            checked && visibleCount < holdings.length ? (
              <View style={styles.footerLoad}>
                <ActivityIndicator size="small" color={colors.accentGreen} />
                <Text style={styles.footerText}>Loading holdings…</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const chg = item.dayChange;
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  navigation.navigate('StockDetail', { symbol: item.symbol })
                }
              >
                <SymLogo
                  symbol={item.symbol}
                  iconUrl={item.iconUrl}
                  styles={styles}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sym}>{item.symbol}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name ?? item.symbol}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.qty}>
                    {hidden ? '•••' : `${item.qty.toLocaleString('en-NP')} qty`}
                  </Text>
                  <Text style={styles.val}>{fmtRs(item.value, hidden)}</Text>
                  <Text
                    style={[
                      styles.chg,
                      {
                        color:
                          chg > 0
                            ? colors.accentGreen
                            : chg < 0
                              ? colors.danger
                              : colors.textMuted,
                      },
                    ]}
                  >
                    {hidden
                      ? '••••'
                      : `${chg >= 0 ? '+' : ''}${Math.round(chg).toLocaleString('en-NP')}`}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />

        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPickerOpen(false)}
            />
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Select account</Text>
              {accounts.length === 0 ? (
                <Text style={styles.emptySheet}>
                  Add a MeroShare account first.
                </Text>
              ) : (
                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                  bounces
                >
                  {accounts.map((a) => (
                    <Pressable
                      key={a.id}
                      style={styles.sheetRow}
                      onPress={() => {
                        setSelectedId(a.id);
                        setPickerOpen(false);
                        setChecked(false);
                        setHoldings([]);
                        setVisibleCount(0);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sheetName}>{a.name}</Text>
                        <Text style={styles.sheetSub}>
                          {a.dpName} · {a.username}
                        </Text>
                      </View>
                      {selectedId === a.id ? (
                        <Ionicons
                          name="checkmark"
                          size={rs(18)}
                          color={colors.accentGreen}
                        />
                      ) : null}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(14),
      paddingVertical: rs(12),
    },
    title: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(17),
      flex: 1,
      marginLeft: rs(10),
    },
    controls: {
      paddingHorizontal: rs(16),
      gap: rs(14),
      marginBottom: rs(8),
    },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
    },
    dropdownText: {
      flex: 1,
      color: c.text,
      fontWeight: '600',
      fontSize: rs(14),
      marginRight: rs(8),
    },
    checkBtn: {
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(22),
      paddingHorizontal: rs(28),
      paddingVertical: rs(10),
      minWidth: rs(160),
      alignItems: 'center',
    },
    checkBtnText: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
    },
    error: {
      color: c.danger,
      textAlign: 'center',
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      fontSize: rs(13),
    },
    hint: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      fontSize: rs(13),
    },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      fontSize: rs(13),
    },
    summary: {
      flexDirection: 'row',
      marginHorizontal: rs(12),
      marginBottom: rs(8),
      gap: rs(8),
    },
    summaryCell: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: rs(10),
      padding: rs(10),
    },
    summaryLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
      marginBottom: rs(4),
    },
    summaryVal: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(12),
    },
    list: { paddingHorizontal: rs(12), paddingBottom: rs(24) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(8),
    },
    logoImg: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(10),
      backgroundColor: c.border,
    },
    logoFallback: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(10),
      backgroundColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '900', fontSize: rs(15) },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    name: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    right: { alignItems: 'flex-end' },
    qty: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    val: { color: c.text, fontWeight: '800', fontSize: rs(13), marginTop: rs(2) },
    chg: { fontSize: rs(11), fontWeight: '700', marginTop: rs(2) },
    footerLoad: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(12),
    },
    footerText: { color: c.textMuted, fontSize: rs(12) },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(16),
      borderTopRightRadius: rs(16),
      paddingTop: rs(16),
      paddingHorizontal: rs(16),
      paddingBottom: rs(20),
      maxHeight: '72%',
      minHeight: rs(220),
    },
    sheetScroll: { flexGrow: 0, maxHeight: rs(420) },
    sheetScrollContent: { paddingBottom: rs(12) },
    emptySheet: {
      color: c.textMuted,
      textAlign: 'center',
      marginVertical: rs(24),
      fontSize: rs(13),
    },
    sheetTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginBottom: rs(8),
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sheetName: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    sheetSub: { color: c.textMuted, fontSize: rs(12), marginTop: rs(2) },
  });
}
