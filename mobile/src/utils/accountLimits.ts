import { Alert } from 'react-native';
import {
  FREE_ACCOUNT_LIMIT,
  PREMIUM_ACCOUNT_LIMIT,
  accountLimitForPlan,
} from '../storage/subscriptionStorage';

/** Returns true if the user may add another account. Shows Alert when blocked. */
export function guardAddAccount(opts: {
  currentCount: number;
  isPremium: boolean;
  onUpgrade?: () => void;
}): boolean {
  const max = accountLimitForPlan(opts.isPremium);
  if (opts.currentCount < max) return true;

  if (opts.isPremium) {
    Alert.alert(
      'Account limit reached',
      `Premium allows up to ${PREMIUM_ACCOUNT_LIMIT} MeroShare accounts.`,
    );
    return false;
  }

  Alert.alert(
    'Free plan limit',
    `Free users can add up to ${FREE_ACCOUNT_LIMIT} accounts.\n\nUpgrade to add up to ${PREMIUM_ACCOUNT_LIMIT} accounts:\n• Rs 300 / 6 months\n• Rs 500 / year`,
    opts.onUpgrade
      ? [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: opts.onUpgrade },
        ]
      : [{ text: 'OK' }],
  );
  return false;
}
