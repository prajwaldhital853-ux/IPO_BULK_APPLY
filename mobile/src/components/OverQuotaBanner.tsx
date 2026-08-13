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
  const { overQuota, needsPick, canFillSlots, canEditSelection, maxAccounts, activeIds } =
    useActiveAccounts();

  if (!overQuota) return null;

  const title = needsPick
    ? `Choose ${maxAccounts} active accounts`
    : canFillSlots
      ? `${activeIds.size} of ${maxAccounts} slots used`
      : `${activeIds.size} of ${accounts.length} accounts active`;

  const body = needsPick
    ? `Your plan allows ${maxAccounts} active accounts. Extra accounts stay saved on this phone but cannot apply or open MeroShare until you pick an active set or upgrade.`
    : canFillSlots
      ? `You deleted an active account, so you can fill the empty slot. You cannot swap accounts that are already active.`
      : `Your active set is locked for this plan. Extra accounts stay saved but cannot be swapped in. Upgrade or ask admin to raise the limit to change them.`;

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.body, !canEditSelection && { marginBottom: 0 }]}>
        {body}
      </Text>
      {canEditSelection ? (
        <Pressable
          style={styles.btn}
          onPress={() => navigation.navigate('ChooseActiveAccounts')}
        >
          <Text style={styles.btnText}>
            {needsPick ? 'Choose now' : 'Fill empty slot'}
          </Text>
        </Pressable>
      ) : null}
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
