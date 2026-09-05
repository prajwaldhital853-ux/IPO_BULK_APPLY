import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AccountDetailSheet } from '../components/AccountDetailSheet';
import { BusyOverlay } from '../components/BusyOverlay';
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import { AppHeader } from '../components/AppHeader';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { HomeMarketPanel } from '../components/home/HomeMarketPanel';
import { HOME_CARD_GAP, HOME_H_PAD } from '../components/home/homeLayout';
import { SwipeTabGesture } from '../components/SwipeTabGesture';
import {
  DEFAULT_MOCK_ACCOUNT_COUNT,
  LOAD_TEST_MOCK_ACCOUNT_COUNT,
  isMockAccountId,
} from '../data/mockAccounts';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useAppBranding } from '../context/AppBrandingContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import {
  backupFolderHint,
  exportFullAccountsExcel,
  loadFullExportRows,
} from '../services/accounts/backup';
import { loadAccountMeta } from '../storage/accountsStorage';
import type { ThemeColors } from '../theme/colors';
import {
  ensureGoogleSignedInForAddAccount,
  guardAddAccountAsync,
} from '../utils/accountLimits';
import {
  isMinorAccount,
} from '../utils/minorAccount';
import { showLockedAccountAlert } from '../utils/lockedAccountAlert';
import { rs } from '../utils/responsive';
import { usePullToRefresh } from '../utils/usePullToRefresh';
import type { RootStackParamList } from '../navigation/types';
import type { AccountMeta } from '../types/account';

const RAIL_GREEN = '#1a4d08';

/** Home account row — green rail, avatar, status badge, menu + chevron. */
function AccountCard({
  item,
  index,
  isActive,
  locked,
  searching,
  onOpen,
  onMenu,
  onDrag,
  styles,
  colors,
}: {
  item: AccountMeta;
  index: number;
  isActive: boolean;
  locked: boolean;
  searching: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onDrag?: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
}) {
  const verified = item.verified !== false;
  const userInactive = item.inactive === true;
  const isMinor = isMinorAccount(item);
  const indexLabel = String(index + 1).padStart(2, '0');
  const canDrag = !searching && Boolean(onDrag);

  return (
    <ScaleDecorator>
      <Pressable
        style={[
          styles.card,
          isActive && styles.cardActive,
          locked && styles.cardLocked,
        ]}
        onPress={onOpen}
        onLongPress={canDrag ? onDrag : undefined}
        delayLongPress={160}
        disabled={isActive}
      >
        <View style={styles.cardLeft}>
          <View style={styles.leftRail}>
            <Text style={styles.railIndex}>{indexLabel}</Text>
          </View>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <Ionicons name="person" size={rs(16)} color={RAIL_GREEN} />
            </View>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name.toUpperCase()}
            </Text>
            {verified ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={rs(7)} color="#FFFFFF" />
              </View>
            ) : null}
            {isMinor ? (
              <View style={styles.minorBadge}>
                <Text style={styles.minorBadgeText}>Minor</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.username} numberOfLines={1}>
            Username : {item.username}
          </Text>
          <View
            style={[styles.statusBadge, locked && styles.statusBadgeLocked]}
          >
            <View
              style={[
                styles.statusDot,
                (!verified || userInactive) && styles.statusDotInactive,
                locked && styles.statusDotLocked,
              ]}
            />
            <Text
              style={[
                styles.statusText,
                (!verified || userInactive) && styles.statusTextInactive,
                locked && styles.statusTextLocked,
              ]}
            >
              {locked ? 'Locked' : userInactive ? 'Inactive' : verified ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions} pointerEvents="box-none">
          <Pressable
            onPress={onMenu}
            hitSlop={8}
            style={styles.menuBtn}
            disabled={searching}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={rs(16)}
              color={searching ? colors.textDim : colors.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={onOpen}
            style={styles.chevronBtn}
            hitSlop={6}
          >
            <Ionicons
              name="chevron-forward"
              size={rs(14)}
              color={colors.primary}
            />
          </Pressable>
        </View>
      </Pressable>
    </ScaleDecorator>
  );
}

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const {
    accounts,
    removeAccount,
    reorderAccounts,
    reloadAccounts,
    seedMockAccounts,
    removeMockAccounts,
  } = useAccounts();
  const { isPremium, maxAccounts } = useSubscription();
  const { isAuthenticated, signInWithGoogle } = useAuth();
  const { isAccountActive } = useActiveAccounts();
  const { refresh: refreshBranding } = useAppBranding();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const goAddCapital = useCallback(() => {
    void (async () => {
      if (
        !(await ensureGoogleSignedInForAddAccount(
          isAuthenticated,
          signInWithGoogle,
        ))
      ) {
        return;
      }
      if (
        !(await guardAddAccountAsync({
          currentCount: accounts.length,
          isPremium,
          maxAccounts,
          onUpgrade: () => navigation.navigate('Subscription'),
        }))
      ) {
        return;
      }
      navigation.navigate('AddCapital');
    })();
  }, [
    accounts.length,
    isAuthenticated,
    isPremium,
    maxAccounts,
    navigation,
    signInWithGoogle,
  ]);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  const refreshAccountsTab = useCallback(async () => {
    await reloadAccounts();
    await refreshBranding();
  }, [reloadAccounts, refreshBranding]);
  const { refreshing, onRefresh } = usePullToRefresh(refreshAccountsTab);

  const [tab, setTab] = useState<'Accounts' | 'Market'>('Accounts');
  // Mount Market only after first visit — keep Accounts-only sessions light.
  const [marketVisited, setMarketVisited] = useState(false);
  useEffect(() => {
    if (tab === 'Market') setMarketVisited(true);
  }, [tab]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountMeta | null>(
    null,
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoBusyLabel, setDemoBusyLabel] = useState('Working…');

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.includes(q) ||
        (a.bankName ?? '').toLowerCase().includes(q) ||
        (a.dpName ?? '').toLowerCase().includes(q) ||
        (a.guardianName ?? '').toLowerCase().includes(q) ||
        (q === 'minor' && isMinorAccount(a)),
    );
  }, [accounts, query]);

  const searching = Boolean(query.trim());
  const hasMockAccounts = useMemo(
    () => accounts.some((a) => isMockAccountId(a.id)),
    [accounts],
  );
  const mockCount = useMemo(
    () => accounts.filter((a) => isMockAccountId(a.id)).length,
    [accounts],
  );

  const runDemoJob = useCallback(
    async (label: string, job: () => Promise<void>, done?: string) => {
      setDemoBusyLabel(label);
      setDemoBusy(true);
      try {
        await job();
        if (done) Alert.alert('Demo accounts', done);
      } catch (e) {
        Alert.alert(
          'Demo accounts',
          e instanceof Error ? e.message : 'Could not update demo accounts.',
        );
      } finally {
        setDemoBusy(false);
      }
    },
    [],
  );

  const toggleDemoAccounts = useCallback(() => {
    const add36 = () =>
      void runDemoJob(
        `Adding ${DEFAULT_MOCK_ACCOUNT_COUNT} demo accounts…`,
        () => seedMockAccounts(DEFAULT_MOCK_ACCOUNT_COUNT),
        `Added ${DEFAULT_MOCK_ACCOUNT_COUNT} sample accounts.`,
      );
    const add200 = () =>
      void runDemoJob(
        `Adding ${LOAD_TEST_MOCK_ACCOUNT_COUNT} demo accounts…`,
        () => seedMockAccounts(LOAD_TEST_MOCK_ACCOUNT_COUNT),
        `Added ${LOAD_TEST_MOCK_ACCOUNT_COUNT} demo accounts. Scroll Accounts, Apply, and Result to test performance.`,
      );

    if (hasMockAccounts) {
      Alert.alert(
        'Demo accounts',
        `You currently have ${mockCount} demo accounts.\n\nUse ${LOAD_TEST_MOCK_ACCOUNT_COUNT} to test how the app feels with a large list (scroll, apply, result, portfolio).`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () =>
              void runDemoJob('Removing demo accounts…', removeMockAccounts),
          },
          { text: `Replace ${LOAD_TEST_MOCK_ACCOUNT_COUNT}`, onPress: add200 },
        ],
      );
      return;
    }

    Alert.alert(
      'Add demo accounts?',
      `${DEFAULT_MOCK_ACCOUNT_COUNT} is the normal sample set. ${LOAD_TEST_MOCK_ACCOUNT_COUNT} is for performance testing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Add ${DEFAULT_MOCK_ACCOUNT_COUNT}`, onPress: add36 },
        { text: `Add ${LOAD_TEST_MOCK_ACCOUNT_COUNT}`, onPress: add200 },
      ],
    );
  }, [
    hasMockAccounts,
    mockCount,
    removeMockAccounts,
    runDemoJob,
    seedMockAccounts,
  ]);

  const confirmDelete = (item: AccountMeta) => {
    Alert.alert(
      'Delete account?',
      `Remove ${item.name} from this device? Credentials, apply history, portfolio, and investment data for this account will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void removeAccount(item.id);
          },
        },
      ],
    );
  };

  const openSheet = useCallback((item: AccountMeta, index: number) => {
    setSelectedAccount(item);
    setSelectedIndex(index);
    setSheetOpen(true);
  }, []);

  const exportAccounts = useCallback(() => {
    void (async () => {
      // Always read from storage so export includes every saved account,
      // not a stale/partial React state snapshot.
      const list = await loadAccountMeta();
      if (!list.length) {
        Alert.alert('No accounts', 'Add a MeroShare account first.');
        return;
      }
      Alert.alert(
        'Export Excel?',
        `Save all ${list.length} account(s) to ${backupFolderHint()}.\n\nKeep this file private — it contains login secrets.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Export Excel',
            onPress: () => {
              void (async () => {
                setExporting(true);
                try {
                  const rows = await loadFullExportRows(list);
                  const saved = await exportFullAccountsExcel(rows);
                  Alert.alert(
                    'Saved',
                    `${rows.length} account${rows.length === 1 ? '' : 's'} saved to:\n${saved.savedPath}`,
                  );
                } catch (e: unknown) {
                  Alert.alert(
                    'Export failed',
                    e instanceof Error
                      ? e.message
                      : 'Could not create Excel file.',
                  );
                } finally {
                  setExporting(false);
                }
              })();
            },
          },
        ],
      );
    })();
  }, []);

  const promptLocked = useCallback(() => {
    showLockedAccountAlert(() => navigation.navigate('Subscription'));
  }, [navigation]);

  const openMeroshare = useCallback(
    (item: AccountMeta) => {
      if (!isAccountActive(item.id)) {
        promptLocked();
        return;
      }
      navigation.navigate('MeroshareWeb', {
        accountId: item.id,
        destination: 'dashboard',
      });
    },
    [isAccountActive, navigation, promptLocked],
  );

  const showAccountMenu = useCallback(
    (item: AccountMeta, index: number, drag?: () => void) => {
      const reorder = searching
        ? []
        : [
            {
              text: 'Move / reorder',
              onPress: () => drag?.(),
            },
          ];

      Alert.alert(item.name, 'Choose an action', [
        { text: 'View details', onPress: () => openSheet(item, index) },
        { text: 'Open MeroShare', onPress: () => openMeroshare(item) },
        {
          text: 'Edit account',
          onPress: () =>
            navigation.navigate('EditAccount', { accountId: item.id }),
        },
        ...reorder,
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDelete(item),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [confirmDelete, navigation, openMeroshare, openSheet, searching],
  );

  const onDragEnd = useCallback(
    ({ data }: { data: AccountMeta[] }) => {
      if (searching) return;
      void reorderAccounts(data.map((a) => a.id));
    },
    [reorderAccounts, searching],
  );

  const renderAccount = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<AccountMeta>) => {
      const index = getIndex() ?? 0;
      return (
        <AccountCard
          item={item}
          index={index}
          isActive={isActive}
          locked={!isAccountActive(item.id)}
          searching={searching}
          onOpen={() => openSheet(item, index)}
          onMenu={() => showAccountMenu(item, index, drag)}
          onDrag={drag}
          styles={styles}
          colors={colors}
        />
      );
    },
    [colors, isAccountActive, openSheet, searching, showAccountMenu, styles],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      <AdminPromoBanner page="home" />

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('Accounts')}
          style={[styles.tabBtn, tab === 'Accounts' && styles.tabBtnOn]}
        >
          <Text
            style={[styles.tabText, tab === 'Accounts' && styles.tabActive]}
          >
            Accounts
          </Text>
          {tab === 'Accounts' ? <View style={styles.tabUnderline} /> : null}
        </Pressable>
        <Pressable
          onPress={() => setTab('Market')}
          style={[styles.tabBtn, tab === 'Market' && styles.tabBtnOn]}
        >
          <Text style={[styles.tabText, tab === 'Market' && styles.tabActive]}>
            Market
          </Text>
          {tab === 'Market' ? <View style={styles.tabUnderline} /> : null}
        </Pressable>
      </View>

      <SwipeTabGesture
        index={tab === 'Accounts' ? 0 : 1}
        count={2}
        onIndexChange={(i) => setTab(i === 0 ? 'Accounts' : 'Market')}
      >
      {/* Mount Market only while visible — keeps chart/SVG off the JS thread
          when Accounts is active (instant scroll / tab switch). */}
      {marketVisited && tab === 'Market' ? (
        <View style={styles.tabPane} pointerEvents="auto">
          <HomeMarketPanel active />
        </View>
      ) : null}
      <View
        style={[styles.tabPane, tab !== 'Accounts' && styles.tabPaneHidden]}
        pointerEvents={tab === 'Accounts' ? 'auto' : 'none'}
      >
          {/* Sticky total-accounts bar — stays above the scrolling list */}
          <View style={styles.stickyHead}>
            <View style={styles.totalCard}>
              <View style={styles.totalIconWrap}>
                <Ionicons name="people" size={rs(16)} color={colors.primary} />
              </View>
              <View style={styles.totalWrap}>
                <Text style={styles.totalLabel}>Total Accounts</Text>
                <Text style={styles.totalCount}>
                  <Text style={styles.totalCountOn}>{accounts.length}</Text>
                  <Text style={styles.totalCountMax}> / {maxAccounts}</Text>
                </Text>
              </View>
              <View style={styles.listActions}>
                <Pressable
                  onPress={() => setSearchOpen((v) => !v)}
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <Ionicons name="search" size={rs(15)} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => void exportAccounts()}
                  hitSlop={6}
                  style={styles.iconBtn}
                  disabled={!accounts.length || exporting}
                >
                  <Ionicons
                    name={exporting ? 'hourglass-outline' : 'share-outline'}
                    size={rs(15)}
                    color={
                      accounts.length && !exporting
                        ? colors.text
                        : colors.textMuted
                    }
                  />
                </Pressable>
                <Pressable
                  onPress={toggleDemoAccounts}
                  hitSlop={6}
                  style={styles.iconBtn}
                  disabled={demoBusy}
                >
                  <Ionicons
                    name={hasMockAccounts ? 'flask' : 'flask-outline'}
                    size={rs(15)}
                    color={demoBusy ? colors.textMuted : colors.text}
                  />
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Accounts',
                      'Tap a card or › to open details. Tap ⋮ for more actions (edit, MeroShare, reorder). Use + to add a MeroShare account.',
                    )
                  }
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={rs(15)}
                    color={colors.text}
                  />
                </Pressable>
              </View>
            </View>

            <OverQuotaBanner />

            {searchOpen ? (
              <View style={styles.searchBar}>
                <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search name or username"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  autoFocus
                />
                <Pressable
                  onPress={() => {
                    setQuery('');
                    setSearchOpen(false);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={rs(20)} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <DraggableFlatList
            data={filteredAccounts}
            keyExtractor={(item) => item.id}
            onDragEnd={onDragEnd}
            activationDistance={searching ? 9999 : 6}
            autoscrollThreshold={80}
            autoscrollSpeed={120}
            animationConfig={{
              damping: 22,
              stiffness: 200,
              mass: 0.35,
            }}
            style={styles.listFlex}
            containerStyle={styles.listFlex}
            showsVerticalScrollIndicator
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={
              filteredAccounts.length === 0 ? styles.listEmpty : styles.list
            }
            ListEmptyComponent={
              <View style={styles.emptyMarket}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="person" size={rs(64)} color={colors.sage} />
                </View>
                <Text style={styles.emptyTitle}>
                  {query.trim() ? 'No matching accounts' : 'No accounts yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {query.trim()
                    ? 'Try a different search term.'
                    : 'Tap + to add your first MeroShare account.'}
                </Text>
              </View>
            }
            renderItem={renderAccount}
          />

          <Pressable style={styles.fab} onPress={goAddCapital}>
            <Ionicons name="add" size={rs(28)} color={colors.fabIcon} />
          </Pressable>

          <AccountDetailSheet
            account={selectedAccount}
            index={selectedIndex}
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            onOpen={(acc) => {
              setSheetOpen(false);
              if (!isAccountActive(acc.id)) {
                promptLocked();
                return;
              }
              navigation.navigate('MeroshareWeb', {
                accountId: acc.id,
                destination: 'dashboard',
              });
            }}
            onEdit={(acc) =>
              navigation.navigate('EditAccount', { accountId: acc.id })
            }
            onDelete={confirmDelete}
          />
      </View>
      </SwipeTabGesture>
      <BusyOverlay visible={Boolean(demoBusy)} message={demoBusyLabel} />
    </GestureHandlerRootView>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const cardBg = c.bg;
  const railGreen = RAIL_GREEN;
  const minorBadgeBg = isDark ? 'rgba(229,57,53,0.22)' : '#FFEBEE';
  const minorBadgeFg = isDark ? '#FF8A80' : '#C62828';
  const minorBadgeBorder = isDark ? '#E57373' : '#E53935';

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    tabPane: { flex: 1 },
    tabPaneHidden: { display: 'none' },
    tabs: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.bgElevated,
    },
    tabBtn: {
      flex: 1,
      paddingTop: rs(12),
      paddingBottom: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBtnOn: {
      backgroundColor: c.primarySoft,
    },
    tabText: {
      color: c.textMuted,
      fontSize: rs(15),
      fontWeight: '600',
      lineHeight: rs(20),
    },
    tabActive: { color: c.primary, fontWeight: '800' },
    tabUnderline: {
      marginTop: rs(8),
      height: rs(3),
      width: '42%',
      borderRadius: 2,
      backgroundColor: c.primary,
    },
    stickyHead: {
      backgroundColor: c.bg,
      paddingHorizontal: HOME_H_PAD,
      paddingTop: rs(10),
      paddingBottom: rs(8),
      zIndex: 4,
    },
    totalCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderRadius: rs(12),
      backgroundColor: cardBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? c.borderMuted : '#E8ECE6',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: rs(1) },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: rs(4),
      elevation: 2,
    },
    totalIconWrap: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(17),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginTop: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderRadius: rs(12),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(14),
      padding: 0,
    },
    totalWrap: { flex: 1, minWidth: 0 },
    totalLabel: { color: c.text, fontSize: rs(12), fontWeight: '700' },
    totalCount: { marginTop: rs(1) },
    totalCountOn: {
      color: c.primary,
      fontSize: rs(18),
      fontWeight: '800',
    },
    totalCountMax: {
      color: c.textMuted,
      fontSize: rs(13),
      fontWeight: '600',
    },
    listActions: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    iconBtn: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(7),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: isDark ? c.surfaceAlt : '#F3F7F2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    listFlex: { flex: 1 },
    list: {
      paddingHorizontal: HOME_H_PAD,
      paddingBottom: rs(100),
      paddingTop: rs(4),
    },
    listEmpty: { flexGrow: 1, paddingBottom: rs(100) },
    card: {
      flexDirection: 'row',
      alignItems: 'stretch',
      position: 'relative',
      borderRadius: rs(10),
      marginBottom: HOME_CARD_GAP,
      backgroundColor: cardBg,
      minHeight: rs(64),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? c.borderMuted : '#E8ECE6',
    },
    cardActive: {
      opacity: 0.94,
      borderColor: c.primary,
    },
    cardLeft: {
      width: rs(50),
      position: 'relative',
      flexShrink: 0,
    },
    leftRail: {
      position: 'absolute',
      left: 0,
      top: rs(6),
      bottom: rs(6),
      width: rs(34),
      backgroundColor: railGreen,
      borderTopLeftRadius: rs(10),
      borderBottomLeftRadius: rs(10),
      paddingTop: rs(7),
      paddingLeft: rs(8),
    },
    railIndex: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: rs(11),
      letterSpacing: 0.2,
    },
    avatarWrap: {
      position: 'absolute',
      left: rs(16),
      top: 0,
      bottom: 0,
      width: rs(32),
      justifyContent: 'center',
      zIndex: 2,
    },
    avatarRing: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: rs(1) },
      shadowOpacity: 0.12,
      shadowRadius: rs(3),
      elevation: 3,
    },
    cardBody: {
      flex: 1,
      minWidth: 0,
      paddingLeft: rs(10),
      paddingVertical: rs(8),
      paddingRight: rs(40),
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      minWidth: 0,
    },
    name: {
      flexShrink: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      letterSpacing: 0.15,
    },
    verifiedBadge: {
      width: rs(12),
      height: rs(12),
      borderRadius: rs(6),
      backgroundColor: c.checkIconGreen || c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    minorBadge: {
      paddingHorizontal: rs(7),
      paddingVertical: rs(2),
      borderRadius: rs(6),
      backgroundColor: minorBadgeBg,
      borderWidth: 1,
      borderColor: minorBadgeBorder,
      flexShrink: 0,
    },
    minorBadgeText: {
      color: minorBadgeFg,
      fontSize: rs(9),
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    username: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(1),
    },
    cardLocked: {
      opacity: 0.88,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: rs(4),
      marginTop: rs(4),
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
      borderRadius: rs(10),
      backgroundColor: c.primarySoft,
    },
    statusBadgeLocked: {
      backgroundColor: c.minorSoft,
    },
    statusDot: {
      width: rs(6),
      height: rs(6),
      borderRadius: rs(3),
      backgroundColor: c.primary,
    },
    statusDotInactive: {
      backgroundColor: c.textMuted,
    },
    statusDotLocked: {
      backgroundColor: c.minorAccent,
    },
    statusText: {
      color: c.primary,
      fontSize: rs(10),
      fontWeight: '700',
    },
    statusTextInactive: {
      color: c.textMuted,
    },
    statusTextLocked: {
      color: c.minorAccent,
    },
    cardActions: {
      position: 'absolute',
      right: rs(8),
      top: rs(6),
      bottom: rs(6),
      width: rs(32),
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 2,
    },
    menuBtn: {
      padding: rs(2),
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevronBtn: {
      width: rs(24),
      height: rs(24),
      borderRadius: rs(6),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fab: {
      position: 'absolute',
      right: HOME_H_PAD,
      bottom: rs(20),
      width: rs(56),
      height: rs(56),
      borderRadius: rs(28),
      backgroundColor: c.fab,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    emptyMarket: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: HOME_H_PAD + rs(20),
      paddingVertical: rs(40),
    },
    emptyIcon: {
      width: rs(110),
      height: rs(110),
      borderRadius: rs(55),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(16),
    },
    emptyTitle: { color: c.text, fontSize: rs(18), fontWeight: '700' },
    emptySub: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(8),
      fontSize: rs(13),
      lineHeight: rs(19),
    },
  });
}
