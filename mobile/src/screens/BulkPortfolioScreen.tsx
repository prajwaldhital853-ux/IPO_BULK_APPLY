import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from '../context/AccountsContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { importPortfolioFromMeroshare } from '../services/meroshare';
import {
  createPortfolioWithHoldings,
  listPortfolios,
  type Portfolio,
} from '../storage/portfolioStorage';
import type { AccountMeta } from '../types/account';
import { rs } from '../utils/responsive';
import { usePollingRefresh } from '../utils/usePollingRefresh';
import type { RootStackParamList } from '../navigation/types';
import { ProtectedPersonalScreen } from '../components/ProtectedPersonalScreen';

type ImportRow = {
  account: AccountMeta;
  status: 'idle' | 'running' | 'done' | 'error';
  message?: string;
  portfolioId?: string;
};

export function BulkPortfolioScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accounts } = useAccounts();

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [running, setRunning] = useState(false);

  const reload = useCallback(async () => {
    setPortfolios(await listPortfolios());
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRows(accounts.map((account) => ({ account, status: 'idle' })));
      void reload();
    }, [accounts, reload]),
  );

  usePollingRefresh(reload);

  const importOne = async (account: AccountMeta): Promise<ImportRow> => {
    try {
      const result = await importPortfolioFromMeroshare(account);
      if (result.holdings.length === 0) {
        return {
          account,
          status: 'error',
          message: 'No holdings on MeroShare',
        };
      }
      const portfolio = await createPortfolioWithHoldings(
        `${account.name} (MeroShare)`,
        result.holdings.map((h) => ({
          symbol: h.symbol,
          name: h.name,
          qty: h.qty,
          wacc: h.wacc,
        })),
      );
      return {
        account,
        status: 'done',
        message: `${result.holdings.length} holdings`,
        portfolioId: portfolio.id,
      };
    } catch (e) {
      return {
        account,
        status: 'error',
        message: e instanceof Error ? e.message : 'Import failed',
      };
    }
  };

  const onImportAll = async () => {
    if (!accounts.length) {
      Alert.alert(
        'No accounts',
        'Add MeroShare accounts from Apply → Add capital first.',
      );
      return;
    }
    setRunning(true);
    const next: ImportRow[] = [];
    for (const account of accounts) {
      setRows((prev) =>
        prev.map((r) =>
          r.account.id === account.id ? { ...r, status: 'running' } : r,
        ),
      );
      const result = await importOne(account);
      next.push(result);
      setRows((prev) =>
        prev.map((r) => (r.account.id === account.id ? result : r)),
      );
    }
    await reload();
    setRunning(false);
    const ok = next.filter((r) => r.status === 'done').length;
    Alert.alert(
      'Bulk import finished',
      `${ok} of ${accounts.length} accounts imported successfully.`,
    );
  };

  return (
    <ProtectedPersonalScreen title="Sign in to import portfolios">
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={rs(22)} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Bulk Portfolio</Text>
        <Pressable onPress={() => navigation.navigate('Portfolio')} hitSlop={10}>
          <Ionicons name="briefcase-outline" size={rs(22)} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Pull holdings from every saved MeroShare account into separate
        portfolios — one tap per account or import all at once.
      </Text>

      <Pressable
        style={[styles.cta, running && styles.ctaDisabled]}
        disabled={running || accounts.length === 0}
        onPress={() => void onImportAll()}
      >
        {running ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialCommunityIcons name="cloud-download-outline" size={rs(20)} color="#fff" />
            <Text style={styles.ctaText}>Import all accounts</Text>
          </>
        )}
      </Pressable>

      <Text style={styles.sectionLabel}>
        Accounts ({accounts.length}) · Portfolios ({portfolios.length})
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.account.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No MeroShare accounts saved. Add capital from the Apply tab.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.iconCircle}>
              <Ionicons name="person" size={rs(18)} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.account.name}</Text>
              <Text style={styles.rowSub}>
                {item.account.dpName} · {item.account.username}
              </Text>
              {item.message ? (
                <Text
                  style={[
                    styles.status,
                    item.status === 'error' && { color: colors.danger },
                    item.status === 'done' && { color: colors.accentGreen },
                  ]}
                >
                  {item.status === 'running' ? 'Importing…' : item.message}
                </Text>
              ) : null}
            </View>
            {item.status === 'running' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : item.portfolioId ? (
              <Pressable
                onPress={() =>
                  navigation.navigate('PortfolioDetail', {
                    portfolioId: item.portfolioId!,
                  })
                }
              >
                <Text style={styles.viewLink}>View</Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={running}
                onPress={() => {
                  void (async () => {
                    setRunning(true);
                    setRows((prev) =>
                      prev.map((r) =>
                        r.account.id === item.account.id
                          ? { ...r, status: 'running' }
                          : r,
                      ),
                    );
                    const result = await importOne(item.account);
                    setRows((prev) =>
                      prev.map((r) =>
                        r.account.id === item.account.id ? result : r,
                      ),
                    );
                    await reload();
                    setRunning(false);
                  })();
                }}
              >
                <Ionicons
                  name="download-outline"
                  size={rs(22)}
                  color={colors.primary}
                />
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
    </ProtectedPersonalScreen>
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
    hint: {
      color: c.textSecondary,
      fontSize: rs(12),
      paddingHorizontal: rs(16),
      lineHeight: rs(17),
      marginBottom: rs(12),
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(8),
      backgroundColor: c.primary,
      marginHorizontal: rs(16),
      borderRadius: rs(14),
      minHeight: rs(48),
      marginBottom: rs(16),
    },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: rs(14) },
    sectionLabel: {
      color: c.textMuted,
      fontSize: rs(11),
      fontWeight: '700',
      paddingHorizontal: rs(16),
      marginBottom: rs(8),
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    list: { paddingHorizontal: rs(16), paddingBottom: rs(28) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(12),
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: rs(14),
      padding: rs(14),
      backgroundColor: c.surface,
      marginBottom: rs(10),
    },
    iconCircle: {
      width: rs(40),
      height: rs(40),
      borderRadius: rs(20),
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { color: c.text, fontWeight: '700', fontSize: rs(14) },
    rowSub: { color: c.textMuted, fontSize: rs(11), marginTop: rs(2) },
    status: { color: c.textSecondary, fontSize: rs(11), marginTop: rs(4) },
    viewLink: { color: c.primary, fontWeight: '800', fontSize: rs(13) },
    empty: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: rs(32),
      fontSize: rs(13),
      lineHeight: rs(18),
    },
  });
}
