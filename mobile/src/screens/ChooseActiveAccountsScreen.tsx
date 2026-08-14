import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
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

/**
 * Read-only view of the active set. The plan decides it — the oldest demats
 * across all phones stay active — so there is nothing to choose here.
 */
export function ChooseActiveAccountsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts } = useAccounts();
  const {
    maxAccounts,
    overQuota,
    activeIds,
    activeCount,
    claimedTotal,
    refresh,
  } = useActiveAccounts();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      await refresh();
      setRefreshing(false);
    })();
  }, [refresh]);

  const ordered = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        const av = activeIds.has(a.id) ? 0 : 1;
        const bv = activeIds.has(b.id) ? 0 : 1;
        if (av !== bv) return av - bv;
        return a.name.localeCompare(b.name);
      }),
    [accounts, activeIds],
  );

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
          ? 'You are within your plan limit, so every saved account is active.'
          : `Your plan allows ${maxAccounts} active accounts across every phone signed in with this Google account. ${claimedTotal} accounts are saved in total, so the ${maxAccounts} added first stay active and the rest are locked — on all your phones. Delete an active account and the next one unlocks automatically.`}
      </Text>
      <Text style={styles.count}>
        Active {activeCount} / {maxAccounts}
        {activeIds.size !== activeCount
          ? ` · ${activeIds.size} on this phone`
          : ''}
      </Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(90) }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {ordered.map((a) => {
          const on = activeIds.has(a.id);
          return (
            <View
              key={a.id}
              style={[styles.row, on ? styles.rowOn : { opacity: 0.72 }]}
            >
              <Ionicons
                name={on ? 'checkmark-circle' : 'lock-closed'}
                size={rs(22)}
                color={on ? colors.primary : colors.textMuted}
              />
              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {a.name.toUpperCase()}
                </Text>
                <Text style={styles.user} numberOfLines={1}>
                  {on ? `Active · ${a.username}` : `Locked · ${a.username}`}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {overQuota ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + rs(12) }]}>
          <Pressable
            style={styles.saveBtn}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={styles.saveText}>Raise my limit</Text>
          </Pressable>
        </View>
      ) : null}
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
