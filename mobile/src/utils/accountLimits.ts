import { Alert } from 'react-native';
import {
  checkCanAddAcrossDevices,
  releaseOtherDeviceSlots,
} from '../services/accountSlots';
import { AUTH_ENABLED } from '../services/auth/config';
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

function promptReleaseOthers(
  opts: {
    currentCount: number;
    onUpgrade?: () => void;
  },
  statusMessage: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: 'Free other phones',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const next = await releaseOtherDeviceSlots(opts.currentCount);
              if (next.allowed || opts.currentCount < next.maxAccounts) {
                Alert.alert(
                  'Slots freed',
                  'Claims from other installs were cleared. You can add accounts on this phone now.',
                );
                resolve(true);
                return;
              }
              Alert.alert(
                'Still at limit',
                next.message || 'This phone already uses the full plan limit.',
              );
              resolve(false);
            } catch (e) {
              Alert.alert(
                'Could not free slots',
                e instanceof Error ? e.message : 'Try again.',
              );
              resolve(false);
            }
          })();
        },
      },
    ];
    if (opts.onUpgrade) {
      buttons.splice(1, 0, {
        text: 'Upgrade',
        onPress: () => {
          opts.onUpgrade?.();
          resolve(false);
        },
      });
    }
    Alert.alert(
      'Account limit reached',
      `${statusMessage}\n\nUninstalled the app on another phone? Free those slots now so you can add accounts here.`,
      buttons,
    );
  });
}

/**
 * Local cap + shared cap across phones signed in with the same Google account.
 * Does not upload MeroShare credentials — only a count per device.
 */
export async function guardAddAccountAsync(opts: {
  currentCount: number;
  isPremium: boolean;
  maxAccounts?: number;
  onUpgrade?: () => void;
}): Promise<boolean> {
  if (!guardAddAccount(opts)) return false;
  // Auth off (dev) → local guard only.
  if (!AUTH_ENABLED) return true;
  try {
    const status = await checkCanAddAcrossDevices(opts.currentCount);
    if (!status) {
      Alert.alert(
        'Sign in required',
        'Sign in with Google to add accounts so your plan limit applies across all phones.',
      );
      return false;
    }
    if (status.allowed) return true;
    if (status.canReleaseOthers || status.otherDevicesTotal > 0) {
      return promptReleaseOthers(
        opts,
        status.message ||
          `Your plan allows ${status.maxAccounts} accounts across all phones.`,
      );
    }
    Alert.alert(
      'Account limit reached',
      status.message ||
        `Your plan allows ${status.maxAccounts} accounts across all your phones.`,
      opts.onUpgrade
        ? [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: opts.onUpgrade },
          ]
        : [{ text: 'OK' }],
    );
    return false;
  } catch {
    Alert.alert(
      'Could not verify limit',
      'Check your internet and try again.',
    );
    return false;
  }
}
