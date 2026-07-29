import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { rs } from '../utils/responsive';
import { fetchTeamMembers, type TeamMember } from '../services/team/teamApi';
import type { RootStackParamList } from '../navigation/types';

const FALLBACK_TEAM: TeamMember[] = [
  {
    id: '1',
    name: 'Founder & CEO',
    role: 'Leadership',
    bio: 'Leads product vision for NEPSE GHAR and investor tools under Kalash Financial Solution.',
    email: 'kalashfinancialsolution@gmail.com',
    whatsapp: '9709133067',
    accent: '#42A5F5',
    photoUrl: null,
    sortOrder: 0,
  },
  {
    id: '2',
    name: 'Product & Operations',
    role: 'Operations',
    bio: 'Coordinates MeroShare workflows, customer support, and day-to-day app operations.',
    email: null,
    whatsapp: '9709133067',
    accent: '#66BB6A',
    photoUrl: null,
    sortOrder: 1,
  },
  {
    id: '3',
    name: 'Market Research',
    role: 'Research',
    bio: 'Curates market insights, share news sources, and premium analytics content for users.',
    email: null,
    whatsapp: null,
    accent: '#FFA726',
    photoUrl: null,
    sortOrder: 2,
  },
  {
    id: '4',
    name: 'Support Desk',
    role: 'Customer Care',
    bio: 'Helps with account setup, subscription verification, and payment screenshots on WhatsApp.',
    email: null,
    whatsapp: '9709133067',
    accent: '#AB47BC',
    photoUrl: null,
    sortOrder: 3,
  },
];

export function TeamMembersScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [team, setTeam] = useState<TeamMember[]>(FALLBACK_TEAM);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchTeamMembers();
      if (rows.length) setTeam(rows);
      else setTeam(FALLBACK_TEAM);
    } catch {
      // Keep whatever is already shown (fallback or last good data).
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Team Members</Text>
        <View style={{ width: rs(22) }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
      <FlatList
        data={team}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.introCard}>
            <View style={styles.introHead}>
              <View style={[styles.iconWell, { backgroundColor: '#C8E6C9' }]}>
                <Ionicons name="people-outline" size={rs(18)} color="#2E7D32" />
              </View>
              <Text style={styles.introTitle}>Our team</Text>
            </View>
            <Text style={styles.intro}>
              Meet the people behind NEPSE GHAR — Kalash Financial Solution
              Pvt. Ltd.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: item.accent }]}>
                <Ionicons name="person" size={rs(28)} color="#fff" />
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={[styles.role, { color: item.accent }]}>
                {item.role}
              </Text>
              <Text style={styles.bio}>{item.bio}</Text>
              <View style={styles.actions}>
                {item.email ? (
                  <Pressable
                    style={styles.chip}
                    onPress={() =>
                      void Linking.openURL(`mailto:${item.email}`)
                    }
                  >
                    <Ionicons
                      name="mail-outline"
                      size={rs(14)}
                      color={colors.text}
                    />
                    <Text style={styles.chipText}>Email</Text>
                  </Pressable>
                ) : null}
                {item.whatsapp ? (
                  <Pressable
                    style={styles.chip}
                    onPress={() =>
                      void Linking.openURL(
                        `https://wa.me/977${item.whatsapp}`,
                      )
                    }
                  >
                    <Ionicons
                      name="logo-whatsapp"
                      size={rs(14)}
                      color="#25D366"
                    />
                    <Text style={styles.chipText}>WhatsApp</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        )}
      />
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    list: { padding: rs(16), paddingBottom: rs(40), gap: rs(12) },
    introCard: {
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      paddingHorizontal: rs(14),
      paddingVertical: rs(14),
      marginBottom: rs(2),
    },
    introHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      marginBottom: rs(10),
    },
    iconWell: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
    },
    introTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(14),
    },
    intro: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(20),
    },
    card: {
      flexDirection: 'row',
      gap: rs(12),
      backgroundColor: c.surface,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: c.borderMuted,
      padding: rs(14),
      marginBottom: rs(12),
    },
    avatar: {
      width: rs(56),
      height: rs(56),
      borderRadius: rs(28),
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1 },
    name: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    role: { fontWeight: '700', fontSize: rs(12), marginTop: rs(2) },
    bio: {
      color: c.textSecondary,
      fontSize: rs(12),
      lineHeight: rs(17),
      marginTop: rs(6),
    },
    actions: {
      flexDirection: 'row',
      gap: rs(8),
      marginTop: rs(10),
      flexWrap: 'wrap',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(16),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
    },
    chipText: { color: c.text, fontSize: rs(11), fontWeight: '600' },
  });
}
