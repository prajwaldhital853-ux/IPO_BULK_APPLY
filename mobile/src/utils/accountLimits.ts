import { Alert } from 'react-native';
import { showAccountLimitBlocked } from '../context/AccountLimitBlockedContext';
import { checkCanAddAcrossDevices } from '../services/accountSlots';
import { AUTH_ENABLED, GUEST_CAN_ADD_ACCOUNTS } from '../services/auth/config';
import { getAccessToken } from '../services/auth/tokenStorage';
import { loadAccountMeta } from '../storage/accountsStorage';
import {
  FREE_ACCOUNT_LIMIT,
  PREMIUM_ACCOUNT_LIMIT,
  accountLimitForPlan,
  isUnlimitedAccountLimit,
} from '../storage/subscriptionStorage';
import type { AccountMeta } from '../types/account';
import { isMockAccountId } from '../data/mockAccounts';
import {
  accountFingerprintList,
  keysForAccountIds,
} from './accountFingerprint';

/** Identity of the account about to be added, when it is already known. */
export type CandidateAccount = {
  dpId?: string;
  dpCode?: string;
  username?: string;
  demat?: string;
};

/** Returns true if the user may add another account. Shows Alert when blocked. */
export function guardAddAccount(opts: {
  currentCount: number;
  isPremium: boolean;
  maxAccounts?: number;
  onUpgrade?: () => void;
}): boolean {
  const max =
    opts.maxAccounts != null && opts.maxAccounts > 0
      ? opts.maxAccounts
      : accountLimitForPlan(opts.isPremium);
  if (isUnlimitedAccountLimit(max) || opts.currentCount < max) return true;

  if (opts.isPremium) {
    Alert.alert(
      'Account limit reached',
      `Your plan allows up to ${max} MeroShare accounts.\n\nNeed more? Open Subscription and tap “Contact us for more than 50 accounts” on WhatsApp — admin can raise your limit (including unlimited).`,
    );
    return false;
  }

  Alert.alert(
    'Free plan limit',
    `Free users can add up to ${FREE_ACCOUNT_LIMIT} accounts.\n\nUpgrade to add up to ${PREMIUM_ACCOUNT_LIMIT} accounts:\n• Rs 300 / 6 months\n• Rs 500 / year\n\nNeed more than 50? Contact admin on WhatsApp from the Subscription page.`,
    opts.onUpgrade
      ? [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: opts.onUpgrade },
        ]
      : [{ text: 'OK' }],
  );
  return false;
}

function candidateKey(candidate?: CandidateAccount): string | undefined {
  if (!candidate) return undefined;
  const keys = accountFingerprintList({
    id: '',
    name: '',
    dpName: '',
    dpId: candidate.dpId ?? '',
    dpCode: candidate.dpCode,
    username: candidate.username ?? '',
    demat: candidate.demat,
  } as AccountMeta);
  return keys.length ? keys.join(';') : undefined;
}

/** Prompt Google sign-in when adding accounts without a session (skipped when guest add is allowed). */
export async function ensureGoogleSignedInForAddAccount(
  isAuthenticated: boolean,
  signInWithGoogle: () => Promise<void>,
): Promise<boolean> {
  if (
    !AUTH_ENABLED ||
    isAuthenticated ||
    GUEST_CAN_ADD_ACCOUNTS
  ) {
    return true;
  }
  await signInWithGoogle();
  return Boolean(getAccessToken());
}

/**
 * Shared cap across every phone on this Google account. When signed in, the
 * server decides — local per-phone counts are not trusted.
 */
export async function guardAddAccountAsync(opts: {
  currentCount: number;
  isPremium: boolean;
  maxAccounts?: number;
  onUpgrade?: () => void;
  /** The account being added, when its DP + username are already known. */
  candidate?: CandidateAccount;
}): Promise<boolean> {
  if (!AUTH_ENABLED) {
    return guardAddAccount(opts);
  }

  const guestLocalOnly =
    GUEST_CAN_ADD_ACCOUNTS && !getAccessToken();

  if (guestLocalOnly) {
    return guardAddAccount(opts);
  }

  try {
    const accounts = (await loadAccountMeta()).filter(
      (a) => !isMockAccountId(a.id),
    );
    const keys = keysForAccountIds(
      accounts,
      accounts.map((a) => a.id),
    );
    const status = await checkCanAddAcrossDevices(
      keys,
      accounts.length,
      candidateKey(opts.candidate),
    );
    if (!status) {
      if (GUEST_CAN_ADD_ACCOUNTS) {
        return guardAddAccount({
          ...opts,
          currentCount: Math.max(opts.currentCount, accounts.length),
        });
      }
      Alert.alert(
        'Sign in required',
        'Sign in with Google to add accounts so your plan limit applies across all phones.',
      );
      return false;
    }
    if (status.allowed) return true;
    showAccountLimitBlocked({
      status,
      onUpgrade: opts.onUpgrade,
    });
    return false;
  } catch {
    if (GUEST_CAN_ADD_ACCOUNTS) {
      return guardAddAccount(opts);
    }
    Alert.alert(
      'Could not verify limit',
      'Check your internet and try again.',
    );
    return false;
  }
}
