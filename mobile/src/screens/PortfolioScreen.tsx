import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useAccounts } from '../context/AccountsContext';
import type { RootStackParamList } from '../navigation/types';
import {
  exportPortfoliosBackup,
  importHoldingsFromExcelCsv,
  importPortfoliosBackup,
} from '../services/portfolio/backup';
import {
  aggregatePortfolios,
  fmtNpr,
  type QuoteMap,
} from '../services/portfolio/metrics';
import { importPortfolioFromMeroshare } from '../services/meroshare';
import { loadMiniScreener } from '../services/nepse/screener';
import {
  createPortfolio,
  listPortfolios,
  upsertImportedPortfolio,
  type Portfolio,
} from '../storage/portfolioStorage';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';

const PAGE_BG = '#E4EAD9';
const TAB_GREEN = '#2D5A27';
const FAB_GREEN = '#B8DFB9';
const RECEIVABLE = '#5BA3D9';
const PILL_BG = 'rgba(120,130,120,0.18)';

export function PortfolioScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [sortAsc, setSortAsc] = useState(true);
  const [backupOpen, setBackupOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [list, screener] = await Promise.all([
      listPortfolios(),
      loadMiniScreener().catch(() => []),
    ]);
    setPortfolios(list);
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  usePollingRefresh(reload);

  const agg = useMemo(
    () => aggregatePortfolios(portfolios, quotes),
    [portfolios, quotes],
  );

  const sorted = useMemo(() => {
    const list = [...agg.items];
    list.sort((a, b) =>
      sortAsc
        ? a.portfolio.name.localeCompare(b.portfolio.name)
        : b.portfolio.name.localeCompare(a.portfolio.name),
    );
    return list;
  }, [agg.items, sortAsc]);

  const onCreate = async () => {
    if (creating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Enter a portfolio name.');
      return;
    }
    setCreating(true);
    try {
      const created = await createPortfolio(trimmed);
      setName('');
      setCreateOpen(false);
      // Open immediately — don't wait for market reload (that felt frozen).
      navigation.navigate('PortfolioDetail', { portfolioId: created.id });
      void reload();
    } catch (e) {
      Alert.alert(
        'Could not create',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setCreating(false);
    }
  };

  const onImportMero = () => {
    setBackupOpen(false);
    if (accounts.length === 0) {
      Alert.alert(
        'No MeroShare account',
        'Add a MeroShare account first, then import holdings here.',
      );
      return;
    }
    setSelectedIds(new Set(accounts.map((a) => a.id)));
    setPickerOpen(true);
  };

  const runImportSelected = async () => {
    const targets = accounts.filter((a) => selectedIds.has(a.id));
    if (!targets.length) {
      Alert.alert('Select accounts', 'Pick at least one account.');
      return;
    }
    setPickerOpen(false);
    setBusy('Importing from MeroShare…');
    let ok = 0;
    let refreshed = 0;
    try {
      for (const account of targets) {
        try {
          const result = await importPortfolioFromMeroshare(account);
          if (!result.holdings.length) continue;
          const saved = await upsertImportedPortfolio(
            account.id,
            `${account.name} (MeroShare)`,
            result.holdings.map((h) => ({
              symbol: h.symbol,
              name: h.name,
              qty: h.qty,
              wacc: h.wacc,
            })),
          );
          if (saved.created) ok += 1;
          else refreshed += 1;
        } catch {
          /* continue */
        }
      }
      await reload();
      Alert.alert(
        'Import finished',
        `${ok ? `${ok} created` : ''}${ok && refreshed ? ' · ' : ''}${
          refreshed ? `${refreshed} updated` : ''
        }` || 'Nothing imported.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <ProtectedPersonalScreen title="Sign in to view portfolios">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color="#111" />
          </Pressable>
          <Text style={styles.title}>Portfolio</Text>
          <View style={styles.headerActions}>
            <Pressable hitSlop={10} onPress={() => setBackupOpen(true)}>
              <Ionicons name="folder-open-outline" size={rs(20)} color="#333" />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => setSortAsc((v) => !v)}>
              <Ionicons name="swap-vertical" size={rs(20)} color="#333" />
            </Pressable>
          </View>
        </View>

        <FlatList
          data={sorted}
          keyExtractor={(item) => item.portfolio.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + rs(90) },
          ]}
          ListHeaderComponent={
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>TOTAL VALUE</Text>
              <Text style={styles.heroValue}>
                NPR {fmtNpr(agg.currentValue)}
              </Text>
              <Text style={styles.heroSub}>
                {agg.portfolioCount} portfolio
                {agg.portfolioCount === 1 ? '' : 's'} · Invested NPR{' '}
                {fmtNpr(agg.invested)}
              </Text>
              <View style={styles.pillRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    Today {fmtNpr(agg.todayPnl)}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    Overall {fmtNpr(agg.overallPnl)}
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No portfolios yet. Tap Add New Portfolio below.
            </Text>
          }
          renderItem={({ item, index }) => {
            const { portfolio, metrics } = item;
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  navigation.navigate('PortfolioDetail', {
                    portfolioId: portfolio.id,
                  })
                }
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardLeft}>
                    <View style={styles.indexBadge}>
                      <Text style={styles.indexText}>{index + 1}</Text>
                    </View>
                    <View>
                      <Text style={styles.cardName}>{portfolio.name}</Text>
                      <Text style={styles.cardUnits}>
                        {fmtNpr(metrics.units)} units
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.cardValue}>
                      {fmtNpr(metrics.currentValue)}
                    </Text>
                    <View style={[styles.pill, { marginTop: rs(6) }]}>
                      <Text style={styles.pillText}>
                        Today {fmtNpr(metrics.todayPnl)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.cardBottom}>
                  <View>
                    <Text style={styles.metaLabel}>Total Investment</Text>
                    <Text style={styles.metaValue}>
                      {fmtNpr(metrics.invested)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.metaLabel}>Total Receivable</Text>
                    <Text style={[styles.metaValue, { color: RECEIVABLE }]}>
                      {fmtNpr(metrics.receivable)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[styles.addBtn, { marginBottom: insets.bottom + rs(12) }]}
          onPress={() => setCreateOpen(true)}
        >
          <Text style={styles.addBtnText}>+ Add New Portfolio</Text>
        </Pressable>

        {/* Backup & Import */}
        <Modal
          visible={backupOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setBackupOpen(false)}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setBackupOpen(false)}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Backup & Import</Text>
              <SheetRow
                icon="cloud-upload-outline"
                title="Export Portfolios"
                sub="Save a backup file you can restore after reinstalling"
                onPress={() => {
                  setBackupOpen(false);
                  void exportPortfoliosBackup().catch((e) =>
                    Alert.alert(
                      'Export failed',
                      e instanceof Error ? e.message : 'Try again',
                    ),
                  );
                }}
              />
              <SheetRow
                icon="time-outline"
                title="Import Portfolios"
                sub="Restore from a backup file exported earlier"
                onPress={() => {
                  setBackupOpen(false);
                  void (async () => {
                    try {
                      setBusy('Importing…');
                      const r = await importPortfoliosBackup();
                      await reload();
                      if (r.count)
                        Alert.alert(
                          'Imported',
                          r.mode === 'csv'
                            ? `Loaded ${r.count} holdings`
                            : `Restored ${r.count} portfolio(s)`,
                        );
                    } catch (e) {
                      Alert.alert(
                        'Import failed',
                        e instanceof Error ? e.message : 'Try again',
                      );
                    } finally {
                      setBusy(null);
                    }
                  })();
                }}
              />
              <SheetRow
                icon="grid-outline"
                title="Import from Excel"
                sub="Import transactions from a custom .xlsx / CSV file"
                onPress={() => {
                  setBackupOpen(false);
                  void (async () => {
                    try {
                      setBusy('Importing Excel…');
                      const r = await importHoldingsFromExcelCsv();
                      await reload();
                      if (r.holdings)
                        Alert.alert(
                          'Imported',
                          `${r.holdings} holdings → ${r.portfolioName}`,
                        );
                    } catch (e) {
                      Alert.alert(
                        'Import failed',
                        e instanceof Error
                          ? e.message
                          : 'Use a CSV with Symbol, Qty, WACC columns',
                      );
                    } finally {
                      setBusy(null);
                    }
                  })();
                }}
              />
              <SheetRow
                icon="business-outline"
                title="Import from MeroShare"
                sub="Pull holdings from a saved account"
                onPress={onImportMero}
              />
            </Pressable>
          </Pressable>
        </Modal>

        {/* Create portfolio */}
        <Modal
          visible={createOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCreateOpen(false)}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setCreateOpen(false)}
          >
            <Pressable style={styles.createSheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>New Portfolio</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Portfolio name"
                placeholderTextColor="#888"
                style={styles.input}
                autoFocus
                editable={!creating}
                onSubmitEditing={() => void onCreate()}
              />
              <Pressable
                style={[styles.primaryBtn, creating && { opacity: 0.7 }]}
                disabled={creating}
                onPress={() => void onCreate()}
              >
                {creating ? (
                  <View style={styles.btnBusy}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={styles.primaryBtnText}>Creating…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryBtnText}>Create</Text>
                )}
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* MeroShare picker */}
        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setPickerOpen(false)}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>Import from MeroShare</Text>
              <ScrollView style={{ maxHeight: rs(340) }}>
                {accounts.map((a) => {
                  const on = selectedIds.has(a.id);
                  return (
                    <Pressable
                      key={a.id}
                      style={styles.acctRow}
                      onPress={() =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          return next;
                        })
                      }
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardName}>{a.name}</Text>
                        <Text style={styles.cardUnits}>
                          {a.dpName} · {a.username}
                        </Text>
                      </View>
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={rs(22)}
                        color={on ? TAB_GREEN : '#999'}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void runImportSelected()}
              >
                <Text style={styles.primaryBtnText}>
                  Import selected ({selectedIds.size})
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color={TAB_GREEN} />
            <Text style={styles.busyText}>{busy}</Text>
          </View>
        ) : null}
      </View>
    </ProtectedPersonalScreen>
  );
}

function SheetRow({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.sheetRow} onPress={onPress}>
      <View style={styles.sheetIcon}>
        <Ionicons name={icon} size={rs(20)} color={TAB_GREEN} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sheetRowTitle}>{title}</Text>
        <Text style={styles.sheetRowSub}>{sub}</Text>
      </View>
    </Pressable>
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
  title: { color: '#111', fontSize: rs(17), fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: rs(14) },
  list: { paddingHorizontal: rs(14), gap: rs(12) },
  hero: {
    backgroundColor: '#D8E0D0',
    borderRadius: rs(18),
    padding: rs(18),
    marginBottom: rs(4),
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
  card: {
    backgroundColor: '#FFF',
    borderRadius: rs(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: rs(14),
    marginTop: rs(10),
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  indexBadge: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(8),
    backgroundColor: FAB_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: '#111', fontWeight: '800', fontSize: rs(12) },
  cardName: { color: '#111', fontWeight: '800', fontSize: rs(15) },
  cardUnits: { color: '#777', fontSize: rs(12), marginTop: rs(2) },
  cardValue: { color: '#111', fontWeight: '800', fontSize: rs(15) },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: rs(12),
  },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { color: '#888', fontSize: rs(11), marginBottom: rs(3) },
  metaValue: { color: '#111', fontWeight: '800', fontSize: rs(14) },
  empty: {
    textAlign: 'center',
    color: '#777',
    marginTop: rs(40),
    fontSize: rs(13),
  },
  addBtn: {
    position: 'absolute',
    left: rs(14),
    right: rs(14),
    bottom: 0,
    backgroundColor: FAB_GREEN,
    borderRadius: rs(28),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  addBtnText: { color: '#111', fontWeight: '800', fontSize: rs(15) },
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
  sheetIcon: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: '#E8F0E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowTitle: { color: '#111', fontWeight: '700', fontSize: rs(14) },
  sheetRowSub: { color: '#777', fontSize: rs(11), marginTop: rs(2) },
  createSheet: {
    backgroundColor: '#FFF',
    marginHorizontal: rs(20),
    marginBottom: rs(120),
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
    marginTop: rs(8),
    marginBottom: rs(14),
  },
  primaryBtn: {
    backgroundColor: TAB_GREEN,
    borderRadius: rs(24),
    paddingVertical: rs(13),
    alignItems: 'center',
    marginTop: rs(8),
  },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: rs(14) },
  btnBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
  },
  acctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
    paddingVertical: rs(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(228,234,217,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(10),
  },
  busyText: { color: '#333', fontWeight: '600' },
});
