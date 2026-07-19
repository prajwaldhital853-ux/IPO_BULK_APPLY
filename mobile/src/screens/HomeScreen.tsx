import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { AccountDetailSheet } from '../components/AccountDetailSheet';
import { AppHeader } from '../components/AppHeader';
import { HomeMarketPanel } from '../components/home/HomeMarketPanel';
import { PromoBanner } from '../components/PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { clearApplyHistoryForAccount } from '../storage/applyHistory';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import type { AccountMeta } from '../types/account';
import { MEROSHARE_WEB_HOME } from '../services/meroshare/webSession';

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const { accounts, removeAccount } = useAccounts();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<'Accounts' | 'Market'>('Accounts');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountMeta | null>(null);
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

  const openSheet = (item: AccountMeta, index: number) => {
    setSelectedAccount(item);
    setSelectedIndex(index);
    setSheetOpen(true);
  };

  const exportAccounts = async () => {
    const lines = accounts.map(
      (a, i) => `${i + 1}. ${a.name} — ${a.username}`,
    );
    const message = `NEPSE GHAR accounts (${accounts.length})\n\n${lines.join('\n')}`;
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('Export', message);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      <PromoBanner onPress={() => navigation.navigate('AddCapital')} />

      <View style={styles.tabs}>
        {(['Accounts', 'Market'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.tabBtn}>
            <Text style={[styles.tabText, tab === t && styles.tabActive]}>
              {t}
            </Text>
            {tab === t ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        ))}
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
                Total Accounts : {accounts.length}
              </Text>
              <View style={styles.listActions}>
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
                      'Tap a card to open, edit, or delete. Use + to add a new MeroShare account.',
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

            <FlatList
              data={filteredAccounts}
              keyExtractor={(item) => item.id}
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
              renderItem={({ item, index }) => (
                <Pressable
                  style={styles.card}
                  onPress={() => openSheet(item, index)}
                >
                  <View style={styles.indexBadge}>
                    <Text style={styles.indexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.name}</Text>
                      {item.verified ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={rs(16)}
                          color={colors.accentGreen}
                        />
                      ) : null}
                    </View>
                    <Text style={styles.username}>
                      Username : {item.username}
                    </Text>
                    {item.bankName || item.dpName ? (
                      <Text style={styles.bankLine} numberOfLines={1}>
                        {item.bankName || item.dpName}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="reorder-three"
                    size={rs(22)}
                    color={colors.textSecondary}
                  />
                </Pressable>
              )}
            />

            <Pressable
              style={styles.fab}
              onPress={() => navigation.navigate('AddCapital')}
            >
              <Ionicons name="add" size={rs(28)} color={colors.fabIcon} />
            </Pressable>

            <AccountDetailSheet
              account={selectedAccount}
              index={selectedIndex}
              visible={sheetOpen}
              onClose={() => setSheetOpen(false)}
              onOpen={() => void Linking.openURL(MEROSHARE_WEB_HOME)}
              onEdit={(acc) => {
                Alert.alert(
                  'Update account',
                  `To change credentials for ${acc.name}, delete this account and add it again with the updated details.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete & re-add',
                      style: 'destructive',
                      onPress: () => confirmDelete(acc),
                    },
                  ],
                );
              }}
              onDelete={confirmDelete}
            />
          </>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: rs(16),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.bgElevated,
    },
    tabBtn: { marginRight: rs(28), paddingTop: rs(12), paddingBottom: rs(10) },
    tabText: { color: c.textMuted, fontSize: rs(15), fontWeight: '600' },
    tabActive: { color: c.primary },
    tabUnderline: {
      marginTop: rs(8),
      height: rs(3),
      borderRadius: 2,
      backgroundColor: c.primary,
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
    name: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    username: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
    bankLine: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
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
