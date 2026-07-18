import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import {
  approveSubscription,
  deactivateUserPremium,
  deleteUserSubscription,
  fetchAdminStats,
  fetchAdminSubscriptions,
  fetchAdminUsers,
  rejectSubscription,
  type AdminStats,
  type AdminSubscriptionRow,
  type AdminUserRow,
} from '../services/admin/adminApi';
import { clearAdminToken, loadAdminToken } from '../services/admin/adminTokenStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

type Tab = 'users' | 'subscriptions';
type SubFilter = 'all' | 'pending' | 'approved' | 'rejected';
type UserFilter = 'all' | 'free' | 'pending' | 'premium';

function accessLabel(level: string): string {
  if (level === 'premium') return 'PREMIUM';
  if (level === 'pending') return 'PENDING';
  return 'FREE';
}

function accessColor(level: string): string {
  if (level === 'premium') return '#2E7D32';
  if (level === 'pending') return '#F9A825';
  return '#78909C';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function AdminDashboardScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [rows, setRows] = useState<AdminSubscriptionRow[]>([]);
  const [tab, setTab] = useState<Tab>('users');
  const [subFilter, setSubFilter] = useState<SubFilter>('pending');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (adminToken: string, nextTab: Tab, nextSubFilter: SubFilter, nextUserFilter: UserFilter) => {
      setLoading(true);
      try {
        const s = await fetchAdminStats(adminToken);
        setStats(s);
        if (nextTab === 'users') {
          const list = await fetchAdminUsers(
            adminToken,
            nextUserFilter === 'all' ? undefined : nextUserFilter,
          );
          setUsers(list);
        } else {
          const list = await fetchAdminSubscriptions(
            adminToken,
            nextSubFilter === 'all' ? undefined : nextSubFilter,
          );
          setRows(list);
        }
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not load dashboard');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      const t = await loadAdminToken();
      if (!t) {
        navigation.replace('AdminLogin');
        return;
      }
      setToken(t);
      await load(t, tab, subFilter, userFilter);
    })();
  }, [tab, subFilter, userFilter, load, navigation]);

  const onLogout = async () => {
    await clearAdminToken();
    navigation.replace('AdminLogin');
  };

  const refresh = () => token && void load(token, tab, subFilter, userFilter);

  const runSubAction = async (
    row: AdminSubscriptionRow,
    action: 'approve' | 'reject' | 'deactivate' | 'delete',
  ) => {
    if (!token) return;
    setBusyId(row.id);
    try {
      if (action === 'approve') {
        await approveSubscription(token, row.id);
        Alert.alert('Approved', `${row.userEmail} premium activated.`);
      } else if (action === 'reject') {
        await rejectSubscription(token, row.id);
        Alert.alert('Rejected', 'Subscription request rejected.');
      } else if (action === 'deactivate') {
        await deactivateUserPremium(token, row.userId);
        Alert.alert('Deactivated', 'Premium access removed.');
      } else {
        await deleteUserSubscription(token, row.userId);
        Alert.alert('Deleted', 'Subscription data cleared.');
      }
      await load(token, tab, subFilter, userFilter);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const runUserAction = async (
    user: AdminUserRow,
    action: 'approve' | 'reject' | 'deactivate' | 'delete',
  ) => {
    if (!token) return;
    const pendingId = user.pendingRequest?.id;
    setBusyId(user.id);
    try {
      if (action === 'approve') {
        if (!pendingId) {
          Alert.alert('No pending request', 'This user has no pending subscription to approve.');
          return;
        }
        await approveSubscription(token, pendingId);
        Alert.alert('Approved', `${user.email} premium activated.`);
      } else if (action === 'reject') {
        if (!pendingId) {
          Alert.alert('No pending request', 'This user has no pending subscription to reject.');
          return;
        }
        await rejectSubscription(token, pendingId);
        Alert.alert('Rejected', 'Subscription request rejected.');
      } else if (action === 'deactivate') {
        await deactivateUserPremium(token, user.id);
        Alert.alert('Deactivated', 'Premium access removed.');
      } else {
        await deleteUserSubscription(token, user.id);
        Alert.alert('Deleted', 'Subscription data cleared.');
      }
      await load(token, tab, subFilter, userFilter);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const renderUser = ({ item }: { item: AdminUserRow }) => {
    const busy = busyId === item.id;
    return (
      <View style={styles.rowCard}>
        <View style={styles.rowHead}>
          <Text style={styles.rowName}>{item.name || '—'}</Text>
          <View
            style={[
              styles.accessBadge,
              { backgroundColor: `${accessColor(item.accessLevel)}22` },
            ]}
          >
            <Text
              style={[styles.accessBadgeText, { color: accessColor(item.accessLevel) }]}
            >
              {accessLabel(item.accessLevel)}
            </Text>
          </View>
        </View>
        <Text style={styles.rowEmail}>Google: {item.email}</Text>
        <Text style={styles.rowMeta}>Google ID: {item.googleSub}</Text>
        <Text style={styles.rowMeta}>User ID: {item.id}</Text>
        <Text style={styles.rowMeta}>Account created: {fmtDate(item.createdAt)}</Text>
        {item.premiumPlan ? (
          <Text style={styles.rowMeta}>
            Premium plan: {item.premiumPlan}
            {item.premiumExpiresAt
              ? ` · until ${fmtDate(item.premiumExpiresAt)}`
              : ''}
            {item.premiumSource ? ` · via ${item.premiumSource}` : ''}
          </Text>
        ) : null}
        {item.pendingRequest ? (
          <Text style={styles.pendingLine}>
            Pending: {item.pendingRequest.planTitle} · Rs {item.pendingRequest.amountNpr} ·{' '}
            {fmtDate(item.pendingRequest.createdAt)}
          </Text>
        ) : null}
        <Text style={styles.rowMeta}>
          Subscription requests: {item.subscriptionRequestCount}
          {item.lastSubscriptionAt
            ? ` · last ${fmtDate(item.lastSubscriptionAt)}`
            : ''}
        </Text>
        <View style={styles.actions}>
          {item.accessLevel === 'pending' && item.pendingRequest ? (
            <>
              <Pressable
                style={[styles.actionBtn, styles.approveBtn]}
                disabled={busy}
                onPress={() => void runUserAction(item, 'approve')}
              >
                <Text style={styles.actionText}>Approve</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.rejectBtn]}
                disabled={busy}
                onPress={() => void runUserAction(item, 'reject')}
              >
                <Text style={styles.actionText}>Reject</Text>
              </Pressable>
            </>
          ) : null}
          {item.accessLevel === 'premium' ? (
            <Pressable
              style={[styles.actionBtn, styles.rejectBtn]}
              disabled={busy}
              onPress={() => void runUserAction(item, 'deactivate')}
            >
              <Text style={styles.actionText}>Deactivate</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.actionBtn, styles.deleteBtn]}
            disabled={busy}
            onPress={() =>
              Alert.alert('Clear subscription data?', item.email, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => void runUserAction(item, 'delete'),
                },
              ])
            }
          >
            <Text style={styles.actionText}>Delete</Text>
          </Pressable>
        </View>
        {busy ? <ActivityIndicator color={colors.teal} style={{ marginTop: rs(8) }} /> : null}
      </View>
    );
  };

  const renderSub = ({ item }: { item: AdminSubscriptionRow }) => {
    const busy = busyId === item.id;
    return (
      <View style={styles.rowCard}>
        <View style={styles.rowHead}>
          <Text style={styles.rowName}>{item.userName || item.userEmail}</Text>
          <View
            style={[
              styles.accessBadge,
              { backgroundColor: `${accessColor(item.userAccessLevel)}22` },
            ]}
          >
            <Text
              style={[
                styles.accessBadgeText,
                { color: accessColor(item.userAccessLevel) },
              ]}
            >
              {accessLabel(item.userAccessLevel)}
            </Text>
          </View>
        </View>
        <Text style={styles.rowEmail}>Google: {item.userEmail}</Text>
        <Text style={styles.rowMeta}>User joined: {fmtDate(item.userCreatedAt)}</Text>
        <Text style={styles.rowMeta}>
          {item.planTitle} · Rs {item.amountNpr} · {item.status.toUpperCase()}
        </Text>
        <Text style={styles.rowMeta}>Requested: {fmtDate(item.createdAt)}</Text>
        {item.reviewedAt ? (
          <Text style={styles.rowMeta}>Reviewed: {fmtDate(item.reviewedAt)}</Text>
        ) : null}
        {item.paymentNote ? (
          <Text style={styles.rowNote}>Payment note: {item.paymentNote}</Text>
        ) : null}
        {item.adminNote ? (
          <Text style={styles.rowNote}>Admin note: {item.adminNote}</Text>
        ) : null}
        {item.premiumActive ? (
          <Text style={styles.activeTag}>
            Premium active until {fmtDate(item.premiumExpiresAt)}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {item.status === 'pending' ? (
            <>
              <Pressable
                style={[styles.actionBtn, styles.approveBtn]}
                disabled={busy}
                onPress={() => void runSubAction(item, 'approve')}
              >
                <Text style={styles.actionText}>Approve</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.rejectBtn]}
                disabled={busy}
                onPress={() => void runSubAction(item, 'reject')}
              >
                <Text style={styles.actionText}>Reject</Text>
              </Pressable>
            </>
          ) : null}
          {item.premiumActive ? (
            <Pressable
              style={[styles.actionBtn, styles.rejectBtn]}
              disabled={busy}
              onPress={() => void runSubAction(item, 'deactivate')}
            >
              <Text style={styles.actionText}>Deactivate</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.actionBtn, styles.deleteBtn]}
            disabled={busy}
            onPress={() =>
              Alert.alert('Delete subscription data?', item.userEmail, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => void runSubAction(item, 'delete'),
                },
              ])
            }
          >
            <Text style={styles.actionText}>Delete</Text>
          </Pressable>
        </View>
        {busy ? <ActivityIndicator color={colors.teal} style={{ marginTop: rs(8) }} /> : null}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Admin Dashboard</Text>
        <Pressable onPress={() => void onLogout()} hitSlop={12}>
          <Ionicons name="log-out-outline" size={rs(22)} color={colors.danger} />
        </Pressable>
      </View>

      {stats ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.totalUsers}</Text>
            <Text style={styles.statLabel}>Users</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.pendingCount}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.activeCount}</Text>
            <Text style={styles.statLabel}>Premium</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.totalRequests}</Text>
            <Text style={styles.statLabel}>Requests</Text>
          </View>
        </ScrollView>
      ) : null}

      <View style={styles.tabs}>
        {(['users', 'subscriptions'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'users' ? 'Google Users' : 'Subscriptions'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.filters}>
        {tab === 'users'
          ? (['all', 'free', 'pending', 'premium'] as UserFilter[]).map((f) => (
              <Pressable
                key={f}
                style={[styles.chip, userFilter === f && styles.chipActive]}
                onPress={() => setUserFilter(f)}
              >
                <Text style={[styles.chipText, userFilter === f && styles.chipTextActive]}>
                  {f}
                </Text>
              </Pressable>
            ))
          : (['pending', 'approved', 'rejected', 'all'] as SubFilter[]).map((f) => (
              <Pressable
                key={f}
                style={[styles.chip, subFilter === f && styles.chipActive]}
                onPress={() => setSubFilter(f)}
              >
                <Text style={[styles.chipText, subFilter === f && styles.chipTextActive]}>
                  {f}
                </Text>
              </Pressable>
            ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: rs(24) }} />
      ) : tab === 'users' ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No users match this filter.</Text>
          }
          refreshing={loading}
          onRefresh={refresh}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderSub}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No subscription records in this filter.</Text>
          }
          refreshing={loading}
          onRefresh={refresh}
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
    statsRow: {
      flexDirection: 'row',
      gap: rs(10),
      paddingHorizontal: rs(16),
      marginBottom: rs(10),
    },
    statBox: {
      minWidth: rs(78),
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(12),
      alignItems: 'center',
    },
    statNum: { color: c.tealHeader, fontWeight: '800', fontSize: rs(18) },
    statLabel: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(2) },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      overflow: 'hidden',
    },
    tabBtn: {
      flex: 1,
      paddingVertical: rs(10),
      alignItems: 'center',
      backgroundColor: c.surface,
    },
    tabBtnActive: { backgroundColor: c.fab },
    tabText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(12) },
    tabTextActive: { color: '#fff' },
    filters: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    chip: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(999),
      paddingHorizontal: rs(12),
      paddingVertical: rs(6),
    },
    chipActive: { backgroundColor: c.fab, borderColor: c.fab },
    chipText: { color: c.textSecondary, fontSize: rs(12), textTransform: 'capitalize' },
    chipTextActive: { color: '#fff', fontWeight: '700' },
    list: { padding: rs(16), paddingBottom: rs(32) },
    rowCard: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(12),
    },
    rowHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: rs(8),
    },
    rowName: { color: c.text, fontWeight: '800', fontSize: rs(15), flex: 1 },
    accessBadge: {
      borderRadius: rs(999),
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
    },
    accessBadgeText: { fontSize: rs(10), fontWeight: '800' },
    rowEmail: { color: c.text, fontSize: rs(12), marginTop: rs(6), fontWeight: '600' },
    rowMeta: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(4), lineHeight: rs(16) },
    rowNote: { color: c.text, fontSize: rs(11), marginTop: rs(6), fontStyle: 'italic' },
    pendingLine: {
      color: '#F9A825',
      fontSize: rs(11),
      marginTop: rs(6),
      fontWeight: '700',
    },
    activeTag: { color: '#2E7D32', fontSize: rs(11), marginTop: rs(6), fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8), marginTop: rs(12) },
    actionBtn: {
      borderRadius: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
    },
    approveBtn: { backgroundColor: '#2E7D32' },
    rejectBtn: { backgroundColor: '#EF6C00' },
    deleteBtn: { backgroundColor: c.danger },
    actionText: { color: '#fff', fontWeight: '700', fontSize: rs(12) },
    empty: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(24),
      fontSize: rs(13),
    },
  });
}
