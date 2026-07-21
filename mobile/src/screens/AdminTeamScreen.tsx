import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import {
  adminCreateTeamMember,
  adminDeleteTeamMember,
  adminFetchTeam,
  adminUpdateTeamMember,
  type TeamMember,
} from '../services/team/teamApi';
import { loadAdminToken } from '../services/admin/adminTokenStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { rs } from '../utils/responsive';

const ACCENTS = ['#42A5F5', '#66BB6A', '#FFA726', '#AB47BC', '#EF5350', '#26A69A'];

type Draft = {
  id: string | null;
  name: string;
  role: string;
  bio: string;
  email: string;
  whatsapp: string;
  accent: string;
  photoUrl: string | null;
  photoBase64: string | null;
  clearPhoto: boolean;
};

function emptyDraft(): Draft {
  return {
    id: null,
    name: '',
    role: '',
    bio: '',
    email: '',
    whatsapp: '',
    accent: ACCENTS[0],
    photoUrl: null,
    photoBase64: null,
    clearPhoto: false,
  };
}

function toDraft(m: TeamMember): Draft {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    bio: m.bio,
    email: m.email ?? '',
    whatsapp: m.whatsapp ?? '',
    accent: m.accent || ACCENTS[0],
    photoUrl: m.photoUrl,
    photoBase64: null,
    clearPhoto: false,
  };
}

export function AdminTeamScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [token, setToken] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async (adminToken: string) => {
    setLoading(true);
    try {
      const rows = await adminFetchTeam(adminToken);
      setMembers(rows);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const t = await loadAdminToken();
      if (!t) {
        navigation.replace('AdminLogin');
        return;
      }
      setToken(t);
      await load(t);
    })();
  }, [load, navigation]);

  const pickPhoto = async () => {
    if (!draft) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo access so you can set a team member photo.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image. Try another photo.');
      return;
    }
    const mime = asset.mimeType ?? 'image/jpeg';
    setDraft({
      ...draft,
      photoUrl: asset.uri,
      photoBase64: `data:${mime};base64,${asset.base64}`,
      clearPhoto: false,
    });
  };

  const save = async () => {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      Alert.alert('Name required', 'Enter a name for this team member.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        role: draft.role.trim(),
        bio: draft.bio.trim(),
        email: draft.email.trim() || null,
        whatsapp: draft.whatsapp.trim() || null,
        accent: draft.accent,
        photoBase64: draft.photoBase64 ?? undefined,
        clearPhoto: draft.clearPhoto,
      };
      if (draft.id) {
        await adminUpdateTeamMember(token, draft.id, payload);
      } else {
        await adminCreateTeamMember(token, payload);
      }
      setDraft(null);
      await load(token);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (m: TeamMember) => {
    if (!token) return;
    Alert.alert('Delete team member?', m.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminDeleteTeamMember(token, m.id);
            await load(token);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: TeamMember }) => (
    <Pressable style={styles.row} onPress={() => setDraft(toDraft(item))}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: item.accent }]}>
          <Ionicons name="person" size={rs(22)} color="#fff" />
        </View>
      )}
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.role || '—'}
        </Text>
      </View>
      <Pressable
        hitSlop={10}
        onPress={(e) => {
          e.stopPropagation?.();
          confirmDelete(item);
        }}
      >
        <Ionicons name="trash-outline" size={rs(20)} color={colors.danger} />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Team Members</Text>
        <Pressable onPress={() => setDraft(emptyDraft())} hitSlop={12}>
          <Ionicons name="add" size={rs(24)} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: rs(24) }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No team members yet. Tap + to add the first profile.
            </Text>
          }
        />
      )}

      <Modal
        visible={draft != null}
        animationType="slide"
        transparent
        onRequestClose={() => setDraft(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDraft(null)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, rs(16)) }]}
          >
            <View style={styles.grab} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetTitle}>
                {draft?.id ? 'Edit member' : 'New member'}
              </Text>

              <Pressable style={styles.photoPicker} onPress={pickPhoto}>
                {draft?.photoUrl ? (
                  <Image source={{ uri: draft.photoUrl }} style={styles.photoBig} />
                ) : (
                  <View
                    style={[
                      styles.photoBig,
                      { backgroundColor: draft?.accent ?? ACCENTS[0] },
                    ]}
                  >
                    <Ionicons name="camera" size={rs(28)} color="#fff" />
                  </View>
                )}
                <Text style={styles.photoHint}>
                  {draft?.photoUrl ? 'Change photo' : 'Add photo'}
                </Text>
              </Pressable>
              {draft?.photoUrl ? (
                <Pressable
                  onPress={() =>
                    draft &&
                    setDraft({
                      ...draft,
                      photoUrl: null,
                      photoBase64: null,
                      clearPhoto: true,
                    })
                  }
                >
                  <Text style={styles.removePhoto}>Remove photo</Text>
                </Pressable>
              ) : null}

              <Field
                styles={styles}
                label="Name"
                value={draft?.name ?? ''}
                onChangeText={(t) => draft && setDraft({ ...draft, name: t })}
                placeholder="e.g. Ram Sharma"
                colors={colors}
              />
              <Field
                styles={styles}
                label="Role"
                value={draft?.role ?? ''}
                onChangeText={(t) => draft && setDraft({ ...draft, role: t })}
                placeholder="e.g. Founder & CEO"
                colors={colors}
              />
              <Field
                styles={styles}
                label="Bio"
                value={draft?.bio ?? ''}
                onChangeText={(t) => draft && setDraft({ ...draft, bio: t })}
                placeholder="Short description"
                colors={colors}
                multiline
              />
              <Field
                styles={styles}
                label="Email (optional)"
                value={draft?.email ?? ''}
                onChangeText={(t) => draft && setDraft({ ...draft, email: t })}
                placeholder="name@example.com"
                colors={colors}
                keyboardType="email-address"
              />
              <Field
                styles={styles}
                label="WhatsApp (optional)"
                value={draft?.whatsapp ?? ''}
                onChangeText={(t) => draft && setDraft({ ...draft, whatsapp: t })}
                placeholder="98XXXXXXXX"
                colors={colors}
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Accent color</Text>
              <View style={styles.accentRow}>
                {ACCENTS.map((a) => (
                  <Pressable
                    key={a}
                    onPress={() => draft && setDraft({ ...draft, accent: a })}
                    style={[
                      styles.accentDot,
                      { backgroundColor: a },
                      draft?.accent === a && styles.accentDotActive,
                    ]}
                  />
                ))}
              </View>

              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
                onPress={() => void save()}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>
                    {draft?.id ? 'Save changes' : 'Add member'}
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setDraft(null)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({
  styles,
  colors,
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View style={{ marginTop: rs(12) }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      />
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
      paddingVertical: rs(10),
    },
    title: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(24) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    avatar: {
      width: rs(44),
      height: rs(44),
      borderRadius: rs(22),
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowMain: { flex: 1, minWidth: 0 },
    rowTitle: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    rowSub: { color: c.textSecondary, fontSize: rs(12), marginTop: rs(2) },
    empty: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(24),
      fontSize: rs(13),
      paddingHorizontal: rs(24),
      lineHeight: rs(19),
    },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(20),
      paddingTop: rs(8),
      maxHeight: '90%',
    },
    grab: {
      alignSelf: 'center',
      width: rs(36),
      height: rs(4),
      borderRadius: rs(2),
      backgroundColor: c.border,
      marginBottom: rs(12),
    },
    sheetTitle: { color: c.text, fontWeight: '800', fontSize: rs(17) },
    photoPicker: { alignItems: 'center', marginTop: rs(14) },
    photoBig: {
      width: rs(84),
      height: rs(84),
      borderRadius: rs(42),
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoHint: { color: c.primary, fontWeight: '700', fontSize: rs(12), marginTop: rs(8) },
    removePhoto: {
      color: c.danger,
      textAlign: 'center',
      fontSize: rs(12),
      marginTop: rs(4),
    },
    fieldLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: rs(12),
    },
    input: {
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      color: c.text,
      fontSize: rs(14),
      marginTop: rs(6),
      backgroundColor: c.bg,
    },
    inputMultiline: { minHeight: rs(70), textAlignVertical: 'top' },
    accentRow: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
    accentDot: {
      width: rs(30),
      height: rs(30),
      borderRadius: rs(15),
      borderWidth: 2,
      borderColor: 'transparent',
    },
    accentDotActive: { borderColor: c.text },
    saveBtn: {
      backgroundColor: c.fab,
      borderRadius: rs(12),
      paddingVertical: rs(14),
      alignItems: 'center',
      marginTop: rs(20),
    },
    saveText: { color: c.fabIcon, fontWeight: '800', fontSize: rs(14) },
    cancelBtn: { alignItems: 'center', paddingVertical: rs(12), marginTop: rs(4) },
    cancelText: { color: c.textSecondary, fontWeight: '600', fontSize: rs(13) },
  });
}
