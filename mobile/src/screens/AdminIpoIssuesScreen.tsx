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
  adminCreateManagedOffering,
  adminDeleteManagedOffering,
  adminFetchManagedOfferings,
  adminUpdateManagedOffering,
  buildManagedMatchKey,
  type ManagedOffering,
  type ManagedOfferingDisplaySection,
  type ManagedOfferingInput,
} from '../services/nepse/managedOfferings';
import {
  ISSUE_TABS,
  loadAllPublicOfferings,
  type PublicOffering,
} from '../services/nepse/publicOffering';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { nepalTodayIso } from '../services/nepse/holidays';
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

const TYPE_OPTIONS = ISSUE_TABS.map((t) => ({
  id: t.apiType,
  label: t.label,
}));

const STATUS_OPTIONS = [
  { id: 'ComingSoon', label: 'Coming Soon' },
  { id: 'Proposed', label: 'Proposed' },
  { id: 'Open', label: 'Open' },
  { id: 'Closed', label: 'Closed' },
] as const;

const DISPLAY_OPTIONS: {
  id: ManagedOfferingDisplaySection;
  label: string;
}[] = [
  { id: 'current', label: 'Current only' },
  { id: 'upcoming', label: 'Upcoming only' },
  { id: 'both', label: 'Both sections' },
];

type Draft = {
  id: string | null;
  name: string;
  symbol: string;
  type: string;
  audience: string;
  issueManager: string;
  status: string;
  displaySection: ManagedOfferingDisplaySection;
  units: string;
  appliedUnits: string;
  applicants: string;
  price: string;
  totalAmount: string;
  appliedAmount: string;
  openingDate: string;
  closingDate: string;
  extendedClosingDate: string;
  rightShareRatio: string;
  active: boolean;
  matchKey: string | null;
};

type DateField = 'openingDate' | 'closingDate' | 'extendedClosingDate';

const DATE_FIELD_LABEL: Record<DateField, string> = {
  openingDate: 'Open date',
  closingDate: 'Close date',
  extendedClosingDate: 'Extended close date',
};

function isIsoDate(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: '',
    symbol: '',
    type: 'Ipo',
    audience: 'GeneralPublic',
    issueManager: '',
    status: 'ComingSoon',
    displaySection: 'both',
    units: '',
    appliedUnits: '',
    applicants: '',
    price: '',
    totalAmount: '',
    appliedAmount: '',
    openingDate: '',
    closingDate: '',
    extendedClosingDate: '',
    rightShareRatio: '',
    active: true,
    matchKey: null,
  };
}

function toDraft(row: ManagedOffering): Draft {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    type: String(row.type || 'Ipo'),
    audience: row.audience ?? '',
    issueManager: row.issueManager ?? '',
    status: String(row.status || 'ComingSoon'),
    displaySection: row.displaySection,
    units: row.units != null ? String(row.units) : '',
    appliedUnits: row.appliedUnits != null ? String(row.appliedUnits) : '',
    applicants: row.applicants != null ? String(row.applicants) : '',
    price: row.price != null ? String(row.price) : '',
    totalAmount: row.totalAmount != null ? String(row.totalAmount) : '',
    appliedAmount: row.appliedAmount != null ? String(row.appliedAmount) : '',
    openingDate: row.openingDate?.slice(0, 10) ?? '',
    closingDate: row.closingDate?.slice(0, 10) ?? '',
    extendedClosingDate: row.extendedClosingDate?.slice(0, 10) ?? '',
    rightShareRatio: row.rightShareRatio ?? '',
    active: row.active,
    matchKey: row.matchKey,
  };
}

function fromExternal(row: PublicOffering): Draft {
  return {
    id: null,
    name: row.name,
    symbol: row.symbol,
    type: String(row.type || 'Ipo'),
    audience: row.audience ?? '',
    issueManager: row.issueManager ?? '',
    status: String(row.status || 'ComingSoon'),
    displaySection: 'both',
    units: row.units != null ? String(row.units) : '',
    appliedUnits: row.appliedUnits != null ? String(row.appliedUnits) : '',
    applicants: row.applicants != null ? String(row.applicants) : '',
    price: row.price != null ? String(row.price) : '',
    totalAmount: row.totalAmount != null ? String(row.totalAmount) : '',
    appliedAmount: '',
    openingDate: row.openingDate?.slice(0, 10) ?? '',
    closingDate: row.closingDate?.slice(0, 10) ?? '',
    extendedClosingDate: row.extendedClosingDate?.slice(0, 10) ?? '',
    rightShareRatio: row.rightShareRatio ?? '',
    active: true,
    matchKey: buildManagedMatchKey({
      name: row.name,
      symbol: row.symbol,
      audience: row.audience,
    }),
  };
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function draftToInput(draft: Draft): ManagedOfferingInput {
  return {
    name: draft.name.trim(),
    symbol: draft.symbol.trim().toUpperCase(),
    type: draft.type,
    audience: draft.audience.trim() || null,
    issueManager: draft.issueManager.trim() || null,
    status: draft.status,
    displaySection: draft.displaySection,
    units: parseOptionalNumber(draft.units),
    appliedUnits: parseOptionalNumber(draft.appliedUnits),
    applicants: parseOptionalNumber(draft.applicants),
    price: parseOptionalNumber(draft.price),
    totalAmount: parseOptionalNumber(draft.totalAmount),
    appliedAmount: parseOptionalNumber(draft.appliedAmount),
    openingDate: draft.openingDate.trim() || null,
    closingDate: draft.closingDate.trim() || null,
    extendedClosingDate: draft.extendedClosingDate.trim() || null,
    rightShareRatio: draft.rightShareRatio.trim() || null,
    active: draft.active,
    matchKey: draft.matchKey,
  };
}

function typeLabel(type: string): string {
  return TYPE_OPTIONS.find((t) => t.id === type)?.label ?? type;
}

export function AdminIpoIssuesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<ManagedOffering[]>([]);
  const [external, setExternal] = useState<PublicOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateField, setDateField] = useState<DateField | null>(null);

  const todayIso = nepalTodayIso();
  const todayBs = useMemo(() => adIsoToBs(todayIso), [todayIso]);
  const [bsYear, setBsYear] = useState(todayBs.year);
  const [bsMonth, setBsMonth] = useState(todayBs.month);
  const weeks = useMemo(
    () => buildBsMonthGrid(bsYear, bsMonth),
    [bsYear, bsMonth],
  );

  const load = useCallback(async (adminToken: string) => {
    setLoading(true);
    try {
      const [adminRows, live] = await Promise.all([
        adminFetchManagedOfferings(adminToken),
        loadAllPublicOfferings(true).catch(() => [] as PublicOffering[]),
      ]);
      setRows(adminRows);
      setExternal(live);
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Could not load IPO issues',
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

  const adminKeys = useMemo(
    () => new Set(rows.map((r) => r.matchKey)),
    [rows],
  );

  const editableExternal = useMemo(() => {
    return external.filter((row) => {
      const key = buildManagedMatchKey({
        name: row.name,
        symbol: row.symbol,
        audience: row.audience,
      });
      return !adminKeys.has(key);
    });
  }, [adminKeys, external]);

  const save = async () => {
    if (!token || !draft) return;
    if (!draft.name.trim()) {
      Alert.alert('Required', 'Company name is required.');
      return;
    }
    if (
      draft.openingDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.openingDate.trim())
    ) {
      Alert.alert('Invalid date', 'Opening date must be YYYY-MM-DD.');
      return;
    }
    if (
      draft.closingDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.closingDate.trim())
    ) {
      Alert.alert('Invalid date', 'Closing date must be YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    try {
      const payload = draftToInput(draft);
      if (draft.id) {
        await adminUpdateManagedOffering(token, draft.id, payload);
      } else {
        await adminCreateManagedOffering(token, payload);
      }
      setDraft(null);
      await load(token);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: ManagedOffering) => {
    if (!token) return;
    Alert.alert('Delete IPO record?', `${row.name} (${row.symbol || '—'})`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await adminDeleteManagedOffering(token, row.id);
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

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const openCalendar = (field: DateField) => {
    const current = draft?.[field] ?? '';
    const bs = isIsoDate(current) ? adIsoToBs(current) : todayBs;
    setBsYear(bs.year);
    setBsMonth(bs.month);
    setDateField(field);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>IPO Issues</Text>
        <Pressable onPress={() => setDraft(emptyDraft())} hitSlop={10}>
          <Ionicons name="add-circle" size={rs(26)} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Add or edit IPO details shown in Current / Upcoming Issues. Editing a
        live ShareHub/CDSC issue creates an override that wins over external
        data.
      </Text>

      <Pressable
        style={styles.importBtn}
        onPress={() => setPickerOpen(true)}
        disabled={editableExternal.length === 0}
      >
        <Ionicons name="cloud-download-outline" size={rs(16)} color={colors.primary} />
        <Text style={styles.importText}>
          Edit live issue ({editableExternal.length})
        </Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={{ marginTop: rs(40) }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No admin IPO records yet. Tap + to add one, or edit a live issue.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.name}
                  {item.symbol ? ` · ${item.symbol}` : ''}
                </Text>
                <Text style={styles.cardMeta}>
                  {typeLabel(String(item.type))} · {item.status}
                  {item.audience ? ` · ${item.audience}` : ''}
                </Text>
                <Text style={styles.cardMeta}>
                  Display: {DISPLAY_OPTIONS.find((o) => o.id === item.displaySection)?.label}
                </Text>
                <Text style={styles.cardMeta}>
                  Units {item.units ?? '—'} · Open {item.openingDate ?? '—'} · Close{' '}
                  {item.closingDate ?? '—'}
                </Text>
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
                {draft?.id ? 'Edit IPO issue' : 'Add IPO issue'}
              </Text>

              <Field
                label="Company name *"
                value={draft?.name ?? ''}
                onChangeText={(t) => setField('name', t)}
                colors={colors}
                styles={styles}
              />
              <Field
                label="Symbol"
                value={draft?.symbol ?? ''}
                onChangeText={(t) => setField('symbol', t.toUpperCase())}
                colors={colors}
                styles={styles}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Type</Text>
              <View style={styles.chipRow}>
                {TYPE_OPTIONS.map((opt) => {
                  const active = draft?.type === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setField('type', opt.id)}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Status</Text>
              <View style={styles.chipRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active = draft?.status === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setField('status', opt.id)}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Show issue in</Text>
              <View style={styles.chipRow}>
                {DISPLAY_OPTIONS.map((opt) => {
                  const active = draft?.displaySection === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setField('displaySection', opt.id)}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Field
                label="Audience (e.g. GeneralPublic)"
                value={draft?.audience ?? ''}
                onChangeText={(t) => setField('audience', t)}
                colors={colors}
                styles={styles}
              />
              <Field
                label="Issue manager"
                value={draft?.issueManager ?? ''}
                onChangeText={(t) => setField('issueManager', t)}
                colors={colors}
                styles={styles}
              />

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Field
                    label="Issued units"
                    value={draft?.units ?? ''}
                    onChangeText={(t) => setField('units', t)}
                    colors={colors}
                    styles={styles}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label="Applied units"
                    value={draft?.appliedUnits ?? ''}
                    onChangeText={(t) => setField('appliedUnits', t)}
                    colors={colors}
                    styles={styles}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Field
                    label="Applicants"
                    value={draft?.applicants ?? ''}
                    onChangeText={(t) => setField('applicants', t)}
                    colors={colors}
                    styles={styles}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label="Issue price"
                    value={draft?.price ?? ''}
                    onChangeText={(t) => setField('price', t)}
                    colors={colors}
                    styles={styles}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Field
                    label="Total amount"
                    value={draft?.totalAmount ?? ''}
                    onChangeText={(t) => setField('totalAmount', t)}
                    colors={colors}
                    styles={styles}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label="Applied amount"
                    value={draft?.appliedAmount ?? ''}
                    onChangeText={(t) => setField('appliedAmount', t)}
                    colors={colors}
                    styles={styles}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <DateFieldButton
                label={DATE_FIELD_LABEL.openingDate}
                value={draft?.openingDate ?? ''}
                onPress={() => openCalendar('openingDate')}
                onClear={() => setField('openingDate', '')}
                styles={styles}
                colors={colors}
              />
              <DateFieldButton
                label={DATE_FIELD_LABEL.closingDate}
                value={draft?.closingDate ?? ''}
                onPress={() => openCalendar('closingDate')}
                onClear={() => setField('closingDate', '')}
                styles={styles}
                colors={colors}
              />
              <DateFieldButton
                label={DATE_FIELD_LABEL.extendedClosingDate}
                value={draft?.extendedClosingDate ?? ''}
                onPress={() => openCalendar('extendedClosingDate')}
                onClear={() => setField('extendedClosingDate', '')}
                styles={styles}
                colors={colors}
              />
              <Field
                label="Right share ratio"
                value={draft?.rightShareRatio ?? ''}
                onChangeText={(t) => setField('rightShareRatio', t)}
                colors={colors}
                styles={styles}
                placeholder="1:14"
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show in app</Text>
                <Switch
                  value={draft?.active ?? true}
                  onValueChange={(v) => setField('active', v)}
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
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setPickerOpen(false)}
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, rs(16)), maxHeight: '70%' },
            ]}
          >
            <Text style={styles.sheetTitle}>Edit live issue</Text>
            <Text style={styles.hint}>
              Creates an admin override for the selected ShareHub/CDSC issue.
            </Text>
            <FlatList
              data={editableExternal}
              keyExtractor={(item) => `${item.type}-${item.id}`}
              ListEmptyComponent={
                <Text style={styles.empty}>No un-overridden live issues.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => {
                    setPickerOpen(false);
                    setDraft(fromExternal(item));
                  }}
                >
                  <Text style={styles.pickTitle} numberOfLines={2}>
                    {item.name}
                    {item.symbol ? ` · ${item.symbol}` : ''}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {typeLabel(String(item.type))} · {item.status}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={dateField != null}
        animationType="fade"
        transparent
        onRequestClose={() => setDateField(null)}
      >
        <View style={styles.calRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setDateField(null)}
          />
          <View
            style={[
              styles.calSheet,
              { paddingBottom: Math.max(insets.bottom, rs(14)) },
            ]}
          >
            <Text style={styles.sheetTitle}>
              {dateField ? DATE_FIELD_LABEL[dateField] : ''}
            </Text>

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
                    cell.inMonth &&
                    dateField != null &&
                    draft?.[dateField] === cell.adIso;
                  const isToday = cell.inMonth && cell.adIso === todayIso;
                  return (
                    <Pressable
                      key={`${cell.adIso}-${cell.inMonth ? 'in' : 'out'}`}
                      style={styles.calDayCell}
                      disabled={!cell.inMonth}
                      onPress={() => {
                        if (!cell.inMonth || !dateField) return;
                        setField(dateField, cell.adIso);
                        setDateField(null);
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

function Field({
  label,
  value,
  onChangeText,
  colors,
  styles,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'characters' | 'sentences';
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </>
  );
}

function DateFieldButton({
  label,
  value,
  onPress,
  onClear,
  colors,
  styles,
}: {
  label: string;
  value: string;
  onPress: () => void;
  onClear: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.dateBtn} onPress={onPress}>
        <Ionicons name="calendar-outline" size={rs(18)} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.dateText, !value && { color: colors.textMuted }]}>
            {value ? formatBsAdShort(value) : 'Choose from calendar'}
          </Text>
          {value ? (
            <Text style={styles.dateSub}>AD {formatAdShort(value)}</Text>
          ) : null}
        </View>
        {value ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onClear();
            }}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={rs(18)} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={rs(16)} color={colors.textMuted} />
        )}
      </Pressable>
    </>
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
    importBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(6),
      alignSelf: 'flex-start',
      marginHorizontal: rs(16),
      marginBottom: rs(8),
      paddingHorizontal: rs(12),
      paddingVertical: rs(8),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    importText: { color: c.primary, fontWeight: '700', fontSize: rs(12) },
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
    cardBody: { flex: 1, padding: rs(12), gap: rs(2) },
    cardTitle: { color: c.text, fontWeight: '800', fontSize: rs(14) },
    cardMeta: { color: c.textMuted, fontSize: rs(11), fontWeight: '600' },
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
      maxHeight: '92%',
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
      marginTop: rs(8),
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
    dateBtn: {
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
    dateText: {
      color: c.text,
      fontSize: rs(14),
      fontWeight: '700',
    },
    dateSub: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    calRoot: { flex: 1, justifyContent: 'center', padding: rs(16) },
    calSheet: {
      backgroundColor: c.bgElevated,
      borderRadius: rs(18),
      padding: rs(14),
    },
    calNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: rs(8),
    },
    calNavBtn: {
      width: rs(40),
      height: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    calMonthTitle: { color: c.text, fontWeight: '800', fontSize: rs(16) },
    calWeekHead: { flexDirection: 'row', marginBottom: rs(4) },
    calWeekHeadText: {
      flex: 1,
      textAlign: 'center',
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
    },
    calWeekRow: { flexDirection: 'row' },
    calDayCell: { flex: 1, aspectRatio: 1, padding: rs(2) },
    calDayInner: {
      flex: 1,
      borderRadius: rs(10),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5',
    },
    calDaySelected: { backgroundColor: c.primary },
    calDayToday: { borderWidth: 1.5, borderColor: c.primary },
    calDayBs: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    calDayAd: { color: c.textMuted, fontSize: rs(9), fontWeight: '600' },
    calDayMuted: { opacity: 0.28 },
    calDaySelectedText: { color: '#FFF' },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: rs(8),
      marginTop: rs(6),
    },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: rs(16),
      paddingHorizontal: rs(10),
      paddingVertical: rs(6),
      backgroundColor: c.surface,
    },
    chipActive: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    chipText: { color: c.textSecondary, fontWeight: '700', fontSize: rs(11) },
    chipTextActive: { color: c.primary },
    twoCol: { flexDirection: 'row', gap: rs(10) },
    col: { flex: 1 },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginVertical: rs(10),
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
    pickRow: {
      paddingVertical: rs(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    pickTitle: { color: c.text, fontWeight: '700', fontSize: rs(13) },
  });
}
