import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import { maskBoid, resolveBoidSync } from '../utils/boid';
import {
  daysUntilMajority,
  formatCountdownLabel,
  formatDobDisplay,
  isMinorAccount,
} from '../utils/minorAccount';
import { rs } from '../utils/responsive';

const ACTION_BLUE = '#2F80ED';
const ACTION_GREEN = '#2E9E5B';

/** Keep first 4 + last 4, mask the middle so account numbers stay private. */
function maskAccountNumber(raw: string): string {
  const s = raw.trim();
  if (s.length <= 8) return s;
  const head = s.slice(0, 4);
  const tail = s.slice(-4);
  return `${head}${'*'.repeat(s.length - 8)}${tail}`;
}

type Props = {
  account: AccountMeta | null;
  index: number;
  visible: boolean;
  onClose: () => void;
  onOpen: (account: AccountMeta) => void;
  onEdit: (account: AccountMeta) => void;
  onDelete: (account: AccountMeta) => void;
};

export function AccountDetailSheet({
  account,
  index,
  visible,
  onClose,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [copied, setCopied] = useState<'boid' | 'acc' | null>(null);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!account) return null;

  const boid = resolveBoidSync(account) ?? account.demat?.trim() ?? null;
  const boidDisplay = boid ? maskBoid(boid) : 'Not available yet';
  const accountNumber = account.accountNumber?.trim() || null;
  const accDisplay = accountNumber ? maskAccountNumber(accountNumber) : '—';

  const copyValue = async (
    which: 'boid' | 'acc',
    value: string | null,
    label: string,
  ) => {
    if (!value) {
      Alert.alert(
        `${label} unavailable`,
        which === 'boid'
          ? 'This account has no 16-digit BOID yet. Re-save the account with DP code, or open MeroShare once.'
          : 'No linked bank account number saved yet. Edit the account and re-verify while logged in to fetch it.',
      );
      return;
    }
    await Clipboard.setStringAsync(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close account details"
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, rs(16)) }]}
        >
        <View style={styles.grabber} />
        <View style={styles.headSection}>
          <View style={styles.headRow}>
            <View style={styles.indexBadge}>
              <Text style={styles.indexText}>{index + 1}</Text>
            </View>
            <View style={styles.headBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{account.name.toUpperCase()}</Text>
                {account.verified ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={rs(14)}
                    color={colors.accentGreen}
                  />
                ) : null}
                {isMinorAccount(account) ? (
                  <View style={styles.minorBadge}>
                    <Text style={styles.minorBadgeText}>Minor</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.username}>Username : {account.username}</Text>
            </View>
          </View>
          <View style={styles.headDivider} />
        </View>

        <View style={styles.detailsBody}>
        {isMinorAccount(account) ? (
          <>
            <View style={styles.fieldRow}>
              <Ionicons
                name="hourglass-outline"
                size={rs(16)}
                color={colors.textMuted}
                style={styles.fieldIcon}
              />
              <Text style={styles.fieldLabel}>Left</Text>
              <Text style={styles.fieldValue} numberOfLines={2}>
                {formatCountdownLabel(daysUntilMajority(account.dateOfBirth))}
              </Text>
            </View>
            <View style={styles.fieldRow}>
              <Ionicons
                name="calendar-outline"
                size={rs(16)}
                color={colors.textMuted}
                style={styles.fieldIcon}
              />
              <Text style={styles.fieldLabel}>DOB</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {formatDobDisplay(account.dateOfBirth)}
              </Text>
            </View>
            <View style={styles.fieldRow}>
              <Ionicons
                name="people-outline"
                size={rs(16)}
                color={colors.textMuted}
                style={styles.fieldIcon}
              />
              <Text style={styles.fieldLabel}>Guard.</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {account.guardianName?.trim() || '—'}
              </Text>
            </View>
          </>
        ) : null}

        <View style={styles.fieldRow}>
          <MaterialCommunityIcons
            name="card-account-details-outline"
            size={rs(16)}
            color={colors.textMuted}
            style={styles.fieldIcon}
          />
          <Text style={styles.fieldLabel}>BOID</Text>
          <View style={styles.valueCopyRow}>
            <Text style={styles.fieldValue} numberOfLines={1}>
              {boidDisplay}
            </Text>
            <Pressable
              hitSlop={8}
              style={styles.copyBtn}
              onPress={() => void copyValue('boid', boid, 'BOID')}
            >
              <Ionicons
                name={copied === 'boid' ? 'checkmark' : 'copy-outline'}
                size={rs(15)}
                color={copied === 'boid' ? colors.accentGreen : colors.primary}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <MaterialCommunityIcons
            name="bank-outline"
            size={rs(16)}
            color={colors.textMuted}
            style={styles.fieldIcon}
          />
          <Text style={styles.fieldLabel}>Bank</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>
            {account.bankName || account.dpName || '—'}
          </Text>
        </View>

        <View style={styles.fieldRow}>
          <MaterialCommunityIcons
            name="receipt"
            size={rs(16)}
            color={colors.textMuted}
            style={styles.fieldIcon}
          />
          <Text style={styles.fieldLabel}>Acc</Text>
          <View style={styles.valueCopyRow}>
            <Text style={styles.fieldValue} numberOfLines={1}>
              {accDisplay}
            </Text>
            <Pressable
              hitSlop={8}
              style={styles.copyBtn}
              onPress={() =>
                void copyValue('acc', accountNumber, 'Account number')
              }
            >
              <Ionicons
                name={copied === 'acc' ? 'checkmark' : 'copy-outline'}
                size={rs(15)}
                color={copied === 'acc' ? colors.accentGreen : colors.primary}
              />
            </Pressable>
          </View>
        </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onOpen(account);
            }}
          >
            <Ionicons name="open-outline" size={rs(16)} color={ACTION_BLUE} />
            <Text style={[styles.actionText, { color: ACTION_BLUE }]}>Open</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onEdit(account);
            }}
          >
            <Ionicons name="create-outline" size={rs(16)} color={ACTION_GREEN} />
            <Text style={[styles.actionText, { color: ACTION_GREEN }]}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onDelete(account);
            }}
          >
            <Ionicons name="trash-outline" size={rs(16)} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
          </Pressable>
        </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.overlay,
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(16),
      paddingTop: rs(8),
    },
    grabber: {
      alignSelf: 'center',
      width: rs(36),
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: c.border,
      marginBottom: rs(8),
    },
    headSection: {
      marginBottom: rs(8),
      paddingTop: rs(4),
      paddingBottom: 0,
    },
    headDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? c.border : '#C5CBC5',
      marginTop: rs(12),
      marginHorizontal: -rs(16),
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
    },
    indexBadge: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(7),
      backgroundColor: c.surfaceAlt || c.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? c.border : '#D8DED8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    indexText: { color: c.text, fontWeight: '700', fontSize: rs(12) },
    headBody: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
    name: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    minorBadge: {
      paddingHorizontal: rs(6),
      paddingVertical: rs(1),
      borderRadius: rs(5),
      backgroundColor: c.surfaceAlt || c.bgElevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    minorBadgeText: {
      color: c.textMuted,
      fontSize: rs(9),
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    username: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(2) },
    detailsBody: {
      paddingTop: rs(2),
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(7),
    },
    fieldIcon: { width: rs(18), textAlign: 'center' },
    fieldLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
      width: rs(38),
    },
    valueCopyRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      minWidth: 0,
    },
    fieldValue: {
      color: c.text,
      fontSize: rs(12),
      fontWeight: '600',
      flexShrink: 1,
      fontVariant: ['tabular-nums'],
    },
    copyBtn: {
      paddingVertical: rs(1),
      paddingHorizontal: rs(2),
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: rs(18),
      paddingLeft: rs(6),
      paddingTop: rs(2),
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(4),
      paddingVertical: rs(8),
      paddingHorizontal: rs(4),
    },
    actionText: {
      fontWeight: '700',
      fontSize: rs(13),
    },
  });
}
