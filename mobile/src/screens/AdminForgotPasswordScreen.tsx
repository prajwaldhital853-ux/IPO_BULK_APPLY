import React, { useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { PasswordRequirementsLive } from '../components/PasswordRequirementsLive';
import {
  requestAdminPasswordReset,
  resetAdminPassword,
} from '../services/admin/adminApi';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import {
  isPasswordStrong,
  passwordsMatch,
} from '../utils/passwordPolicy';
import { rs } from '../utils/responsive';

export function AdminForgotPasswordScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const onSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter the admin Gmail address.');
      return;
    }
    setBusy(true);
    try {
      const msg = await requestAdminPasswordReset(email.trim());
      setCodeSent(true);
      Alert.alert(
        'Check your email',
        `${msg}\n\nEnter the 6-digit code in the field below, then set a new password.`,
      );
    } catch (e) {
      Alert.alert('Could not send code', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter the admin Gmail address.');
      return;
    }
    if (otp.trim().length !== 6) {
      Alert.alert('Invalid', 'Enter the 6-digit code from email.');
      return;
    }
    if (!isPasswordStrong(newPassword)) {
      Alert.alert(
        'Weak password',
        'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
      );
      return;
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      Alert.alert('Mismatch', 'New password and confirm password do not match.');
      return;
    }
    setBusy(true);
    try {
      await resetAdminPassword(email.trim(), otp.trim(), newPassword);
      Alert.alert('Password updated', 'You can sign in with your new password.', [
        { text: 'OK', onPress: () => navigation.replace('AdminLogin') },
      ]);
    } catch (e) {
      Alert.alert('Reset failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const canReset =
    email.trim().length > 0 &&
    otp.trim().length === 6 &&
    isPasswordStrong(newPassword) &&
    passwordsMatch(newPassword, confirmPassword);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Reset password</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          1) Send a code to the admin Gmail{'\n'}
          2) Enter the code below{'\n'}
          3) Choose a new password
        </Text>

        {codeSent ? (
          <View style={styles.sentBanner}>
            <Ionicons name="mail-open-outline" size={rs(16)} color={colors.primary} />
            <Text style={styles.sentText}>
              Code sent. Open Gmail, copy the 6-digit code, and enter it below.
            </Text>
          </View>
        ) : null}

        <Text style={styles.label}>Admin email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Admin email"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          editable={!busy}
        />

        <Pressable
          style={[styles.btn, busy && { opacity: 0.65 }]}
          onPress={() => void onSendOtp()}
          disabled={busy}
        >
          {busy && !otp ? (
            <ActivityIndicator color={colors.fabIcon} />
          ) : (
            <Text style={styles.btnText}>
              {codeSent ? 'Resend verification code' : 'Send verification code'}
            </Text>
          )}
        </Pressable>

        <Text style={[styles.label, { marginTop: rs(20) }]}>
          6-digit code from email
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholder="Enter OTP from Gmail"
          placeholderTextColor={colors.textMuted}
          value={otp}
          onChangeText={setOtp}
          maxLength={6}
          editable={!busy}
        />

        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="New password"
          placeholderTextColor={colors.textMuted}
          value={newPassword}
          onChangeText={setNewPassword}
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Confirm new password"
          placeholderTextColor={colors.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!busy}
        />
        <PasswordRequirementsLive
          password={newPassword}
          confirmPassword={confirmPassword}
          colors={colors}
        />

        <Pressable
          style={[styles.btn, (!canReset || busy) && { opacity: 0.65 }]}
          onPress={() => void onReset()}
          disabled={busy || !canReset}
        >
          {busy && otp ? (
            <ActivityIndicator color={colors.fabIcon} />
          ) : (
            <Text style={styles.btnText}>Verify code & set password</Text>
          )}
        </Pressable>
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
    body: {
      paddingHorizontal: rs(24),
      paddingTop: rs(24),
      paddingBottom: rs(40),
      maxWidth: rs(420),
      alignSelf: 'center',
      width: '100%',
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(14),
      textAlign: 'center',
      marginBottom: rs(16),
      lineHeight: rs(20),
    },
    sentBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
      backgroundColor: c.primary + '18',
      borderColor: c.primary,
      borderWidth: 1,
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(14),
    },
    sentText: {
      color: c.text,
      fontSize: rs(12),
      fontWeight: '600',
      flex: 1,
      lineHeight: rs(17),
    },
    label: {
      color: c.textMuted,
      fontSize: rs(12),
      fontWeight: '700',
      marginBottom: rs(6),
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
  });
}
