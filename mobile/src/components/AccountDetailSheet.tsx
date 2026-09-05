import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [copied, setCopied] = useState<'boid' | 'acc' | null>(null);

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
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close account details"
        />
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, rs(16)) }]}
          onPress={() => {}}
        >
        <View style={styles.grabber} />
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
                  size={rs(16)}
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

        {isMinorAccount(account) ? (
          <>
            <View style={styles.fieldRow}>
              <Ionicons
                name="hourglass-outline"
                size={rs(18)}
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
                size={rs(18)}
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
                size={rs(18)}
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
            size={rs(18)}
            color={colors.textMuted}
            style={styles.fieldIcon}
          />
          <Text style={styles.fieldLabel}>BOID</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>
            {boidDisplay}
          </Text>
          <Pressable
            hitSlop={10}
            style={styles.copyBtn}
            onPress={() => void copyValue('boid', boid, 'BOID')}
          >
            <Ionicons
              name={copied === 'boid' ? 'checkmark' : 'copy-outline'}
              size={rs(18)}
              color={copied === 'boid' ? colors.accentGreen : colors.primary}
            />
          </Pressable>
        </View>

        <View style={styles.fieldRow}>
          <MaterialCommunityIcons
            name="bank-outline"
            size={rs(18)}
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
            size={rs(18)}
            color={colors.textMuted}
            style={styles.fieldIcon}
          />
          <Text style={styles.fieldLabel}>Acc</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>
            {accDisplay}
          </Text>
          {accountNumber ? (
            <Pressable
              hitSlop={10}
              style={styles.copyBtn}
              onPress={() => void copyValue('acc', accountNumber, 'Account number')}
            >
              <Ionicons
                name={copied === 'acc' ? 'checkmark' : 'copy-outline'}
                size={rs(18)}
                color={copied === 'acc' ? colors.accentGreen : colors.primary}
              />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.divider} />

        <View style={styles.actions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onOpen(account);
            }}
          >
            <Ionicons name="open-outline" size={rs(18)} color={ACTION_BLUE} />
            <Text style={[styles.actionText, { color: ACTION_BLUE }]}>Open</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onEdit(account);
            }}
          >
            <Ionicons name="create-outline" size={rs(18)} color={ACTION_GREEN} />
            <Text style={[styles.actionText, { color: ACTION_GREEN }]}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onDelete(account);
            }}
          >
            <Ionicons name="trash-outline" size={rs(18)} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
          </Pressable>
        </View>
        </Pressable>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(20),
      borderTopRightRadius: rs(20),
      paddingHorizontal: rs(20),
      paddingTop: rs(10),
    },
    grabber: {
      alignSelf: 'center',
      width: rs(40),
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: c.border,
      marginBottom: rs(16),
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      marginBottom: rs(20),
    },
    indexBadge: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(8),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indexText: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    headBody: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    name: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    minorBadge: {
      paddingHorizontal: rs(7),
      paddingVertical: rs(2),
      borderRadius: rs(6),
      backgroundColor: c.surfaceAlt || c.bgElevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    minorBadgeText: {
      color: c.textMuted,
      fontSize: rs(10),
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    username: { color: c.textSecondary, fontSize: rs(13), marginTop: rs(4) },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(14),
    },
    fieldIcon: { width: rs(20), textAlign: 'center' },
    fieldLabel: {
      color: c.textMuted,
      fontSize: rs(13),
      fontWeight: '600',
      width: rs(44),
    },
    fieldValue: {
      color: c.text,
      fontSize: rs(14),
      fontWeight: '600',
      flex: 1,
      fontVariant: ['tabular-nums'],
    },
    copyBtn: {
      paddingVertical: rs(4),
      paddingHorizontal: rs(6),
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginTop: rs(4),
      marginBottom: rs(10),
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      paddingVertical: rs(12),
    },
    actionText: {
      fontWeight: '700',
      fontSize: rs(14),
    },
  });
}
