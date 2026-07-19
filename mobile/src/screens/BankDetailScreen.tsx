import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../components/FormField';
import { LocalDisclaimer } from '../components/LocalDisclaimer';
import { useAccounts } from '../context/AccountsContext';
import {
  MeroshareClient,
  verifyAccountForSave,
  type VerifyField,
} from '../services/meroshare';
import { colors } from '../theme/colors';
import { rs } from '../utils/responsive';
import type { RootStackParamList } from '../navigation/types';
import { SensitiveActionModals } from '../components/SensitiveActionModals';
import { useSensitiveAction } from '../hooks/useSensitiveAction';

function fieldLabel(field: VerifyField | null): string {
  switch (field) {
    case 'dp':
      return 'Depository Participant';
    case 'username':
      return 'Username';
    case 'password':
      return 'Password';
    case 'crn':
      return 'CRN Number';
    case 'pin':
      return 'Transaction PIN';
    case 'bank':
      return 'Bank linkage';
    case 'network':
      return 'Network';
    default:
      return 'Credentials';
  }
}

export function BankDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { draft, addAccount } = useAccounts();
  const sensitive = useSensitiveAction();

  const [linkedBank, setLinkedBank] = useState('');
  const [loadingBank, setLoadingBank] = useState(true);
  const [bankError, setBankError] = useState('');
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');
  const [hideCrn, setHideCrn] = useState(true);
  const [hidePin, setHidePin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorField, setErrorField] = useState<VerifyField | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!draft) {
        if (mounted) {
          setLoadingBank(false);
          setBankError('Missing capital detail');
        }
        return;
      }
      setLoadingBank(true);
      setBankError('');
      const client = new MeroshareClient();
      try {
        await client.login({
          clientId: draft.dpId,
          dpCode: draft.dpCode,
          dpName: draft.dpName,
          username: draft.username,
          password: draft.password,
        });
        const banks = await client.listBanks();
        if (!mounted) return;
        if (banks.length) {
          setLinkedBank(banks[0].name || `Bank #${banks[0].id}`);
        } else {
          setLinkedBank(draft.dpName);
          setBankError(
            'No ASBA bank found on MeroShare. You can still enter CRN/PIN if your DP is correct.',
          );
        }
      } catch (e) {
        if (!mounted) return;
        setLinkedBank(draft.dpName);
        setBankError(
          e instanceof Error
            ? `Could not load linked bank: ${e.message}`
            : 'Could not load linked bank from MeroShare',
        );
      } finally {
        client.clearSession();
        if (mounted) setLoadingBank(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [draft]);

  const onSubmit = async () => {
    if (!draft) {
      Alert.alert('Missing capital detail', 'Please add capital detail first.');
      navigation.navigate('AddCapital');
      return;
    }
    if (!crn.trim() || pin.length !== 4) {
      setErrorField(!crn.trim() ? 'crn' : 'pin');
      setErrorMsg(
        !crn.trim()
          ? 'Enter your CRN number.'
          : 'Transaction PIN must be 4 digits.',
      );
      return;
    }
    if (submitting) return;
    void sensitive.requestSensitiveAction(async () => {
      setSubmitting(true);
      setErrorField(null);
      setErrorMsg('');
      try {
        const verify = await verifyAccountForSave({
          dpId: draft.dpId,
          dpCode: draft.dpCode,
          username: draft.username,
          password: draft.password,
          crn: crn.trim(),
          pin,
        });

        if (!verify.ok) {
          setErrorField(verify.field);
          setErrorMsg(verify.message);
          Alert.alert(
            verify.field === 'unknown' || !verify.field
              ? 'Could not verify'
              : `${fieldLabel(verify.field)} incorrect`,
            `${verify.message}\n\nAccount was NOT saved. Fix the highlighted field and try again.`,
            verify.field === 'dp' ||
              verify.field === 'username' ||
              verify.field === 'password'
              ? [
                  {
                    text: 'Edit Capital',
                    onPress: () => navigation.navigate('AddCapital'),
                  },
                  { text: 'OK' },
                ]
              : [{ text: 'OK' }],
          );
          return;
        }

        await addAccount({
          name: draft.username.toUpperCase(),
          dpId: draft.dpId,
          dpCode: draft.dpCode,
          dpName: draft.dpName,
          username: draft.username,
          password: draft.password,
          bankName: verify.bankName || linkedBank || draft.dpName,
          crn: crn.trim(),
          pin,
          verified: true,
          crnPinVerified: !verify.crnPinDeferred,
          demat: (() => {
            const raw =
              verify.demat?.trim() ||
              (verify.boid && /^\d{16}$/.test(verify.boid.trim())
                ? verify.boid.trim()
                : undefined);
            if (raw) return raw;
            if (draft.dpCode && draft.username) {
              return `130${draft.dpCode}${draft.username.trim()}`;
            }
            return undefined;
          })(),
          boidHint: (() => {
            const full =
              verify.demat?.trim() ||
              (verify.boid && /^\d{16}$/.test(verify.boid.trim())
                ? verify.boid.trim()
                : verify.boid);
            return full ? String(full).slice(-4) : undefined;
          })(),
        });

        Alert.alert(
          'Verified & saved',
          verify.crnPinDeferred
            ? `${verify.message}\n\nImportant: No IPO is open, so CRN/PIN were not confirmed yet.\nWhen a real IPO opens and you tap Live Apply, MeroShare will check CRN + PIN. If either is wrong, that account will fail (and will NOT be marked applied).`
            : `${verify.message}\n\nData stays on this device only.`,
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('MainTabs', { screen: 'Apply' }),
            },
          ],
        );
      } finally {
        setSubmitting(false);
      }
    });
  };

  const errStyle = (field: VerifyField) =>
    errorField === field ? styles.fieldErrorWrap : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Bank Detail</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: rs(40) }}>
        <LocalDisclaimer />

        <Text style={styles.verifyHint}>
          Your DP was already chosen. ASBA bank is taken from your MeroShare
          account automatically — only enter CRN and transaction PIN.
        </Text>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerTitle}>
              {errorField === 'unknown' || !errorField
                ? 'Verification issue'
                : `${fieldLabel(errorField)} does not match`}
            </Text>
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Depository Participant</Text>
          <Text style={styles.infoValue}>
            {draft?.dpName ?? '—'}
          </Text>
          <Text style={[styles.infoLabel, { marginTop: rs(12) }]}>
            Linked bank (from MeroShare)
          </Text>
          {loadingBank ? (
            <ActivityIndicator
              color={colors.sage}
              style={{ marginTop: rs(8), alignSelf: 'flex-start' }}
            />
          ) : (
            <Text style={styles.infoValue}>{linkedBank || '—'}</Text>
          )}
          {bankError ? (
            <Text style={styles.bankWarn}>{bankError}</Text>
          ) : null}
        </View>

        <View style={errStyle('crn')}>
          <FormField
            icon="key-outline"
            label="CRN Number"
            value={crn}
            onChangeText={(t) => {
              setCrn(t);
              if (errorField === 'crn') {
                setErrorField(null);
                setErrorMsg('');
              }
            }}
            placeholder="CRN from your bank / ASBA"
            secure={hideCrn}
            showEye
            onToggleEye={() => setHideCrn((v) => !v)}
          />
        </View>
        <View style={errStyle('pin')}>
          <FormField
            icon="ellipsis-horizontal"
            label="Transaction PIN"
            value={pin}
            onChangeText={(t) => {
              setPin(t.replace(/[^0-9]/g, '').slice(0, 4));
              if (errorField === 'pin') {
                setErrorField(null);
                setErrorMsg('');
              }
            }}
            placeholder="4-digit MeroShare PIN"
            secure={hidePin}
            showEye
            onToggleEye={() => setHidePin((v) => !v)}
            keyboardType="number-pad"
            maxLength={4}
            counter={`${pin.length}/4`}
          />
        </View>

        <Pressable
          style={[
            styles.submitBtn,
            (submitting || loadingBank) && { opacity: 0.6 },
          ]}
          onPress={onSubmit}
          disabled={submitting || loadingBank}
        >
          {submitting ? (
            <View style={styles.submitRow}>
              <ActivityIndicator color={colors.sage} />
              <Text style={styles.submitText}> Verifying live…</Text>
            </View>
          ) : (
            <Text style={styles.submitText}>Verify & Save</Text>
          )}
        </Pressable>
      </ScrollView>
      <SensitiveActionModals action={sensitive} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    gap: rs(8),
    backgroundColor: colors.bgElevated,
  },
  back: { color: colors.text, fontSize: rs(22), width: rs(32) },
  title: { color: colors.text, fontSize: rs(17), fontWeight: '600' },
  verifyHint: {
    marginHorizontal: rs(16),
    marginBottom: rs(10),
    color: colors.textSecondary,
    fontSize: rs(12),
    lineHeight: rs(17),
  },
  infoCard: {
    marginHorizontal: rs(16),
    marginBottom: rs(12),
    padding: rs(14),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: rs(12),
    fontWeight: '600',
  },
  infoValue: {
    color: colors.text,
    fontSize: rs(14),
    fontWeight: '700',
    marginTop: rs(4),
  },
  bankWarn: {
    color: colors.textMuted,
    fontSize: rs(11),
    marginTop: rs(8),
    lineHeight: rs(15),
  },
  errorBanner: {
    marginHorizontal: rs(16),
    marginBottom: rs(12),
    padding: rs(12),
    borderRadius: rs(10),
    backgroundColor: 'rgba(198,40,40,0.12)',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorBannerTitle: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: rs(13),
    marginBottom: rs(4),
  },
  errorBannerText: {
    color: colors.text,
    fontSize: rs(12),
    lineHeight: rs(17),
  },
  fieldErrorWrap: {
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    marginLeft: rs(8),
  },
  submitBtn: {
    alignSelf: 'center',
    marginTop: rs(28),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rs(24),
    paddingHorizontal: rs(36),
    paddingVertical: rs(10),
    minWidth: rs(160),
    alignItems: 'center',
  },
  submitRow: { flexDirection: 'row', alignItems: 'center' },
  submitText: { color: colors.sage, fontWeight: '700', fontSize: rs(15) },
});
