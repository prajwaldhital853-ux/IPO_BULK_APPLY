import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import { loadAdminToken } from '../services/admin/adminTokenStorage';
import {
  fetchAdminNotificationHistory,
  fetchAdminNotificationScreens,
  fetchAdminNotificationAudiencePreview,
  sendAdminNotification,
  type AdminNotificationHistoryRow,
  type AdminNotificationRedirectScreen,
} from '../services/admin/adminApi';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

type Audience = 'free' | 'premium' | 'all';

const AUDIENCE_OPTIONS: { id: Audience; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'premium', label: 'Premium' },
  { id: 'all', label: 'Both' },
];

function audienceLabel(id: string): string {
  if (id === 'premium') return 'Premium';
  if (id === 'all') return 'Both';
  return 'Free';
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function AdminNotificationsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [screens, setScreens] = useState<AdminNotificationRedirectScreen[]>([]);
  const [history, setHistory] = useState<AdminNotificationHistoryRow[]>([]);
  const [deviceCount, setDeviceCount] = useState(0);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [redirectScreen, setRedirectScreen] = useState('Home');
  const [symbol, setSymbol] = useState('');
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);

  const selectedScreen = screens.find((s) => s.id === redirectScreen);
  const needsSymbol = selectedScreen?.needsSymbol ?? false;

  const loadMeta = useCallback(async (adminToken: string) => {
    setLoading(true);
    try {
      const [screenRows, historyRows, preview] = await Promise.all([
        fetchAdminNotificationScreens(adminToken),
        fetchAdminNotificationHistory(adminToken),
        fetchAdminNotificationAudiencePreview(adminToken, 'all'),
      ]);
      setScreens(screenRows);
      setHistory(historyRows);
      setDeviceCount(preview.deviceCount);
      if (screenRows.length > 0 && !screenRows.some((s) => s.id === redirectScreen)) {
        setRedirectScreen(screenRows[0].id);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, [redirectScreen]);

  const refreshAudienceCount = useCallback(
    async (adminToken: string, nextAudience: Audience) => {
      try {
        const preview = await fetchAdminNotificationAudiencePreview(
          adminToken,
          nextAudience,
        );
        setDeviceCount(preview.deviceCount);
      } catch {
        setDeviceCount(0);
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
      await loadMeta(t);
    })();
  }, [loadMeta, navigation]);

  useEffect(() => {
    if (!token) return;
    void refreshAudienceCount(token, audience);
  }, [audience, refreshAudienceCount, token]);

  const onSend = () => {
    if (!token) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      Alert.alert('Missing fields', 'Title and message are required.');
      return;
    }
    if (needsSymbol && !symbol.trim()) {
      Alert.alert('Symbol required', 'Enter a stock symbol for this redirect page.');
      return;
    }

    Alert.alert(
      'Send notification',
      `Send to ${deviceCount} device(s) (${audienceLabel(audience)} users)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSending(true);
              try {
                const result = await sendAdminNotification(token, {
                  title: trimmedTitle,
                  body: trimmedBody,
                  audience,
                  redirectScreen,
                  redirectSymbol: needsSymbol ? symbol.trim().toUpperCase() : null,
                });
                Alert.alert(
                  'Sent',
                  `Delivered to ${result.sentCount ?? result.tokenCount ?? 0} device(s).`,
                );
                setTitle('');
                setBody('');
                setSymbol('');
                const historyRows = await fetchAdminNotificationHistory(token);
                setHistory(historyRows);
              } catch (e) {
                Alert.alert('Send failed', e instanceof Error ? e.message : 'Could not send');
              } finally {
                setSending(false);
              }
            })();
          },
        },
      ],
    );
  };

  const screenLabel =
    selectedScreen?.label ?? redirectScreen.replace(/([A-Z])/g, ' $1').trim();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: rs(22) }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>Compose</Text>
            <Text style={styles.hint}>
              Sends a push to user phones. Tapping opens the selected page.
            </Text>

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Notification title"
              placeholderTextColor={colors.textMuted}
              maxLength={200}
            />

            <Text style={styles.fieldLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={body}
              onChangeText={setBody}
              placeholder="Write your message here…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
            />

            <Text style={styles.fieldLabel}>Send to</Text>
            <View style={styles.segmentRow}>
              {AUDIENCE_OPTIONS.map((opt) => {
                const active = audience === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => setAudience(opt.id)}
                  >
                    <Text
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.preview}>
              Will reach <Text style={styles.previewStrong}>{deviceCount}</Text> device(s)
            </Text>

            <Text style={styles.fieldLabel}>Open page when tapped</Text>
            <Pressable
              style={styles.pickerBtn}
              onPress={() => setScreenPickerOpen(true)}
            >
              <Text style={styles.pickerBtnText}>{screenLabel}</Text>
              <Ionicons name="chevron-down" size={rs(18)} color={colors.textSecondary} />
            </Pressable>

            {needsSymbol ? (
              <>
                <Text style={styles.fieldLabel}>Stock symbol</Text>
                <TextInput
                  style={styles.input}
                  value={symbol}
                  onChangeText={setSymbol}
                  placeholder="e.g. NABIL"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  maxLength={32}
                />
              </>
            ) : null}

            <Pressable
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={onSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="notifications" size={rs(18)} color="#fff" />
                  <Text style={styles.sendBtnText}>Send notification</Text>
                </>
              )}
            </Pressable>

            <Text style={[styles.sectionLabel, { marginTop: rs(20) }]}>
              Last 5 sent
            </Text>
            {history.length === 0 ? (
              <Text style={styles.emptyHistory}>No notifications sent yet.</Text>
            ) : (
              history.map((row) => (
                <View key={row.id} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.historyMeta}>{fmtWhen(row.createdAt)}</Text>
                  </View>
                  <Text style={styles.historyBody} numberOfLines={2}>
                    {row.body}
                  </Text>
                  <Text style={styles.historyFoot}>
                    {audienceLabel(row.audience)} · {row.sentCount}/{row.tokenCount} sent ·{' '}
                    {row.redirectScreen}
                    {row.redirectSymbol ? ` (${row.redirectSymbol})` : ''}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={screenPickerOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setScreenPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Open page</Text>
            <FlatList
              data={screens}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setRedirectScreen(item.id);
                    setScreenPickerOpen(false);
                    if (!item.needsSymbol) setSymbol('');
                  }}
                >
                  <Text style={styles.modalRowText}>{item.label}</Text>
                  {redirectScreen === item.id ? (
                    <Ionicons name="checkmark" size={rs(18)} color={colors.primary} />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingBottom: rs(12),
    },
    title: { color: c.text, fontSize: rs(18), fontWeight: '800' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingHorizontal: rs(16), paddingBottom: rs(32) },
    sectionLabel: {
      color: c.text,
      fontSize: rs(15),
      fontWeight: '800',
      marginBottom: rs(6),
    },
    hint: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(18),
      marginBottom: rs(14),
    },
    fieldLabel: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '700',
      marginBottom: rs(6),
      marginTop: rs(10),
    },
    input: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      color: c.text,
      fontSize: rs(14),
    },
    textArea: { minHeight: rs(96), textAlignVertical: 'top' },
    segmentRow: { flexDirection: 'row', gap: rs(8) },
    segment: {
      flex: 1,
      paddingVertical: rs(10),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.borderMuted,
      alignItems: 'center',
      backgroundColor: c.surface,
    },
    segmentActive: {
      borderColor: c.primary,
      backgroundColor: `${c.primary}18`,
    },
    segmentText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(12) },
    segmentTextActive: { color: c.primary },
    preview: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(8) },
    previewStrong: { color: c.text, fontWeight: '800' },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      borderRadius: rs(12),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
    pickerBtnText: { color: c.text, fontSize: rs(14), fontWeight: '600' },
    sendBtn: {
      marginTop: rs(18),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: c.primary,
      borderRadius: rs(12),
      paddingVertical: rs(14),
    },
    sendBtnDisabled: { opacity: 0.7 },
    sendBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(15) },
    emptyHistory: { color: c.textMuted, fontSize: rs(13), marginTop: rs(4) },
    historyCard: {
      marginTop: rs(10),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
    },
    historyTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: rs(8),
      marginBottom: rs(4),
    },
    historyTitle: { flex: 1, color: c.text, fontWeight: '800', fontSize: rs(13) },
    historyMeta: { color: c.textMuted, fontSize: rs(11) },
    historyBody: { color: c.textSecondary, fontSize: rs(12), lineHeight: rs(17) },
    historyFoot: { color: c.textMuted, fontSize: rs(11), marginTop: rs(6) },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      maxHeight: '70%',
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(16),
      borderTopRightRadius: rs(16),
      paddingTop: rs(14),
      paddingBottom: rs(24),
    },
    modalTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(14),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    modalRowText: { color: c.text, fontSize: rs(14), fontWeight: '600' },
  });
}
