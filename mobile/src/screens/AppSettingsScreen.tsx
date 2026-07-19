import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import {
  loadNotificationsEnabled,
  saveNotificationsEnabled,
} from '../storage/appPreferencesStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

export function AppSettingsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [notifications, setNotifications] = useState(true);
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.android?.versionCode;

  useEffect(() => {
    void loadNotificationsEnabled().then((enabled) => {
      setNotifications(enabled);
      setLoadingPrefs(false);
    });
  }, []);

  const onToggleNotifications = async () => {
    const next = !notifications;
    setNotifications(next);
    await saveNotificationsEnabled(next);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>Appearance</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={toggle}>
            <View style={[styles.icon, { backgroundColor: isDark ? '#424242' : '#E3F2FD' }]}>
              <Ionicons
                name={isDark ? 'moon' : 'sunny-outline'}
                size={rs(18)}
                color={isDark ? '#FFD54F' : '#1565C0'}
              />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Dark mode</Text>
              <Text style={styles.rowHint}>{isDark ? 'On' : 'Off'}</Text>
            </View>
            <View
              style={[
                styles.toggleTrack,
                { backgroundColor: isDark ? colors.primary : colors.primarySoft },
              ]}
            >
              <View
                style={[
                  styles.toggleThumb,
                  { alignSelf: isDark ? 'flex-end' : 'flex-start' },
                ]}
              />
            </View>
          </Pressable>
        </View>

        <Text style={styles.section}>Notifications</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={() => void onToggleNotifications()}
            disabled={loadingPrefs}
          >
            <View style={[styles.icon, { backgroundColor: '#BBDEFB' }]}>
              <Ionicons name="notifications-outline" size={rs(18)} color="#1565C0" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>App notifications</Text>
              <Text style={styles.rowHint}>
                {notifications
                  ? 'Enabled for alerts and updates'
                  : 'Disabled on this device'}
              </Text>
            </View>
            <View
              style={[
                styles.toggleTrack,
                { backgroundColor: notifications ? colors.primary : colors.primarySoft },
              ]}
            >
              <View
                style={[
                  styles.toggleThumb,
                  { alignSelf: notifications ? 'flex-end' : 'flex-start' },
                ]}
              />
            </View>
          </Pressable>
        </View>

        <Text style={styles.section}>Account</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Subscription')}
          >
            <View style={[styles.icon, { backgroundColor: '#FFE0B2' }]}>
              <Ionicons name="receipt-outline" size={rs(18)} color="#EF6C00" />
            </View>
            <Text style={styles.rowLabel}>Subscription & premium</Text>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
          </Pressable>
        </View>

        <Text style={styles.section}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: '#CFD8DC' }]}>
              <Ionicons name="information-circle-outline" size={rs(18)} color="#455A64" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>App version</Text>
              <Text style={styles.rowHint}>
                v{version}
                {build != null ? ` (${build})` : ''}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    scroll: { padding: rs(16), paddingBottom: rs(40) },
    section: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '700',
      marginBottom: rs(8),
      marginTop: rs(4),
      textTransform: 'uppercase',
    },
    card: {
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      marginBottom: rs(16),
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: rs(14),
      gap: rs(12),
    },
    icon: {
      width: rs(36),
      height: rs(36),
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: { flex: 1 },
    rowLabel: { color: c.text, fontWeight: '600', fontSize: rs(14) },
    rowHint: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
    toggleTrack: {
      width: rs(40),
      height: rs(22),
      borderRadius: rs(11),
      paddingHorizontal: rs(2),
      justifyContent: 'center',
    },
    toggleThumb: {
      width: rs(18),
      height: rs(18),
      borderRadius: rs(9),
      backgroundColor: '#FFFFFF',
    },
  });
}
