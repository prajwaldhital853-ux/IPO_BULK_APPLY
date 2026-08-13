import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { MinorDobFields } from '../components/MinorDobFields';
import { OverQuotaBanner } from '../components/OverQuotaBanner';
import { useAccounts } from '../context/AccountsContext';
import { useActiveAccounts } from '../context/ActiveAccountsContext';
import { useTheme } from '../context/ThemeContext';
import {
  fetchMinorAccountInfo,
  minorMetaFromDob,
  type MinorFetchResult,
} from '../services/meroshare/minorTracker';
import type { ThemeColors } from '../theme/colors';
import type { AccountMeta } from '../types/account';
import {
  ageYears,
  buildMinorMetaFields,
  daysUntilMajority,
  formatCountdownLabel,
  formatDobDisplay,
  isMinorFromDob,
  parseDobInput,
} from '../utils/minorAccount';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';

type TabId = 'users' | 'minors';

const URGENT_DAYS = 30;

const TONE = {
  okBg: '#1B3D24',
  okBorder: '#00C853',
  okText: '#69F0AE',
  badBg: '#3D1B1B',
  badBorder: '#E53935',
  badText: '#FF8A80',
  checkText: '#A5D6A7',
  skipText: '#BDBDBD',
} as const;

const TONE_LIGHT = {
  okBg: '#E8F5E9',
  okBorder: '#1B5E20',
  okText: '#1B5E20',
  badBg: '#FFEBEE',
  badBorder: '#B71C1C',
  badText: '#B71C1C',
  checkText: '#0D47A1',
  skipText: '#616161',
} as const;

function isUrgentMinor(result: MinorFetchResult): boolean {
  return (
    result.daysLeft != null &&
    result.daysLeft >= 0 &&
    result.daysLeft < URGENT_DAYS
  );
}

export function MinorAccountsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const tone = isDark ? TONE : TONE_LIGHT;
  const { loadSecrets, updateAccountMeta } = useAccounts();
  const { usableAccounts: accounts } = useActiveAccounts();
  const listRef = useRef<FlatList<MinorFetchResult>>(null);

  const [tab, setTab] = useState<TabId>('users');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minors, setMinors] = useState<MinorFetchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [statusLine, setStatusLine] = useState('');
  const [statusKind, setStatusKind] = useState<
    'idle' | 'checking' | 'not_minor' | 'error' | 'done'
  >('idle');

  const [editTarget, setEditTarget] = useState<AccountMeta | null>(null);
  const [dobDraft, setDobDraft] = useState('');
  const [guardianDraft, setGuardianDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(accounts.map((a) => a.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      return next;
    });
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const visibleMinors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return minors;
    return minors.filter(
      (r) =>
        r.accountName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q),
    );
  }, [minors, query]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMinors([]);
    setStatusLine('');
    setStatusKind('idle');
    const targets = accounts.filter((a) => selected.has(a.id));
    if (!targets.length) {
      setFetchProgress(null);
      setLoading(false);
      setStatusKind('done');
      setStatusLine('No accounts selected.');
      return;
    }

    const total = targets.length;
    setFetchProgress({ done: 0, total });
    setStatusKind('checking');
    setStatusLine(`Checking accounts…\n0/${total}`);

    const found: MinorFetchResult[] = [];
    let done = 0;
    let lastNotMinor: string | null = null;

    const bump = (info: MinorFetchResult) => {
      done += 1;
      if (info.isMinor) {
        found.push(info);
        // Keep urgent minors first as they arrive
        found.sort((a, b) => {
          const da = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
          const db = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
          return da - db;
        });
        setMinors([...found]);
      } else if (info.source !== 'error') {
        lastNotMinor = info.accountName;
      }

      setFetchProgress({ done, total });
      if (info.isMinor) {
        setStatusKind('checking');
        setStatusLine(
          `Checking accounts…\n${done}/${total} · ${found.length} minor found`,
        );
      } else if (info.source === 'error') {
        setStatusKind('error');
        setStatusLine(
          `Could not verify ${info.accountName}\n${done}/${total} · ${found.length} minor`,
        );
      } else {
        setStatusKind(found.length ? 'checking' : 'not_minor');
        setStatusLine(
          found.length
            ? `Checking accounts…\n${done}/${total} · ${found.length} minor found`
            : `Not a minor\n${(lastNotMinor ?? info.accountName).toUpperCase()}\n\n${done}/${total}`,
        );
      }
    };

    // Local DOB / mocks finish instantly; live MeroShare checks run in parallel.
    const CONCURRENCY = 6;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < targets.length) {
        const i = nextIndex;
        nextIndex += 1;
        const account = targets[i]!;
        const secrets = await loadSecrets(account.id);
        const info = await fetchMinorAccountInfo(
          account,
          secrets?.password,
          async (dob, extras) => {
            await updateAccountMeta(account.id, {
              ...minorMetaFromDob(dob),
              ...(extras?.guardianName
                ? { guardianName: extras.guardianName }
                : {}),
            });
          },
        );
        bump(info);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () =>
        worker(),
      ),
    );

    setFetchProgress(null);
    setLoading(false);
    setStatusKind('done');
    setStatusLine(
      found.length
        ? `Finished · ${found.length} minor account${found.length === 1 ? '' : 's'} found`
        : 'Finished · no minor accounts in this selection',
    );
  }, [accounts, loadSecrets, selected, updateAccountMeta]);

  useEffect(() => {
    if (tab === 'minors') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEdit = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId) ?? null;
    if (!account) return;
    setEditTarget(account);
    setDobDraft(account.dateOfBirth ?? '');
    setGuardianDraft(account.guardianName ?? '');
  };

  const closeEdit = () => {
    setEditTarget(null);
    setDobDraft('');
    setGuardianDraft('');
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const iso = parseDobInput(dobDraft);
    if (dobDraft.trim() && !iso) {
      Alert.alert(
        'Invalid date',
        'Choose a valid date from the Nepali calendar.',
      );
      return;
    }
    setSaving(true);
    try {
      const fields = buildMinorMetaFields(dobDraft, guardianDraft);
      await updateAccountMeta(editTarget.id, {
        dateOfBirth: fields.dateOfBirth,
        holderType: fields.holderType,
        guardianName: fields.guardianName,
      });
      const dob = fields.dateOfBirth ?? null;
      const isMinor = dob
        ? isMinorFromDob(dob)
        : fields.holderType === 'minor';
      const result: MinorFetchResult = {
        accountId: editTarget.id,
        accountName: editTarget.name,
        username: editTarget.username,
        dpName: editTarget.dpName,
        isMinor,
        dateOfBirth: dob,
        daysLeft: daysUntilMajority(dob),
        age: ageYears(dob),
        guardianName: fields.guardianName,
        source: 'local',
        detail: isMinor
          ? formatCountdownLabel(daysUntilMajority(dob))
          : 'Major (18+) — not listed as minor',
      };
      setMinors((prev) => {
        if (!isMinor) return prev.filter((r) => r.accountId !== editTarget.id);
        const idx = prev.findIndex((r) => r.accountId === editTarget.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = result;
          return next;
        }
        return [...prev, result];
      });
      closeEdit();
    } finally {
      setSaving(false);
    }
  };

  const statusColor =
    statusKind === 'not_minor'
      ? tone.skipText
      : statusKind === 'error'
        ? tone.badText
        : statusKind === 'done'
          ? tone.okText
          : tone.checkText;

  /** Center plain text while checking / not-minor when no minor cards yet */
  const showCenterOnly =
    tab === 'minors' && visibleMinors.length === 0 && Boolean(statusLine);

  const downloadExcel = useCallback(async () => {
    // Prefer fetched Minor Status list; else local DOB minors on saved accounts.
    let rows: MinorFetchResult[] = minors.filter((r) => r.isMinor);
    if (!rows.length) {
      rows = accounts
        .filter(
          (a) =>
            isMinorFromDob(a.dateOfBirth) ||
            (a.holderType === 'minor' && !a.dateOfBirth),
        )
        .map((a) => {
          const dob = a.dateOfBirth ?? null;
          const daysLeft = daysUntilMajority(dob);
          const age = ageYears(dob);
          return {
            accountId: a.id,
            accountName: a.name,
            username: a.username,
            dpName: a.dpName,
            isMinor: true,
            dateOfBirth: dob,
            daysLeft,
            age,
            guardianName: a.guardianName,
            source: dob ? ('local' as const) : ('none' as const),
            detail: formatCountdownLabel(daysLeft),
          };
        })
        .sort(
          (a, b) =>
            (a.daysLeft ?? Number.MAX_SAFE_INTEGER) -
            (b.daysLeft ?? Number.MAX_SAFE_INTEGER),
        );
    }

    if (!rows.length) {
      Alert.alert(
        'No minor records',
        'Fetch Minor Status first, or add DOB on minor accounts, then download.',
      );
      return;
    }

    setExporting(true);
    try {
      const aoa: (string | number)[][] = [
        [
          'S.N.',
          'Name',
          'Username',
          'DP Name',
          'Date of Birth (AD)',
          'Age (years)',
          'Remaining Days',
          'Countdown',
          'Guardian Name',
          'Status',
          'Source',
          'Detail',
        ],
        ...rows.map((r, i) => [
          i + 1,
          r.accountName,
          r.username,
          r.dpName || '',
          r.dateOfBirth ? formatDobDisplay(r.dateOfBirth) : '',
          r.age ?? '',
          r.daysLeft ?? '',
          formatCountdownLabel(r.daysLeft),
          r.guardianName ?? '',
          r.isMinor ? 'Minor' : 'Major',
          r.source,
          r.detail,
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 28 },
        { wch: 18 },
        { wch: 28 },
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
        { wch: 28 },
        { wch: 24 },
        { wch: 10 },
        { wch: 12 },
        { wch: 36 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Minor Accounts');

      const base64 = XLSX.write(wb, {
        type: 'base64',
        bookType: 'xlsx',
      }) as string;

      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!dir) {
        Alert.alert('Download failed', 'Storage is not available on this device.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const fileUri = `${dir}Minor_Accounts_${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Saved', `Excel file created at:\n${fileUri}`);
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Download Minor Accounts Excel',
        UTI: 'com.microsoft.excel.xlsx',
      });
    } catch (e) {
      Alert.alert(
        'Download failed',
        e instanceof Error ? e.message : 'Could not create Excel file',
      );
    } finally {
      setExporting(false);
    }
  }, [accounts, minors]);

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
        <Text style={styles.title} numberOfLines={1}>
          Minor Accounts
        </Text>
        <Pressable
          onPress={() => void downloadExcel()}
          hitSlop={10}
          style={styles.headerIcon}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name="download-outline"
              size={rs(22)}
              color={colors.text}
            />
          )}
        </Pressable>
        <Pressable
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={10}
          style={styles.headerIcon}
        >
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={rs(22)}
            color={colors.text}
          />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('AddCapital')}
          hitSlop={10}
          style={styles.headerIcon}
        >
          <Ionicons name="add" size={rs(26)} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: rs(16) }}>
        <OverQuotaBanner />
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={rs(16)} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search user…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
      ) : null}

      <View style={styles.tabs}>
        <Pressable style={styles.tab} onPress={() => setTab('users')}>
          <Text
            style={[styles.tabText, tab === 'users' && styles.tabTextActive]}
          >
            Select Users
          </Text>
          <View
            style={[styles.tabLine, tab === 'users' && styles.tabLineActive]}
          />
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('minors')}>
          <Text
            style={[styles.tabText, tab === 'minors' && styles.tabTextActive]}
          >
            Minor Status
          </Text>
          <View
            style={[styles.tabLine, tab === 'minors' && styles.tabLineActive]}
          />
        </Pressable>
      </View>

      {tab === 'users' ? (
        <View style={styles.flex}>
          <View style={styles.selectRow}>
            <Text style={styles.selectCount}>{selected.size} selected</Text>
            <View style={styles.selectActions}>
              <Pressable
                onPress={() => setSelected(new Set(accounts.map((a) => a.id)))}
                hitSlop={8}
              >
                <Text style={[styles.selectAction, { color: tone.okText }]}>
                  Select All
                </Text>
              </Pressable>
              <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
                <Text style={[styles.selectAction, { color: tone.badText }]}>
                  Unselect All
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {filteredAccounts.map((a, idx) => {
              const on = selected.has(a.id);
              return (
                <Pressable
                  key={a.id}
                  style={styles.userCard}
                  onPress={() => toggleUser(a.id)}
                >
                  <View style={styles.avatar}>
                    <Ionicons
                      name="person"
                      size={rs(15)}
                      color={colors.textMuted}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {idx + 1}. {a.name.toUpperCase()}
                    </Text>
                    <Text style={styles.userMeta}>USERNAME : {a.username}</Text>
                    <Text style={styles.userMeta} numberOfLines={1}>
                      BANK : {(a.bankName || a.dpName || '—').toUpperCase()}
                    </Text>
                  </View>
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={rs(22)}
                    color={on ? colors.accentGreen : colors.textMuted}
                  />
                </Pressable>
              );
            })}
            {!accounts.length ? (
              <Text style={styles.empty}>
                No accounts saved. Tap + to add a MeroShare account.
              </Text>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, rs(12)) },
            ]}
          >
            <Pressable
              style={[
                styles.fetchBtn,
                { borderColor: tone.okBorder },
                !selected.size && styles.fetchBtnOff,
              ]}
              disabled={!selected.size}
              onPress={() => setTab('minors')}
            >
              <Text style={[styles.fetchText, { color: tone.okText }]}>
                Fetch Minor Accounts
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.flex}>
          {showCenterOnly ? (
            <View style={styles.centerStatus}>
              {loading ? (
                <ActivityIndicator
                  size="large"
                  color={statusColor}
                  style={{ marginBottom: rs(16) }}
                />
              ) : null}
              <Text style={[styles.centerStatusText, { color: statusColor }]}>
                {statusLine}
              </Text>
              {fetchProgress ? (
                <Text style={styles.centerProgress}>
                  {fetchProgress.done}/{fetchProgress.total}
                </Text>
              ) : null}
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={visibleMinors}
              keyExtractor={(item) => item.accountId}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                statusLine ? (
                  <Text style={[styles.topStatus, { color: statusColor }]}>
                    {statusLine}
                    {fetchProgress
                      ? `\n${fetchProgress.done}/${fetchProgress.total} · ${minors.length} minor`
                      : ''}
                  </Text>
                ) : (
                  <Text style={styles.summary}>
                    {visibleMinors.length} minor · Red = under 1 month · Green =
                    safer
                  </Text>
                )
              }
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {accounts.length
                    ? selected.size
                      ? 'No minor accounts found.'
                      : 'No accounts selected. Switch to Select Users.'
                    : 'No MeroShare accounts saved. Tap + to add.'}
                </Text>
              }
              renderItem={({ item }) => {
                const urgent = isUrgentMinor(item);
                const border = urgent ? tone.badBorder : tone.okBorder;
                const bg = urgent ? tone.badBg : tone.okBg;
                const fg = urgent ? tone.badText : tone.okText;
                return (
                  <Pressable
                    style={[
                      styles.resultCard,
                      { borderColor: border, backgroundColor: bg },
                    ]}
                    onPress={() => openEdit(item.accountId)}
                  >
                    <View style={styles.cardHead}>
                      <Ionicons
                        name={urgent ? 'warning-outline' : 'happy-outline'}
                        size={rs(16)}
                        color={fg}
                      />
                      <Text
                        style={[styles.cardName, { color: fg }]}
                        numberOfLines={1}
                      >
                        {item.accountName.toUpperCase()}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { borderColor: border, backgroundColor: bg },
                        ]}
                      >
                        <Text style={[styles.statusBadgeText, { color: fg }]}>
                          {urgent ? 'Urgent' : 'Minor'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.userMeta}>
                      USERNAME : {item.username}
                    </Text>
                    <Text style={[styles.countdown, { color: fg }]}>
                      {item.detail}
                    </Text>
                    <Text style={styles.meta}>
                      DOB {formatDobDisplay(item.dateOfBirth)}
                      {item.age != null ? ` · Age ${item.age}` : ''}
                      {urgent ? ' · Less than 1 month left' : ''}
                    </Text>
                    {item.guardianName ? (
                      <Text style={styles.meta}>
                        Guardian: {item.guardianName}
                      </Text>
                    ) : null}
                    <Text style={styles.tapHint}>
                      Tap to edit DOB / guardian
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      )}

      <Modal visible={Boolean(editTarget)} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={closeEdit} />
        <View
          style={[
            styles.editSheet,
            { paddingBottom: Math.max(insets.bottom, rs(16)) },
          ]}
        >
          <Text style={styles.editTitle}>
            {editTarget?.name.toUpperCase() ?? 'Account'}
          </Text>
          <Text style={styles.editSub}>
            Username: {editTarget?.username ?? '—'}
          </Text>
          <MinorDobFields
            compact
            dateOfBirth={dobDraft}
            onDateOfBirthChange={setDobDraft}
            guardianName={guardianDraft}
            onGuardianNameChange={setGuardianDraft}
          />
          {(() => {
            const iso = parseDobInput(dobDraft);
            if (!iso) return null;
            return (
              <Text style={[styles.preview, { color: tone.okText }]}>
                Age {ageYears(iso) ?? '—'} ·{' '}
                {formatCountdownLabel(daysUntilMajority(iso))}
              </Text>
            );
          })()}
          <View style={styles.editActions}>
            <Pressable style={styles.cancelBtn} onPress={closeEdit}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={() => void saveEdit()}
              disabled={saving}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors, isDark: boolean) {
  const headerBg = c.bgElevated;
  const cardBg = isDark ? c.surface : '#FFFFFF';
  const avatarBg = isDark ? c.surfaceAlt : '#E8F5E9';
  const ok = isDark ? TONE : TONE_LIGHT;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: rs(8),
      paddingVertical: rs(10),
      backgroundColor: headerBg,
    },
    headerIcon: {
      width: rs(40),
      height: rs(40),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: c.text,
      fontWeight: '800',
      fontSize: rs(15),
      marginHorizontal: rs(4),
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginHorizontal: rs(12),
      marginTop: rs(4),
      marginBottom: rs(6),
      paddingHorizontal: rs(12),
      backgroundColor: cardBg,
      borderRadius: rs(10),
      borderWidth: isDark ? 1 : 1.5,
      borderColor: isDark ? c.border : '#7A8F6A',
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: rs(13),
      paddingVertical: rs(9),
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: headerBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    tab: { flex: 1, alignItems: 'center', paddingTop: rs(12) },
    tabText: { color: c.textMuted, fontSize: rs(13), fontWeight: '600' },
    tabTextActive: { color: ok.okText, fontWeight: '800' },
    tabLine: {
      marginTop: rs(9),
      height: rs(2.5),
      width: '60%',
      backgroundColor: 'transparent',
      borderTopLeftRadius: rs(2),
      borderTopRightRadius: rs(2),
    },
    tabLineActive: { backgroundColor: ok.okBorder },
    selectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: rs(16),
      paddingTop: rs(12),
      paddingBottom: rs(2),
    },
    selectCount: { color: c.text, fontWeight: '700', fontSize: rs(13) },
    selectActions: { flexDirection: 'row', gap: rs(18) },
    selectAction: { fontWeight: '700', fontSize: rs(13) },
    list: { padding: rs(14), paddingBottom: rs(24) },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: rs(32),
      fontSize: rs(13),
      lineHeight: rs(18),
      paddingHorizontal: rs(12),
    },
    userCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      padding: rs(14),
      marginBottom: rs(10),
      borderRadius: rs(12),
      borderWidth: isDark ? 1 : 1.5,
      borderColor: isDark ? c.border : '#8FA07A',
      backgroundColor: cardBg,
    },
    avatar: {
      width: rs(26),
      height: rs(26),
      borderRadius: rs(13),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: avatarBg,
    },
    userName: { color: c.text, fontWeight: '800', fontSize: rs(13) },
    userMeta: { color: c.textMuted, fontSize: rs(11), marginTop: rs(3) },
    footer: {
      paddingHorizontal: rs(16),
      paddingTop: rs(10),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: headerBg,
    },
    fetchBtn: {
      borderWidth: 2,
      borderRadius: rs(26),
      paddingVertical: rs(13),
      alignItems: 'center',
      backgroundColor: isDark ? 'transparent' : '#E8F5E9',
    },
    fetchBtnOff: { opacity: 0.4 },
    fetchText: { fontWeight: '800', fontSize: rs(14) },
    centerStatus: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: rs(28),
    },
    centerStatusText: {
      textAlign: 'center',
      fontSize: rs(16),
      fontWeight: '700',
      lineHeight: rs(24),
    },
    centerProgress: {
      marginTop: rs(14),
      color: c.textMuted,
      fontSize: rs(13),
      fontWeight: '600',
      textAlign: 'center',
    },
    topStatus: {
      textAlign: 'center',
      fontSize: rs(13),
      fontWeight: '700',
      lineHeight: rs(19),
      marginBottom: rs(12),
    },
    summary: {
      color: c.textSecondary,
      fontSize: rs(12),
      fontWeight: '700',
      marginBottom: rs(10),
      textAlign: 'center',
    },
    foundList: { maxHeight: '42%' },
    foundListPad: { paddingHorizontal: rs(14), paddingBottom: rs(16) },
    resultCard: {
      borderWidth: isDark ? 1.5 : 2,
      borderRadius: rs(16),
      padding: rs(16),
      marginBottom: rs(12),
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(8),
      marginBottom: rs(6),
    },
    cardName: {
      flex: 1,
      fontWeight: '800',
      fontSize: rs(14),
    },
    statusBadge: {
      borderWidth: 1.5,
      borderRadius: rs(12),
      paddingHorizontal: rs(10),
      paddingVertical: rs(4),
    },
    statusBadgeText: { fontSize: rs(11), fontWeight: '800' },
    countdown: {
      marginTop: rs(8),
      fontSize: rs(13),
      fontWeight: '700',
    },
    meta: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(4) },
    tapHint: {
      marginTop: rs(8),
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '600',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    editSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.surface,
      borderTopLeftRadius: rs(18),
      borderTopRightRadius: rs(18),
      paddingHorizontal: rs(16),
      paddingTop: rs(16),
    },
    editTitle: { color: c.text, fontSize: rs(16), fontWeight: '800' },
    editSub: {
      color: c.textSecondary,
      fontSize: rs(12),
      marginTop: rs(4),
      marginBottom: rs(12),
    },
    preview: { fontSize: rs(12), fontWeight: '700', marginBottom: rs(8) },
    warn: { fontSize: rs(12), marginBottom: rs(8) },
    editActions: { flexDirection: 'row', gap: rs(10), marginTop: rs(8) },
    cancelBtn: {
      flex: 1,
      paddingVertical: rs(12),
      borderRadius: rs(10),
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    cancelText: { color: c.text, fontWeight: '700' },
    saveBtn: {
      flex: 1,
      paddingVertical: rs(12),
      borderRadius: rs(10),
      backgroundColor: c.primary,
      alignItems: 'center',
    },
    saveText: { color: '#FFFFFF', fontWeight: '700' },
  });
}
