import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PromoBanner } from './PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useAppBranding } from '../context/AppBrandingContext';
import { useSubscription } from '../context/SubscriptionContext';
import type { RootStackParamList } from '../navigation/types';
import type { HomePromoPageKey } from '../services/app/publicSettingsApi';
import { guardAddAccount } from '../utils/accountLimits';

const TAB_ACTIONS = new Set(['Apply', 'Services', 'Profile', 'Home', 'Check']);

type Props = {
  page: HomePromoPageKey;
};

/**
 * Promo strip controlled from Admin → Home card (per page).
 */
export function AdminPromoBanner({ page }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { homePromos } = useAppBranding();
  const promo = homePromos[page];
  const { accounts } = useAccounts();
  const { isPremium, maxAccounts } = useSubscription();

  const onPress = useCallback(() => {
    const action = (promo.action || 'none').trim();
    if (!action || action === 'none') return;

    if (action === 'AddCapital') {
      if (
        !guardAddAccount({
          currentCount: accounts.length,
          isPremium,
          maxAccounts,
          onUpgrade: () => navigation.navigate('Subscription'),
        })
      ) {
        return;
      }
      navigation.navigate('AddCapital');
      return;
    }

    if (TAB_ACTIONS.has(action)) {
      navigation.navigate('MainTabs', { screen: action as never });
      return;
    }

    navigation.navigate(action as never);
  }, [
    accounts.length,
    promo.action,
    isPremium,
    maxAccounts,
    navigation,
  ]);

  if (!promo.visible) return null;

  const clickable = Boolean(promo.action && promo.action !== 'none');

  return (
    <PromoBanner
      text={promo.text}
      color={promo.color}
      onPress={clickable ? onPress : undefined}
    />
  );
}
