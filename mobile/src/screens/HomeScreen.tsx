import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDrawer = useOpenDrawer();
  const { accounts } = useAccounts();
  const [tab, setTab] = useState<'Accounts' | 'Market'>('Accounts');

  return (
    <View style={styles.root}>
      <AppHeader onMenuPress={openDrawer} />
      <PromoBanner />

      <View style={styles.tabs}>
        {(['Accounts', 'Market'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.tabBtn}>
            <Text style={[styles.tabText, tab === t && styles.tabActive]}>{t}</Text>
            {tab === t ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        ))}
      </View>

      {tab === 'Market' ? (
        <View style={styles.emptyMarket}>
          <Text style={styles.emptyTitle}>Market</Text>
          <Text style={styles.emptySub}>Coming in next design drop</Text>
        </View>
      ) : (
        <>
          <View style={styles.listHead}>
            <Text style={styles.total}>Total Accounts : {accounts.length}</Text>
            <View style={styles.listActions}>
              <Ionicons name="search" size={rs(18)} color={colors.textSecondary} />
              <Ionicons name="share-outline" size={rs(18)} color={colors.textSecondary} />
              <Ionicons name="information-circle-outline" size={rs(18)} color={colors.textSecondary} />
            </View>
          </View>

          <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyMarket}>
                <Text style={styles.emptySub}>No accounts yet. Tap + to add.</Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <View style={styles.card}>
                <View style={styles.indexBadge}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.verified ? (
                      <Ionicons name="checkmark-circle" size={rs(16)} color={colors.accentGreen} />
                    ) : null}
                  </View>
                  <Text style={styles.username}>Username : {item.username}</Text>
                </View>
                <Ionicons name="ellipsis-vertical" size={rs(18)} color={colors.textSecondary} />
              </View>
            )}
          />

          <Pressable
            style={styles.fab}
            onPress={() => navigation.navigate('AddCapital')}
          >
            <Ionicons name="add" size={rs(28)} color={colors.text} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: rs(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabBtn: { marginRight: rs(24), paddingTop: rs(12), paddingBottom: rs(10) },
  tabText: { color: colors.textMuted, fontSize: rs(15), fontWeight: '600' },
  tabActive: { color: colors.text },
  tabUnderline: {
    marginTop: rs(8),
    height: rs(3),
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
  },
  total: { color: colors.text, fontSize: rs(14), fontWeight: '600' },
  listActions: { flexDirection: 'row', gap: rs(14) },
  list: { paddingHorizontal: rs(16), paddingBottom: rs(100) },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(12),
    padding: rs(12),
    marginBottom: rs(10),
    backgroundColor: colors.surface,
    gap: rs(12),
  },
  indexBadge: {
    width: rs(28),
    height: rs(28),
    borderRadius: rs(8),
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: colors.text, fontWeight: '700', fontSize: rs(13) },
  cardBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  name: { color: colors.text, fontWeight: '700', fontSize: rs(14) },
  username: { color: colors.textSecondary, fontSize: rs(12), marginTop: rs(2) },
  fab: {
    position: 'absolute',
    right: rs(20),
    bottom: rs(20),
    width: rs(56),
    height: rs(56),
    borderRadius: rs(28),
    backgroundColor: colors.fab,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  emptyMarket: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rs(24),
  },
  emptyTitle: { color: colors.text, fontSize: rs(18), fontWeight: '700' },
  emptySub: { color: colors.textSecondary, marginTop: rs(8), textAlign: 'center' },
});
