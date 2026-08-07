import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type CloudNote,
} from '../services/notes/notesApi';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

function formatUpdated(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-NP', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function previewBody(body: string): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (!t) return 'No text';
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

export function NotesScreen() {
  return (
    <ProtectedPersonalScreen
      requireSignIn
      title="Sign in to use Notes"
      subtitle="Notes sync to your Google account on NEPSE GHAR servers — private to you, and available again after reinstall. Sign in with Google to continue."
    >
      <NotesBody />
    </ProtectedPersonalScreen>
  );
}

function NotesBody() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [notes, setNotes] = useState<CloudNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CloudNote | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [pinnedDraft, setPinnedDraft] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    setError('');
    try {
      const rows = await listNotes();
      setNotes(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotes([]);
      setLoading(false);
      return;
    }
    void load();
  }, [isAuthenticated, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    );
  }, [notes, query]);

  const openCreate = () => {
    setEditing(null);
    setTitleDraft('');
    setBodyDraft('');
    setPinnedDraft(false);
    setEditorOpen(true);
  };

  const openEdit = (note: CloudNote) => {
    setEditing(note);
    setTitleDraft(note.title);
    setBodyDraft(note.body);
    setPinnedDraft(note.pinned);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditing(null);
  };

  const saveNote = async () => {
    const title = titleDraft.trim();
    const body = bodyDraft;
    if (!title && !body.trim()) {
      Alert.alert('Empty note', 'Add a title or some text before saving.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateNote(editing.id, {
          title: title || editing.title || 'Untitled',
          body,
          pinned: pinnedDraft,
        });
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === updated.id ? updated : n));
          return next.sort(
            (a, b) =>
              Number(b.pinned) - Number(a.pinned) ||
              b.updatedAt.localeCompare(a.updatedAt),
          );
        });
      } else {
        const created = await createNote({
          title: title || 'Untitled',
          body,
          pinned: pinnedDraft,
        });
        setNotes((prev) => {
          const next = [created, ...prev];
          return next.sort(
            (a, b) =>
              Number(b.pinned) - Number(a.pinned) ||
              b.updatedAt.localeCompare(a.updatedAt),
          );
        });
      }
      setEditorOpen(false);
      setEditing(null);
    } catch (e) {
      Alert.alert(
        'Could not save',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (note: CloudNote) => {
    Alert.alert(
      'Delete note?',
      `"${note.title || 'Untitled'}" will be removed from your Google account cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteNote(note.id);
                setNotes((prev) => prev.filter((n) => n.id !== note.id));
                if (editing?.id === note.id) closeEditor();
              } catch (e) {
                Alert.alert(
                  'Delete failed',
                  e instanceof Error ? e.message : 'Please try again.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  const togglePin = async (note: CloudNote) => {
    try {
      const updated = await updateNote(note.id, { pinned: !note.pinned });
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === updated.id ? updated : n));
        return next.sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            b.updatedAt.localeCompare(a.updatedAt),
        );
      });
    } catch (e) {
      Alert.alert(
        'Could not update',
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerIcon}
        >
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.title}>Notes</Text>
          {user?.email ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              Synced · {user.email}
            </Text>
          ) : (
            <Text style={styles.subtitle}>Cloud · Google account</Text>
          )}
        </View>
        <Pressable
          onPress={openCreate}
          hitSlop={10}
          style={styles.headerIcon}
        >
          <Ionicons name="add" size={rs(28)} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={rs(18)} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.privacyHint}>
        Private to your account. Use for CRN, passwords, or other important
        info — only you can see these notes after Google sign-in.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>Loading your notes…</Text>
        </View>
      ) : error && notes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            filtered.length === 0 && styles.listEmpty,
            { paddingBottom: Math.max(insets.bottom, rs(24)) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons
                name="document-text-outline"
                size={rs(42)}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptySub}>
                Tap + to save passwords, CRN, bank details, or any reminder.
                They stay with your Google account.
              </Text>
              <Pressable style={styles.createBtn} onPress={openCreate}>
                <Text style={styles.createBtnText}>Create note</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => openEdit(item)}
              onLongPress={() => confirmDelete(item)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.pinned ? '📌 ' : ''}
                  {item.title || 'Untitled'}
                </Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => void togglePin(item)}
                  style={styles.pinBtn}
                >
                  <Ionicons
                    name={item.pinned ? 'pin' : 'pin-outline'}
                    size={rs(18)}
                    color={item.pinned ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              </View>
              <Text style={styles.cardBody} numberOfLines={3}>
                {previewBody(item.body)}
              </Text>
              <Text style={styles.cardMeta}>
                Updated {formatUpdated(item.updatedAt)}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={editorOpen}
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <View style={[styles.editorRoot, { paddingTop: insets.top }]}>
          <View style={styles.editorHeader}>
            <Pressable onPress={closeEditor} hitSlop={10} disabled={saving}>
              <Text style={styles.editorCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.editorTitle}>
              {editing ? 'Edit note' : 'New note'}
            </Text>
            <Pressable onPress={() => void saveNote()} disabled={saving} hitSlop={10}>
              {saving ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.editorSave}>Save</Text>
              )}
            </Pressable>
          </View>

          <TextInput
            style={styles.titleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
            maxLength={200}
          />
          <TextInput
            style={styles.bodyInput}
            value={bodyDraft}
            onChangeText={setBodyDraft}
            placeholder="Write note… (password, CRN, PIN reminder, etc.)"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={20000}
          />

          <View style={styles.editorFooter}>
            <Pressable
              style={styles.pinRow}
              onPress={() => setPinnedDraft((v) => !v)}
            >
              <Ionicons
                name={pinnedDraft ? 'pin' : 'pin-outline'}
                size={rs(18)}
                color={pinnedDraft ? colors.primary : colors.textMuted}
              />
              <Text style={styles.pinRowText}>
                {pinnedDraft ? 'Pinned' : 'Pin note'}
              </Text>
            </Pressable>
            {editing ? (
              <Pressable
                onPress={() => confirmDelete(editing)}
                style={styles.deleteRow}
              >
                <Ionicons name="trash-outline" size={rs(18)} color={colors.danger} />
                <Text style={[styles.deleteText, { color: colors.danger }]}>
                  Delete
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.cloudHint, { paddingBottom: insets.bottom + rs(8) }]}>
            Saved to your Google-linked NEPSE GHAR account (not only this phone).
          </Text>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? c.surface : '#FFFDF5';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(8),
      backgroundColor: c.bgElevated,
    },
    headerIcon: {
      width: rs(40),
      height: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerMid: { flex: 1, alignItems: 'center' },
    title: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    subtitle: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(1),
      maxWidth: '90%',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(14),
      marginTop: rs(10),
      paddingHorizontal: rs(12),
      borderRadius: rs(12),
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(14),
      paddingVertical: rs(10),
    },
    privacyHint: {
      marginHorizontal: rs(16),
      marginTop: rs(8),
      marginBottom: rs(4),
      color: c.textSecondary,
      fontSize: rs(11),
      lineHeight: rs(15),
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(10),
      paddingHorizontal: rs(24),
    },
    centerText: {
      color: c.textMuted,
      textAlign: 'center',
      fontSize: rs(13),
    },
    retryBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: rs(16),
      paddingVertical: rs(10),
      borderRadius: rs(10),
    },
    retryText: { color: '#FFF', fontWeight: '800' },
    list: { padding: rs(14), gap: rs(10) },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },
    emptyWrap: {
      alignItems: 'center',
      paddingHorizontal: rs(24),
      gap: rs(8),
    },
    emptyTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
      marginTop: rs(6),
    },
    emptySub: {
      color: c.textMuted,
      textAlign: 'center',
      fontSize: rs(13),
      lineHeight: rs(18),
    },
    createBtn: {
      marginTop: rs(10),
      backgroundColor: c.primary,
      paddingHorizontal: rs(18),
      paddingVertical: rs(12),
      borderRadius: rs(12),
    },
    createBtnText: { color: '#FFF', fontWeight: '800', fontSize: rs(14) },
    card: {
      backgroundColor: cardBg,
      borderRadius: rs(14),
      borderWidth: 1,
      borderColor: isDark ? c.border : '#E8DCC8',
      padding: rs(14),
      marginBottom: rs(10),
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
    },
    cardTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
    },
    pinBtn: { padding: rs(2) },
    cardBody: {
      color: c.textSecondary,
      fontSize: rs(13),
      lineHeight: rs(18),
      marginTop: rs(6),
    },
    cardMeta: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(8),
      fontWeight: '600',
    },
    editorRoot: { flex: 1, backgroundColor: c.bg },
    editorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.bgElevated,
    },
    editorCancel: { color: c.textMuted, fontWeight: '700', fontSize: rs(15) },
    editorTitle: { color: c.text, fontWeight: '800', fontSize: rs(15) },
    editorSave: { color: c.primary, fontWeight: '800', fontSize: rs(15) },
    titleInput: {
      marginHorizontal: rs(16),
      marginTop: rs(14),
      color: c.text,
      fontSize: rs(20),
      fontWeight: '800',
      paddingVertical: rs(8),
    },
    bodyInput: {
      flex: 1,
      marginHorizontal: rs(16),
      marginTop: rs(4),
      color: c.text,
      fontSize: rs(15),
      lineHeight: rs(22),
      paddingVertical: rs(8),
    },
    editorFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingTop: rs(8),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    pinRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingVertical: rs(10),
    },
    pinRowText: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    deleteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      paddingVertical: rs(10),
    },
    deleteText: { fontWeight: '800', fontSize: rs(13) },
    cloudHint: {
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(11),
      paddingHorizontal: rs(16),
      paddingTop: rs(4),
    },
  });
}
