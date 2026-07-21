import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  Share,
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
import { AppHeader } from '../components/AppHeader';
import { HomeMarketPanel } from '../components/home/HomeMarketPanel';
import { PromoBanner } from '../components/PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { clearApplyHistoryForAccount } from '../storage/applyHistory';
import type { ThemeColors } from '../theme/colors';
import { guardAddAccount } from '../utils/accountLimits';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import type { AccountMeta } from '../types/account';
import { MEROSHARE_WEB_HOME } from '../services/meroshare/webSession';

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const {
    accounts,
    removeAccount,
    reorderAccounts,
    addDemoAccounts,
    removeDemoAccounts,
  } = useAccounts();
  const { isPremium, maxAccounts } = useSubscription();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const goAddCapital = useCallback(() => {
    if (
      !guardAddAccount({
        currentCount: accounts.length,
        isPremium,
        onUpgrade: () => navigation.navigate('Subscription'),
      })
    ) {
      return;
    }
    navigation.navigate('AddCapital');
  }, [accounts.length, isPremium, navigation]);
  const [tab, setTab] = useState<'Accounts' | 'Market'>('Accounts');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountMeta | null>(
    null,
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.includes(q) ||
        (a.bankName ?? '').toLowerCase().includes(q) ||
        (a.dpName ?? '').toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const searching = Boolean(query.trim());

  const confirmDelete = (item: AccountMeta) => {
    Alert.alert(
      'Delete account?',
      `Remove ${item.name} from this device? Saved credentials and apply history for this account will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearApplyHistoryForAccount(item.id);
              await removeAccount(item.id);
            })();
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

  const exportAccounts = async () => {
    const lines = accounts.map((a, i) => `${i + 1}. ${a.name} — ${a.username}`);
    const message = `NEPSE GHAR accounts (${accounts.length})\n\n${lines.join('\n')}`;
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('Export', message);
    }
  };

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
        <ScaleDecorator>
          <Pressable
            style={[styles.card, isActive && styles.cardActive]}
            onPress={() => openSheet(item, index)}
            disabled={isActive}
          >
            <View style={styles.indexBadge}>
              <Text style={styles.indexText}>{index + 1}</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name.toUpperCase()}
                </Text>
                {item.verified ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={rs(16)}
                    color={colors.accentGreen}
                  />
                ) : null}
              </View>
              <Text style={styles.username}>Username : {item.username}</Text>
            </View>
            <Pressable
              onLongPress={searching ? undefined : drag}
              delayLongPress={120}
              hitSlop={8}
              style={styles.dragHandle}
              disabled={searching}
            >
              <Ionicons
                name="menu"
                size={rs(22)}
                color={searching ? colors.textDim : colors.textSecondary}
              />
            </Pressable>
          </Pressable>
        </ScaleDecorator>
      );
    },
    [colors.accentGreen, colors.textDim, colors.textSecondary, openSheet, searching, styles],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      <PromoBanner onPress={goAddCapital} />

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('Accounts')} style={styles.tabBtn}>
          <Text
            style={[styles.tabText, tab === 'Accounts' && styles.tabActive]}
          >
            Accounts
          </Text>
          {tab === 'Accounts' ? <View style={styles.tabUnderline} /> : null}
        </Pressable>
        <Pressable onPress={() => setTab('Market')} style={styles.tabBtnMarket}>
          <Text style={[styles.tabText, tab === 'Market' && styles.tabActive]}>
            Market
          </Text>
          {tab === 'Market' ? <View style={styles.tabUnderline} /> : null}
        </Pressable>
      </View>

      {tab === 'Market' ? (
        <HomeMarketPanel active={tab === 'Market'} />
      ) : (
        <>
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

          <View style={styles.listHead}>
            <Text style={styles.total}>
              Total Accounts : {accounts.length}/{maxAccounts}
            </Text>
            <View style={styles.listActions}>
              {__DEV__ ? (
                <Pressable
                  onPress={() =>
                    Alert.alert('Dry run (dev only)', 'Add demo accounts to test list scrolling?', [
                      {
                        text: 'Add 15 demo',
                        onPress: () => void addDemoAccounts(15),
                      },
                      {
                        text: 'Remove demo',
                        style: 'destructive',
                        onPress: () => void removeDemoAccounts(),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ])
                  }
                  hitSlop={8}
                  style={styles.iconBtn}
                >
                  <Ionicons name="flask-outline" size={rs(20)} color={colors.text} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setSearchOpen((v) => !v)}
                hitSlop={8}
                style={styles.iconBtn}
              >
                <Ionicons name="search" size={rs(20)} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => void exportAccounts()}
                hitSlop={8}
                style={styles.iconBtn}
                disabled={!accounts.length}
              >
                <Ionicons
                  name="share-outline"
                  size={rs(20)}
                  color={accounts.length ? colors.text : colors.textMuted}
                />
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Accounts',
                    'Tap a card to open details. Long-press the ≡ handle on the right to drag and reorder. Use + to add a MeroShare account.',
                  )
                }
                hitSlop={8}
                style={styles.iconBtn}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={rs(20)}
                  color={colors.text}
                />
              </Pressable>
            </View>
          </View>

          <DraggableFlatList
            data={filteredAccounts}
            keyExtractor={(item) => item.id}
            onDragEnd={onDragEnd}
            activationDistance={searching ? 9999 : 10}
            style={styles.listFlex}
            containerStyle={styles.listFlex}
            showsVerticalScrollIndicator
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
            onOpen={() => void Linking.openURL(MEROSHARE_WEB_HOME)}
            onEdit={(acc) =>
              navigation.navigate('EditAccount', { accountId: acc.id })
            }
            onDelete={confirmDelete}
          />
        </>
      )}
    </GestureHandlerRootView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    tabs: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: rs(16),
      gap: rs(0),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.bgElevated,
    },
    tabBtn: {
      paddingTop: rs(12),
      paddingBottom: rs(10),
      alignItems: 'center',
    },
    tabBtnMarket: {
      paddingTop: rs(12),
      paddingBottom: rs(10),
      alignItems: 'center',
      marginLeft: rs(240),
    },
    tabText: {
      color: c.textMuted,
      fontSize: rs(15),
      fontWeight: '600',
      lineHeight: rs(20),
    },
    tabActive: { color: c.primary },
    tabUnderline: {
      marginTop: rs(8),
      height: rs(3),
      borderRadius: 2,
      backgroundColor: c.primary,
      alignSelf: 'stretch',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(16),
      marginTop: rs(10),
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
    listHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(14),
    },
    total: { color: c.text, fontSize: rs(14), fontWeight: '700' },
    listActions: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
    iconBtn: { padding: rs(6) },
    listFlex: { flex: 1 },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(100) },
    listEmpty: { flexGrow: 1, paddingBottom: rs(100) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: rs(10),
      backgroundColor: c.surface,
      gap: rs(8),
    },
    cardActive: {
      opacity: 0.92,
      borderColor: c.primary,
      elevation: 4,
    },
    indexBadge: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(8),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indexText: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    cardBody: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    name: {
      flexShrink: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
      letterSpacing: 0.2,
    },
    username: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
    dragHandle: { padding: rs(4) },
    fab: {
      position: 'absolute',
      right: rs(20),
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
      paddingHorizontal: rs(36),
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
      marginTop: rs(8),
      textAlign: 'center',
      fontSize: rs(13),
      lineHeight: rs(20),
    },
  });
}
