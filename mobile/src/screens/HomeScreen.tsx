import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const { accounts, removeAccount } = useAccounts();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<'Accounts' | 'Market'>('Accounts');

  const confirmDelete = (item: AccountMeta) => {
    Alert.alert(
      'Delete account?',
      `Remove ${item.name} (${item.username}) from this device?\n\nCredentials and apply history for this account will be deleted locally.`,
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

  const openAccountMenu = (item: AccountMeta) => {
    Alert.alert(item.name, `Username: ${item.username}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: () => confirmDelete(item),
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <AppHeader onMenuPress={openDrawer} title="NEPSE GHAR" showLogo={false} />
      {isDark ? <PromoBanner /> : null}

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
        <ProtectedPersonalScreen
          title="Sign in to manage accounts"
          subtitle="Saved MeroShare accounts are stored per Google user on this device."
        >
        <>
          <Pressable style={styles.notice}>
            <View style={styles.noticeIcon}>
              <Ionicons name="information" size={rs(16)} color="#FFFFFF" />
            </View>
            <View style={styles.noticeBody}>
              <Text style={styles.noticeTitle} numberOfLines={2}>
                Welcome to NEPSE GHAR! Apply for multiple demat accounts
                seamlessly in one click.
              </Text>
              <Text style={styles.noticeSub}>System Notice • Check details</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={rs(18)}
              color={colors.primary}
            />
          </Pressable>

          <View style={styles.listHead}>
            <Text style={styles.total}>Total Accounts : {accounts.length}</Text>
          </View>

          <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              accounts.length === 0 ? styles.listEmpty : styles.list
            }
            ListEmptyComponent={
              <View style={styles.emptyMarket}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="person" size={rs(64)} color={colors.sage} />
                </View>
                <Text style={styles.emptySub}>
                  No applicant accounts added yet.{'\n'}
                  Tap the &apos;+&apos; button at the bottom-right corner to add
                  your accounts manually.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <View style={styles.card}>
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
                  {item.crnPinVerified === false ? (
                    <Text style={styles.deferredHint}>
                      CRN/PIN not confirmed yet — checked on first Live Apply
                    </Text>
                  ) : null}
                  {item.dpName || item.bankName ? (
                    <Text style={styles.username} numberOfLines={1}>
                      {item.bankName || item.dpName}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => openAccountMenu(item)}
                  hitSlop={10}
                  style={styles.menuBtn}
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={rs(18)}
                    color={colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(item)}
                  hitSlop={8}
                  style={styles.deleteBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={rs(18)}
                    color={colors.danger}
                  />
                </Pressable>
              </View>
            )}
          />

          <Pressable
            style={styles.fab}
            onPress={() => navigation.navigate('AddCapital')}
          >
            <Ionicons name="add" size={rs(28)} color={colors.primary} />
          </Pressable>
        </>
        </ProtectedPersonalScreen>
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
    notice: {
      marginHorizontal: rs(14),
      marginTop: rs(12),
      marginBottom: rs(4),
      backgroundColor: c.primarySoft,
      borderRadius: rs(14),
      paddingVertical: rs(12),
      paddingHorizontal: rs(12),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
    },
    noticeIcon: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1 },
    noticeTitle: {
      color: c.primary,
      fontSize: rs(12),
      fontWeight: '600',
      lineHeight: rs(16),
    },
    noticeSub: {
      color: c.textSecondary,
      fontSize: rs(11),
      marginTop: rs(3),
    },
    listHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(14),
    },
    total: { color: c.text, fontSize: rs(14), fontWeight: '700' },
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
    deferredHint: {
      color: c.danger,
      fontSize: rs(11),
      marginTop: rs(4),
      fontWeight: '600',
    },
    menuBtn: { padding: rs(4) },
    deleteBtn: { padding: rs(6) },
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
      marginTop: rs(4),
      textAlign: 'center',
      fontSize: rs(13),
      lineHeight: rs(20),
    },
  });
}
