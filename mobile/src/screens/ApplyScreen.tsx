import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function ApplyScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const { accounts } = useAccounts();
  const [mode, setMode] = useState<'Bulk' | 'Single'>('Bulk');
  const [qty, setQty] = useState('10');

  const primary = accounts[0];

  return (
    <View style={styles.root}>
      <AppHeader onMenuPress={openDrawer} />
      <PromoBanner />

      {accounts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyArt}>
            <View style={styles.emptyCircle}>
              <MaterialCommunityIcons
                name="file-document-outline"
                size={rs(48)}
                color="#90CAF9"
              />
            </View>
            <View style={styles.plusBubble}>
              <Ionicons name="add" size={rs(28)} color={colors.text} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>Oops! No Data Found</Text>
          <Text style={styles.emptySub}>
            Please add some data first to apply bulk IPO
          </Text>
          <Pressable
            style={styles.addDataBtn}
            onPress={() => navigation.navigate('AddCapital')}
          >
            <Text style={styles.addDataText}>Add Data</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryName}>{primary.name}</Text>
            <View style={styles.valueRow}>
              <View>
                <Text style={styles.valueLabel}>Total current value</Text>
                <Text style={styles.valueAmount}>Rs. 0</Text>
              </View>
              <View style={styles.deltaPill}>
                <Text style={styles.deltaText}>- Rs. 0</Text>
                <Ionicons name="eye-outline" size={rs(14)} color={colors.text} />
              </View>
            </View>
            <Pressable style={styles.summaryBtn}>
              <Text style={styles.summaryBtnText}>Current Investment Summary</Text>
            </Pressable>
          </View>

          <View style={styles.modeRow}>
            <View style={styles.modeToggle}>
              {(['Bulk', 'Single'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode === m && styles.modeTextActive,
                    ]}
                  >
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Ionicons
              name="information-circle-outline"
              size={rs(20)}
              color={colors.textSecondary}
            />
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.labelRow}>
              <MaterialCommunityIcons
                name="bank"
                size={rs(16)}
                color={colors.textSecondary}
              />
              <Text style={styles.label}>Current Opening IPO/FPO/Right</Text>
            </View>
            <Pressable style={styles.dropdown}>
              <Text style={styles.dropdownText}>No Any Opening</Text>
              <Ionicons name="chevron-down" size={rs(18)} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.labelRow}>
              <Text style={styles.hash}>#</Text>
              <Text style={styles.label}>Quantity</Text>
            </View>
            <View style={styles.dropdown}>
              <TextInput
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
                style={styles.qtyInput}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {mode === 'Bulk' ? (
            <Pressable style={styles.autoApply}>
              <Text style={styles.autoApplyText}>Auto Apply</Text>
            </Pressable>
          ) : (
            <View style={styles.accountRow}>
              <View style={styles.indexBadge}>
                <Text style={styles.indexText}>1</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accName}>{primary.name}</Text>
                <Text style={styles.accBank}>
                  {primary.bankName || primary.dpName}
                </Text>
              </View>
              <Pressable style={styles.applyDisabled}>
                <Text style={styles.applyDisabledText}>Apply</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(28),
  },
  emptyArt: {
    width: rs(160),
    height: rs(160),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rs(16),
  },
  emptyCircle: {
    width: rs(120),
    height: rs(120),
    borderRadius: rs(60),
    backgroundColor: '#1A3A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBubble: {
    position: 'absolute',
    width: rs(52),
    height: rs(52),
    borderRadius: rs(26),
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: rs(20),
    fontWeight: '700',
    marginBottom: rs(8),
  },
  emptySub: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: rs(20),
    fontSize: rs(14),
  },
  addDataBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: rs(24),
    paddingHorizontal: rs(28),
    paddingVertical: rs(10),
  },
  addDataText: {
    color: colors.sage,
    fontWeight: '600',
    fontSize: rs(15),
  },
  content: { padding: rs(16), paddingBottom: rs(40) },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(14),
    padding: rs(14),
    backgroundColor: colors.surface,
    marginBottom: rs(16),
  },
  summaryName: {
    color: colors.text,
    fontWeight: '800',
    fontSize: rs(15),
    letterSpacing: 0.4,
  },
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: rs(10),
  },
  valueLabel: { color: colors.textSecondary, fontSize: rs(12) },
  valueAmount: {
    color: colors.text,
    fontSize: rs(26),
    fontWeight: '700',
    marginTop: rs(4),
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    backgroundColor: colors.surfaceAlt,
    borderRadius: rs(16),
    paddingHorizontal: rs(10),
    paddingVertical: rs(6),
  },
  deltaText: { color: colors.textSecondary, fontSize: rs(12) },
  summaryBtn: {
    marginTop: rs(14),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(10),
    paddingVertical: rs(10),
    alignItems: 'center',
  },
  summaryBtnText: { color: colors.sage, fontSize: rs(13), fontWeight: '600' },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(12),
    marginBottom: rs(18),
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: rs(20),
    padding: rs(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeBtn: {
    paddingHorizontal: rs(22),
    paddingVertical: rs(8),
    borderRadius: rs(16),
  },
  modeBtnActive: { backgroundColor: colors.sage },
  modeText: { color: colors.text, fontWeight: '600', fontSize: rs(13) },
  modeTextActive: { color: colors.bg },
  fieldBlock: { marginBottom: rs(14) },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    marginBottom: rs(8),
  },
  label: { color: colors.textSecondary, fontSize: rs(13) },
  hash: { color: colors.textSecondary, fontWeight: '700' },
  dropdown: {
    minHeight: rs(48),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: rs(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
  },
  dropdownText: { color: colors.textMuted, fontSize: rs(14) },
  qtyInput: { flex: 1, color: colors.text, fontSize: rs(15), paddingVertical: rs(10) },
  autoApply: {
    marginTop: rs(20),
    backgroundColor: colors.sage,
    borderRadius: rs(28),
    paddingVertical: rs(14),
    alignItems: 'center',
  },
  autoApplyText: {
    color: colors.bg,
    fontWeight: '800',
    fontSize: rs(16),
  },
  accountRow: {
    marginTop: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: colors.border,
    padding: rs(12),
    backgroundColor: colors.surface,
  },
  indexBadge: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(14),
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: colors.text, fontWeight: '700' },
  accName: { color: colors.text, fontWeight: '700', fontSize: rs(14) },
  accBank: { color: colors.textSecondary, fontSize: rs(12), marginTop: rs(2) },
  applyDisabled: {
    paddingHorizontal: rs(14),
    paddingVertical: rs(8),
    borderRadius: rs(8),
    backgroundColor: colors.surfaceAlt,
  },
  applyDisabledText: { color: colors.textMuted, fontWeight: '600' },
});
