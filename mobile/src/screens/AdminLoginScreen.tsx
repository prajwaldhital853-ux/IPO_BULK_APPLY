import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { adminLogin } from '../services/admin/adminApi';
import { saveAdminToken } from '../services/admin/adminTokenStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

export function AdminLoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter admin email and password.');
      return;
    }
    setBusy(true);
    try {
      const session = await adminLogin(email.trim(), password);
      await saveAdminToken(session.accessToken);
      navigation.replace('AdminDashboard');
    } catch (e) {
      Alert.alert(
        'Login failed',
        e instanceof Error ? e.message : 'Invalid credentials',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={rs(32)} color={colors.fabIcon} />
        </View>
        <Text style={styles.subtitle}>Sign in to manage subscriptions</Text>

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Admin email"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          style={[styles.btn, busy && { opacity: 0.7 }]}
          onPress={() => void onLogin()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.fabIcon} />
          ) : (
            <Text style={styles.btnText}>Login</Text>
          )}
        </Pressable>
        {busy ? (
          <Text style={styles.wakeHint}>Signing in…</Text>
        ) : null}
        <Pressable
          style={styles.forgotBtn}
          onPress={() => navigation.navigate('AdminForgotPassword')}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>
      </View>
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
    body: {
      paddingHorizontal: rs(24),
      paddingTop: rs(32),
      maxWidth: rs(400),
      alignSelf: 'center',
      width: '100%',
    },
    iconWrap: {
      width: rs(56),
      height: rs(56),
      borderRadius: rs(28),
      backgroundColor: c.fab,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: rs(16),
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(14),
      textAlign: 'center',
      marginBottom: rs(24),
    },
    input: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      padding: rs(14),
      color: c.text,
      fontSize: rs(14),
      marginBottom: rs(12),
      backgroundColor: c.surface,
    },
    btn: {
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(14),
      alignItems: 'center',
      marginTop: rs(4),
    },
    btnText: { color: c.fabIcon, fontWeight: '800', fontSize: rs(15) },
    wakeHint: {
      color: c.textMuted,
      fontSize: rs(12),
      textAlign: 'center',
      marginTop: rs(10),
      lineHeight: rs(16),
    },
    forgotBtn: { alignItems: 'center', marginTop: rs(16), paddingVertical: rs(8) },
    forgotText: { color: c.primary, fontWeight: '600', fontSize: rs(14) },
  });
}
