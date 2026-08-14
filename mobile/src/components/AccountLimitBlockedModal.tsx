import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { SlotStatus } from '../services/accountSlots';
import { rs } from '../utils/responsive';

function formatWait(totalSeconds: number): string {
  const secs = Math.max(0, totalSeconds);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Props = {
  visible: boolean;
  status: SlotStatus | null;
  onClose: () => void;
  onUpgrade?: () => void;
};

export function AccountLimitBlockedModal({
  visible,
  status,
  onClose,
  onUpgrade,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const initialSeconds = status?.retryAfterSeconds ?? 0;
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (!visible || !status) return;
    setSecondsLeft(status.retryAfterSeconds);
  }, [visible, status]);

  useEffect(() => {
    if (!visible || !status || status.retryAfterSeconds <= 0) return;
    if (status.blockReason !== 'waiting_stale_release') return;
    const endAt = Date.now() + status.retryAfterSeconds * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [visible, status]);

  if (!status) return null;

  const waitingStale = status.blockReason === 'waiting_stale_release';
  const staleMins = status.staleReleaseMinutes || 20;
  const otherDevices = status.devices.filter(
    (d) => !d.isThisDevice && d.accountCount > 0,
  );
  const timerDone = waitingStale && secondsLeft <= 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <Ionicons
              name="phone-portrait-outline"
              size={rs(28)}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>Can't add account on this phone</Text>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.lead}>
              {waitingStale
                ? `Your Google account already has ${status.claimedTotal} of ${status.maxAccounts} MeroShare accounts saved across all phones. Another phone is still holding those slots.`
                : `Your plan allows ${status.maxAccounts} accounts in total on this Google account (already saved: ${status.claimedTotal}).`}
            </Text>

            {waitingStale ? (
              <Text style={styles.reason}>
                If you removed the app on another phone, those slots are released
                automatically after it has been offline for {staleMins} minutes.
                You do not need to contact admin.
              </Text>
            ) : (
              <Text style={styles.reason}>
                Delete an account you no longer need on any phone, or upgrade your
                plan for a higher limit.
              </Text>
            )}

            {otherDevices.length > 0 ? (
              <View style={styles.deviceBox}>
                <Text style={styles.deviceBoxTitle}>Other phones on this account</Text>
                {otherDevices.map((d) => (
                  <View key={d.deviceId} style={styles.deviceRow}>
                    <Text style={styles.deviceLabel} numberOfLines={2}>
                      {d.deviceLabel}
                    </Text>
                    <Text style={styles.deviceCount}>
                      {d.accountCount} account{d.accountCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {waitingStale ? (
              <View style={styles.timerBox}>
                <Text style={styles.timerLabel}>
                  {timerDone
                    ? 'Slots may be free now'
                    : 'Estimated time until slots may free up'}
                </Text>
                <Text style={styles.timerValue}>
                  {timerDone ? 'Try again' : formatWait(secondsLeft)}
                </Text>
                {!timerDone ? (
                  <Text style={styles.timerHint}>
                    Keep this app open or try adding again after the timer ends.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.statsRow}>
              <Text style={styles.stat}>
                This phone: {status.thisDeviceCount}
              </Text>
              <Text style={styles.stat}>
                Other phones: {status.otherDevicesTotal}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            {onUpgrade ? (
              <Pressable
                style={styles.btnSecondary}
                onPress={() => {
                  onClose();
                  onUpgrade();
                }}
              >
                <Text style={styles.btnSecondaryText}>Upgrade plan</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.btnPrimary} onPress={onClose}>
              <Text style={styles.btnPrimaryText}>
                {timerDone && waitingStale ? 'Try again' : 'OK'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function makeStyles(
  colors: import('../theme/colors').ThemeColors,
  isDark: boolean,
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: rs(20),
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: rs(16),
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconRow: {
      alignItems: 'center',
      paddingTop: rs(20),
    },
    title: {
      fontSize: rs(18),
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      paddingHorizontal: rs(20),
      paddingTop: rs(8),
      paddingBottom: rs(4),
    },
    bodyScroll: {
      maxHeight: rs(360),
    },
    bodyContent: {
      paddingHorizontal: rs(20),
      paddingBottom: rs(8),
    },
    lead: {
      fontSize: rs(14),
      lineHeight: rs(20),
      color: colors.text,
      marginTop: rs(8),
    },
    reason: {
      fontSize: rs(13),
      lineHeight: rs(19),
      color: colors.textSecondary,
      marginTop: rs(10),
    },
    deviceBox: {
      marginTop: rs(14),
      padding: rs(12),
      borderRadius: rs(10),
      backgroundColor: isDark ? colors.surfaceAlt : colors.primarySoft,
    },
    deviceBoxTitle: {
      fontSize: rs(12),
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: rs(8),
    },
    deviceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: rs(8),
      paddingVertical: rs(4),
    },
    deviceLabel: {
      flex: 1,
      fontSize: rs(13),
      color: colors.text,
    },
    deviceCount: {
      fontSize: rs(13),
      fontWeight: '600',
      color: colors.primary,
    },
    timerBox: {
      marginTop: rs(16),
      alignItems: 'center',
      paddingVertical: rs(16),
      paddingHorizontal: rs(12),
      borderRadius: rs(12),
      backgroundColor: isDark ? colors.bgElevated : colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    timerLabel: {
      fontSize: rs(12),
      color: colors.textSecondary,
      textAlign: 'center',
    },
    timerValue: {
      fontSize: rs(36),
      fontWeight: '700',
      color: colors.primary,
      marginTop: rs(6),
      fontVariant: ['tabular-nums'],
    },
    timerHint: {
      fontSize: rs(11),
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: rs(8),
      lineHeight: rs(16),
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: rs(14),
      paddingTop: rs(10),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderMuted,
    },
    stat: {
      fontSize: rs(12),
      color: colors.textMuted,
    },
    actions: {
      flexDirection: 'row',
      gap: rs(10),
      padding: rs(16),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderMuted,
    },
    btnPrimary: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: rs(10),
      paddingVertical: rs(12),
      alignItems: 'center',
    },
    btnPrimaryText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: rs(15),
    },
    btnSecondary: {
      flex: 1,
      borderRadius: rs(10),
      paddingVertical: rs(12),
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    btnSecondaryText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: rs(15),
    },
  });
}
