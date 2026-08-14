import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function ChooseActiveAccountsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts } = useAccounts();
  const {
    maxAccounts,
    suggestedIds,
    saveSelection,
    overQuota,
    needsPick,
    canFillSlots,
    selectionLocked,
    activeIds,
  } = useActiveAccounts();

  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(suggestedIds),
  );

  const suggestedKey = suggestedIds.join('|');
  useEffect(() => {
    setPicked(new Set(suggestedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedKey]);

  const toggle = (id: string) => {
    if (selectionLocked) return;
    if (canFillSlots && activeIds.has(id)) {
      Alert.alert(
        'Locked',
        'This account is already in your active set. You cannot swap it out on this plan.',
      );
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (canFillSlots && activeIds.has(id)) return prev;
        next.delete(id);
        return next;
      }
      if (next.size >= maxAccounts) {
        Alert.alert(
          'Limit reached',
          `Your plan allows ${maxAccounts} active accounts.`,
        );
        return prev;
      }
      next.add(id);
      return next;
    });
  };

  const onSave = async () => {
    if (selectionLocked) {
      navigation.goBack();
      return;
    }
    if (picked.size < 1) {
      Alert.alert('Pick at least one', 'Choose which accounts stay active.');
      return;
    }
    if (picked.size > maxAccounts) {
      Alert.alert(
        'Too many',
        `Select at most ${maxAccounts} accounts.`,
      );
      return;
    }
    if (needsPick) {
      // If this phone has enough demats, require a full set so one phone
      // cannot lock the Google account to a tiny active set by mistake.
      const required = Math.min(maxAccounts, accounts.length);
      if (picked.size < required) {
        Alert.alert(
          'Select more',
          accounts.length >= maxAccounts
            ? `Select exactly ${maxAccounts} accounts for this plan.`
            : `Select all ${accounts.length} accounts on this phone (or open the phone that has more demats to choose the full ${maxAccounts}).`,
        );
        return;
      }
    }
    if (canFillSlots) {
      for (const id of activeIds) {
        if (!picked.has(id)) {
          Alert.alert(
            'Cannot swap',
            'Already-active accounts stay active. You can only fill empty slots.',
          );
          return;
        }
      }
    }
    try {
      await saveSelection([...picked]);
      navigation.goBack();
    } catch {
      // Alert already shown by saveSelection
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Active accounts</Text>
      </View>

      <Text style={styles.hint}>
        {!overQuota
          ? 'You are within your plan limit. All saved accounts are active.'
          : needsPick
            ? `You have ${accounts.length} saved accounts, but your plan allows ${maxAccounts} active across all phones on this Google account. ${
                accounts.length >= maxAccounts
                  ? `Select exactly ${maxAccounts}.`
                  : `Select all ${accounts.length} on this phone (the other phone can fill the rest up to ${maxAccounts}).`
              } After you save, the same set applies on every device.`
            : canFillSlots
              ? `Your active set is locked across all phones. Empty slot(s) are available because an active account was removed. You can add replacements, but you cannot uncheck accounts that are already active.`
              : `Your active set is locked for this plan on every phone signed in with this Google account. Upgrade or ask admin to raise the limit to change it.`}
      </Text>
      <Text style={styles.count}>
        Selected {picked.size} / {maxAccounts}
      </Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(90) }}
        showsVerticalScrollIndicator={false}
      >
        {accounts.map((a) => {
          const on = picked.has(a.id);
          const frozen = selectionLocked || (canFillSlots && activeIds.has(a.id));
          return (
            <Pressable
              key={a.id}
              style={[styles.row, on && styles.rowOn, frozen && { opacity: 0.72 }]}
              onPress={() => toggle(a.id)}
            >
              <Ionicons
                name={
                  frozen && on
                    ? 'lock-closed'
                    : on
                      ? 'checkbox'
                      : 'square-outline'
                }
                size={rs(22)}
                color={on ? colors.primary : colors.textMuted}
              />
              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {a.name.toUpperCase()}
                </Text>
                <Text style={styles.user} numberOfLines={1}>
                  {frozen && on ? 'Active · locked' : a.username}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + rs(12) }]}>
        {selectionLocked ? (
          <Pressable
            style={styles.saveBtn}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={styles.saveText}>Upgrade to change set</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.saveBtn} onPress={() => void onSave()}>
            <Text style={styles.saveText}>
              {canFillSlots ? 'Save extra slots' : 'Save active set'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      gap: rs(8),
    },
    back: { color: c.text, fontSize: rs(22), width: rs(32) },
    title: { color: c.text, fontSize: rs(18), fontWeight: '800' },
    hint: {
      marginHorizontal: rs(16),
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(18),
      marginBottom: rs(8),
    },
    count: {
      marginHorizontal: rs(16),
      marginBottom: rs(10),
      color: c.primary,
      fontWeight: '800',
      fontSize: rs(13),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      padding: rs(12),
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.bg,
    },
    rowOn: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    rowBody: { flex: 1, minWidth: 0 },
    name: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    user: { color: c.textMuted, fontSize: rs(12), marginTop: rs(2) },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: rs(16),
      paddingTop: rs(8),
      backgroundColor: c.bg,
    },
    saveBtn: {
      backgroundColor: c.primary,
      borderRadius: rs(16),
      paddingVertical: rs(12),
      alignItems: 'center',
    },
    saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: rs(15) },
  });
}
