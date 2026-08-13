import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSheetModal } from '../components/KeyboardSheetModal';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  adjustTo,
  computeBalances,
  deposit,
  getTracker,
  resetTransactions,
  setOpeningBalance,
  startTracking,
  stopTracking,
  updateSettings,
  withdraw,
  type BankTrackerAccount,
  type BankTxnGroup,
} from '../storage/bankTrackerStorage';
import { rs } from '../utils/responsive';
import { showLockedAccountAlert } from '../utils/lockedAccountAlert';
import { formatRs } from './BankTrackerScreen';
import type { RootStackParamList } from '../navigation/types';

type FilterKey = 'all' | 'hold' | 'refund' | 'casba' | 'manual';
type ActionKind = 'deposit' | 'withdraw' | 'adjust';

const FILTERS: { key: FilterKey; label: string; group?: BankTxnGroup }[] = [
  { key: 'all', label: 'All' },
  { key: 'hold', label: 'Holds', group: 'hold' },
  { key: 'refund', label: 'Refunds', group: 'refund' },
  { key: 'casba', label: 'CASBA', group: 'casba' },
  { key: 'manual', label: 'Manual', group: 'manual' },
];

function parseAmount(text: string): number | null {
  const clean = text.replace(/[^0-9.]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d
    .getHours()
    .toString()
    .padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function BankTrackerDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route =
    useRoute<RouteProp<RootStackParamList, 'BankTrackerDetail'>>();
  const { accountId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts } = useAccounts();
  const { isAccountActive, canEditSelection } = useActiveAccounts();

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  const [tracker, setTracker] = useState<BankTrackerAccount | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [menuOpen, setMenuOpen] = useState(false);

  // Modals
  const [startOpen, setStartOpen] = useState(false);
  const [startValue, setStartValue] = useState('');
  const [action, setAction] = useState<ActionKind | null>(null);
  const [actionValue, setActionValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feeValue, setFeeValue] = useState('');
  const [yearlyCharge, setYearlyCharge] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState('');

  const reload = useCallback(async () => {
    const t = await getTracker(accountId);
    setTracker(t);
    return t;
  }, [accountId]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getTracker(accountId).then((t) => {
        if (alive) setTracker(t);
      });
      return () => {
        alive = false;
      };
    }, [accountId]),
  );

  const balances = tracker
    ? computeBalances(tracker)
    : { available: 0, hold: 0, total: 0 };

  const counts = useMemo(() => {
    const txns = tracker?.transactions ?? [];
    return {
      all: txns.length,
      hold: txns.filter((t) => t.group === 'hold').length,
      refund: txns.filter((t) => t.group === 'refund').length,
      casba: txns.filter((t) => t.group === 'casba').length,
      manual: txns.filter((t) => t.group === 'manual').length,
    };
  }, [tracker]);

  const filtered = useMemo(() => {
    const txns = tracker?.transactions ?? [];
    if (filter === 'all') return txns;
    return txns.filter((t) => t.group === filter);
  }, [tracker, filter]);

  const accountTitle = account?.name.toUpperCase() ?? 'Account';
  const bankLine = account
    ? `${(account.bankName || account.dpName || '—').toUpperCase()}${
        account.accountNumber ? ` • ${account.accountNumber}` : ''
      }`
    : '';

  const promptLocked = () => {
    showLockedAccountAlert(
      canEditSelection
        ? () => navigation.navigate('ChooseActiveAccounts')
        : null,
      () => navigation.navigate('Subscription'),
    );
  };

  // ---- Actions ----
  const doStart = async () => {
    if (!isAccountActive(accountId)) {
      promptLocked();
      return;
    }
    const n = parseAmount(startValue);
    if (n == null) {
      Alert.alert('Enter a balance', 'Type your current bank balance to start.');
      return;
    }
    await startTracking(accountId, n);
    setStartOpen(false);
    setStartValue('');
    await reload();
  };

  const openAction = (kind: ActionKind) => {
    setAction(kind);
    setActionValue('');
  };

  const doAction = async () => {
    if (!isAccountActive(accountId)) {
      promptLocked();
      return;
    }
    if (!action) return;
    const n = parseAmount(actionValue);
    if (n == null || n < 0) {
      Alert.alert('Enter an amount', 'Type a valid amount.');
      return;
    }
    if (action === 'deposit') await deposit(accountId, n);
    else if (action === 'withdraw') await withdraw(accountId, n);
    else if (action === 'adjust') await adjustTo(accountId, n);
    setAction(null);
    setActionValue('');
    await reload();
  };

  const doReset = () => {
    Alert.alert(
      'Reset transactions?',
      'This clears all transactions and returns the balance to your opening amount. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetTransactions(accountId);
            await reload();
          },
        },
      ],
    );
  };

  const openSettings = () => {
    setMenuOpen(false);
    setFeeValue(String(tracker?.casbaFee ?? 5));
    setYearlyCharge(tracker?.mobileBankingYearlyCharge ?? false);
    setSettingsOpen(true);
  };

  const doSaveSettings = async () => {
    const fee = parseAmount(feeValue);
    await updateSettings(accountId, {
      casbaFee: fee ?? undefined,
      mobileBankingYearlyCharge: yearlyCharge,
    });
    setSettingsOpen(false);
    await reload();
  };

  const openEdit = () => {
    setMenuOpen(false);
    setEditValue(String(tracker?.openingBalance ?? 0));
    setEditOpen(true);
  };

  const doSaveEdit = async () => {
    const n = parseAmount(editValue);
    if (n == null) {
      Alert.alert('Enter a balance', 'Type the opening balance.');
      return;
    }
    await setOpeningBalance(accountId, n);
    setEditOpen(false);
    await reload();
  };

  const doStop = () => {
    setMenuOpen(false);
    Alert.alert(
      'Stop tracking?',
      'This clears the tracked balance and all transactions for this account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop tracking',
          style: 'destructive',
          onPress: async () => {
            await stopTracking(accountId);
            await reload();
          },
        },
      ],
    );
  };

  const tracking = tracker?.tracking ?? false;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {accountTitle}
        </Text>
        {tracking ? (
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="ellipsis-vertical" size={rs(20)} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      {!tracking ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="wallet-outline" size={rs(56)} color={colors.primary} />
          <Text style={styles.emptyTitle}>Track this account&apos;s balance</Text>
          <Text style={styles.emptyBody}>
            Set an opening balance to start. IPO applications from this app will
            then auto-record the Rs {tracker?.casbaFee ?? 5} CASBA fee plus the
            blocked amount, so your available balance stays accurate.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              setStartValue('');
              setStartOpen(true);
            }}
          >
            <Ionicons name="play" size={rs(15)} color={colors.pillText} />
            <Text style={styles.primaryBtnText}>Start tracking</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {/* Balance card */}
              <View style={styles.balanceCard}>
                <View style={styles.balanceHead}>
                  <View style={styles.balanceBankIcon}>
                    <Ionicons name="business" size={rs(16)} color="#123524" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.balanceName} numberOfLines={1}>
                      {accountTitle}
                    </Text>
                    <Text style={styles.balanceBank} numberOfLines={1}>
                      {(account?.bankName || account?.dpName || '—').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.balanceLabel}>Available Balance</Text>
                <Text style={styles.balanceValue}>
                  {formatRs(balances.available)}
                </Text>

                <View style={styles.balanceSplit}>
                  <View style={styles.splitCol}>
                    <Text style={styles.splitLabel}>On Hold</Text>
                    <Text style={styles.splitValue}>{formatRs(balances.hold)}</Text>
                  </View>
                  <View style={styles.splitDivider} />
                  <View style={styles.splitCol}>
                    <Text style={styles.splitLabel}>Total Balance</Text>
                    <Text style={styles.splitValue}>{formatRs(balances.total)}</Text>
                  </View>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <ActionButton
                  icon="add"
                  label="Deposit"
                  tint="#2E9E5B"
                  styles={styles}
                  onPress={() => openAction('deposit')}
                />
                <ActionButton
                  icon="remove"
                  label="Withdraw"
                  tint="#E5484D"
                  styles={styles}
                  onPress={() => openAction('withdraw')}
                />
                <ActionButton
                  icon="options"
                  label="Adjust"
                  tint="#F5A623"
                  styles={styles}
                  onPress={() => openAction('adjust')}
                />
                <ActionButton
                  icon="refresh"
                  label="Reset"
                  tint={colors.textMuted}
                  styles={styles}
                  onPress={doReset}
                />
              </View>

              {/* Transactions header */}
              <View style={styles.txnHead}>
                <Text style={styles.txnTitle}>Transactions</Text>
                <Text style={styles.txnCount}>{counts.all} entries</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  const count =
                    f.key === 'all' ? counts.all : counts[f.key as keyof typeof counts];
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {f.label} {count}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          }
          ListEmptyComponent={
            <View style={styles.txnEmpty}>
              <Ionicons name="receipt-outline" size={rs(40)} color={colors.textMuted} />
              <Text style={styles.txnEmptyText}>No transactions yet</Text>
            </View>
          }
          renderItem={({ item }) => {
            const positive = item.availableDelta > 0;
            const amtColor = positive ? '#2E9E5B' : '#E5484D';
            const sign = positive ? '+' : '−';
            return (
              <View style={styles.txnRow}>
                <View style={styles.txnIcon}>
                  <Ionicons
                    name={groupIcon(item.group)}
                    size={rs(16)}
                    color={colors.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.txnTime}>{timeLabel(item.createdAt)}</Text>
                </View>
                <Text style={[styles.txnAmt, { color: amtColor }]}>
                  {sign} {formatRs(Math.abs(item.availableDelta))}
                </Text>
              </View>
            );
          }}
        />
      )}

      {/* Kebab menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: insets.top + rs(48) }]}>
            <Pressable style={styles.menuItem} onPress={openSettings}>
              <Text style={styles.menuText}>Account settings</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={openEdit}>
              <Text style={styles.menuText}>Edit opening balance</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={doStop}>
              <Text style={[styles.menuText, { color: '#E5484D' }]}>Stop tracking</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Start tracking */}
      <SheetModal
        visible={startOpen}
        onClose={() => setStartOpen(false)}
        title="Start tracking"
        subtitle="Your current bank balance for this account."
        styles={styles}
        colors={colors}
        insets={insets}
        footer={
          <Pressable style={styles.primaryBtn} onPress={doStart}>
            <Text style={styles.primaryBtnText}>Start</Text>
          </Pressable>
        }
      >
        <MoneyInput
          label="Opening balance (Rs)"
          value={startValue}
          onChangeText={setStartValue}
          styles={styles}
          colors={colors}
        />
      </SheetModal>

      {/* Deposit / Withdraw / Adjust */}
      <SheetModal
        visible={action != null}
        onClose={() => setAction(null)}
        title={
          action === 'deposit'
            ? 'Deposit'
            : action === 'withdraw'
              ? 'Withdraw'
              : 'Adjust balance'
        }
        subtitle={
          action === 'adjust'
            ? 'Set the available balance to an exact amount.'
            : action === 'deposit'
              ? 'Add money to this account.'
              : 'Remove money from this account.'
        }
        styles={styles}
        colors={colors}
        insets={insets}
        footer={
          <Pressable style={styles.primaryBtn} onPress={doAction}>
            <Text style={styles.primaryBtnText}>
              {action === 'deposit'
                ? 'Deposit'
                : action === 'withdraw'
                  ? 'Withdraw'
                  : 'Save'}
            </Text>
          </Pressable>
        }
      >
        <MoneyInput
          label={action === 'adjust' ? 'New balance (Rs)' : 'Amount (Rs)'}
          value={actionValue}
          onChangeText={setActionValue}
          styles={styles}
          colors={colors}
        />
      </SheetModal>

      {/* Edit opening balance */}
      <SheetModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit opening balance"
        subtitle="Update the starting balance for this account."
        styles={styles}
        colors={colors}
        insets={insets}
        footer={
          <Pressable style={styles.primaryBtn} onPress={doSaveEdit}>
            <Text style={styles.primaryBtnText}>Save</Text>
          </Pressable>
        }
      >
        <MoneyInput
          label="Opening balance (Rs)"
          value={editValue}
          onChangeText={setEditValue}
          styles={styles}
          colors={colors}
        />
      </SheetModal>

      {/* Account settings */}
      <SheetModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Account settings"
        styles={styles}
        colors={colors}
        insets={insets}
        footer={
          <Pressable style={styles.primaryBtn} onPress={doSaveSettings}>
            <Text style={styles.primaryBtnText}>Save settings</Text>
          </Pressable>
        }
      >
        <Text style={styles.settingHeading}>CASBA fee per IPO apply</Text>
        <MoneyInput
          label="CASBA fee (Rs)"
          value={feeValue}
          onChangeText={setFeeValue}
          styles={styles}
          colors={colors}
          autoFocus={false}
        />
        <Text style={styles.settingHint}>
          Charged on each fresh IPO apply. Leave 5 if unsure.
        </Text>

        <View style={styles.settingDivider} />

        <View style={styles.settingSwitchRow}>
          <View style={{ flex: 1, paddingRight: rs(12) }}>
            <Text style={styles.settingSwitchTitle}>Mobile banking yearly charge</Text>
            <Text style={styles.settingHint}>
              Auto-deduct a yearly service charge on the renewal date.
            </Text>
          </View>
          <Switch
            value={yearlyCharge}
            onValueChange={setYearlyCharge}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#FFFFFF"
          />
        </View>
      </SheetModal>
    </View>
  );
}

function groupIcon(group: BankTxnGroup): keyof typeof Ionicons.glyphMap {
  if (group === 'hold') return 'lock-closed-outline';
  if (group === 'refund') return 'return-down-back-outline';
  if (group === 'casba') return 'receipt-outline';
  return 'swap-horizontal-outline';
}

function ActionButton({
  icon,
  label,
  tint,
  onPress,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <View style={[styles.actionIcon, { borderColor: tint }]}>
        <Ionicons name={icon} size={rs(20)} color={tint} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function MoneyInput({
  label,
  value,
  onChangeText,
  styles,
  colors,
  autoFocus = true,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.moneyWrap}>
      <Text style={styles.moneyLabel}>{label}</Text>
      <View style={styles.moneyInputRow}>
        <Text style={styles.moneyPrefix}>Rs</Text>
        <TextInput
          style={styles.moneyInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

function SheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  styles,
  insets,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned above the keypad (Save / Start buttons). */
  footer?: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  insets: { bottom: number };
}) {
  return (
    <KeyboardSheetModal
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      bottomInset={insets.bottom}
      sheetStyle={styles.sheet}
      backdropStyle={styles.sheetBackdrop}
      handleStyle={styles.sheetHandle}
      titleStyle={styles.sheetTitle}
      subtitleStyle={styles.sheetSubtitle}
      footerStyle={styles.sheetFooter}
    >
      {children}
    </KeyboardSheetModal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(10),
    },
    iconBtn: {
      width: rs(40),
      height: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginHorizontal: rs(4),
    },
    // Empty (not tracking)
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(32),
      gap: rs(12),
    },
    emptyTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(18),
      textAlign: 'center',
    },
    emptyBody: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(19),
      textAlign: 'center',
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: c.primary,
      borderRadius: rs(26),
      paddingVertical: rs(14),
      paddingHorizontal: rs(24),
      marginTop: rs(4),
    },
    primaryBtnText: { color: c.pillText, fontWeight: '800', fontSize: rs(14) },
    list: { padding: rs(14), paddingBottom: rs(30) },
    // Balance card
    balanceCard: {
      backgroundColor: '#A7D3A0',
      borderRadius: rs(18),
      padding: rs(16),
      marginBottom: rs(14),
    },
    balanceHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(12),
    },
    balanceBankIcon: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(17),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.45)',
    },
    balanceName: { color: '#123524', fontWeight: '800', fontSize: rs(13) },
    balanceBank: { color: 'rgba(18,53,36,0.7)', fontSize: rs(11), marginTop: rs(2) },
    balanceLabel: { color: 'rgba(18,53,36,0.75)', fontSize: rs(12) },
    balanceValue: {
      color: '#0E2A1C',
      fontWeight: '800',
      fontSize: rs(30),
      marginTop: rs(2),
    },
    balanceSplit: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.28)',
      borderRadius: rs(12),
      paddingVertical: rs(10),
      paddingHorizontal: rs(14),
      marginTop: rs(14),
    },
    splitCol: { flex: 1 },
    splitDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: 'rgba(18,53,36,0.25)',
      marginHorizontal: rs(10),
    },
    splitLabel: { color: 'rgba(18,53,36,0.7)', fontSize: rs(11) },
    splitValue: { color: '#123524', fontWeight: '800', fontSize: rs(14), marginTop: rs(2) },
    // Actions
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: c.surface,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      paddingVertical: rs(14),
      marginBottom: rs(16),
    },
    action: { alignItems: 'center', gap: rs(6) },
    actionIcon: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(22),
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: { color: c.textSecondary, fontSize: rs(11), fontWeight: '600' },
    // Transactions
    txnHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(10),
    },
    txnTitle: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    txnCount: { color: c.textMuted, fontSize: rs(12) },
    chipRow: { gap: rs(8), paddingRight: rs(8), paddingBottom: rs(12) },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(16),
      paddingHorizontal: rs(14),
      paddingVertical: rs(7),
      backgroundColor: c.surface,
    },
    chipActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
    chipText: { color: c.textSecondary, fontSize: rs(12), fontWeight: '700' },
    chipTextActive: { color: c.primary },
    txnEmpty: { alignItems: 'center', paddingVertical: rs(40), gap: rs(10) },
    txnEmptyText: { color: c.textMuted, fontSize: rs(13) },
    txnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    txnIcon: {
      width: rs(34),
      height: rs(34),
      borderRadius: rs(17),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceAlt,
    },
    txnLabel: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    txnTime: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    txnAmt: { fontWeight: '800', fontSize: rs(13) },
    // Kebab menu
    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
    menu: {
      position: 'absolute',
      right: rs(12),
      backgroundColor: c.bgElevated,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: rs(6),
      minWidth: rs(200),
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    menuItem: { paddingHorizontal: rs(16), paddingVertical: rs(12) },
    menuText: { color: c.text, fontSize: rs(14), fontWeight: '600' },
    // Sheet modal
    sheetRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: rs(20),
      borderTopRightRadius: rs(20),
      paddingHorizontal: rs(18),
      paddingTop: rs(10),
      width: '100%',
    },
    sheetScrollView: {
      flexGrow: 0,
      flexShrink: 1,
    },
    sheetScroll: {
      paddingBottom: rs(4),
      flexGrow: 0,
    },
    sheetFooter: {
      paddingTop: rs(8),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderMuted,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: rs(40),
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: c.border,
      marginBottom: rs(14),
    },
    sheetTitle: { color: c.text, fontWeight: '800', fontSize: rs(18) },
    sheetSubtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
      marginBottom: rs(6),
    },
    // Money input
    moneyWrap: { marginTop: rs(14), marginBottom: rs(6) },
    moneyLabel: {
      color: c.primary,
      fontSize: rs(11),
      fontWeight: '700',
      marginBottom: rs(4),
      marginLeft: rs(4),
    },
    moneyInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: rs(12),
      paddingHorizontal: rs(14),
    },
    moneyPrefix: { color: c.textSecondary, fontSize: rs(15), fontWeight: '700' },
    moneyInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(16),
      fontWeight: '700',
      paddingVertical: rs(12),
    },
    // Settings
    settingHeading: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginTop: rs(12),
    },
    settingHint: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(6),
      marginLeft: rs(2),
      lineHeight: rs(16),
    },
    settingDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: rs(16),
    },
    settingSwitchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    settingSwitchTitle: { color: c.text, fontWeight: '700', fontSize: rs(13) },
  });
}
