import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
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
import { AdminPromoBanner } from '../components/AdminPromoBanner';
import { AppHeader } from '../components/AppHeader';
import { HomeMarketPanel } from '../components/home/HomeMarketPanel';
import { HOME_CARD_GAP, HOME_H_PAD } from '../components/home/homeLayout';
import { useAccounts } from '../context/AccountsContext';
import { useAppBranding } from '../context/AppBrandingContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { exportFullAccountsExcel } from '../services/accounts/backup';
import { loadAccountMeta } from '../storage/accountsStorage';
import type { ThemeColors } from '../theme/colors';
import { guardAddAccount } from '../utils/accountLimits';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import type { AccountMeta } from '../types/account';

/** Classic home account row — index, name + tick, username, drag handle. */
function AccountCard({
  item,
  index,
  isActive,
  searching,
  onOpen,
  onDrag,
  styles,
  colors,
}: {
  item: AccountMeta;
  index: number;
  isActive: boolean;
  searching: boolean;
  onOpen: () => void;
  onDrag: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
}) {
  const verified = item.verified !== false;

  return (
    <ScaleDecorator>
      <Pressable
        style={[styles.card, isActive && styles.cardActive]}
        onPress={onOpen}
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
            {verified ? (
              <Ionicons
                name="checkmark-circle"
                size={rs(16)}
                color={colors.accentGreen}
              />
            ) : null}
          </View>
          <Text style={styles.username} numberOfLines={1}>
            Username : {item.username}
          </Text>
        </View>
        <Pressable
          onLongPress={searching ? undefined : onDrag}
          delayLongPress={120}
          hitSlop={10}
          style={styles.menuBtn}
          disabled={searching}
        >
          <Ionicons
            name="menu"
            size={rs(22)}
            color={searching ? colors.textDim : colors.text}
          />
        </Pressable>
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
    seedMockAccounts,
    removeMockAccounts,
    loadSecrets,
  } = useAccounts();
  const { isPremium, maxAccounts } = useSubscription();
  const { refresh: refreshBranding } = useAppBranding();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const goAddCapital = useCallback(() => {
    if (
      !guardAddAccount({
        currentCount: accounts.length,
        isPremium,
        maxAccounts,
        onUpgrade: () => navigation.navigate('Subscription'),
      })
    ) {
      return;
    }
    navigation.navigate('AddCapital');
  }, [accounts.length, isPremium, maxAccounts, navigation]);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);
  const [tab, setTab] = useState<'Accounts' | 'Market'>('Accounts');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountMeta | null>(
    null,
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

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
        'Export to Excel?',
        `Save all ${list.length} account(s) with S.N., Name, DP, Client, Password, CRN and PIN.\n\nKeep this file private — it contains login secrets.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Export Excel',
            onPress: () => {
              void (async () => {
                setExporting(true);
                try {
                  const rows = await Promise.all(
                    list.map(async (a, i) => {
                      let secrets: Awaited<ReturnType<typeof loadSecrets>> =
                        null;
                      try {
                        secrets = await loadSecrets(a.id);
                      } catch {
                        secrets = null;
                      }
                      return {
                        sn: i + 1,
                        name: a.name ?? '',
                        dp: a.dpCode ?? a.dpId ?? '',
                        client: a.username ?? '',
                        password: secrets?.password ?? '',
                        crn: secrets?.crn ?? '',
                        pin: secrets?.pin ?? '',
                        dpName: a.dpName,
                        bankName: a.bankName,
                        demat: a.demat,
                      };
                    }),
                  );
                  await exportFullAccountsExcel(rows);
                  Alert.alert(
                    'Exported',
                    `${rows.length} account${rows.length === 1 ? '' : 's'} saved to Excel/CSV.`,
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
  }, [loadSecrets]);

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
          searching={searching}
          onOpen={() => openSheet(item, index)}
          onDrag={drag}
          styles={styles}
          colors={colors}
        />
      );
    },
    [colors, openSheet, searching, styles],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      <AdminPromoBanner />

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
            <View style={styles.totalWrap}>
              <Text style={styles.totalLabel}>Total Accounts</Text>
              <Text style={styles.totalCount}>
                <Text style={styles.totalCountOn}>{accounts.length}</Text>
                <Text style={styles.totalCountMax}> / {maxAccounts}</Text>
              </Text>
            </View>
            <View style={styles.listActions}>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Sample accounts',
                    'Load realistic mock accounts with portfolio holdings (gain/loss) for Expo Go testing?',
                    [
                      {
                        text: 'Load sample accounts',
                        onPress: () =>
                          void seedMockAccounts().then(() =>
                            Alert.alert(
                              'Ready',
                              '15 sample accounts loaded. Open Bulk Portfolio Check, Portfolio import, or Investment Summary to see money/gain/loss data.',
                            ),
                          ),
                      },
                      {
                        text: 'Remove sample accounts',
                        style: 'destructive',
                        onPress: () => void removeMockAccounts(),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ],
                  )
                }
                hitSlop={6}
                style={styles.iconBtn}
              >
                <Ionicons
                  name="filter-outline"
                  size={rs(18)}
                  color={colors.text}
                />
              </Pressable>
              <Pressable
                onPress={() => setSearchOpen((v) => !v)}
                hitSlop={6}
                style={styles.iconBtn}
              >
                <Ionicons name="search" size={rs(18)} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => void exportAccounts()}
                hitSlop={6}
                style={styles.iconBtn}
                disabled={!accounts.length || exporting}
              >
                <Ionicons
                  name={exporting ? 'hourglass-outline' : 'share-outline'}
                  size={rs(18)}
                  color={
                    accounts.length && !exporting
                      ? colors.text
                      : colors.textMuted
                  }
                />
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Accounts',
                    'Tap a card to open details. Long-press the menu handle on the right to drag and reorder. Use + to add a MeroShare account.',
                  )
                }
                hitSlop={6}
                style={styles.iconBtn}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={rs(18)}
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
            onOpen={(acc) => {
              setSheetOpen(false);
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
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: HOME_H_PAD,
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
      paddingHorizontal: HOME_H_PAD,
      paddingTop: rs(12),
      paddingBottom: rs(10),
      gap: rs(8),
    },
    totalWrap: { flexShrink: 1 },
    totalLabel: { color: c.text, fontSize: rs(14), fontWeight: '800' },
    totalCount: { marginTop: rs(2) },
    totalCountOn: {
      color: c.primary,
      fontSize: rs(16),
      fontWeight: '800',
    },
    totalCountMax: {
      color: c.textMuted,
      fontSize: rs(13),
      fontWeight: '600',
    },
    listActions: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    iconBtn: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(8),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listFlex: { flex: 1 },
    list: {
      paddingHorizontal: HOME_H_PAD,
      paddingBottom: rs(100),
      paddingTop: rs(2),
    },
    listEmpty: { flexGrow: 1, paddingBottom: rs(100) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(12),
      padding: rs(12),
      marginBottom: HOME_CARD_GAP,
      backgroundColor: c.surface,
      gap: rs(12),
    },
    cardActive: {
      opacity: 0.92,
      borderColor: c.primary,
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
    cardBody: { flex: 1, minWidth: 0 },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
    },
    name: {
      flexShrink: 1,
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
    },
    username: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(2),
    },
    menuBtn: {
      padding: rs(4),
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
