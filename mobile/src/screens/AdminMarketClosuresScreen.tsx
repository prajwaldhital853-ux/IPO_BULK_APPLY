import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { loadAdminToken } from '../services/admin/adminTokenStorage';
import {
  adminCreateMarketClosure,
  adminDeleteMarketClosure,
  adminFetchMarketClosures,
  adminUpdateMarketClosure,
  type MarketClosure,
} from '../services/nepse/marketClosures';
import { nepalTodayIso } from '../services/nepse/holidays';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import {
  WEEKDAYS_NP,
  adIsoToBs,
  bsMonthTitle,
  buildBsMonthGrid,
  formatAdShort,
  formatBsAdShort,
  shiftBsMonth,
  toNepaliDigits,
} from '../utils/bsDate';
import { rs } from '../utils/responsive';

const COLORS = [
  '#E53935',
  '#D81B60',
  '#8E24AA',
  '#FB8C00',
  '#F4511E',
  '#6D4C41',
];

type Draft = {
  id: string | null;
  date: string; // AD ISO for API
  title: string;
  notice: string;
  color: string;
  active: boolean;
};

function emptyDraft(): Draft {
  return {
    id: null,
    date: nepalTodayIso(),
    title: 'NEPSE Closed',
    notice: '',
    color: COLORS[0],
    active: true,
  };
}

function toDraft(row: MarketClosure): Draft {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    notice: row.notice,
    color: row.color || COLORS[0],
    active: row.active,
  };
}

function formatBsLabel(adIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adIso)) return 'Pick a date';
  return formatBsAdShort(adIso);
}

export function AdminMarketClosuresScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<MarketClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const todayIso = nepalTodayIso();
  const todayBs = useMemo(() => adIsoToBs(todayIso), [todayIso]);
  const [bsYear, setBsYear] = useState(todayBs.year);
  const [bsMonth, setBsMonth] = useState(todayBs.month);

  const load = useCallback(async (adminToken: string) => {
    setLoading(true);
    try {
      setRows(await adminFetchMarketClosures(adminToken));
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Could not load closures',
      );
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

  const openCalendar = (adIso: string) => {
    const bs = /^\d{4}-\d{2}-\d{2}$/.test(adIso)
      ? adIsoToBs(adIso)
      : todayBs;
    setBsYear(bs.year);
    setBsMonth(bs.month);
    setCalendarOpen(true);
  };

  const save = async () => {
    if (!token || !draft) return;
    const date = draft.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Pick a date', 'Choose a closed day from the Nepali calendar.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date,
        title: draft.title.trim() || 'NEPSE Closed',
        notice: draft.notice.trim(),
        color: draft.color,
        active: draft.active,
      };
      if (draft.id) {
        await adminUpdateMarketClosure(token, draft.id, payload);
      } else {
        await adminCreateMarketClosure(token, payload);
      }
      setDraft(null);
      await load(token);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: MarketClosure) => {
    if (!token) return;
    Alert.alert('Delete closed day?', `${formatBsLabel(row.date)} — ${row.title}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await adminDeleteMarketClosure(token, row.id);
              await load(token);
            } catch (e) {
              Alert.alert(
                'Delete failed',
                e instanceof Error ? e.message : 'Unknown error',
              );
            }
          })();
        },
      },
    ]);
  };

  const weeks = useMemo(
    () => buildBsMonthGrid(bsYear, bsMonth),
    [bsYear, bsMonth],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>NEPSE closed days</Text>
        <Pressable onPress={() => setDraft(emptyDraft())} hitSlop={10}>
          <Ionicons name="add-circle" size={rs(26)} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Mark unexpected market closures on the Nepali (BS) calendar. They show
        in your chosen color on NEPSE Calendar with the notice below it.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No unexpected closures yet.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={[styles.colorBar, { backgroundColor: item.color }]} />
              <View style={styles.cardBody}>
                <Text style={styles.cardDate}>{formatBsLabel(item.date)}</Text>
                <Text style={styles.cardAd}>{formatAdShort(item.date)}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.notice ? (
                  <Text style={styles.cardNotice} numberOfLines={3}>
                    {item.notice}
                  </Text>
                ) : null}
                {!item.active ? (
                  <Text style={styles.inactive}>Inactive (hidden in app)</Text>
                ) : null}
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => setDraft(toDraft(item))} hitSlop={8}>
                  <Ionicons name="pencil" size={rs(18)} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => remove(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={rs(18)} color="#E53935" />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal
        visible={draft != null}
        animationType="slide"
        transparent
        onRequestClose={() => setDraft(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setDraft(null)} />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, rs(16)) },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sheetTitle}>
                {draft?.id ? 'Edit closed day' : 'Add closed day'}
              </Text>

              <Text style={styles.label}>Date (Bikram Sambat)</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => openCalendar(draft?.date ?? todayIso)}
              >
                <Ionicons
                  name="calendar"
                  size={rs(18)}
                  color={colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.datePickerMain}>
                    {draft?.date ? formatBsLabel(draft.date) : 'Pick a date'}
                  </Text>
                  {draft?.date ? (
                    <Text style={styles.datePickerSub}>
                      AD {formatAdShort(draft.date)}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-down"
                  size={rs(18)}
                  color={colors.textMuted}
                />
              </Pressable>

              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={draft?.title ?? ''}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, title: t } : d))
                }
                placeholder="NEPSE Closed"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>Notice (shown below calendar)</Text>
              <TextInput
                style={[styles.input, styles.noticeInput]}
                value={draft?.notice ?? ''}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, notice: t } : d))
                }
                placeholder="Why is NEPSE closed today?"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.label}>Day color</Text>
              <View style={styles.colorRow}>
                {COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() =>
                      setDraft((d) => (d ? { ...d, color: c } : d))
                    }
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      draft?.color === c && styles.colorSwatchActive,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show in calendar</Text>
                <Switch
                  value={draft?.active ?? true}
                  onValueChange={(v) =>
                    setDraft((d) => (d ? { ...d, active: v } : d))
                  }
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>

              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={() => void save()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={calendarOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCalendarOpen(false)}
      >
        <View style={styles.calRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setCalendarOpen(false)}
          />
          <View
            style={[
              styles.calSheet,
              { paddingBottom: Math.max(insets.bottom, rs(14)) },
            ]}
          >
            <View style={styles.calNav}>
              <Pressable
                onPress={() => {
                  const n = shiftBsMonth(bsYear, bsMonth, -1);
                  setBsYear(n.year);
                  setBsMonth(n.month);
                }}
                hitSlop={10}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-back" size={rs(22)} color={colors.text} />
              </Pressable>
              <Text style={styles.calMonthTitle}>
                {bsMonthTitle(bsYear, bsMonth)}
              </Text>
              <Pressable
                onPress={() => {
                  const n = shiftBsMonth(bsYear, bsMonth, 1);
                  setBsYear(n.year);
                  setBsMonth(n.month);
                }}
                hitSlop={10}
                style={styles.calNavBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={rs(22)}
                  color={colors.text}
                />
              </Pressable>
            </View>

            <View style={styles.calWeekHead}>
              {WEEKDAYS_NP.map((w) => (
                <Text key={w} style={styles.calWeekHeadText}>
                  {w}
                </Text>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={`w${wi}`} style={styles.calWeekRow}>
                {week.map((cell) => {
                  const selected =
                    cell.inMonth && draft?.date === cell.adIso;
                  const isToday = cell.inMonth && cell.adIso === todayIso;
                  return (
                    <Pressable
                      key={`${cell.adIso}-${cell.inMonth ? 'in' : 'out'}`}
                      style={styles.calDayCell}
                      disabled={!cell.inMonth}
                      onPress={() => {
                        if (!cell.inMonth) return;
                        setDraft((d) =>
                          d ? { ...d, date: cell.adIso } : d,
                        );
                        setCalendarOpen(false);
                      }}
                    >
                      <View
                        style={[
                          styles.calDayInner,
                          selected && styles.calDaySelected,
                          isToday && !selected && styles.calDayToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calDayBs,
                            !cell.inMonth && styles.calDayMuted,
                            selected && styles.calDaySelectedText,
                          ]}
                        >
                          {toNepaliDigits(cell.bsDay)}
                        </Text>
                        <Text
                          style={[
                            styles.calDayAd,
                            !cell.inMonth && styles.calDayMuted,
                            selected && styles.calDaySelectedText,
                          ]}
                        >
                          {cell.adDay}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
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
    hint: {
      color: c.textSecondary,
      fontSize: rs(12),
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
      lineHeight: rs(18),
    },
    list: { padding: rs(16), paddingBottom: rs(40) },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: rs(40),
      fontSize: rs(13),
    },
    card: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: rs(12),
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      marginBottom: rs(10),
    },
    colorBar: { width: rs(6) },
    cardBody: { flex: 1, padding: rs(12), gap: rs(2) },
    cardDate: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    cardAd: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
    cardTitle: { color: c.textSecondary, fontWeight: '600', fontSize: rs(13) },
    cardNotice: { color: c.textMuted, fontSize: rs(12), marginTop: rs(4) },
    inactive: { color: '#FB8C00', fontSize: rs(11), marginTop: rs(4) },
    cardActions: {
      justifyContent: 'center',
      gap: rs(14),
      paddingHorizontal: rs(12),
    },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      padding: rs(18),
      maxHeight: '88%',
    },
    sheetTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(17),
      marginBottom: rs(8),
    },
    label: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '700',
      marginTop: rs(6),
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(12),
      backgroundColor: c.surface,
      marginTop: rs(4),
    },
    datePickerMain: {
      color: c.text,
      fontWeight: '700',
      fontSize: rs(14),
    },
    datePickerSub: {
      color: c.textMuted,
      fontSize: rs(11),
      marginTop: rs(2),
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(10),
      paddingHorizontal: rs(12),
      paddingVertical: rs(10),
      color: c.text,
      fontSize: rs(14),
      backgroundColor: c.surface,
      marginTop: rs(4),
    },
    noticeInput: { minHeight: rs(88) },
    colorRow: { flexDirection: 'row', gap: rs(10), marginVertical: rs(8) },
    colorSwatch: {
      width: rs(32),
      height: rs(32),
      borderRadius: rs(16),
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorSwatchActive: {
      borderColor: c.text,
      transform: [{ scale: 1.08 }],
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginVertical: rs(8),
    },
    switchLabel: { color: c.text, fontWeight: '600', fontSize: rs(14) },
    saveBtn: {
      marginTop: rs(10),
      backgroundColor: c.primary,
      borderRadius: rs(12),
      minHeight: rs(46),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: rs(8),
    },
    saveText: { color: '#FFF', fontWeight: '800', fontSize: rs(15) },
    calRoot: { flex: 1, justifyContent: 'flex-end' },
    calSheet: {
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(14),
      paddingTop: rs(14),
    },
    calNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(10),
    },
    calNavBtn: {
      width: rs(40),
      height: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    calMonthTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(16),
    },
    calWeekHead: {
      flexDirection: 'row',
      marginBottom: rs(4),
    },
    calWeekHeadText: {
      flex: 1,
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
    },
    calWeekRow: { flexDirection: 'row' },
    calDayCell: {
      flex: 1,
      aspectRatio: 1,
      padding: rs(2),
    },
    calDayInner: {
      flex: 1,
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5',
    },
    calDaySelected: { backgroundColor: c.primary },
    calDayToday: {
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    calDayBs: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
    },
    calDayAd: {
      color: c.textMuted,
      fontSize: rs(9),
      fontWeight: '600',
    },
    calDayMuted: { opacity: 0.28 },
    calDaySelectedText: { color: '#FFF' },
  });
}
