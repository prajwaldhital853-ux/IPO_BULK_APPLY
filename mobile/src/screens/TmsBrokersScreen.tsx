import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { loadTmsBrokers, type TmsBrokerRow } from '../services/nepse/resources';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

export function TmsBrokersScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<TmsBrokerRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadTmsBrokers());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.includes(q) ||
        r.address?.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const openUrl = (url: string | null) => {
    if (!url) return;
    void Linking.openURL(url);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>TMS Brokers</Text>
        <View style={{ width: rs(22) }} />
      </View>
      <Text style={styles.subtitle}>
        NEPSE TMS login links, websites and broker contact numbers.
      </Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search broker name or code…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listBody}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {item.iconUrl ? (
                  <Image source={{ uri: item.iconUrl }} style={styles.logo} />
                ) : (
                  <View style={styles.logoFallback}>
                    <Text style={styles.logoLetter}>{item.code || '?'}</Text>
                  </View>
                )}
                <View style={styles.cardMid}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>Broker #{item.code}</Text>
                  {item.address ? (
                    <Text style={styles.meta} numberOfLines={2}>
                      {item.address}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.actions}>
                {item.tmsLoginUrl ? (
                  <Pressable
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => openUrl(item.tmsLoginUrl)}
                  >
                    <Ionicons name="log-in-outline" size={rs(14)} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Open TMS</Text>
                  </Pressable>
                ) : null}
                {item.website ? (
                  <Pressable
                    style={styles.btn}
                    onPress={() => openUrl(item.website)}
                  >
                    <Ionicons name="globe-outline" size={rs(14)} color={colors.primary} />
                    <Text style={styles.btnText}>Website</Text>
                  </Pressable>
                ) : null}
              </View>

              {item.contacts.length > 0 ? (
                <View style={styles.contacts}>
                  {item.contacts.slice(0, 3).map((c, i) => (
                    <Pressable
                      key={`${c.phone}-${i}`}
                      style={styles.contactRow}
                      onPress={() => void Linking.openURL(`tel:${c.phone.replace(/\s/g, '')}`)}
                    >
                      <Ionicons name="call-outline" size={rs(14)} color={colors.accentGreen} />
                      <Text style={styles.contactText}>
                        {c.name}: {c.phone.trim()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query ? 'No brokers match your search.' : 'No brokers loaded.'}
            </Text>
          }
        />
      )}
    </View>
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
      paddingVertical: rs(12),
    },
    title: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      paddingHorizontal: rs(16),
      paddingBottom: rs(8),
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
      marginBottom: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      borderRadius: rs(10),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    searchInput: { flex: 1, color: c.text, fontSize: rs(14) },
    listBody: { paddingHorizontal: rs(12), paddingBottom: rs(24) },
    card: {
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(12),
      marginBottom: rs(10),
    },
    cardTop: { flexDirection: 'row', gap: rs(10) },
    logo: { width: rs(40), height: rs(40), borderRadius: rs(8) },
    logoFallback: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(8),
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoLetter: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    cardMid: { flex: 1, minWidth: 0 },
    name: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    meta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8), marginTop: rs(12) },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      borderRadius: rs(8),
      backgroundColor: c.primarySoft,
    },
    btnPrimary: { backgroundColor: c.primary },
    btnText: { color: c.primary, fontWeight: '700', fontSize: rs(12) },
    btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: rs(12) },
    contacts: { marginTop: rs(10), gap: rs(6) },
    contactRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
    contactText: { color: c.textSecondary, fontSize: rs(11), flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: rs(40),
    },
  });
}
