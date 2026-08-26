import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AccountMeta } from '../types/account';
import type { ThemeColors } from '../theme/colors';
import { formatRs } from '../services/nepse/premiumAnalytics';
import { rs } from '../utils/responsive';
import {
  computeBalances,
  type BankTrackerAccount,
} from '../storage/bankTrackerStorage';

export const AccountCheckboxPickerRow = React.memo(
  function AccountCheckboxPickerRow({
    account,
    selected,
    onPress,
    accentColor,
    mutedColor,
    rowStyle,
    titleStyle,
  }: {
    account: AccountMeta;
    selected: boolean;
    onPress: () => void;
    accentColor: string;
    mutedColor: string;
    rowStyle: object;
    titleStyle: object;
  }) {
    return (
      <Pressable style={rowStyle} onPress={onPress}>
        <Text style={titleStyle}>{account.name.toUpperCase()}</Text>
        <Ionicons
          name={selected ? 'checkbox' : 'square-outline'}
          size={rs(22)}
          color={selected ? accentColor : mutedColor}
        />
      </Pressable>
    );
  },
);

export type AccountUserSelectStyles = {
  userCard: object;
  avatar: object;
  flex: object;
  userName: object;
  userMeta: object;
};

export const AccountUserSelectRow = React.memo(function AccountUserSelectRow({
  account,
  index,
  selected,
  onPress,
  styles,
  colors,
}: {
  account: AccountMeta;
  index: number;
  selected: boolean;
  onPress: () => void;
  styles: AccountUserSelectStyles;
  colors: ThemeColors;
}) {
  return (
    <Pressable style={styles.userCard} onPress={onPress}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={rs(15)} color={colors.textMuted} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.userName} numberOfLines={1}>
          {index + 1}. {account.name.toUpperCase()}
        </Text>
        <Text style={styles.userMeta}>USERNAME : {account.username}</Text>
        <Text style={styles.userMeta} numberOfLines={1}>
          BANK : {(account.bankName || account.dpName || '—').toUpperCase()}
        </Text>
      </View>
      <Ionicons
        name={selected ? 'checkbox' : 'square-outline'}
        size={rs(22)}
        color={selected ? colors.accentGreen : colors.textMuted}
      />
    </Pressable>
  );
});

export type BankTrackerCardStyles = {
  card: object;
  bankIcon: object;
  cardBody: object;
  cardName: object;
  cardMeta: object;
  balanceCol: object;
  balanceVal: object;
  balanceLabel: object;
  setupBtn: object;
  setupText: object;
};

export const BankTrackerAccountRow = React.memo(function BankTrackerAccountRow({
  account,
  tracker,
  onPress,
  styles,
  colors,
}: {
  account: AccountMeta;
  tracker?: BankTrackerAccount;
  onPress: () => void;
  styles: BankTrackerCardStyles;
  colors: ThemeColors;
}) {
  const tracking = tracker?.tracking ?? false;
  const balances = tracker ? computeBalances(tracker) : null;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.bankIcon}>
        <Ionicons name="business" size={rs(18)} color={colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {account.name.toUpperCase()}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {(account.bankName || account.dpName || '—').toUpperCase()}
          {account.accountNumber
            ? ` • ${maskAccountNumber(account.accountNumber)}`
            : ''}
        </Text>
      </View>
      {tracking && balances ? (
        <View style={styles.balanceCol}>
          <Text style={styles.balanceVal}>{formatRs(balances.available)}</Text>
          <Text style={styles.balanceLabel}>Available</Text>
        </View>
      ) : (
        <View style={styles.setupBtn}>
          <Text style={styles.setupText}>Set up</Text>
        </View>
      )}
    </Pressable>
  );
});

function maskAccountNumber(n: string): string {
  const s = n.trim();
  if (s.length <= 6) return s;
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

export type ApplyAccountRowStyles = {
  accountRow: object;
  accountRowDisabled?: object;
  indexBadge: object;
  indexText: object;
  accName: object;
  accBank: object;
  applyBtn: object;
  applyBtnDisabled?: object;
  applyBtnText: object;
};

export const ApplySingleAccountRow = React.memo(function ApplySingleAccountRow({
  account,
  index,
  applied,
  locked,
  running,
  onApply,
  styles,
  colors,
}: {
  account: AccountMeta;
  index: number;
  applied: boolean;
  locked: boolean;
  running: boolean;
  onApply: (id: string) => void;
  styles: ApplyAccountRowStyles;
  colors: ThemeColors;
}) {
  const blocked = applied || locked;
  return (
    <View style={styles.accountRow}>
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.accName}>{account.name}</Text>
        <Text style={styles.accBank}>
          {applied
            ? 'Already applied for this IPO'
            : locked
              ? 'Locked — over plan limit'
              : account.bankName || account.dpName}
        </Text>
      </View>
      <Pressable
        style={[styles.applyBtn, blocked && styles.applyBtnDisabled]}
        onPress={() => onApply(account.id)}
        disabled={running || applied}
      >
        <Text
          style={[
            styles.applyBtnText,
            blocked && { color: colors.textMuted },
          ]}
        >
          {applied ? 'Done' : locked ? 'Locked' : 'Apply'}
        </Text>
      </Pressable>
    </View>
  );
});

export const ApplyModalAccountRow = React.memo(function ApplyModalAccountRow({
  account,
  index,
  applied,
  locked,
  checked,
  onToggle,
  styles,
  colors,
}: {
  account: AccountMeta;
  index: number;
  applied: boolean;
  locked: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  styles: ApplyAccountRowStyles;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      style={[
        styles.accountRow,
        (applied || locked) && styles.accountRowDisabled,
      ]}
      onPress={() => onToggle(account.id)}
      disabled={applied}
    >
      <Ionicons
        name={
          applied
            ? 'checkmark-done-circle'
            : locked
              ? 'lock-closed'
              : checked
                ? 'checkbox'
                : 'square-outline'
        }
        size={rs(22)}
        color={
          applied
            ? colors.accentGreen
            : locked
              ? colors.minorAccent
              : checked
                ? colors.primary
                : colors.textMuted
        }
      />
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.accName}>{account.name}</Text>
        <Text style={styles.accBank}>
          {applied
            ? 'Already applied for this IPO'
            : locked
              ? 'Locked — over plan limit'
              : account.bankName || account.dpName}
        </Text>
      </View>
    </Pressable>
  );
});
