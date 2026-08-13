import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';

function accountLabel(account: AccountMeta, index: number): string {
  const code = account.dpCode ?? account.dpId;
  return `${index + 1}. ${account.name.toUpperCase()} · ${code}`;
}

/**
 * Pick a MeroShare account → View prompt (like CDSC WACC banner) → open
 * in-app MeroShare logged in on the Purchase / WACC page.
 */
export function CalculateWaccScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { usableAccounts: accounts } = useActiveAccounts();

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewing, setViewing] = useState(false);

  const selected = accounts[selectedIdx] ?? null;

  const onView = () => {
    if (!selected) {
      Alert.alert('No account', 'Add a MeroShare account first from Apply.');
      return;
    }
    setViewing(true);
  };

  const onCalculate = () => {
    if (!selected) return;
    navigation.navigate('MeroshareWeb', {
      accountId: selected.id,
      destination: 'purchase',
    });
  };

  return (
    <ProtectedPersonalScreen title="Sign in to calculate WACC">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Calculate WACC</Text>
          <View style={{ width: rs(22) }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            Select a MeroShare account, tap View, then Calculate WACC to open
            that user’s Purchase page inside the app.
          </Text>

          <Text style={styles.label}>Account</Text>
          <Pressable
            style={styles.dropdown}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.dropdownText} numberOfLines={1}>
              {selected
                ? accountLabel(selected, selectedIdx)
                : 'Select account'}
            </Text>
            <Ionicons name="chevron-down" size={rs(18)} color={colors.text} />
          </Pressable>

          <Pressable
            style={[styles.viewBtn, !selected && styles.btnDisabled]}
            disabled={!selected}
            onPress={onView}
          >
            <Text style={styles.viewBtnText}>View</Text>
          </Pressable>

          {viewing && selected ? (
            <View style={styles.promptCard}>
              <View style={styles.banner}>
                <View style={styles.bannerIcon}>
                  <Text style={styles.bannerBang}>!</Text>
                </View>
                <Text style={styles.bannerText}>
                  PLEASE PERFORM REMAINING WACC CALCULATION FOR THIS ACCOUNT
                  BEFORE VIEWING SUMMARY DATA.
                </Text>
              </View>
              <Text style={styles.promptHint}>
                Account: {selected.name.toUpperCase()} ({selected.username})
              </Text>
              <Pressable style={styles.calcBtn} onPress={onCalculate}>
                <Text style={styles.calcBtnText}>Calculate WACC</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPickerOpen(false)}
          >
            <Pressable
              style={[
                styles.modalSheet,
                { paddingBottom: Math.max(insets.bottom, rs(16)) },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Select account</Text>
                <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                  <Ionicons name="close" size={rs(22)} color={colors.text} />
                </Pressable>
              </View>
              {accounts.length === 0 ? (
                <Text style={styles.empty}>No accounts saved.</Text>
              ) : (
                <FlatList
                  data={accounts}
                  keyExtractor={(a) => a.id}
                  style={styles.modalList}
                  contentContainerStyle={styles.modalListContent}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item, index }) => (
                    <Pressable
                      style={[
                        styles.pickerRow,
                        index === selectedIdx && styles.pickerRowOn,
                      ]}
                      onPress={() => {
                        setSelectedIdx(index);
                        setPickerOpen(false);
                        setViewing(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerText,
                          index === selectedIdx && styles.pickerTextOn,
                        ]}
                        numberOfLines={2}
                      >
                        {accountLabel(item, index)}
                      </Text>
                      {index === selectedIdx ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={rs(18)}
                          color={colors.primary}
                        />
                      ) : null}
                    </Pressable>
                  )}
                />
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </ProtectedPersonalScreen>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.bgElevated,
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    scroll: { padding: rs(16), paddingBottom: rs(40), gap: rs(10) },
    lead: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(19),
      marginBottom: rs(6),
    },
    label: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(13),
      marginTop: rs(4),
    },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
    dropdownText: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      fontWeight: '600',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      height: '70%',
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(16),
      borderTopRightRadius: rs(16),
      paddingTop: rs(12),
      paddingHorizontal: rs(12),
    },
    modalHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(4),
      paddingBottom: rs(10),
    },
    modalTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    modalList: { flex: 1 },
    modalListContent: { paddingBottom: rs(8) },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(14),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    pickerRowOn: { backgroundColor: c.primarySoft },
    pickerText: { flex: 1, color: c.text, fontSize: rs(13) },
    pickerTextOn: { fontWeight: '700', color: c.primary },
    empty: {
      color: c.textMuted,
      padding: rs(12),
      fontSize: rs(13),
    },
    viewBtn: {
      marginTop: rs(8),
      backgroundColor: c.fab,
      borderRadius: rs(10),
      paddingVertical: rs(13),
      alignItems: 'center',
    },
    viewBtnText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
    btnDisabled: { opacity: 0.45 },
    promptCard: {
      marginTop: rs(16),
      gap: rs(12),
      alignItems: 'center',
    },
    banner: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      backgroundColor: '#1B5E20',
      borderRadius: rs(6),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
    bannerIcon: {
      width: rs(28),
      height: rs(28),
      borderRadius: rs(14),
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerBang: {
      color: '#1B5E20',
      fontWeight: '900',
      fontSize: rs(16),
    },
    bannerText: {
      flex: 1,
      color: '#fff',
      fontWeight: '800',
      fontSize: rs(11),
      lineHeight: rs(15),
      letterSpacing: 0.2,
    },
    promptHint: {
      color: c.textSecondary,
      fontSize: rs(12),
      textAlign: 'center',
    },
    calcBtn: {
      minWidth: rs(180),
      paddingHorizontal: rs(24),
      paddingVertical: rs(12),
      borderRadius: rs(8),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    calcBtnText: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
    },
  });
}
