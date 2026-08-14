import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function OverQuotaBanner() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts } = useAccounts();
  const { overQuota, maxAccounts, activeIds, lockedIds, claimedTotal } =
    useActiveAccounts();

  if (!overQuota) return null;

  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        {activeIds.size} of {accounts.length} accounts active on this phone
      </Text>
      <Text style={styles.body}>
        Your plan allows {maxAccounts} active accounts across every phone signed
        in with this Google account, and {claimedTotal} are saved in total. The{' '}
        {maxAccounts} oldest accounts stay active automatically —{' '}
        {lockedIds.length} on this phone {lockedIds.length === 1 ? 'is' : 'are'}{' '}
        locked. Delete an active account to free its slot, or ask admin to raise
        your limit.
      </Text>
      <Pressable
        style={styles.btn}
        onPress={() => navigation.navigate('ChooseActiveAccounts')}
      >
        <Text style={styles.btnText}>See which are active</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    box: {
      marginBottom: rs(10),
      padding: rs(12),
      borderRadius: rs(12),
      backgroundColor: c.minorSoft,
      borderWidth: 1,
      borderColor: c.minorAccent,
    },
    title: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      marginBottom: rs(4),
    },
    body: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginBottom: rs(10),
    },
    btn: {
      alignSelf: 'flex-start',
      backgroundColor: c.primary,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(7),
    },
    btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: rs(12) },
  });
}
