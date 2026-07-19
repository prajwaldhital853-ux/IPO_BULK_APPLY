import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import { maskBoid, resolveBoidSync } from '../utils/boid';
import { rs } from '../utils/responsive';

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

  if (!account) return null;

  const boid = resolveBoidSync(account) ?? account.demat ?? null;
  const boidDisplay = boid ? maskBoid(boid) : 'Not available yet';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, rs(16)) }]}>
        <View style={styles.grabber} />
        <View style={styles.headRow}>
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>{index + 1}</Text>
          </View>
          <View style={styles.headBody}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{account.name}</Text>
              {account.verified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={rs(16)}
                  color={colors.accentGreen}
                />
              ) : null}
            </View>
            <Text style={styles.username}>Username : {account.username}</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>BOID</Text>
          <View style={styles.fieldValueRow}>
            <Text style={styles.fieldValue}>{boidDisplay}</Text>
            <Ionicons name="copy-outline" size={rs(18)} color={colors.textMuted} />
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Bank</Text>
          <Text style={styles.fieldValue}>
            {account.bankName || account.dpName || '—'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onOpen(account);
            }}
          >
            <Ionicons name="open-outline" size={rs(18)} color={colors.primary} />
            <Text style={styles.actionText}>Open</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              onClose();
              onEdit(account);
            }}
          >
            <Ionicons name="create-outline" size={rs(18)} color={colors.primary} />
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionDanger]}
            onPress={() => {
              onClose();
              onDelete(account);
            }}
          >
            <Ionicons name="trash-outline" size={rs(18)} color={colors.danger} />
            <Text style={[styles.actionText, styles.actionDangerText]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
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
    username: { color: c.textSecondary, fontSize: rs(13), marginTop: rs(4) },
    fieldBlock: { marginBottom: rs(16) },
    fieldLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      letterSpacing: 0.4,
      marginBottom: rs(6),
    },
    fieldValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: rs(8),
    },
    fieldValue: {
      color: c.text,
      fontSize: rs(14),
      fontWeight: '600',
      flex: 1,
    },
    actions: {
      flexDirection: 'row',
      gap: rs(10),
      marginTop: rs(8),
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      paddingVertical: rs(14),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgElevated,
    },
    actionDanger: {
      borderColor: `${c.danger}44`,
      backgroundColor: `${c.danger}11`,
    },
    actionText: {
      color: c.primary,
      fontWeight: '700',
      fontSize: rs(13),
    },
    actionDangerText: { color: c.danger },
  });
}
