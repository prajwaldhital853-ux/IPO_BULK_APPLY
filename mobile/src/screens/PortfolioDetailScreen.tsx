import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/types';
import {
  fmtNpr,
  fmtSigned,
  portfolioMetrics,
  sectorDistribution,
  type DistMode,
  type HoldingMetrics,
  type QuoteMap,
} from '../services/portfolio/metrics';
import { iconUri, loadMiniScreener } from '../services/nepse/screener';
import {
  addHolding,
  deletePortfolio,
  listPortfolios,
  removeHolding,
  renamePortfolio,
  type Portfolio,
} from '../storage/portfolioStorage';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';

const PAGE_BG = '#E4EAD9';
const TAB_GREEN = '#2D5A27';
const FAB_GREEN = '#B8DFB9';
const RECEIVABLE = '#5BA3D9';
const PNL_BLUE = '#5B9FD4';
const PILL_BG = 'rgba(120,130,120,0.18)';

type MainTab = 'summary' | 'holdings' | 'distribution';
type HoldSort = 'qty' | 'ltp' | 'today';

export function PortfolioDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PortfolioDetail'>>();
  const insets = useSafeAreaInsets();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [tab, setTab] = useState<MainTab>('summary');
  const [distMode, setDistMode] = useState<DistMode>('current');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('');
  const [wacc, setWacc] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [holdSort, setHoldSort] = useState<HoldSort>('qty');
  const [holdDesc, setHoldDesc] = useState(true);

  const reload = useCallback(async () => {
    const [list, screener] = await Promise.all([
      listPortfolios(),
      loadMiniScreener().catch(() => []),
    ]);
    const p = list.find((x) => x.id === route.params.portfolioId) ?? null;
    setPortfolio(p);
    if (p) setEditName(p.name);
    const map: QuoteMap = {};
    for (const row of screener) {
      if (!row.symbol) continue;
      map[row.symbol.toUpperCase()] = {
        ltp: row.ltp,
        change: row.change,
        changePercent: row.changePercent,
        sector: row.sector,
        iconUrl: row.iconUrl,
        name: row.name,
        previousClose: row.previousClose,
      };
    }
    setQuotes(map);
  }, [route.params.portfolioId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  usePollingRefresh(reload);

  const metrics = useMemo(
    () => (portfolio ? portfolioMetrics(portfolio, quotes) : null),
    [portfolio, quotes],
  );

  const sectors = useMemo(
    () =>
      metrics ? sectorDistribution(metrics.holdings, distMode) : [],
    [metrics, distMode],
  );

  const topHoldings = useMemo(() => {
    if (!metrics) return [];
    return [...metrics.holdings]
      .sort((a, b) => b.current - a.current)
      .slice(0, 5);
  }, [metrics]);

  const filteredHoldings = useMemo(() => {
    if (!metrics) return [];
    const q = query.trim().toLowerCase();
    let list = metrics.holdings;
    if (q) {
      list = list.filter(
        (h) =>
          h.symbol.toLowerCase().includes(q) ||
          h.name.toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const av =
        holdSort === 'qty'
          ? a.qty
          : holdSort === 'ltp'
            ? a.ltp ?? 0
            : a.todayPnl;
      const bv =
        holdSort === 'qty'
          ? b.qty
          : holdSort === 'ltp'
            ? b.ltp ?? 0
            : b.todayPnl;
      return holdDesc ? bv - av : av - bv;
    });
    return sorted;
  }, [metrics, query, holdSort, holdDesc]);

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
    await addHolding(portfolio.id, { symbol: sym, qty: quantity, wacc: cost });
    setSymbol('');
    setQty('');
    setWacc('');
    setAddOpen(false);
    await reload();
  };

  const onRename = async () => {
    if (!portfolio) return;
    try {
      await renamePortfolio(portfolio.id, editName);
      setEditOpen(false);
      setSettingsOpen(false);
      await reload();
    } catch (e) {
      Alert.alert(
        'Rename failed',
        e instanceof Error ? e.message : 'Try again',
      );
    }
  };

  const onDelete = () => {
    if (!portfolio) return;
    Alert.alert(
      'Delete Portfolio',
      'All the stocks will be removed',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deletePortfolio(portfolio.id).then(() => navigation.goBack());
          },
        },
      ],
    );
  };

  const toggleHoldSort = (key: HoldSort) => {
    if (holdSort === key) setHoldDesc((d) => !d);
    else {
      setHoldSort(key);
      setHoldDesc(true);
    }
  };

  if (!portfolio || !metrics) {
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
          <Ionicons name="arrow-back" size={rs(22)} color="#111" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {portfolio.name}
        </Text>
        <Pressable hitSlop={12} onPress={() => setSettingsOpen(true)}>
          <Ionicons name="settings-outline" size={rs(20)} color="#111" />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['summary', 'Summary'],
            ['holdings', 'All Holdings'],
            ['distribution', 'Distribution'],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.tab, tab === id && styles.tabOn]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'summary' ? (
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + rs(90) },
          ]}
        >
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>CURRENT VALUE</Text>
            <Text style={styles.heroValue}>
              NPR {fmtNpr(metrics.currentValue)}
            </Text>
            <Text style={styles.heroSub}>
              {fmtNpr(metrics.units)} units · Invested NPR{' '}
              {fmtNpr(metrics.invested)}
            </Text>
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  Today {fmtNpr(metrics.todayPnl)}
                </Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  Overall {fmtNpr(metrics.overallPnl)}
                </Text>
              </View>
            </View>
          </View>

          <MetricRow
            label="Total Investment"
            value={fmtNpr(metrics.invested)}
            extra={`${fmtNpr(metrics.units)} Units`}
          />
          <MetricRow
            label="Today Profit and Loss"
            value={fmtNpr(metrics.todayPnl)}
            valueColor={PNL_BLUE}
          />
          <MetricRow
            label="All Time Profit and Loss"
            value={fmtNpr(metrics.overallPnl)}
            valueColor={PNL_BLUE}
          />
          <MetricRow
            label="Realized Profit and Loss"
            value={fmtNpr(metrics.realizedPnl)}
            valueColor={PNL_BLUE}
          />
          <MetricRow
            label="Unrealized Profit and Loss"
            value={fmtNpr(metrics.unrealizedPnl)}
            valueColor={PNL_BLUE}
          />
          <MetricRow
            label="Receivable Amount"
            value={fmtNpr(metrics.receivable)}
            last
          />

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Top Holdings</Text>
            <Pressable onPress={() => setTab('holdings')}>
              <Text style={styles.viewAll}>View All</Text>
            </Pressable>
          </View>
          {topHoldings.map((h) => (
            <HoldingCard key={h.symbol} h={h} />
          ))}
          {!topHoldings.length ? (
            <Text style={styles.muted}>No holdings yet — tap + to add</Text>
          ) : null}
        </ScrollView>
      ) : null}

      {tab === 'holdings' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.holdHead}>
            <Text style={styles.sectionTitle}>All Holdings</Text>
            <View style={styles.holdActions}>
              <Pressable hitSlop={8} onPress={() => setSearchOpen((v) => !v)}>
                <Ionicons name="search" size={rs(18)} color="#444" />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert('Filter', 'Sort using the column headers below.')
                }
              >
                <Ionicons name="options-outline" size={rs(18)} color="#444" />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert(
                    'Tags',
                    'Tagging coming soon — long-press a row to remove.',
                  )
                }
              >
                <Ionicons name="pricetag-outline" size={rs(18)} color="#444" />
              </Pressable>
            </View>
          </View>
          {searchOpen ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search symbol…"
              placeholderTextColor="#888"
              style={styles.searchInput}
              autoCapitalize="characters"
            />
          ) : null}
          <View style={styles.colHead}>
            <Pressable
              style={styles.colQty}
              onPress={() => toggleHoldSort('qty')}
            >
              <Text style={styles.colLabel}>Quantity</Text>
              <SortIcon active={holdSort === 'qty'} desc={holdDesc} />
            </Pressable>
            <Pressable
              style={styles.colLtp}
              onPress={() => toggleHoldSort('ltp')}
            >
              <Text style={styles.colLabel}>LTP</Text>
              <SortIcon active={holdSort === 'ltp'} desc={holdDesc} />
            </Pressable>
            <Pressable
              style={styles.colPnl}
              onPress={() => toggleHoldSort('today')}
            >
              <Text style={styles.colLabel}>Today PNL</Text>
              <SortIcon active={holdSort === 'today'} desc={holdDesc} />
            </Pressable>
          </View>
          <FlatList
            data={filteredHoldings}
            keyExtractor={(h) => h.symbol}
            contentContainerStyle={{
              paddingHorizontal: rs(14),
              paddingBottom: insets.bottom + rs(90),
            }}
            ListEmptyComponent={
              <Text style={styles.muted}>No holdings in this portfolio</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.holdRow}
                onPress={() =>
                  navigation.navigate('StockDetail', { symbol: item.symbol })
                }
                onLongPress={() => {
                  Alert.alert('Remove holding', `Delete ${item.symbol}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => {
                        void removeHolding(portfolio.id, item.symbol).then(
                          reload,
                        );
                      },
                    },
                  ]);
                }}
              >
                <View style={styles.holdLeft}>
                  <SymAvatar symbol={item.symbol} iconUrl={item.iconUrl} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.symRow}>
                      <Text style={styles.sym}>{item.symbol}</Text>
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyBadgeText}>
                          {fmtNpr(item.qty)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.holdInvested}>
                      {fmtNpr(item.invested)}
                    </Text>
                  </View>
                </View>
                <View style={styles.holdMid}>
                  <Text style={styles.holdLtp}>
                    {item.ltp != null ? fmtNpr(item.ltp) : '0'}
                  </Text>
                  <View style={styles.chgRow}>
                    <Text style={[styles.chg, { color: PNL_BLUE }]}>
                      {fmtNpr(item.change ?? 0)}
                    </Text>
                    <View style={styles.pctPill}>
                      <Text style={styles.pctPillText}>
                        {(item.changePercent ?? 0).toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.holdRight}>
                  <Text style={[styles.holdPnl, { color: PNL_BLUE }]}>
                    {fmtNpr(item.todayPnl)}
                  </Text>
                  <Text style={[styles.holdPnlPct, { color: PNL_BLUE }]}>
                    {item.todayPnlPct.toFixed(2)}%
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {tab === 'distribution' ? (
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + rs(90) },
          ]}
        >
          <View style={styles.subTabs}>
            {(
              [
                ['current', 'Current'],
                ['investment', 'Investment'],
                ['profit', 'Profit'],
                ['loss', 'Loss'],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                style={[styles.subTab, distMode === id && styles.tabOn]}
                onPress={() => setDistMode(id)}
              >
                <Text
                  style={[
                    styles.subTabText,
                    distMode === id && styles.tabTextOn,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.distBar}>
            {sectors.length === 0 ? (
              <View style={[styles.distSeg, { flex: 1, backgroundColor: '#DDD' }]} />
            ) : (
              sectors.map((s) => (
                <View
                  key={s.sector}
                  style={[
                    styles.distSeg,
                    {
                      flex: Math.max(s.pct, 0.5),
                      backgroundColor: s.color,
                    },
                  ]}
                />
              ))
            )}
          </View>

          {sectors.map((s) => (
            <View key={s.sector} style={styles.sectorRow}>
              <View style={styles.sectorLeft}>
                <View
                  style={[styles.sectorDot, { backgroundColor: s.color }]}
                />
                <View>
                  <Text style={styles.sectorName}>{s.sector}</Text>
                  <Text style={styles.sectorSub}>
                    {s.stocks} Stock{s.stocks === 1 ? '' : 's'} •{' '}
                    {fmtNpr(s.units)} Units
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.sectorVal}>NPR {fmtNpr(s.value)}</Text>
                <Text style={styles.sectorPct}>{s.pct.toFixed(2)}%</Text>
              </View>
            </View>
          ))}
          {!sectors.length ? (
            <Text style={styles.muted}>No distribution data yet</Text>
          ) : null}
        </ScrollView>
      ) : null}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + rs(16) }]}
        onPress={() => setAddOpen(true)}
      >
        <Ionicons name="add" size={rs(28)} color="#111" />
      </Pressable>

      {/* Settings sheet */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setSettingsOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{portfolio.name}</Text>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                setSettingsOpen(false);
                setEditOpen(true);
              }}
            >
              <Ionicons name="pencil" size={rs(20)} color="#333" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowTitle}>Edit Portfolio</Text>
                <Text style={styles.sheetRowSub}>Change portfolio name</Text>
              </View>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={onDelete}>
              <Ionicons name="trash-outline" size={rs(20)} color="#D32F2F" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetRowTitle, { color: '#D32F2F' }]}>
                  Delete Portfolio
                </Text>
                <Text style={styles.sheetRowSub}>
                  All the stocks will be removed
                </Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename */}
      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.createSheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Edit Portfolio</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={styles.input}
              autoFocus
            />
            <Pressable style={styles.primaryBtn} onPress={() => void onRename()}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add holding */}
      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.createSheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Add Holding</Text>
            <TextInput
              value={symbol}
              onChangeText={setSymbol}
              placeholder="Symbol"
              placeholderTextColor="#888"
              autoCapitalize="characters"
              style={styles.input}
            />
            <TextInput
              value={qty}
              onChangeText={setQty}
              placeholder="Quantity"
              placeholderTextColor="#888"
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              value={wacc}
              onChangeText={setWacc}
              placeholder="WACC / buy price"
              placeholderTextColor="#888"
              keyboardType="numeric"
              style={styles.input}
            />
            <Pressable style={styles.primaryBtn} onPress={() => void onAdd()}>
              <Text style={styles.primaryBtnText}>Add</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SortIcon({ active, desc }: { active: boolean; desc: boolean }) {
  return (
    <Ionicons
      name={active ? (desc ? 'caret-down' : 'caret-up') : 'swap-vertical'}
      size={rs(10)}
      color="#888"
    />
  );
}

function MetricRow({
  label,
  value,
  extra,
  valueColor,
  last,
}: {
  label: string;
  value: string;
  extra?: string;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.metricRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(8) }}>
        <Text style={[styles.metricValue, valueColor ? { color: valueColor } : null]}>
          {value}
        </Text>
        {extra ? <Text style={styles.metricExtra}>{extra}</Text> : null}
      </View>
    </View>
  );
}

function HoldingCard({ h }: { h: HoldingMetrics }) {
  return (
    <View style={styles.holdCard}>
      <SymAvatar symbol={h.symbol} iconUrl={h.iconUrl} />
      <View style={{ flex: 1 }}>
        <Text style={styles.sym}>{h.symbol}</Text>
        <Text style={styles.cardUnits}>{fmtNpr(h.qty)} units</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.cardValue}>{fmtNpr(h.current)}</Text>
        <View style={styles.trendRow}>
          <Ionicons
            name={h.overallPnl >= 0 ? 'trending-up' : 'trending-down'}
            size={rs(12)}
            color={PNL_BLUE}
          />
          <Text style={[styles.trendText, { color: PNL_BLUE }]}>
            {fmtSigned(h.overallPnl)} ({h.overallPnlPct.toFixed(1)}%)
          </Text>
        </View>
      </View>
    </View>
  );
}

function SymAvatar({
  symbol,
  iconUrl,
}: {
  symbol: string;
  iconUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const uri = iconUri(iconUrl) ?? iconUrl;
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.avatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarText}>{symbol.slice(0, 2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(14),
    paddingVertical: rs(10),
  },
  title: {
    color: '#111',
    fontSize: rs(17),
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: rs(8),
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: rs(14),
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: rs(22),
    padding: rs(3),
    marginBottom: rs(10),
  },
  tab: {
    flex: 1,
    borderRadius: rs(18),
    paddingVertical: rs(9),
    alignItems: 'center',
  },
  tabOn: { backgroundColor: TAB_GREEN },
  tabText: { color: '#333', fontSize: rs(12), fontWeight: '700' },
  tabTextOn: { color: '#FFF' },
  body: { paddingHorizontal: rs(14) },
  hero: {
    backgroundColor: '#D8E0D0',
    borderRadius: rs(18),
    padding: rs(18),
    marginBottom: rs(8),
  },
  heroLabel: {
    color: '#555',
    fontSize: rs(11),
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroValue: {
    color: '#111',
    fontSize: rs(28),
    fontWeight: '800',
    marginTop: rs(4),
  },
  heroSub: { color: '#666', fontSize: rs(13), marginTop: rs(4) },
  pillRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(14) },
  pill: {
    backgroundColor: PILL_BG,
    borderRadius: rs(14),
    paddingHorizontal: rs(10),
    paddingVertical: rs(5),
  },
  pillText: { color: '#444', fontSize: rs(11), fontWeight: '600' },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: rs(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  metricLabel: { color: '#333', fontSize: rs(13), fontWeight: '500' },
  metricValue: { color: '#111', fontSize: rs(14), fontWeight: '800' },
  metricExtra: { color: '#888', fontSize: rs(12) },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: rs(18),
    marginBottom: rs(10),
  },
  sectionTitle: { color: '#111', fontSize: rs(16), fontWeight: '800' },
  viewAll: { color: TAB_GREEN, fontWeight: '700', fontSize: rs(13) },
  holdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    backgroundColor: '#FFF',
    borderRadius: rs(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: rs(12),
    marginBottom: rs(8),
  },
  cardUnits: { color: '#777', fontSize: rs(12), marginTop: rs(2) },
  cardValue: { color: '#111', fontWeight: '800', fontSize: rs(14) },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(3),
    marginTop: rs(3),
  },
  trendText: { fontSize: rs(11), fontWeight: '600' },
  avatar: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: '#DDD',
  },
  avatarFallback: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: '#CFD5C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#333', fontWeight: '800', fontSize: rs(12) },
  muted: {
    textAlign: 'center',
    color: '#777',
    marginTop: rs(24),
    fontSize: rs(13),
  },
  fab: {
    position: 'absolute',
    right: rs(18),
    width: rs(54),
    height: rs(54),
    borderRadius: rs(27),
    backgroundColor: FAB_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  holdHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rs(14),
    marginBottom: rs(8),
  },
  holdActions: { flexDirection: 'row', gap: rs(14) },
  searchInput: {
    marginHorizontal: rs(14),
    marginBottom: rs(8),
    backgroundColor: '#FFF',
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    color: '#111',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  colHead: {
    flexDirection: 'row',
    paddingHorizontal: rs(14),
    paddingBottom: rs(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    marginBottom: rs(4),
  },
  colLabel: { color: '#888', fontSize: rs(11), fontWeight: '600' },
  colQty: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(3),
    paddingLeft: rs(52),
  },
  colLtp: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(3),
  },
  colPnl: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: rs(3),
  },
  holdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  holdLeft: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
  },
  symRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  sym: { color: '#111', fontWeight: '800', fontSize: rs(14) },
  qtyBadge: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: rs(8),
    paddingHorizontal: rs(6),
    paddingVertical: rs(1),
  },
  qtyBadgeText: { color: '#555', fontSize: rs(10), fontWeight: '700' },
  holdInvested: { color: '#333', fontSize: rs(12), marginTop: rs(2) },
  holdMid: { flex: 0.9, alignItems: 'center' },
  holdLtp: { color: '#111', fontWeight: '700', fontSize: rs(13) },
  chgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    marginTop: rs(3),
  },
  chg: { fontSize: rs(11), fontWeight: '600' },
  pctPill: {
    backgroundColor: 'rgba(91,159,212,0.15)',
    borderRadius: rs(8),
    paddingHorizontal: rs(5),
    paddingVertical: rs(1),
  },
  pctPillText: { color: PNL_BLUE, fontSize: rs(10), fontWeight: '700' },
  holdRight: { flex: 0.9, alignItems: 'flex-end' },
  holdPnl: { fontWeight: '700', fontSize: rs(13) },
  holdPnlPct: { fontSize: rs(11), marginTop: rs(3), fontWeight: '600' },
  subTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: rs(18),
    padding: rs(3),
    marginBottom: rs(14),
  },
  subTab: {
    flex: 1,
    borderRadius: rs(14),
    paddingVertical: rs(8),
    alignItems: 'center',
  },
  subTabText: { color: '#333', fontSize: rs(11), fontWeight: '700' },
  distBar: {
    flexDirection: 'row',
    height: rs(14),
    borderRadius: rs(8),
    overflow: 'hidden',
    marginBottom: rs(18),
  },
  distSeg: { height: '100%' },
  sectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: rs(12),
  },
  sectorLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  sectorDot: {
    width: rs(10),
    height: rs(10),
    borderRadius: rs(5),
  },
  sectorName: { color: '#111', fontWeight: '800', fontSize: rs(14) },
  sectorSub: { color: '#777', fontSize: rs(11), marginTop: rs(2) },
  sectorVal: { color: '#111', fontWeight: '800', fontSize: rs(13) },
  sectorPct: { color: '#777', fontSize: rs(11), marginTop: rs(2) },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: rs(20),
    borderTopRightRadius: rs(20),
    padding: rs(18),
    paddingBottom: rs(28),
  },
  handle: {
    alignSelf: 'center',
    width: rs(40),
    height: rs(4),
    borderRadius: 2,
    backgroundColor: '#CCC',
    marginBottom: rs(14),
  },
  sheetTitle: {
    color: '#111',
    fontSize: rs(17),
    fontWeight: '800',
    marginBottom: rs(10),
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    paddingVertical: rs(12),
  },
  sheetRowTitle: { color: '#111', fontWeight: '700', fontSize: rs(14) },
  sheetRowSub: { color: '#777', fontSize: rs(11), marginTop: rs(2) },
  createSheet: {
    backgroundColor: '#FFF',
    marginHorizontal: rs(20),
    marginBottom: rs(100),
    borderRadius: rs(16),
    padding: rs(18),
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    color: '#111',
    fontSize: rs(14),
    marginBottom: rs(10),
  },
  primaryBtn: {
    backgroundColor: TAB_GREEN,
    borderRadius: rs(24),
    paddingVertical: rs(13),
    alignItems: 'center',
    marginTop: rs(4),
  },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: rs(14) },
});
