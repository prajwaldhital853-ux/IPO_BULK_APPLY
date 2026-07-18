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
  const [email, setEmail] = useState('admin@nepseghar.com');
  const [password, setPassword] = useState('admin123');
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
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
        <Text style={styles.title}>Admin Login</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.card}>
        <Ionicons name="shield-checkmark" size={rs(40)} color={colors.tealHeader} />
        <Text style={styles.subtitle}>Demo admin access for subscription management</Text>
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
        <Pressable style={styles.btn} onPress={() => void onLogin()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Login</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>Demo: admin@nepseghar.com / admin123</Text>
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
    card: {
      margin: rs(16),
      padding: rs(20),
      borderRadius: rs(16),
      borderWidth: 1,
      borderColor: c.borderMuted,
      backgroundColor: c.surface,
      gap: rs(12),
      alignItems: 'stretch',
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(18),
      textAlign: 'center',
      marginBottom: rs(4),
    },
    input: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      padding: rs(12),
      color: c.text,
      fontSize: rs(14),
    },
    btn: {
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(14),
      alignItems: 'center',
      marginTop: rs(4),
    },
    btnText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
    hint: {
      color: c.textMuted,
      fontSize: rs(11),
      textAlign: 'center',
      marginTop: rs(4),
    },
  });
}
