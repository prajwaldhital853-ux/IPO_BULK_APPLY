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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  createPortfolio,
  upsertImportedPortfolio,
  deletePortfolio,
  listPortfolios,
  type Portfolio,
} from '../storage/portfolioStorage';
import { useAccounts } from '../context/AccountsContext';
import { importPortfolioFromMeroshare } from '../services/meroshare';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';

export function PortfolioScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts } = useAccounts();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const reload = useCallback(async () => {
    setPortfolios(await listPortfolios());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  usePollingRefresh(reload);

  const sortedPortfolios = useMemo(() => {
    const list = [...portfolios];
    list.sort((a, b) =>
      sortAsc
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    );
    return list;
  }, [portfolios, sortAsc]);

  const onCreate = async () => {
    try {
      await createPortfolio(name);
      setName('');
      setShowForm(false);
      await reload();
    } catch (e) {
      Alert.alert(
        'Could not create portfolio',
        e instanceof Error ? e.message : 'Try again',
      );
    }
  };

  const onImportPress = () => {
    if (accounts.length === 0) {
      Alert.alert(
        'No MeroShare account',
        'Add a MeroShare account first (used for bulk apply). Then you can import your holdings here.',
      );
      return;
    }
    setSelectedIds(new Set(accounts.map((a) => a.id)));
    setPickerOpen(true);
  };

  const togglePick = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runImportSelected = async () => {
    const targets = accounts.filter((a) => selectedIds.has(a.id));
    if (!targets.length) {
      Alert.alert('Select accounts', 'Pick at least one account to import.');
      return;
    }
    setPickerOpen(false);
    setImportingId('bulk');
    setImportProgress({ done: 0, total: targets.length });
    let ok = 0;
    let refreshed = 0;
    let empty = 0;
    let failed = 0;
    const errors: string[] = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        const account = targets[i]!;
        setImportProgress({ done: i, total: targets.length });
        try {
          const result = await importPortfolioFromMeroshare(account);
          if (result.holdings.length === 0) {
            empty += 1;
            continue;
          }
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
        } catch (e) {
          failed += 1;
          errors.push(
            `${account.name}: ${e instanceof Error ? e.message : 'failed'}`,
          );
        }
        setImportProgress({ done: i + 1, total: targets.length });
      }
      await reload();
      const parts = [
        ok ? `${ok} imported` : null,
        refreshed ? `${refreshed} updated` : null,
        empty ? `${empty} empty` : null,
        failed ? `${failed} failed` : null,
      ].filter(Boolean);
      Alert.alert(
        'Import finished',
        `${parts.join(' · ') || 'Nothing imported.'}${
          errors.length
            ? `\n\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n…' : ''}`
            : ''
        }\n\nWACC is seeded from last price — edit it for accurate P/L.`,
      );
    } finally {
      setImportingId(null);
      setImportProgress(null);
    }
  };

  const onDelete = (p: Portfolio) => {
    Alert.alert('Delete portfolio', `Remove "${p.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deletePortfolio(p.id).then(reload);
        },
      },
    ]);
  };

  function renderPicker() {
    const allOn = accounts.length > 0 && selectedIds.size === accounts.length;
    return (
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Import from MeroShare</Text>
            <Text style={styles.sheetSub}>
              Select one or more accounts — we&apos;ll pull holdings for all
              selected at once.
            </Text>
            <View style={styles.selectRow}>
              <Pressable
                onPress={() =>
                  setSelectedIds(
                    allOn
                      ? new Set()
                      : new Set(accounts.map((a) => a.id)),
                  )
                }
                hitSlop={8}
              >
                <Text style={styles.selectAction}>
                  {allOn ? 'Clear' : 'Select all'}
                </Text>
              </Pressable>
              <Text style={styles.selectCount}>{selectedIds.size} selected</Text>
            </View>
            <ScrollView style={{ maxHeight: rs(340) }}>
              {accounts.map((a) => {
                const on = selectedIds.has(a.id);
                return (
                  <Pressable
                    key={a.id}
                    style={styles.acctRow}
                    onPress={() => togglePick(a.id)}
                  >
                    <View style={styles.acctIcon}>
                      <Ionicons
                        name="person"
                        size={rs(16)}
                        color={colors.accentGreen}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.acctName}>{a.name}</Text>
                      <Text style={styles.acctSub}>
                        {a.dpName} · {a.username}
                      </Text>
                    </View>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={rs(22)}
                      color={on ? colors.accentGreen : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={[
                styles.importSelectedBtn,
                selectedIds.size === 0 && { opacity: 0.45 },
              ]}
              disabled={selectedIds.size === 0}
              onPress={() => void runImportSelected()}
            >
              <Text style={styles.importSelectedText}>
                Import selected ({selectedIds.size})
              </Text>
            </Pressable>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  if (portfolios.length === 0 && !showForm) {
    return (
      <ProtectedPersonalScreen title="Sign in to view portfolios">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Share Portfolio</Text>
          <Pressable
            hitSlop={10}
            onPress={() => setSortAsc((v) => !v)}
            accessibilityLabel="Sort portfolios"
          >
            <Ionicons
              name="swap-vertical"
              size={rs(20)}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.emptyBody}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons
              name="chart-donut"
              size={rs(36)}
              color={colors.accentGreen}
            />
          </View>
          <Text style={styles.heroTitle}>Build your share portfolio</Text>
          <Text style={styles.heroText}>
            Add your shares to follow live value, profit & loss, and sector
            breakdown — with accurate NEPSE WACC, charges and CGT.
          </Text>

          <FeatureRow
            icon="folder-outline"
            label="Create multiple portfolios"
            colors={colors}
            styles={styles}
          />
          <FeatureRow
            icon="stats-chart-outline"
            label="Live profit, loss & WACC"
            colors={colors}
            styles={styles}
          />
          <FeatureRow
            icon="cloud-download-outline"
            label="Import from MeroShare or Excel"
            colors={colors}
            styles={styles}
          />

          <Pressable
            style={styles.outlineBtn}
            onPress={onImportPress}
            disabled={importingId != null}
          >
            {importingId ? (
              <ActivityIndicator size="small" color={colors.accentGreen} />
            ) : (
              <Ionicons
                name="cloud-download-outline"
                size={rs(18)}
                color={colors.accentGreen}
              />
            )}
            <Text style={styles.outlineBtnText}>
              {importProgress
                ? `Importing ${importProgress.done}/${importProgress.total}…`
                : importingId
                  ? 'Importing…'
                  : 'Import from MeroShare'}
            </Text>
          </Pressable>
        </ScrollView>

        {renderPicker()}

        <Pressable
          style={[styles.fab, { marginBottom: insets.bottom + rs(12) }]}
          onPress={() => setShowForm(true)}
        >
          <Ionicons name="add" size={rs(20)} color="#FFF" />
          <Text style={styles.fabText}>Add New Portfolio</Text>
        </Pressable>
      </View>
      </ProtectedPersonalScreen>
    );
  }

  return (
    <ProtectedPersonalScreen title="Sign in to view portfolios">
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Share Portfolio</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(8) }}>
          <Pressable
            onPress={() => setSortAsc((v) => !v)}
            hitSlop={10}
            accessibilityLabel="Sort portfolios"
          >
            <Ionicons
              name="swap-vertical"
              size={rs(22)}
              color={colors.textMuted}
            />
          </Pressable>
          <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={10}>
            <Ionicons
              name="add-circle-outline"
              size={rs(22)}
              color={colors.accentGreen}
            />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={styles.importBar}
        onPress={onImportPress}
        disabled={importingId != null}
      >
        {importingId ? (
          <ActivityIndicator size="small" color={colors.accentGreen} />
        ) : (
          <Ionicons
            name="cloud-download-outline"
            size={rs(16)}
            color={colors.accentGreen}
          />
        )}
        <Text style={styles.importBarText}>
          {importProgress
            ? `Importing ${importProgress.done}/${importProgress.total}…`
            : importingId
              ? 'Importing from MeroShare…'
              : 'Import from MeroShare'}
        </Text>
      </Pressable>

      {showForm ? (
        <View style={styles.form}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Portfolio name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Pressable style={styles.saveBtn} onPress={() => void onCreate()}>
            <Text style={styles.saveBtnText}>Create</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={sortedPortfolios}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listBody}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onLongPress={() => onDelete(item)}
            onPress={() =>
              navigation.navigate('PortfolioDetail', { portfolioId: item.id })
            }
          >
            <View style={styles.cardIcon}>
              <Ionicons name="briefcase" size={rs(20)} color={colors.accentGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSub}>
                {item.holdings.length} holding
                {item.holdings.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={rs(18)} color={colors.textMuted} />
          </Pressable>
        )}
      />

      {renderPicker()}
    </View>
    </ProtectedPersonalScreen>
  );
}

function FeatureRow({
  icon,
  label,
  colors,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={rs(18)} color={colors.accentGreen} />
      </View>
      <Text style={styles.featureText}>{label}</Text>
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
    title: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    emptyBody: {
      padding: rs(20),
      alignItems: 'center',
      paddingBottom: rs(100),
    },
    logoCircle: {
      width: rs(72),
      height: rs(72),
      borderRadius: rs(36),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(16),
    },
    heroTitle: {
      color: c.text,
      fontSize: rs(20),
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: rs(10),
    },
    heroText: {
      color: c.textSecondary,
      fontSize: rs(13),
      textAlign: 'center',
      lineHeight: rs(20),
      marginBottom: rs(20),
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      width: '100%',
      marginBottom: rs(12),
    },
    featureIcon: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(8),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: { color: c.text, fontSize: rs(13), fontWeight: '600', flex: 1 },
    outlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1,
      borderColor: c.accentGreen,
      borderRadius: rs(22),
      paddingHorizontal: rs(18),
      paddingVertical: rs(10),
      marginTop: rs(10),
    },
    outlineBtnText: { color: c.accentGreen, fontWeight: '700', fontSize: rs(13) },
    fab: {
      position: 'absolute',
      left: rs(16),
      right: rs(16),
      bottom: 0,
      backgroundColor: c.primary,
      borderRadius: rs(24),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      paddingVertical: rs(14),
    },
    fabText: { color: '#FFF', fontWeight: '800', fontSize: rs(14) },
    form: {
      flexDirection: 'row',
      gap: rs(8),
      padding: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    input: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      color: c.text,
      fontSize: rs(13),
    },
    saveBtn: {
      backgroundColor: c.primary,
      borderRadius: rs(10),
      paddingHorizontal: rs(16),
      justifyContent: 'center',
    },
    saveBtnText: { color: '#FFF', fontWeight: '800' },
    listBody: { padding: rs(12), gap: rs(10) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(10),
    },
    cardIcon: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(10),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    cardSub: { color: c.textMuted, fontSize: rs(12), marginTop: rs(2) },
    importBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
      marginTop: rs(10),
      borderWidth: 1,
      borderColor: c.accentGreen,
      borderRadius: rs(12),
      paddingVertical: rs(11),
    },
    importBarText: { color: c.accentGreen, fontWeight: '700', fontSize: rs(13) },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      padding: rs(18),
      gap: rs(6),
    },
    sheetTitle: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    sheetSub: {
      color: c.textMuted,
      fontSize: rs(12),
      marginBottom: rs(8),
    },
    selectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(4),
    },
    selectAction: { color: c.accentGreen, fontWeight: '800', fontSize: rs(13) },
    selectCount: { color: c.textMuted, fontWeight: '600', fontSize: rs(12) },
    acctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(12),
      marginTop: rs(8),
    },
    acctIcon: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(9),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acctName: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    acctSub: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    importSelectedBtn: {
      marginTop: rs(14),
      backgroundColor: c.primary,
      borderRadius: rs(24),
      paddingVertical: rs(13),
      alignItems: 'center',
    },
    importSelectedText: { color: '#FFF', fontWeight: '800', fontSize: rs(14) },
    cancelBtn: {
      alignItems: 'center',
      paddingVertical: rs(13),
      marginTop: rs(4),
    },
    cancelBtnText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(13) },
  });
}
