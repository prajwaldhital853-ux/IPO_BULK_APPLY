import { Alert } from 'react-native';
import {
  FREE_ACCOUNT_LIMIT,
  PREMIUM_ACCOUNT_LIMIT,
  accountLimitForPlan,
  isUnlimitedAccountLimit,
} from '../storage/subscriptionStorage';

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
