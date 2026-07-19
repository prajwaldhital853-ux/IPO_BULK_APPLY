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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { submitFeedback, type FeedbackKind } from '../services/app/feedbackApi';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

export function FeedbackFormScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'FeedbackForm'>>();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const kind: FeedbackKind = route.params?.kind ?? 'feedback';
  const isFeature = kind === 'feature_request';

  const [name, setName] = useState(auth.user?.name ?? '');
  const [email, setEmail] = useState(auth.user?.email ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const title = isFeature ? 'Feature request' : 'Feedback';
  const placeholder = isFeature
    ? 'Describe the feature you want and why it helps…'
    : 'Tell us what you like, what to improve, or any issue…';

  const onSubmit = async () => {
    if (message.trim().length < 5) {
      Alert.alert('Too short', 'Please write at least a few words.');
      return;
    }
    setBusy(true);
    try {
      await submitFeedback({
        kind,
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });
      Alert.alert(
        'Thank you',
        isFeature
          ? 'Your feature request was sent to the admin team.'
          : 'Your feedback was sent to the admin team.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
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
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Submitted forms appear in the admin panel for review.
        </Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email for follow-up"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>{isFeature ? 'Feature details' : 'Message'}</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />

        <Pressable style={styles.btn} onPress={() => void onSubmit()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.fabIcon} />
          ) : (
            <Text style={styles.btnText}>Submit</Text>
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
    body: { padding: rs(20), paddingBottom: rs(40) },
    subtitle: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(20),
      marginBottom: rs(20),
    },
    label: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginBottom: rs(6),
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(12),
      padding: rs(14),
      color: c.text,
      fontSize: rs(14),
      marginBottom: rs(14),
      backgroundColor: c.surface,
    },
    textarea: { minHeight: rs(140) },
    btn: {
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(14),
      alignItems: 'center',
      marginTop: rs(8),
    },
    btnText: { color: c.fabIcon, fontWeight: '800', fontSize: rs(15) },
  });
}
