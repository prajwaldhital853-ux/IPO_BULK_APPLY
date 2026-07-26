import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  fmtNum,
  loadMiniScreener,
  type MiniScreenerRow,
} from '../services/nepse/screener';
import {
  addPriceAlert,
  clearAllPriceAlerts,
  getNotifyInBackground,
  listPriceAlerts,
  removePriceAlert,
  setNotifyInBackground,
  togglePriceAlert,
  type PriceAlert,
  type PriceAlertDirection,
} from '../storage/priceAlertStorage';
import { syncPriceAlertsToServer } from '../services/push/notifications';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

type EnrichedAlert = PriceAlert & {
  ltp: number | null;
  triggered: boolean;
  pctToGo: number | null;
};

function pctToGo(
  ltp: number | null,
  target: number,
  direction: PriceAlertDirection,
): number | null {
  if (ltp == null || ltp <= 0) return null;
  if (direction === 'above') {
    if (ltp >= target) return 0;
    return ((target - ltp) / ltp) * 100;
  }
  if (ltp <= target) return 0;
  return ((ltp - target) / ltp) * 100;
}

export function PriceAlertScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [items, setItems] = useState<EnrichedAlert[]>([]);
  const [screener, setScreener] = useState<MiniScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifyBg, setNotifyBg] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState('');
  const [direction, setDirection] =
    useState<PriceAlertDirection>('above');
  const [picked, setPicked] = useState<MiniScreenerRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [alerts, rows, bg] = await Promise.all([
      listPriceAlerts(),
      loadMiniScreener(Boolean(silent)),
      getNotifyInBackground(),
    ]);
    setScreener(rows);
    setNotifyBg(bg);
    const bySym = new Map(rows.map((r) => [r.symbol.toUpperCase(), r]));
    setItems(
      alerts.map((a) => {
        const row = bySym.get(a.symbol.toUpperCase());
        const ltp = row?.ltp ?? null;
        const triggered =
          a.enabled &&
          ltp != null &&
          (a.direction === 'above'
            ? ltp >= a.targetPrice
            : ltp <= a.targetPrice);
        return {
          ...a,
          ltp,
          triggered,
          pctToGo: pctToGo(ltp, a.targetPrice, a.direction),
        };
      }),
    );
    if (bg) {
      void syncPriceAlertsToServer(alerts);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  usePollingRefresh(reload);

  const onRefresh = () => {
    setRefreshing(true);
    void reload().finally(() => setRefreshing(false));
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = screener.filter((r) => r.symbol);
    if (!q) return base.slice(0, 60);
    return base
      .filter(
        (r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q),
      )
      .slice(0, 80);
  }, [screener, query]);

  const pickedLtp = picked?.ltp ?? null;
  const targetNum = Number(target.replace(/,/g, ''));
  const targetValid = Number.isFinite(targetNum) && targetNum > 0;

  const helperText = useMemo(() => {
    if (!picked || !targetValid || pickedLtp == null) return null;
    if (Math.abs(targetNum - pickedLtp) < 0.005) {
      return `Target equals the current price (Rs ${fmtNum(pickedLtp)}). Set it ${direction === 'above' ? 'higher for a rise alert' : 'lower for a fall alert'}.`;
    }
    if (direction === 'above' && targetNum < pickedLtp) {
      return `For an "above" alert, target should be higher than LTP Rs ${fmtNum(pickedLtp)}.`;
    }
    if (direction === 'below' && targetNum > pickedLtp) {
      return `For a "below" alert, target should be lower than LTP Rs ${fmtNum(pickedLtp)}.`;
    }
    return null;
  }, [direction, picked, pickedLtp, targetNum, targetValid]);

  const applyPct = (pct: number) => {
    if (pickedLtp == null) return;
    const next = pickedLtp * (1 + pct / 100);
    setTarget(String(Math.round(next * 100) / 100));
    setDirection(pct >= 0 ? 'above' : 'below');
  };

  const resetAdd = () => {
    setAddOpen(false);
    setQuery('');
    setTarget('');
    setPicked(null);
    setDirection('above');
  };

  const onSaveAlert = async () => {
    if (!picked) {
      Alert.alert('Pick a stock', 'Search and select a listed company first.');
      return;
    }
    if (!targetValid) {
      Alert.alert('Invalid price', 'Enter a valid target price.');
      return;
    }
    if (helperText) {
      Alert.alert('Check target price', helperText);
      return;
    }
    await addPriceAlert({
      symbol: picked.symbol,
      name: picked.name,
      direction,
      targetPrice: targetNum,
    });
    resetAdd();
    setToast(`Alert set for ${picked.symbol} (${direction === 'above' ? 'above' : 'below'} Rs ${fmtNum(targetNum)}).`);
    setTimeout(() => setToast(null), 2800);
    await reload();
  };

  const onClearAll = () => {
    if (!items.length) return;
    Alert.alert(
      'Clear all alerts?',
      'This removes every price alert on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => void clearAllPriceAlerts().then(reload),
        },
      ],
    );
  };

  const openAdd = () => {
    resetAdd();
    setAddOpen(true);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Price Alerts</Text>
        <Pressable onPress={onClearAll} hitSlop={10}>
          <Ionicons name="trash-outline" size={rs(22)} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.notifyRow}>
        <View style={styles.notifyIcon}>
          <Ionicons name="notifications" size={rs(16)} color={colors.accentGreen} />
        </View>
        <Text style={styles.notifyLabel}>Notify in background</Text>
        <Switch
          value={notifyBg}
          onValueChange={(v) => {
            setNotifyBg(v);
            void (async () => {
              await setNotifyInBackground(v);
              if (v) {
                const alerts = await listPriceAlerts();
                const ok = await syncPriceAlertsToServer(alerts);
                if (!ok) {
                  Alert.alert(
                    'Notifications',
                    'Could not enable background alerts. Turn on App notifications in Settings and allow permission.',
                  );
                }
              } else {
                await syncPriceAlertsToServer([]);
              }
            })();
          }}
          trackColor={{ false: colors.border, true: colors.primarySoft }}
          thumbColor={notifyBg ? colors.accentGreen : colors.textMuted}
        />
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator
          style={{ marginTop: rs(40) }}
          color={colors.primary}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={
            items.length === 0 ? styles.emptyList : styles.list
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name="notifications-outline"
                  size={rs(42)}
                  color={colors.accentGreen}
                />
              </View>
              <Text style={styles.emptyTitle}>No price alerts yet</Text>
              <Text style={styles.emptySub}>
                Tap &quot;Add alert&quot;, pick a stock and set a target price.
                We&apos;ll notify you the moment it hits.
              </Text>
              <Text style={styles.stockCount}>
                {screener.length > 0
                  ? `${screener.length} listed companies available`
                  : ''}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View
                style={[
                  styles.dirIcon,
                  item.direction === 'above'
                    ? styles.dirIconUp
                    : styles.dirIconDown,
                ]}
              >
                <Ionicons
                  name={
                    item.direction === 'above'
                      ? 'arrow-up'
                      : 'arrow-down'
                  }
                  size={rs(16)}
                  color={
                    item.direction === 'above'
                      ? colors.accentGreen
                      : colors.danger
                  }
                />
              </View>
              <Pressable
                style={{ flex: 1 }}
                onPress={() =>
                  navigation.navigate('StockDetail', { symbol: item.symbol })
                }
              >
                <View style={styles.rowTop}>
                  <Text style={styles.sym}>{item.symbol}</Text>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeText}>
                      {item.enabled ? (item.triggered ? 'Hit' : 'Active') : 'Off'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.rule}>
                  {item.direction === 'above' ? 'Above' : 'Below'} Rs{' '}
                  {fmtNum(item.targetPrice)} · Now{' '}
                  {item.ltp != null ? `Rs ${fmtNum(item.ltp)}` : '—'}
                </Text>
                {item.pctToGo != null && !item.triggered ? (
                  <Text style={styles.pctGo}>
                    {item.pctToGo.toFixed(1)}% to go
                  </Text>
                ) : null}
              </Pressable>
              <View style={styles.rowActions}>
                <Switch
                  value={item.enabled}
                  onValueChange={(v) =>
                    void togglePriceAlert(item.id, v).then(reload)
                  }
                  trackColor={{ false: colors.border, true: colors.primarySoft }}
                  thumbColor={item.enabled ? colors.accentGreen : colors.textMuted}
                />
                <Pressable
                  hitSlop={8}
                  onPress={() => void removePriceAlert(item.id).then(reload)}
                >
                  <Ionicons
                    name="trash-outline"
                    size={rs(18)}
                    color={colors.danger}
                  />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + rs(20) }]}
        onPress={openAdd}
      >
        <Ionicons name="notifications" size={rs(18)} color="#fff" />
        <Text style={styles.fabText}>Add alert</Text>
      </Pressable>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + rs(80) }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={addOpen} animationType="slide" onRequestClose={resetAdd}>
        <View style={[styles.modalRoot, { paddingTop: insets.top }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalKicker}>NEW ALERT</Text>
            <Pressable onPress={resetAdd} hitSlop={12}>
              <Ionicons name="close" size={rs(24)} color={colors.text} />
            </Pressable>
          </View>

          {!picked ? (
            <>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search symbol or company"
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="characters"
                />
              </View>
              <Text style={styles.searchHint}>
                All {screener.length || '…'} NEPSE listed companies
              </Text>
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.symbol}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.pickRow}
                    onPress={() => {
                      setPicked(item);
                      setTarget(
                        item.ltp != null ? String(item.ltp) : '',
                      );
                      setDirection('above');
                    }}
                  >
                    <Text style={styles.sym}>{item.symbol}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.ltp}>
                      {item.ltp != null ? fmtNum(item.ltp) : '—'}
                    </Text>
                  </Pressable>
                )}
              />
            </>
          ) : (
            <View style={styles.sheetBody}>
              <Text style={styles.pickedSym}>{picked.symbol}</Text>
              <Text style={styles.pickedName}>{picked.name}</Text>
              {pickedLtp != null ? (
                <View style={styles.ltpBadge}>
                  <MaterialCommunityIcons
                    name="chart-line"
                    size={rs(14)}
                    color={colors.accentGreen}
                  />
                  <Text style={styles.ltpBadgeText}>
                    LTP Rs {fmtNum(pickedLtp)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.dirRow}>
                {(['above', 'below'] as PriceAlertDirection[]).map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.dirBtn, direction === d && styles.dirBtnOn]}
                    onPress={() => setDirection(d)}
                  >
                    <Ionicons
                      name={d === 'above' ? 'arrow-up' : 'arrow-down'}
                      size={rs(14)}
                      color={
                        direction === d ? colors.accentGreen : colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.dirBtnText,
                        direction === d && styles.dirBtnTextOn,
                      ]}
                    >
                      Alert if {d === 'above' ? 'above' : 'below'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.targetWrap}>
                <Text style={styles.targetLabel}>Target price</Text>
                <TextInput
                  style={[
                    styles.priceInput,
                    helperText ? styles.priceInputWarn : null,
                  ]}
                  placeholder="Rs"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={target ? `Rs ${target}` : ''}
                  onChangeText={(t) =>
                    setTarget(t.replace(/^Rs\s?/i, '').replace(/,/g, ''))
                  }
                />
              </View>
              {helperText ? (
                <Text style={styles.helperWarn}>{helperText}</Text>
              ) : null}

              <View style={styles.pctRow}>
                {[-5, -2, 2, 5].map((p) => (
                  <Pressable
                    key={p}
                    style={[
                      styles.pctBtn,
                      ((p >= 0 && direction === 'above') ||
                        (p < 0 && direction === 'below')) &&
                        styles.pctBtnOn,
                    ]}
                    onPress={() => applyPct(p)}
                  >
                    <Text style={styles.pctBtnText}>
                      {p > 0 ? `+${p}%` : `${p}%`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.setBtn} onPress={() => void onSaveAlert()}>
                <Ionicons name="notifications" size={rs(18)} color="#1B1B1B" />
                <Text style={styles.setBtnText}>Set alert</Text>
              </Pressable>

              <Pressable
                style={styles.changeStock}
                onPress={() => {
                  setPicked(null);
                  setQuery('');
                  setTarget('');
                }}
              >
                <Text style={styles.changeStockText}>Pick another stock</Text>
              </Pressable>
            </View>
          )}
        </View>
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
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    notifyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginHorizontal: rs(16),
      marginBottom: rs(12),
      padding: rs(12),
      borderRadius: rs(14),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    notifyIcon: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifyLabel: { flex: 1, color: c.text, fontWeight: '600', fontSize: rs(13) },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(100) },
    emptyList: { flexGrow: 1, paddingHorizontal: rs(16), paddingBottom: rs(100) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(14),
      padding: rs(12),
      backgroundColor: c.surface,
      marginBottom: rs(10),
    },
    dirIcon: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
    },
    dirIconUp: { backgroundColor: c.primarySoft },
    dirIconDown: { backgroundColor: '#3A2020' },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
    sym: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    activeBadge: {
      backgroundColor: '#1E3A5F',
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
      borderRadius: rs(8),
    },
    activeText: { color: '#64B5F6', fontWeight: '800', fontSize: rs(10) },
    rule: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(4) },
    pctGo: {
      color: c.accentGreen,
      fontWeight: '700',
      fontSize: rs(11),
      marginTop: rs(2),
    },
    rowActions: { alignItems: 'center', gap: rs(8) },
    emptyBox: { alignItems: 'center', marginTop: rs(40), gap: rs(8) },
    emptyIconWrap: {
      width: rs(88),
      height: rs(88),
      borderRadius: rs(44),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(8),
    },
    emptyTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    emptySub: {
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: rs(13),
      lineHeight: rs(18),
      paddingHorizontal: rs(24),
    },
    stockCount: { color: c.textMuted, fontSize: rs(11), marginTop: rs(4) },
    fab: {
      position: 'absolute',
      right: rs(16),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      backgroundColor: c.fab,
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      borderRadius: rs(24),
      elevation: 4,
    },
    fabText: { color: '#fff', fontWeight: '800', fontSize: rs(13) },
    toast: {
      position: 'absolute',
      left: rs(16),
      right: rs(16),
      backgroundColor: c.accentGreen,
      borderRadius: rs(12),
      padding: rs(14),
    },
    toastText: { color: '#fff', fontWeight: '700', fontSize: rs(13) },
    modalRoot: { flex: 1, backgroundColor: c.bg },
    sheetHandle: {
      alignSelf: 'center',
      width: rs(40),
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: c.border,
      marginTop: rs(8),
      marginBottom: rs(8),
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    modalKicker: {
      color: c.textMuted,
      fontWeight: '800',
      fontSize: rs(11),
      letterSpacing: 0.8,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(16),
      marginBottom: rs(6),
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      backgroundColor: c.surface,
    },
    searchInput: { flex: 1, color: c.text, paddingVertical: rs(10), fontSize: rs(14) },
    searchHint: {
      color: c.textMuted,
      fontSize: rs(11),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    name: { flex: 1, color: c.textSecondary, fontSize: rs(12) },
    ltp: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    sheetBody: { paddingHorizontal: rs(16), paddingBottom: rs(24) },
    pickedSym: { color: c.text, fontWeight: '800', fontSize: rs(22) },
    pickedName: { color: c.textSecondary, fontSize: rs(13), marginTop: rs(4) },
    ltpBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      marginTop: rs(10),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      borderRadius: rs(16),
      backgroundColor: c.surfaceAlt,
    },
    ltpBadgeText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(12) },
    dirRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(16), marginBottom: rs(12) },
    dirBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      paddingVertical: rs(10),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    dirBtnOn: { borderColor: c.accentGreen, backgroundColor: c.primarySoft },
    dirBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(12) },
    dirBtnTextOn: { color: c.accentGreen },
    targetWrap: { marginBottom: rs(6) },
    targetLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      marginBottom: rs(4),
      marginLeft: rs(4),
    },
    priceInput: {
      borderWidth: 1,
      borderColor: c.accentGreen,
      borderRadius: rs(12),
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      backgroundColor: c.surface,
    },
    priceInputWarn: { borderColor: '#EF5350' },
    helperWarn: {
      color: '#EF9A9A',
      fontSize: rs(11),
      lineHeight: rs(15),
      marginBottom: rs(8),
    },
    pctRow: { flexDirection: 'row', gap: rs(8), marginBottom: rs(16) },
    pctBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: rs(10),
      borderRadius: rs(20),
      backgroundColor: c.surfaceAlt,
    },
    pctBtnOn: { backgroundColor: c.primarySoft },
    pctBtnText: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    setBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: c.accentGreen,
      borderRadius: rs(14),
      minHeight: rs(48),
    },
    setBtnText: { color: '#1B1B1B', fontWeight: '800', fontSize: rs(15) },
    changeStock: { alignItems: 'center', marginTop: rs(14) },
    changeStockText: { color: c.primary, fontWeight: '700', fontSize: rs(13) },
  });
}
