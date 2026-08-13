import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
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
  deactivateUserPremium,
  deleteUserSubscription,
  fetchAdminFeedback,
  fetchAdminStats,
  fetchAdminSubscriptions,
  fetchAdminUsers,
  rejectSubscription,
  setAdminUserMaxAccounts,
  forgetAdminUserDevice,
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

type Tab = 'users' | 'subscriptions' | 'feedback';
type SubFilter = 'all' | 'pending' | 'approved' | 'rejected';
type UserFilter = 'all' | 'free' | 'pending' | 'premium';
type FeedbackFilter = 'new' | 'read' | 'resolved' | 'all';
type FeedbackKindFilter = 'all' | 'feedback' | 'feature_request';

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const [customMaxAccounts, setCustomMaxAccounts] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const detailScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const load = useCallback(
    async (
      adminToken: string,
      nextTab: Tab,
      nextSubFilter: SubFilter,
      nextUserFilter: UserFilter,
      nextFeedbackFilter: FeedbackFilter,
      nextFeedbackKind: FeedbackKindFilter,
    ) => {
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
        } else if (nextTab === 'subscriptions') {
          const list = await fetchAdminSubscriptions(
            adminToken,
            nextSubFilter === 'all' ? undefined : nextSubFilter,
          );
          setRows(list);
        } else {
          const list = await fetchAdminFeedback(adminToken, {
            status: nextFeedbackFilter,
            kind: nextFeedbackKind,
          });
          setFeedbackRows(list);
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
      await load(t, tab, subFilter, userFilter, feedbackFilter, feedbackKind);
    })();
  }, [tab, subFilter, userFilter, feedbackFilter, feedbackKind, load, navigation]);

  const onLogout = async () => {
    await clearAdminToken();
    navigation.replace('AdminLogin');
  };

  const refresh = () =>
    token &&
    void load(token, tab, subFilter, userFilter, feedbackFilter, feedbackKind);

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
      await load(token, tab, subFilter, userFilter, feedbackFilter, feedbackKind);
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
      await load(token, tab, subFilter, userFilter, feedbackFilter, feedbackKind);
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
      await load(token, tab, subFilter, userFilter, feedbackFilter, feedbackKind);
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
    const tint = accessColor(item.accessLevel, colors);
    const busy = busyId === item.id;
    return (
      <Pressable
        style={styles.compactRow}
        onPress={() => {
          setCustomMaxAccounts('');
          setDetail({ kind: 'user', data: item });
        }}
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
            {accessLabel(item.accessLevel)}
          </Text>
        </View>
        {item.accessLevel === 'pending' && item.pendingRequest ? (
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
      const limitPresets = [50, 100, 200, 500, 999999];
      const limitLabel =
        item.maxAccounts >= 999999 ? 'Unlimited' : `${item.maxAccounts} accounts`;
      return (
        <>
          <Text style={styles.detailName}>{item.name || '—'}</Text>
          <Text style={styles.detailEmail}>{item.email}</Text>
          <View style={styles.detailGrid}>
            <DetailCell styles={styles} label="Status" value={accessLabel(item.accessLevel)} />
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
              Same Google account on multiple phones. 50+50+50+4 = 154 of 200 is
              OK. 200+200+200 is over the plan. Remove a device to free its
              claimed slots.
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
              Premium default is 50. Raise after offline payment, or set Unlimited. Applies immediately.
            </Text>
            <View style={styles.limitChips}>
              {limitPresets.map((n) => (
                <Pressable
                  key={n}
                  style={[
                    styles.limitChip,
                    item.maxAccounts === n && styles.limitChipActive,
                  ]}
                  disabled={limitBusy}
                  onPress={() => onSetMaxAccounts(item, n)}
                >
                  <Text
                    style={[
                      styles.limitChipText,
                      item.maxAccounts === n && styles.limitChipTextActive,
                    ]}
                  >
                    {n >= 999999 ? 'Unlimited' : n}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.limitCustomRow}>
              <TextInput
                style={styles.limitInput}
                keyboardType="number-pad"
                placeholder="Custom (any number)"
                placeholderTextColor={colors.textMuted}
                value={customMaxAccounts}
                onChangeText={setCustomMaxAccounts}
                editable={!limitBusy}
                onFocus={() => {
                  // Wait for keyboard + sheet lift, then reveal the custom field.
                  setTimeout(() => {
                    detailScrollRef.current?.scrollToEnd({ animated: true });
                  }, Platform.OS === 'ios' ? 280 : 180);
                }}
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
              label="Clear data"
              color={colors.danger}
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
          <Text style={styles.detailName}>
            {feedbackKindLabel(item.kind)} · {item.status.toUpperCase()}
          </Text>
          <Text style={styles.detailEmail}>
            {item.name || '—'} · {item.email || 'no email'}
          </Text>
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
        <Text style={styles.detailName}>{item.userName || item.userEmail}</Text>
        <Text style={styles.detailEmail}>{item.userEmail}</Text>
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
          <StatTile label="Users" value={stats.totalUsers} colors={colors} />
          <StatTile label="Pending" value={stats.pendingCount} colors={colors} accent="#F9A825" />
          <StatTile label="Premium" value={stats.activeCount} colors={colors} accent={colors.accentGreen} />
          <StatTile label="Feedback" value={stats.newFeedbackCount} colors={colors} accent="#7B1FA2" />
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
          onPress={() => navigation.navigate('AdminIpoIssues')}
        >
          <Ionicons name="trending-up-outline" size={rs(20)} color={colors.primary} />
          <Text style={styles.toolTileText} numberOfLines={2}>
            IPO Issues
          </Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(['users', 'subscriptions', 'feedback'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'users' ? 'Users' : t === 'subscriptions' ? 'Requests' : 'Inbox'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.filters}>
        {tab === 'users'
          ? (['all', 'pending', 'premium', 'free'] as UserFilter[]).map((f) => (
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
          : tab === 'subscriptions'
            ? (['pending', 'approved', 'rejected', 'all'] as SubFilter[]).map((f) => (
                <Pressable
                  key={f}
                  style={[styles.chip, subFilter === f && styles.chipActive]}
                  onPress={() => setSubFilter(f)}
                >
                  <Text style={[styles.chipText, subFilter === f && styles.chipTextActive]}>
                    {f}
                  </Text>
                </Pressable>
              ))
            : (
              <>
                {(['new', 'read', 'resolved', 'all'] as FeedbackFilter[]).map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.chip, feedbackFilter === f && styles.chipActive]}
                    onPress={() => setFeedbackFilter(f)}
                  >
                    <Text
                      style={[styles.chipText, feedbackFilter === f && styles.chipTextActive]}
                    >
                      {f}
                    </Text>
                  </Pressable>
                ))}
                {(['all', 'feedback', 'feature_request'] as FeedbackKindFilter[]).map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.chip, feedbackKind === f && styles.chipActive]}
                    onPress={() => setFeedbackKind(f)}
                  >
                    <Text style={[styles.chipText, feedbackKind === f && styles.chipTextActive]}>
                      {f === 'feature_request' ? 'features' : f}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: rs(24) }} />
      ) : tab === 'users' ? (
        <FlatList
          style={styles.listFlex}
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
      ) : tab === 'subscriptions' ? (
        <FlatList
          style={styles.listFlex}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderSub}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No requests in this filter.</Text>
          }
          refreshing={loading}
          onRefresh={refresh}
        />
      ) : (
        <FlatList
          style={styles.listFlex}
          data={feedbackRows}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedback}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No feedback in this filter.</Text>
          }
          refreshing={loading}
          onRefresh={refresh}
        />
      )}

      <Modal visible={detail != null} animationType="slide" transparent onRequestClose={closeDetail}>
        <Pressable style={styles.modalBackdrop} onPress={closeDetail} />
        <View
          style={[
            styles.modalSheet,
            {
              bottom: keyboardHeight,
              paddingBottom: Math.max(insets.bottom, rs(16)),
              maxHeight: keyboardHeight > 0 ? '88%' : '78%',
            },
          ]}
        >
          <View style={styles.modalGrab} />
          <ScrollView
            ref={detailScrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
          >
            {renderDetailModal()}
            <Pressable style={styles.modalClose} onPress={closeDetail}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function StatTile({
  label,
  value,
  colors,
  accent,
}: {
  label: string;
  value: number;
  colors: ThemeColors;
  accent?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: '46%', backgroundColor: colors.surface, borderRadius: rs(12), borderWidth: 1, borderColor: colors.borderMuted, padding: rs(12) }}>
      <Text style={{ color: accent ?? colors.primary, fontWeight: '800', fontSize: rs(20) }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: rs(11), marginTop: rs(2) }}>{label}</Text>
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
      flexWrap: 'wrap',
      gap: rs(10),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
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
      paddingVertical: rs(10),
      alignItems: 'center',
      backgroundColor: c.surface,
    },
    tabBtnActive: { backgroundColor: c.fab },
    tabText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(13) },
    tabTextActive: { color: c.fabIcon },
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
      paddingVertical: rs(5),
    },
    chipActive: { backgroundColor: c.primarySoft, borderColor: c.primary },
    chipText: { color: c.textSecondary, fontSize: rs(11), textTransform: 'capitalize' },
    chipTextActive: { color: c.primary, fontWeight: '700' },
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
    empty: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(24),
      fontSize: rs(13),
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    modalSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(20),
      paddingTop: rs(8),
      maxHeight: '78%',
    },
    modalScrollContent: {
      paddingBottom: rs(8),
    },
    modalGrab: {
      alignSelf: 'center',
      width: rs(36),
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: c.border,
      marginBottom: rs(16),
    },
    detailName: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    detailEmail: { color: c.textSecondary, fontSize: rs(13), marginTop: rs(4) },
    detailGrid: { marginTop: rs(16) },
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
    limitChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
    },
    limitChip: {
      minWidth: rs(48),
      paddingVertical: rs(8),
      paddingHorizontal: rs(12),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      alignItems: 'center',
      backgroundColor: c.bg,
    },
    limitChipActive: {
      borderColor: c.primary,
      backgroundColor: c.primary,
    },
    limitChipText: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    limitChipTextActive: { color: '#fff' },
    limitCustomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginTop: rs(4),
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
    modalClose: {
      marginTop: rs(16),
      alignItems: 'center',
      paddingVertical: rs(12),
    },
    modalCloseText: { color: c.primary, fontWeight: '700', fontSize: rs(14) },
  });
}
