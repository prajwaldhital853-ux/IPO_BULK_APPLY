import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { PromoBanner } from '../components/PromoBanner';
import { useOpenDrawer } from '../navigation/useOpenDrawer';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';

const GENERAL = [
  { label: 'Settings', icon: 'settings-outline' as const, bg: '#424242' },
  { label: 'Notifications', icon: 'notifications-outline' as const, bg: '#1A237E' },
  { label: 'Rate this App', icon: 'star-outline' as const, bg: '#5D4037' },
  { label: 'Whatsapp Group', icon: 'logo-whatsapp' as const, bg: '#4A148C' },
  { label: 'Share this App', icon: 'share-social-outline' as const, bg: '#1B5E20' },
  { label: 'Feedback', icon: 'mail-outline' as const, bg: '#880E4F' },
  { label: 'Feature Request', icon: 'play-forward-outline' as const, bg: '#311B92' },
];

export function ProfileScreen() {
  const openDrawer = useOpenDrawer();

  return (
    <View style={styles.root}>
      <AppHeader
        onMenuPress={openDrawer}
        showActions={false}
        right={
          <View style={styles.headerRight}>
            <View style={styles.toggleOff} />
            <Ionicons name="ellipsis-vertical" size={rs(20)} color={colors.text} />
          </View>
        }
      />
      <PromoBanner />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatarGlow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={rs(40)} color="#90CAF9" />
            </View>
          </View>
          <Text style={styles.guest}>Guest</Text>
          <Text style={styles.free}>FREE</Text>
          <Pressable style={styles.loginBtn}>
            <Text style={styles.loginText}>Log In</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Account Settings</Text>
          <Pressable style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#5D4037' }]}>
              <Ionicons name="receipt-outline" size={rs(18)} color={colors.text} />
            </View>
            <Text style={styles.rowLabel}>Subscription</Text>
            <Ionicons name="refresh-circle" size={rs(22)} color={colors.teal} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>General Options</Text>
          {GENERAL.map((item) => (
            <Pressable key={item.label} style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={rs(18)} color={colors.text} />
              </View>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Connect With Us</Text>
          <Pressable style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: '#0D47A1' }]}>
              <Ionicons name="logo-facebook" size={rs(18)} color={colors.text} />
            </View>
            <Text style={styles.rowLabel}>Facebook Page</Text>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textDim} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: rs(12) },
  toggleOff: {
    width: rs(36),
    height: rs(20),
    borderRadius: rs(10),
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: { paddingBottom: rs(40) },
  hero: { alignItems: 'center', paddingVertical: rs(24) },
  avatarGlow: {
    width: rs(100),
    height: rs(100),
    borderRadius: rs(50),
    backgroundColor: '#1A237E55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: rs(72),
    height: rs(72),
    borderRadius: rs(36),
    backgroundColor: '#263238',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guest: {
    color: colors.text,
    fontSize: rs(20),
    fontWeight: '800',
    marginTop: rs(12),
  },
  free: {
    color: '#4FC3F7',
    fontWeight: '700',
    marginTop: rs(4),
    marginBottom: rs(12),
  },
  loginBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(10),
    paddingHorizontal: rs(28),
    paddingVertical: rs(10),
    backgroundColor: colors.surface,
  },
  loginText: { color: colors.text, fontWeight: '600' },
  card: {
    marginHorizontal: rs(16),
    marginBottom: rs(14),
    borderRadius: rs(14),
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: rs(12),
  },
  section: {
    color: colors.textSecondary,
    fontSize: rs(12),
    fontWeight: '700',
    marginBottom: rs(8),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(10),
    gap: rs(12),
  },
  rowIcon: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, color: colors.text, fontSize: rs(14), fontWeight: '500' },
});
