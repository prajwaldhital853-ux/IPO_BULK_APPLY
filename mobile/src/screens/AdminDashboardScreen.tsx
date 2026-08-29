import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import {
  approveSubscription,
  blockAdminUser,
  deactivateUserPremium,
  deleteAdminUser,
  deleteUserSubscription,
  fetchAdminFeedback,
  fetchAdminStats,
  fetchAdminSubscriptions,
  fetchAdminUserDetail,
  fetchAdminUsers,
  clearAdminListLegacyCache,
  rejectSubscription,
  setAdminUserMaxAccounts,
  forgetAdminUserDevice,
  unblockAdminUser,
  updateAdminFeedbackStatus,
  type AdminFeedbackRow,
  type AdminStats,
  type AdminSubscriptionRow,
  type AdminUserRow,
} from '../services/admin/adminApi';
import { clearAdminToken, loadAdminToken } from '../services/admin/adminTokenStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';
import { KeyboardSheetModal } from '../components/KeyboardSheetModal';

type Tab = 'users' | 'subscriptions' | 'feedback';
type SubFilter = 'all' | 'pending' | 'approved' | 'rejected';
type UserFilter = 'all' | 'free' | 'pending' | 'premium' | 'blocked' | 'multi_device';
type FeedbackFilter = 'new' | 'read' | 'resolved' | 'all';
type FeedbackKindFilter = 'all' | 'feedback' | 'feature_request';

const ALERT_RED = '#E53935';
const ALERT_RED_SOFT = '#FFEBEE';

function accessLabel(level: string): string {
  if (level === 'premium') return 'Premium';
  if (level === 'pending') return 'Pending';
  return 'Free';
}

function accessColor(level: string, colors: ThemeColors): string {
  if (level === 'premium') return colors.accentGreen;
  if (level === 'pending') return '#F9A825';
  return colors.textMuted;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function initials(name: string, email: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

type DetailItem =
  | { kind: 'user'; data: AdminUserRow }
  | { kind: 'subscription'; data: AdminSubscriptionRow }
  | { kind: 'feedback'; data: AdminFeedbackRow };

type ListMeta = {
  page: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
};

const EMPTY_META: ListMeta = {
  page: 1,
  totalPages: 1,
  totalCount: 0,
  hasMore: false,
  nextCursor: null,
};

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
  const [feedbackRows, setFeedbackRows] = useState<AdminFeedbackRow[]>([]);
  const [tab, setTab] = useState<Tab>('users');
  const [subFilter, setSubFilter] = useState<SubFilter>('pending');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('new');
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKindFilter>('all');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [customMaxAccounts, setCustomMaxAccounts] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userSearchDebounced, setUserSearchDebounced] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [usersMeta, setUsersMeta] = useState<ListMeta>(EMPTY_META);
  const userCursorsRef = useRef<(string | null)[]>([null]);
  const [subsPage, setSubsPage] = useState(1);
  const [subsMeta, setSubsMeta] = useState<ListMeta>(EMPTY_META);
  const subCursorsRef = useRef<(string | null)[]>([null]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setUserSearchDebounced(userSearch.trim());
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [userSearch]);

  const loadStats = useCallback(async (adminToken: string) => {
    const s = await fetchAdminStats(adminToken);
    setStats(s);
  }, []);

  const loadUsersList = useCallback(
    async (
      adminToken: string,
      page: number,
      nextUserFilter: UserFilter,
      search: string,
    ) => {
      setListLoading(true);
      try {
        const cursor = userCursorsRef.current[page - 1] ?? null;
        const result = await fetchAdminUsers(adminToken, {
          access: nextUserFilter === 'all' ? undefined : nextUserFilter,
          q: search || undefined,
          page,
          cursor,
        });
        setUsers(result.items);
        setUsersMeta({
          page: result.page,
          totalPages: result.totalPages,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        });
        if (result.nextCursor) {
          userCursorsRef.current[page] = result.nextCursor;
        }
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not load users');
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  const loadSubsList = useCallback(
    async (
      adminToken: string,
      page: number,
      nextSubFilter: SubFilter,
    ) => {
      setListLoading(true);
      try {
        const cursor = subCursorsRef.current[page - 1] ?? null;
        const result = await fetchAdminSubscriptions(adminToken, {
          status: nextSubFilter === 'all' ? undefined : nextSubFilter,
          page,
          cursor,
        });
        setRows(result.items);
        setSubsMeta({
          page: result.page,
          totalPages: result.totalPages,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        });
        if (result.nextCursor) {
          subCursorsRef.current[page] = result.nextCursor;
        }
      } catch (e) {
        Alert.alert(
          'Error',
          e instanceof Error ? e.message : 'Could not load subscriptions',
        );
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  const loadFeedbackList = useCallback(
    async (
      adminToken: string,
      nextFeedbackFilter: FeedbackFilter,
      nextFeedbackKind: FeedbackKindFilter,
    ) => {
      setListLoading(true);
      try {
        const list = await fetchAdminFeedback(adminToken, {
          status: nextFeedbackFilter,
          kind: nextFeedbackKind,
        });
        setFeedbackRows(list);
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not load feedback');
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  const reloadCurrentList = useCallback(async () => {
    if (!token) return;
    if (tab === 'users') {
      await loadUsersList(token, usersPage, userFilter, userSearchDebounced);
    } else if (tab === 'subscriptions') {
      await loadSubsList(token, subsPage, subFilter);
    } else {
      await loadFeedbackList(token, feedbackFilter, feedbackKind);
    }
  }, [
    token,
    tab,
    usersPage,
    userFilter,
    userSearchDebounced,
    subsPage,
    subFilter,
    feedbackFilter,
    feedbackKind,
    loadUsersList,
    loadSubsList,
    loadFeedbackList,
  ]);

  useEffect(() => {
    void (async () => {
      const t = await loadAdminToken();
      if (!t) {
        navigation.replace('AdminLogin');
        return;
      }
      setToken(t);
      setLoading(true);
      try {
        await loadStats(t);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial auth bootstrap only
  }, [navigation]);

  useEffect(() => {
    clearAdminListLegacyCache();
    setUsersPage(1);
    userCursorsRef.current = [null];
  }, [userFilter, userSearchDebounced]);

  useEffect(() => {
    if (!token || tab !== 'users') return;
    void loadUsersList(token, usersPage, userFilter, userSearchDebounced);
  }, [token, tab, usersPage, userFilter, userSearchDebounced, loadUsersList]);

  useEffect(() => {
    if (!token || tab !== 'subscriptions') return;
    void loadSubsList(token, subsPage, subFilter);
  }, [token, tab, subsPage, subFilter, loadSubsList]);

  useEffect(() => {
    if (!token || tab !== 'feedback') return;
    void loadFeedbackList(token, feedbackFilter, feedbackKind);
  }, [token, tab, feedbackFilter, feedbackKind, loadFeedbackList]);

  const onLogout = async () => {
    await clearAdminToken();
    navigation.replace('AdminLogin');
  };

  const refresh = () => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      try {
        await loadStats(token);
        await reloadCurrentList();
      } finally {
        setLoading(false);
      }
    })();
  };

  const openUserDetail = (item: AdminUserRow) => {
    setCustomMaxAccounts(
      item.maxAccounts >= 999999 ? '' : String(item.maxAccounts),
    );
    setDetail({ kind: 'user', data: item });
    if (!token) return;
    setDetailLoading(true);
    void (async () => {
      try {
        const full = await fetchAdminUserDetail(token, item.id);
        setDetail({ kind: 'user', data: full });
      } catch (e) {
        Alert.alert(
          'Could not load full profile',
          e instanceof Error ? e.message : 'Try again.',
        );
      } finally {
        setDetailLoading(false);
      }
    })();
  };

  const goUsersPage = (nextPage: number) => {
    if (nextPage < 1) return;
    if (
      nextPage > usersMeta.page &&
      !usersMeta.hasMore &&
      nextPage > usersMeta.totalPages
    ) {
      return;
    }
    setUsersPage(nextPage);
  };

  const goSubsPage = (nextPage: number) => {
    if (nextPage < 1) return;
    if (
      nextPage > subsMeta.page &&
      !subsMeta.hasMore &&
      nextPage > subsMeta.totalPages
    ) {
      return;
    }
    setSubsPage(nextPage);
  };

  const closeDetail = () => {
    setDetail(null);
    setCustomMaxAccounts('');
  };

  const onSetMaxAccounts = (user: AdminUserRow, maxAccounts: number) => {
    if (!Number.isFinite(maxAccounts) || maxAccounts < 1 || maxAccounts > 999999) {
      Alert.alert(
        'Invalid limit',
        'Enter a number from 1 upward, or tap Unlimited.',
      );
      return;
    }
    void (async () => {
      if (!token) return;
      setBusyId(`max-${user.id}`);
      try {
        const updated = await setAdminUserMaxAccounts(token, user.id, maxAccounts);
        setUsers((prev) =>
          prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
        );
        setDetail({ kind: 'user', data: { ...user, ...updated } });
        setCustomMaxAccounts('');
        const label =
          updated.maxAccounts >= 999999
            ? 'Unlimited'
            : String(updated.maxAccounts);
        Alert.alert(
          'Updated',
          `Account limit set to ${label}. User can add accounts up to this limit immediately.`,
        );
      } catch (e) {
        Alert.alert(
          'Failed',
          e instanceof Error ? e.message : 'Could not update account limit.',
        );
      } finally {
        setBusyId(null);
      }
    })();
  };

  const onForgetDevice = (user: AdminUserRow, deviceId: string, label: string) => {
    Alert.alert(
      'Remove this device?',
      `${label}\n\nFrees this phone's claimed account count from the shared limit. Accounts stay on the phone until the user opens the app again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!token) return;
              setBusyId(`dev-${deviceId}`);
              try {
                const updated = await forgetAdminUserDevice(
                  token,
                  user.id,
                  deviceId,
                );
                setUsers((prev) =>
                  prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
                );
                setDetail({ kind: 'user', data: { ...user, ...updated } });
              } catch (e) {
                Alert.alert(
                  'Failed',
                  e instanceof Error ? e.message : 'Could not remove device.',
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const onToggleBlockUser = (user: AdminUserRow) => {
    const blocking = !user.isBlocked;
    Alert.alert(
      blocking ? 'Block this user?' : 'Unblock this user?',
      blocking
        ? `${user.email}\n\nThey will not be able to sign in with Google. Guest mode (without login) still works on their phone.`
        : `${user.email}\n\nThey will be able to sign in with Google again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: blocking ? 'Block' : 'Unblock',
          style: blocking ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              if (!token) return;
              setBusyId(`block-${user.id}`);
              try {
                const updated = blocking
                  ? await blockAdminUser(token, user.id)
                  : await unblockAdminUser(token, user.id);
                setUsers((prev) => {
                  if (userFilter === 'blocked' && !updated.isBlocked) {
                    return prev.filter((u) => u.id !== updated.id);
                  }
                  return prev.map((u) =>
                    u.id === updated.id ? { ...u, ...updated } : u,
                  );
                });
                setStats((prev) =>
                  prev
                    ? {
                        ...prev,
                        blockedUserCount: Math.max(
                          0,
                          prev.blockedUserCount + (blocking ? 1 : -1),
                        ),
                      }
                    : prev,
                );
                setDetail({ kind: 'user', data: { ...user, ...updated } });
                Alert.alert(
                  blocking ? 'Blocked' : 'Unblocked',
                  blocking
                    ? 'User cannot sign in until you unblock them.'
                    : 'User can sign in again.',
                );
              } catch (e) {
                Alert.alert(
                  'Failed',
                  e instanceof Error ? e.message : 'Could not update block status.',
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const runSubAction = async (
    row: AdminSubscriptionRow,
    action: 'approve' | 'reject' | 'deactivate' | 'delete',
  ) => {
    if (!token) return;
    setBusyId(row.id);
    try {
      if (action === 'approve') {
        await approveSubscription(token, row.id);
        Alert.alert('Approved', `${row.userEmail} can use premium now.`);
      } else if (action === 'reject') {
        await rejectSubscription(token, row.id);
        Alert.alert('Rejected', 'Request rejected.');
      } else if (action === 'deactivate') {
        await deactivateUserPremium(token, row.userId);
        Alert.alert('Deactivated', 'Premium removed.');
      } else {
        await deleteUserSubscription(token, row.userId);
        Alert.alert('Deleted', 'Subscription data cleared.');
      }
      closeDetail();
      if (token) {
        await loadStats(token);
        await reloadCurrentList();
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDeleteUserAccount = (user: AdminUserRow) => {
    Alert.alert(
      'Delete user account?',
      `${user.email}\n\nThis permanently removes their Google profile, premium, device slots, and cloud notes from the server. MeroShare accounts on their phone are not wiped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!token) return;
              setBusyId(user.id);
              try {
                await deleteAdminUser(token, user.id);
                closeDetail();
                setUsers((prev) => prev.filter((u) => u.id !== user.id));
                setStats((prev) =>
                  prev
                    ? {
                        ...prev,
                        totalUsers: Math.max(0, prev.totalUsers - 1),
                        blockedUserCount: user.isBlocked
                          ? Math.max(0, prev.blockedUserCount - 1)
                          : prev.blockedUserCount,
                        premiumUserCount:
                          user.accessLevel === 'premium'
                            ? Math.max(0, prev.premiumUserCount - 1)
                            : prev.premiumUserCount,
                        pendingUserCount:
                          user.accessLevel === 'pending'
                            ? Math.max(0, prev.pendingUserCount - 1)
                            : prev.pendingUserCount,
                        freeUserCount:
                          user.accessLevel === 'free'
                            ? Math.max(0, prev.freeUserCount - 1)
                            : prev.freeUserCount,
                      }
                    : prev,
                );
                Alert.alert('Deleted', 'User account removed from the server.');
              } catch (e) {
                Alert.alert(
                  'Failed',
                  e instanceof Error ? e.message : 'Could not delete account.',
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
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
          Alert.alert('No pending request', 'Nothing to approve for this user.');
          return;
        }
        await approveSubscription(token, pendingId);
        Alert.alert('Approved', `${user.email} can use premium now.`);
      } else if (action === 'reject') {
        if (!pendingId) {
          Alert.alert('No pending request', 'Nothing to reject for this user.');
          return;
        }
        await rejectSubscription(token, pendingId);
        Alert.alert('Rejected', 'Request rejected.');
      } else if (action === 'deactivate') {
        await deactivateUserPremium(token, user.id);
        Alert.alert('Deactivated', 'Premium removed.');
      } else {
        await deleteUserSubscription(token, user.id);
        Alert.alert('Deleted', 'Subscription data cleared.');
      }
      closeDetail();
      if (token) {
        await loadStats(token);
        await reloadCurrentList();
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const runFeedbackAction = async (
    row: AdminFeedbackRow,
    status: AdminFeedbackRow['status'],
  ) => {
    if (!token) return;
    setBusyId(row.id);
    try {
      await updateAdminFeedbackStatus(token, row.id, status);
      closeDetail();
      if (token) {
        await loadStats(token);
        await reloadCurrentList();
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update');
    } finally {
      setBusyId(null);
    }
  };

  const feedbackKindLabel = (kind: AdminFeedbackRow['kind']) =>
    kind === 'feature_request' ? 'Feature' : 'Feedback';

  const renderFeedback = ({ item }: { item: AdminFeedbackRow }) => {
    const tint =
      item.status === 'new' ? '#F9A825' : item.status === 'resolved' ? colors.accentGreen : colors.textMuted;
    return (
      <Pressable
        style={styles.compactRow}
        onPress={() => setDetail({ kind: 'feedback', data: item })}
      >
        <View style={[styles.avatar, { backgroundColor: `${tint}22` }]}>
          <Ionicons
            name={item.kind === 'feature_request' ? 'bulb-outline' : 'chatbubble-outline'}
            size={rs(18)}
            color={tint}
          />
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name || item.email || 'Anonymous'}
          </Text>
          <Text style={styles.rowSub} numberOfLines={2}>
            {item.message}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${tint}18` }]}>
          <Text style={[styles.badgeText, { color: tint }]}>
            {item.status}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderUser = ({ item }: { item: AdminUserRow }) => {
    const tint = item.isBlocked
      ? colors.danger
      : accessColor(item.accessLevel, colors);
    const busy = busyId === item.id;
    return (
      <Pressable
        style={styles.compactRow}
        onPress={() => openUserDetail(item)}
      >
        <View style={[styles.avatar, { backgroundColor: `${tint}22` }]}>
          <Text style={[styles.avatarText, { color: tint }]}>
            {initials(item.name, item.email)}
          </Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name || item.email}
          </Text>
          <Text style={styles.rowSub} numberOfLines={2}>
            {item.email} ·{' '}
            {item.maxAccounts >= 999999
              ? 'Unlimited'
              : `${item.claimedTotal}/${item.maxAccounts} accts`}
            {item.deviceCount > 0
              ? ` · ${item.deviceCount} device${item.deviceCount === 1 ? '' : 's'}`
              : ''}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${tint}18` }]}>
          <Text style={[styles.badgeText, { color: tint }]}>
            {item.isBlocked ? 'Blocked' : accessLabel(item.accessLevel)}
          </Text>
        </View>
        {item.accessLevel === 'pending' && item.pendingRequest && !item.isBlocked ? (
          <Pressable
            style={styles.quickApprove}
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation?.();
              void runUserAction(item, 'approve');
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark" size={rs(18)} color="#fff" />
            )}
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={rs(18)} color={colors.textMuted} />
        )}
      </Pressable>
    );
  };

  const renderSub = ({ item }: { item: AdminSubscriptionRow }) => {
    const tint = accessColor(item.userAccessLevel, colors);
    const busy = busyId === item.id;
    return (
      <Pressable
        style={styles.compactRow}
        onPress={() => setDetail({ kind: 'subscription', data: item })}
      >
        <View style={[styles.avatar, { backgroundColor: `${tint}22` }]}>
          <Text style={[styles.avatarText, { color: tint }]}>
            {initials(item.userName, item.userEmail)}
          </Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.userName || item.userEmail}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {item.planTitle} · Rs {item.amountNpr}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${tint}18` }]}>
          <Text style={[styles.badgeText, { color: tint }]}>
            {item.status === 'pending' ? 'Pending' : item.status}
          </Text>
        </View>
        {item.status === 'pending' ? (
          <Pressable
            style={styles.quickApprove}
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation?.();
              void runSubAction(item, 'approve');
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark" size={rs(18)} color="#fff" />
            )}
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={rs(18)} color={colors.textMuted} />
        )}
      </Pressable>
    );
  };

  const renderDetailModal = () => {
    if (!detail) return null;
    const busy =
      detail.kind === 'user'
        ? busyId === detail.data.id
        : busyId === detail.data.id;

    if (detail.kind === 'user') {
      const item = detail.data;
      const limitBusy = busy || busyId === `max-${item.id}`;
      const limitLabel =
        item.maxAccounts >= 999999 ? 'Unlimited' : `${item.maxAccounts} accounts`;
      return (
        <>
          <View style={styles.detailGrid}>
            <DetailCell
              styles={styles}
              label="Status"
              value={item.isBlocked ? 'Blocked' : accessLabel(item.accessLevel)}
            />
            <DetailCell styles={styles} label="Joined" value={fmtDate(item.createdAt)} />
            <DetailCell
              styles={styles}
              label="Account limit"
              value={limitLabel}
            />
            <DetailCell
              styles={styles}
              label="Claimed across devices"
              value={
                item.maxAccounts >= 999999
                  ? `${item.claimedTotal} (unlimited plan)`
                  : `${item.claimedTotal} / ${item.maxAccounts}`
              }
            />
            {item.isBlocked ? (
              <DetailCell
                styles={styles}
                label="Blocked since"
                value={fmtDate(item.blockedAt)}
              />
            ) : null}
            {item.premiumPlan ? (
              <DetailCell
                styles={styles}
                label="Plan"
                value={`${item.premiumPlan} · until ${fmtDate(item.premiumExpiresAt)}`}
              />
            ) : null}
            {item.pendingRequest ? (
              <DetailCell
                styles={styles}
                label="Pending plan"
                value={`${item.pendingRequest.planTitle} · Rs ${item.pendingRequest.amountNpr}`}
              />
            ) : null}
          </View>

          <View style={styles.limitBox}>
            <Text style={styles.limitTitle}>Devices (account counts)</Text>
            <Text style={styles.limitHint}>
               Remove a device to free its claimed slots.
            </Text>
            {item.devices.length === 0 ? (
              <Text style={styles.limitHint}>No phones reported yet.</Text>
            ) : (
              item.devices.map((d) => (
                <View key={d.deviceId} style={styles.deviceRow}>
                  <View style={styles.deviceMain}>
                    <Text style={styles.deviceName} numberOfLines={2}>
                      {d.deviceLabel}
                    </Text>
                    <Text style={styles.deviceMeta}>
                      {d.accountCount} account{d.accountCount === 1 ? '' : 's'} ·{' '}
                      last seen {fmtDate(d.lastSeenAt)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      onForgetDevice(item, d.deviceId, d.deviceLabel)
                    }
                    disabled={busyId === `dev-${d.deviceId}`}
                    hitSlop={8}
                  >
                    <Text style={styles.deviceRemove}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={styles.limitBox}>
            <Text style={styles.limitTitle}>Set account limit</Text>
            <Text style={styles.limitHint}>
              Enter the max MeroShare accounts for this Google account (across all
              phones). Use 999999 for unlimited. Applies immediately.
            </Text>
            <View style={styles.limitCustomRow}>
              <TextInput
                style={styles.limitInput}
                keyboardType="number-pad"
                placeholder="Account limit (e.g. 2, 50, 999999)"
                placeholderTextColor={colors.textMuted}
                value={customMaxAccounts}
                onChangeText={setCustomMaxAccounts}
                editable={!limitBusy}
              />
              <Pressable
                style={[styles.limitApplyBtn, limitBusy && { opacity: 0.5 }]}
                disabled={limitBusy}
                onPress={() =>
                  onSetMaxAccounts(item, Number.parseInt(customMaxAccounts.trim(), 10))
                }
              >
                <Text style={styles.limitApplyText}>Apply</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.detailActions}>
            {item.accessLevel === 'pending' && item.pendingRequest ? (
              <>
                <ActionBtn
                  label="Approve"
                  color="#2E7D32"
                  disabled={busy}
                  onPress={() => void runUserAction(item, 'approve')}
                />
                <ActionBtn
                  label="Reject"
                  color="#EF6C00"
                  disabled={busy}
                  onPress={() => void runUserAction(item, 'reject')}
                />
              </>
            ) : null}
            {item.accessLevel === 'premium' ? (
              <ActionBtn
                label="Deactivate"
                color="#EF6C00"
                disabled={busy}
                onPress={() => void runUserAction(item, 'deactivate')}
              />
            ) : null}
            <ActionBtn
              label={item.isBlocked ? 'Unblock user' : 'Block user'}
              color={item.isBlocked ? '#2E7D32' : colors.danger}
              disabled={busy || busyId === `block-${item.id}`}
              onPress={() => onToggleBlockUser(item)}
            />
            <ActionBtn
              label="Clear subscription"
              color={colors.danger}
              disabled={busy}
              onPress={() =>
                Alert.alert('Clear subscription data?', item.email, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => void runUserAction(item, 'delete'),
                  },
                ])
              }
            />
            <ActionBtn
              label="Delete account"
              color={colors.danger}
              disabled={busy}
              onPress={() => onDeleteUserAccount(item)}
            />
          </View>
        </>
      );
    }

    if (detail.kind === 'feedback') {
      const item = detail.data;
      const fbBusy = busyId === item.id;
      return (
        <>
          <View style={styles.detailGrid}>
            <DetailCell styles={styles} label="Submitted" value={fmtDate(item.createdAt)} />
            <DetailCell styles={styles} label="Message" value={item.message} />
          </View>
          <View style={styles.detailActions}>
            {item.status !== 'read' ? (
              <ActionBtn
                label="Mark read"
                color={colors.primary}
                disabled={fbBusy}
                onPress={() => void runFeedbackAction(item, 'read')}
              />
            ) : null}
            {item.status !== 'resolved' ? (
              <ActionBtn
                label="Resolved"
                color="#2E7D32"
                disabled={fbBusy}
                onPress={() => void runFeedbackAction(item, 'resolved')}
              />
            ) : null}
            {item.status !== 'new' ? (
              <ActionBtn
                label="Re-open"
                color="#EF6C00"
                disabled={fbBusy}
                onPress={() => void runFeedbackAction(item, 'new')}
              />
            ) : null}
          </View>
        </>
      );
    }

    const item = detail.data;
    return (
      <>
        <View style={styles.detailGrid}>
          <DetailCell styles={styles} label="Plan" value={`${item.planTitle} · Rs ${item.amountNpr}`} />
          <DetailCell styles={styles} label="Status" value={item.status.toUpperCase()} />
          <DetailCell styles={styles} label="Requested" value={fmtDate(item.createdAt)} />
          {item.paymentNote ? (
            <DetailCell styles={styles} label="Payment note" value={item.paymentNote} />
          ) : null}
          {item.premiumActive ? (
            <DetailCell
              styles={styles}
              label="Premium until"
              value={fmtDate(item.premiumExpiresAt)}
            />
          ) : null}
        </View>
        <View style={styles.detailActions}>
          {item.status === 'pending' ? (
            <>
              <ActionBtn
                label="Approve"
                color="#2E7D32"
                disabled={busy}
                onPress={() => void runSubAction(item, 'approve')}
              />
              <ActionBtn
                label="Reject"
                color="#EF6C00"
                disabled={busy}
                onPress={() => void runSubAction(item, 'reject')}
              />
            </>
          ) : null}
          {item.premiumActive ? (
            <ActionBtn
              label="Deactivate"
              color="#EF6C00"
              disabled={busy}
              onPress={() => void runSubAction(item, 'deactivate')}
            />
          ) : null}
          <ActionBtn
            label="Clear data"
            color={colors.danger}
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
          />
        </View>
      </>
    );
  };

  const detailSheetMeta = useMemo(() => {
    if (!detail) return { title: '', subtitle: undefined as string | undefined };
    if (detail.kind === 'user') {
      return {
        title: detail.data.name || detail.data.email,
        subtitle: detail.data.email,
      };
    }
    if (detail.kind === 'feedback') {
      const item = detail.data;
      return {
        title: `${feedbackKindLabel(item.kind)} · ${item.status.toUpperCase()}`,
        subtitle: `${item.name || '—'} · ${item.email || 'no email'}`,
      };
    }
    const item = detail.data;
    return {
      title: item.userName || item.userEmail,
      subtitle: item.userEmail,
    };
  }, [detail]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.navigate('AdminSettings')}
            hitSlop={10}
          >
            <Ionicons name="settings-outline" size={rs(20)} color={colors.primary} />
          </Pressable>
          <Pressable onPress={refresh} hitSlop={10}>
            <Ionicons name="refresh" size={rs(20)} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => void onLogout()} hitSlop={10}>
            <Ionicons name="log-out-outline" size={rs(20)} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      {stats ? (
        <View style={styles.statsGrid}>
          <StatTile label="Users" value={stats.totalUsers} colors={colors} styles={styles} />
          <StatTile
            label="Pending"
            value={stats.pendingCount}
            colors={colors}
            styles={styles}
            accent={ALERT_RED}
            highlightAlert
          />
          <StatTile label="Premium" value={stats.activeCount} colors={colors} styles={styles} accent={colors.accentGreen} />
          <StatTile label="Feedback" value={stats.newFeedbackCount} colors={colors} styles={styles} accent="#7B1FA2" />
        </View>
      ) : null}

      <View style={styles.toolsRow}>
        <Pressable
          style={styles.toolTile}
          onPress={() => navigation.navigate('AdminSettings')}
        >
          <Ionicons name="qr-code-outline" size={rs(20)} color={colors.primary} />
          <Text style={styles.toolTileText} numberOfLines={2}>
            Payment
          </Text>
        </Pressable>
        <Pressable
          style={styles.toolTile}
          onPress={() => navigation.navigate('AdminTeam')}
        >
          <Ionicons name="people-outline" size={rs(20)} color={colors.primary} />
          <Text style={styles.toolTileText} numberOfLines={2}>
            Team
          </Text>
        </Pressable>
        <Pressable
          style={styles.toolTile}
          onPress={() => navigation.navigate('AdminMarketClosures')}
        >
          <Ionicons name="calendar-outline" size={rs(20)} color={colors.primary} />
          <Text style={styles.toolTileText} numberOfLines={2}>
            Closed days
          </Text>
        </Pressable>
        <Pressable
          style={styles.toolTile}
          onPress={() => navigation.navigate('AdminNotifications')}
        >
          <Ionicons name="notifications-outline" size={rs(20)} color={colors.primary} />
          <Text style={styles.toolTileText} numberOfLines={2}>
            Notify
          </Text>
        </Pressable>
        <Pressable
          style={styles.toolTile}
          onPress={() => navigation.navigate('AdminIpoIssues')}
        >
          <Ionicons name="trending-up-outline" size={rs(20)} color={colors.primary} />
          <Text style={styles.toolTileText} numberOfLines={2}>
            IPO Issues
          </Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {([
          {
            id: 'users' as const,
            label: `Users · ${stats?.totalUsers ?? 0}`,
            alertCount: 0,
          },
          {
            id: 'subscriptions' as const,
            label: `Requests · ${stats?.totalRequests ?? 0}`,
            alertCount: stats?.pendingCount ?? 0,
          },
          {
            id: 'feedback' as const,
            label: `Inbox · ${stats?.feedbackTotalCount ?? 0}`,
            alertCount: 0,
          },
        ]).map((t) => {
          const showAlert = t.alertCount > 0;
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={[
                styles.tabBtn,
                active && styles.tabBtnActive,
                showAlert && styles.tabBtnAlert,
                showAlert && active && styles.tabBtnAlertActive,
              ]}
              onPress={() => setTab(t.id)}
            >
              <Text
                style={[
                  styles.tabText,
                  active && styles.tabTextActive,
                  showAlert && active && styles.tabTextOnAlert,
                ]}
              >
                {t.label}
              </Text>
              {showAlert ? (
                <View
                  style={[
                    styles.tabAlertBadge,
                    active && styles.tabAlertBadgeOnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabAlertBadgeText,
                      active && styles.tabAlertBadgeTextOnActive,
                    ]}
                  >
                    {t.alertCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'users' ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search by email or name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filters}
      >
        {tab === 'users'
          ? (
            [
              {
                id: 'all' as const,
                label: `All · ${stats?.totalUsers ?? 0}`,
              },
              {
                id: 'pending' as const,
                label: `Pending · ${stats?.pendingUserCount ?? 0}`,
              },
              {
                id: 'premium' as const,
                label: `Premium · ${stats?.premiumUserCount ?? 0}`,
              },
              {
                id: 'free' as const,
                label: `Free · ${stats?.freeUserCount ?? 0}`,
              },
              {
                id: 'blocked' as const,
                label: `Blocked · ${stats?.blockedUserCount ?? 0}`,
              },
              {
                id: 'multi_device' as const,
                label: `Multi · ${stats?.multiDeviceUserCount ?? 0}`,
              },
            ]
          ).map((f) => (
              <Pressable
                key={f.id}
                style={[styles.chip, userFilter === f.id && styles.chipActive]}
                onPress={() => {
                  clearAdminListLegacyCache();
                  userCursorsRef.current = [null];
                  setUsersPage(1);
                  setUserFilter(f.id);
                }}
              >
                <Text
                  style={[styles.chipText, userFilter === f.id && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))
          : tab === 'subscriptions'
            ? (
              [
                {
                  id: 'pending' as const,
                  label: `Pending · ${stats?.pendingCount ?? 0}`,
                },
                {
                  id: 'approved' as const,
                  label: `Approved · ${stats?.approvedRequestCount ?? 0}`,
                },
                {
                  id: 'rejected' as const,
                  label: `Rejected · ${stats?.rejectedRequestCount ?? 0}`,
                },
                {
                  id: 'all' as const,
                  label: `All · ${stats?.totalRequests ?? 0}`,
                },
              ]
            ).map((f) => {
              const pendingAlerts = (stats?.pendingCount ?? 0) > 0;
              const isPendingChip = f.id === 'pending';
              return (
                <Pressable
                  key={f.id}
                  style={[
                    styles.chip,
                    subFilter === f.id && styles.chipActive,
                    isPendingChip && pendingAlerts && styles.chipAlert,
                    isPendingChip && pendingAlerts && subFilter === f.id && styles.chipAlertActive,
                  ]}
                  onPress={() => {
                    clearAdminListLegacyCache();
                    subCursorsRef.current = [null];
                    setSubsPage(1);
                    setSubFilter(f.id);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      subFilter === f.id && styles.chipTextActive,
                      isPendingChip && pendingAlerts && styles.chipAlertText,
                      isPendingChip &&
                        pendingAlerts &&
                        subFilter === f.id &&
                        styles.chipAlertTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })
            : (
              <>
                {(
                  [
                    {
                      id: 'new' as const,
                      label: `New · ${stats?.newFeedbackCount ?? 0}`,
                    },
                    {
                      id: 'read' as const,
                      label: `Read · ${stats?.feedbackReadCount ?? 0}`,
                    },
                    {
                      id: 'resolved' as const,
                      label: `Resolved · ${stats?.feedbackResolvedCount ?? 0}`,
                    },
                    {
                      id: 'all' as const,
                      label: `All · ${stats?.feedbackTotalCount ?? 0}`,
                    },
                  ]
                ).map((f) => (
                  <Pressable
                    key={f.id}
                    style={[styles.chip, feedbackFilter === f.id && styles.chipActive]}
                    onPress={() => setFeedbackFilter(f.id)}
                  >
                    <Text
                      style={[styles.chipText, feedbackFilter === f.id && styles.chipTextActive]}
                      numberOfLines={1}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
                {(['all', 'feedback', 'feature_request'] as FeedbackKindFilter[]).map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.chip, feedbackKind === f && styles.chipActive]}
                    onPress={() => setFeedbackKind(f)}
                  >
                    <Text
                      style={[styles.chipText, feedbackKind === f && styles.chipTextActive]}
                      numberOfLines={1}
                    >
                      {f === 'feature_request' ? 'features' : f}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
      </ScrollView>

      {loading && !users.length && !rows.length && !feedbackRows.length ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: rs(24) }} />
      ) : tab === 'users' ? (
        <View style={[styles.listSection, { paddingBottom: insets.bottom }]}>
          <FlatList
            style={styles.listFlex}
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              listLoading ? null : (
                <Text style={styles.empty}>No users match this filter.</Text>
              )
            }
            refreshing={listLoading}
            onRefresh={refresh}
            initialNumToRender={12}
            maxToRenderPerBatch={16}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
          />
          <PaginationBar
            page={usersMeta.page}
            totalPages={usersMeta.totalPages}
            totalCount={usersMeta.totalCount}
            hasMore={usersMeta.hasMore}
            disabled={listLoading}
            onPrev={() => goUsersPage(usersMeta.page - 1)}
            onNext={() => goUsersPage(usersMeta.page + 1)}
            colors={colors}
            styles={styles}
          />
        </View>
      ) : tab === 'subscriptions' ? (
        <View style={[styles.listSection, { paddingBottom: insets.bottom }]}>
          <FlatList
            style={styles.listFlex}
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={renderSub}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              listLoading ? null : (
                <Text style={styles.empty}>No requests in this filter.</Text>
              )
            }
            refreshing={listLoading}
            onRefresh={refresh}
            initialNumToRender={12}
            maxToRenderPerBatch={16}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
          />
          <PaginationBar
            page={subsMeta.page}
            totalPages={subsMeta.totalPages}
            totalCount={subsMeta.totalCount}
            hasMore={subsMeta.hasMore}
            disabled={listLoading}
            onPrev={() => goSubsPage(subsMeta.page - 1)}
            onNext={() => goSubsPage(subsMeta.page + 1)}
            colors={colors}
            styles={styles}
          />
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={feedbackRows}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedback}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            listLoading ? null : (
              <Text style={styles.empty}>No feedback in this filter.</Text>
            )
          }
          refreshing={listLoading}
          onRefresh={refresh}
        />
      )}

      <KeyboardSheetModal
        visible={detail != null}
        onClose={closeDetail}
        title={detailSheetMeta.title}
        subtitle={detailSheetMeta.subtitle}
        bottomInset={insets.bottom}
        showsVerticalScrollIndicator
        sheetStyle={{ backgroundColor: colors.surface }}
        titleStyle={{ color: colors.text }}
        subtitleStyle={{ color: colors.textSecondary }}
        handleStyle={{ backgroundColor: colors.border }}
        backdropStyle={{ backgroundColor: colors.overlay }}
        scrollContentStyle={styles.detailScrollContent}
        footer={
          <Pressable style={styles.modalClose} onPress={closeDetail}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        }
      >
        {renderDetailModal()}
        {detailLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: rs(12) }} />
        ) : null}
      </KeyboardSheetModal>
    </View>
  );
}

function StatTile({
  label,
  value,
  colors,
  styles,
  accent,
  highlightAlert = false,
}: {
  label: string;
  value: number;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  accent?: string;
  highlightAlert?: boolean;
}) {
  const showAlert = highlightAlert && value > 0;
  return (
    <View style={[styles.statTile, showAlert && styles.statTileAlert]}>
      <Text
        style={[
          styles.statValue,
          { color: showAlert ? ALERT_RED : accent ?? colors.primary },
        ]}
      >
        {value}
      </Text>
      <Text
        style={[styles.statLabel, showAlert && styles.statLabelAlert]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function PaginationBar({
  page,
  totalPages,
  totalCount,
  hasMore,
  disabled,
  onPrev,
  onNext,
  colors,
  styles,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
  disabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const canPrev = page > 1 && !disabled;
  const canNext = (hasMore || page < totalPages) && !disabled;
  return (
    <View style={styles.pagination}>
      <Pressable
        style={[styles.pageBtn, canPrev && styles.pageBtnActive, !canPrev && styles.pageBtnDisabled]}
        disabled={!canPrev}
        onPress={onPrev}
        accessibilityLabel="Previous page"
      >
        <Ionicons
          name="chevron-back"
          size={rs(18)}
          color={canPrev ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.pageBtnText, !canPrev && styles.pageBtnTextDisabled]}>
          Prev
        </Text>
      </Pressable>
      <View style={styles.pageMeta}>
        <Text style={styles.pageLabel}>
          Page {page} of {totalPages}
        </Text>
        <Text style={styles.pageCount}>{totalCount} total</Text>
      </View>
      <Pressable
        style={[styles.pageBtn, canNext && styles.pageBtnActive, !canNext && styles.pageBtnDisabled]}
        disabled={!canNext}
        onPress={onNext}
        accessibilityLabel="Next page"
      >
        <Text style={[styles.pageBtnText, !canNext && styles.pageBtnTextDisabled]}>
          Next
        </Text>
        <Ionicons
          name="chevron-forward"
          size={rs(18)}
          color={canNext ? colors.primary : colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

function DetailCell({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ActionBtn({
  label,
  color,
  disabled,
  onPress,
}: {
  label: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={{
        flex: 1,
        minWidth: '30%',
        backgroundColor: color,
        borderRadius: rs(10),
        paddingVertical: rs(12),
        alignItems: 'center',
        opacity: disabled ? 0.6 : 1,
      }}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: rs(12) }}>{label}</Text>
    </Pressable>
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
      paddingVertical: rs(10),
    },
    headerRight: { flexDirection: 'row', gap: rs(12), alignItems: 'center' },
    title: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    statsGrid: {
      flexDirection: 'row',
      gap: rs(8),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    statTile: {
      flex: 1,
      aspectRatio: 1,
      maxHeight: rs(72),
      backgroundColor: c.surface,
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(8),
      alignItems: 'center',
      justifyContent: 'center',
    },
    statValue: { fontWeight: '800', fontSize: rs(16) },
    statLabel: {
      color: c.textSecondary,
      fontSize: rs(9),
      marginTop: rs(2),
      textAlign: 'center',
    },
    statTileAlert: {
      backgroundColor: ALERT_RED_SOFT,
      borderColor: ALERT_RED,
      borderWidth: 1.5,
    },
    statLabelAlert: { color: ALERT_RED, fontWeight: '700' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: Platform.OS === 'ios' ? rs(10) : rs(6),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      padding: 0,
    },
    pagination: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
      backgroundColor: c.surface,
      elevation: 8,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: rs(6),
      shadowOffset: { width: 0, height: -2 },
    },
    pageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      paddingHorizontal: rs(10),
      paddingVertical: rs(10),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.bg,
      minWidth: rs(72),
      justifyContent: 'center',
    },
    pageBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    pageBtnDisabled: { opacity: 0.45 },
    pageBtnText: { color: c.primary, fontWeight: '800', fontSize: rs(11) },
    pageBtnTextDisabled: { color: c.textMuted },
    pageMeta: { alignItems: 'center', flex: 1 },
    pageLabel: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    pageCount: { color: c.textSecondary, fontSize: rs(10), marginTop: rs(2) },
    listSection: { flex: 1, minHeight: 0 },
    toolsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      paddingHorizontal: rs(16),
      marginBottom: rs(10),
    },
    toolTile: {
      flexGrow: 1,
      flexBasis: '22%',
      minWidth: rs(72),
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(4),
      paddingVertical: rs(10),
      paddingHorizontal: rs(4),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      minHeight: rs(64),
    },
    toolTileText: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(11),
      textAlign: 'center',
    },
    paymentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      marginHorizontal: rs(16),
      marginBottom: rs(12),
      padding: rs(14),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    paymentCardIcon: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(10),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    paymentCardBody: { flex: 1 },
    paymentCardTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    paymentCardSub: {
      color: c.textSecondary,
      fontSize: rs(11),
      lineHeight: rs(16),
      marginTop: rs(2),
    },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      borderRadius: rs(10),
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      backgroundColor: c.surface,
    },
    tabBtnActive: { backgroundColor: c.fab },
    tabBtnAlert: {
      backgroundColor: ALERT_RED_SOFT,
    },
    tabBtnAlertActive: {
      backgroundColor: ALERT_RED,
    },
    tabAlertBadge: {
      minWidth: rs(18),
      height: rs(18),
      paddingHorizontal: rs(5),
      borderRadius: rs(9),
      backgroundColor: ALERT_RED,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabAlertBadgeText: {
      color: '#fff',
      fontSize: rs(10),
      fontWeight: '800',
      lineHeight: rs(12),
    },
    tabAlertBadgeOnActive: { backgroundColor: '#fff' },
    tabAlertBadgeTextOnActive: { color: ALERT_RED },
    tabText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(12) },
    tabTextActive: { color: c.fabIcon },
    tabTextOnAlert: { color: '#fff' },
    filtersScroll: {
      flexGrow: 0,
      marginBottom: rs(8),
    },
    filters: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(16),
    },
    chip: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(999),
      paddingHorizontal: rs(10),
      paddingVertical: rs(5),
      flexShrink: 0,
    },
    chipActive: { backgroundColor: c.primarySoft, borderColor: c.primary },
    chipAlert: {
      backgroundColor: ALERT_RED_SOFT,
      borderColor: ALERT_RED,
    },
    chipAlertActive: {
      backgroundColor: ALERT_RED,
      borderColor: ALERT_RED,
    },
    chipText: { color: c.textSecondary, fontSize: rs(10), fontWeight: '600' },
    chipTextActive: { color: c.primary, fontWeight: '800' },
    chipAlertText: { color: ALERT_RED, fontWeight: '800' },
    chipAlertTextActive: { color: '#fff' },
    listFlex: { flex: 1 },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(24) },
    compactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      paddingVertical: rs(12),
      paddingHorizontal: rs(4),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    avatar: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontWeight: '800', fontSize: rs(13) },
    rowMain: { flex: 1, minWidth: 0 },
    rowTitle: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    rowSub: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(2) },
    badge: {
      borderRadius: rs(999),
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
    },
    badgeText: { fontSize: rs(10), fontWeight: '800' },
    quickApprove: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      backgroundColor: '#2E7D32',
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailScrollContent: {
      paddingBottom: rs(32),
    },
    modalClose: {
      alignItems: 'center',
      paddingVertical: rs(12),
    },
    detailGrid: { marginTop: rs(4) },
    detailCell: { marginBottom: rs(10) },
    detailLabel: {
      color: c.textMuted,
      fontSize: rs(10),
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    detailValue: { color: c.text, fontSize: rs(13), marginTop: rs(3) },
    detailActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginTop: rs(16),
    },
    limitBox: {
      marginTop: rs(14),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      gap: rs(8),
    },
    limitTitle: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    limitHint: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(16),
    },
    deviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingVertical: rs(8),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    deviceMain: { flex: 1, minWidth: 0 },
    deviceName: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    deviceMeta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    deviceRemove: { color: c.danger, fontWeight: '800', fontSize: rs(12) },
    limitCustomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    limitInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      color: c.text,
      fontSize: rs(13),
      backgroundColor: c.bg,
    },
    limitApplyBtn: {
      backgroundColor: c.primary,
      borderRadius: rs(10),
      paddingHorizontal: rs(14),
      paddingVertical: rs(10),
    },
    limitApplyText: { color: '#fff', fontWeight: '800', fontSize: rs(13) },
    empty: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(24),
      fontSize: rs(13),
    },
    modalCloseText: { color: c.primary, fontWeight: '700', fontSize: rs(14) },
  });
}
