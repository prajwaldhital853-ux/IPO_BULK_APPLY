import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from '../context/AccountsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  fetchAccountExpiryInfo,
  type AccountExpiryInfo,
  type ExpiryStatus,
} from '../services/meroshare/accountExpiry';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';

function statusColor(status: ExpiryStatus, colors: ThemeColors): string {
  if (status === 'ok') return colors.accentGreen;
  if (status === 'warning') return '#FFA726';
  if (status === 'expired' || status === 'error') return colors.danger;
  return colors.textMuted;
}

export function AccountExpiryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts, loadSecrets } = useAccounts();
  const { isPremium, daysLeft, state: sub } = useSubscription();

  const [rows, setRows] = useState<AccountExpiryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!accounts.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const out: AccountExpiryInfo[] = [];
    for (const account of accounts) {
      const secrets = await loadSecrets(account.id);
      if (!secrets?.password) {
        out.push({
          accountId: account.id,
          accountName: account.name,
          username: account.username,
          dpName: account.dpName,
          demat: account.demat ?? null,
          meroshareExpired: null,
          dematExpired: null,
          meroshareExpiryDate: null,
          dematExpiryDate: null,
          status: 'error',
          detail: 'Password not saved — re-add account',
        });
        continue;
      }
      out.push(await fetchAccountExpiryInfo(account, secrets.password));
    }
    setRows(out);
    setLoading(false);
  }, [accounts, loadSecrets]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePollingRefresh(refresh);

  const subStatus: ExpiryStatus = isPremium ? 'ok' : 'warning';
  const subDetail = isPremium
    ? daysLeft != null
      ? `${daysLeft} day(s) left · ${sub.productId ?? 'premium'}`
      : 'Premium active'
    : 'Free plan — upgrade for analytics';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Account Expiry Status</Text>
        <Pressable onPress={() => navigation.navigate('Subscription')} hitSlop={10}>
          <Ionicons name="diamond-outline" size={rs(22)} color={colors.tealHeader} />
        </Pressable>
      </View>

      <View style={styles.subCard}>
        <Text style={styles.subLabel}>In-app subscription</Text>
        <Text style={[styles.subStatus, { color: statusColor(subStatus, colors) }]}>
          {isPremium ? 'PREMIUM ACTIVE' : 'FREE'}
        </Text>
        <Text style={styles.subDetail}>{subDetail}</Text>
        {sub.expiresAt ? (
          <Text style={styles.dateLine}>Renews / ends: {sub.expiresAt.slice(0, 10)}</Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.accountId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh().finally(() => setRefreshing(false));
              }}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No MeroShare accounts saved. Add from Apply → Add capital.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.name}>{item.accountName}</Text>
                <View
                  style={[
                    styles.badge,
                    { borderColor: statusColor(item.status, colors) },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: statusColor(item.status, colors) },
                    ]}
                  >
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {item.dpName} · {item.username}
              </Text>
              {item.demat ? (
                <Text style={styles.meta}>Demat: {item.demat}</Text>
              ) : null}
              <View style={styles.grid}>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>MeroShare</Text>
                  <Text style={styles.cellVal}>
                    {item.meroshareExpired === true
                      ? 'Expired'
                      : item.meroshareExpired === false
                        ? 'Active'
                        : '—'}
                  </Text>
                  <Text style={styles.cellDate}>
                    {item.meroshareExpiryDate ?? 'No date'}
                  </Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>Demat</Text>
                  <Text style={styles.cellVal}>
                    {item.dematExpired === true
                      ? 'Expired'
                      : item.dematExpired === false
                        ? 'Active'
                        : '—'}
                  </Text>
                  <Text style={styles.cellDate}>
                    {item.dematExpiryDate ?? 'No date'}
                  </Text>
                </View>
              </View>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
          )}
        />
      )}
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
    subCard: {
      marginHorizontal: rs(16),
      marginBottom: rs(12),
      padding: rs(14),
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    subLabel: { color: c.textMuted, fontSize: rs(11), fontWeight: '700' },
    subStatus: { fontWeight: '800', fontSize: rs(14), marginTop: rs(4) },
    subDetail: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(4) },
    dateLine: { color: c.textMuted, fontSize: rs(11), marginTop: rs(4) },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(28) },
    empty: {
      textAlign: 'center',
      color: c.textSecondary,
      marginTop: rs(32),
      fontSize: rs(13),
    },
    card: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(10),
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: rs(8),
    },
    name: { flex: 1, color: c.text, fontWeight: '800', fontSize: rs(14) },
    badge: {
      borderWidth: 1,
      borderRadius: rs(10),
      paddingHorizontal: rs(8),
      paddingVertical: rs(2),
    },
    badgeText: { fontWeight: '800', fontSize: rs(9) },
    meta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(4) },
    grid: { flexDirection: 'row', gap: rs(10), marginTop: rs(12) },
    cell: {
      flex: 1,
      backgroundColor: c.bgElevated,
      borderRadius: rs(10),
      padding: rs(10),
    },
    cellLabel: { color: c.textMuted, fontSize: rs(10), fontWeight: '700' },
    cellVal: { color: c.text, fontWeight: '800', fontSize: rs(13), marginTop: rs(4) },
    cellDate: { color: c.textSecondary, fontSize: rs(10), marginTop: rs(2) },
    detail: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(10) },
  });
}
