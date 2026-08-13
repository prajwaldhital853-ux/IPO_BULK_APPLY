import React, { useEffect, useMemo, useState } from 'react';
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
import { adminLogin, verifyAdminLogin } from '../services/admin/adminApi';
import { saveAdminToken } from '../services/admin/adminTokenStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

function parseLockSeconds(message: string): number | null {
  const m = message.match(/(\d+)\s*more\s*minute/i);
  if (m) return Math.max(1, Number(m[1])) * 60;
  const m2 = message.match(/locked for (\d+)\s*minute/i);
  if (m2) return Math.max(1, Number(m2[1])) * 60;
  if (/locked/i.test(message)) return 5 * 60;
  return null;
}

export function AdminLoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [busy, setBusy] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);

  useEffect(() => {
    if (lockSecondsLeft <= 0) return;
    const id = setInterval(() => {
      setLockSecondsLeft((s) => {
        if (s <= 1) {
          setLockMessage(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [lockSecondsLeft > 0]);

  const locked = lockSecondsLeft > 0;
  const lockMins = Math.ceil(lockSecondsLeft / 60);

  const onLogin = async () => {
    if (locked) {
      Alert.alert(
        'Login locked',
        `Too many failed attempts. Try again in about ${lockMins} minute(s).`,
      );
      return;
    }
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter admin email and password.');
      return;
    }
    setBusy(true);
    try {
      const session = await adminLogin(email.trim(), password);
      setLockMessage(null);
      setLockSecondsLeft(0);
      if (session.needsOtp) {
        const alreadyOnOtp = step === 'otp';
        setMaskedEmail(session.maskedEmail);
        setOtp('');
        setStep('otp');
        if (!alreadyOnOtp) {
          Alert.alert(
            'Verify this device',
            `A 6-digit code was sent to ${session.maskedEmail || 'the admin Gmail'}. Enter it to continue.`,
          );
        }
        return;
      }
      await saveAdminToken(session.accessToken);
      navigation.replace('AdminDashboard');
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Invalid credentials';
      const secs = parseLockSeconds(message);
      if (secs != null) {
        setLockMessage(message);
        setLockSecondsLeft(secs);
      } else {
        setLockMessage(null);
      }
      Alert.alert('Login failed', message);
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async () => {
    if (otp.trim().length !== 6) {
      Alert.alert('Enter the code', 'Type the 6-digit code from the admin Gmail.');
      return;
    }
    setBusy(true);
    try {
      const session = await verifyAdminLogin(email.trim(), password, otp.trim());
      await saveAdminToken(session.accessToken);
      setLockMessage(null);
      setLockSecondsLeft(0);
      navigation.replace('AdminDashboard');
    } catch (e) {
      Alert.alert(
        'Verification failed',
        e instanceof Error ? e.message : 'Invalid code',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (step === 'otp') {
              setStep('credentials');
              setOtp('');
              return;
            }
            navigation.goBack();
          }}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Admin</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={rs(32)} color={colors.fabIcon} />
        </View>
        <Text style={styles.subtitle}>
          {step === 'otp'
            ? `Enter the code sent to ${maskedEmail || 'admin Gmail'}`
            : 'Sign in to manage subscriptions'}
        </Text>

        {locked || lockMessage ? (
          <View style={styles.lockBanner}>
            <Ionicons name="lock-closed" size={rs(16)} color={colors.danger} />
            <Text style={styles.lockText}>
              {locked
                ? `This device is locked. Try again in ~${lockMins} min (${lockSecondsLeft}s). Other devices can still log in.`
                : lockMessage}
            </Text>
          </View>
        ) : null}

        {step === 'credentials' ? (
          <>
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
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              editable={!busy && !locked}
            />
            <Pressable
              style={[styles.btn, (busy || locked) && { opacity: 0.7 }]}
              onPress={() => void onLogin()}
              disabled={busy || locked}
            >
              {busy ? (
                <ActivityIndicator color={colors.fabIcon} />
              ) : (
                <Text style={styles.btnText}>
                  {locked ? `Locked (${lockMins}m)` : 'Login'}
                </Text>
              )}
            </Pressable>
            {busy ? (
              <Text style={styles.wakeHint}>Signing in…</Text>
            ) : (
              <Text style={styles.wakeHint}>
                New or unknown devices need a Gmail code after the password.
                After 3 failed attempts, login locks for 5 minutes.
              </Text>
            )}
            <Pressable
              style={styles.forgotBtn}
              onPress={() => navigation.navigate('AdminForgotPassword')}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="6-digit code"
              placeholderTextColor={colors.textMuted}
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              editable={!busy}
            />
            <Pressable
              style={[styles.btn, busy && { opacity: 0.7 }]}
              onPress={() => void onVerifyOtp()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.fabIcon} />
              ) : (
                <Text style={styles.btnText}>Verify and continue</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.forgotBtn}
              onPress={() => void onLogin()}
              disabled={busy}
            >
              <Text style={styles.forgotText}>Resend code</Text>
            </Pressable>
            <Text style={styles.wakeHint}>
              This phone is remembered after a successful code so you will not
              be asked again until you reinstall the app.
            </Text>
          </>
        )}
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
    lockBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: rs(8),
      backgroundColor: c.danger + '18',
      borderColor: c.danger,
      borderWidth: 1,
      borderRadius: rs(10),
      padding: rs(12),
      marginBottom: rs(14),
    },
    lockText: {
      color: c.danger,
      fontSize: rs(12),
      fontWeight: '600',
      flex: 1,
      lineHeight: rs(17),
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
