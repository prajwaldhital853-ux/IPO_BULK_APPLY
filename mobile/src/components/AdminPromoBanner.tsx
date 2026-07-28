import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PromoBanner } from './PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useAppBranding } from '../context/AppBrandingContext';
import { useSubscription } from '../context/SubscriptionContext';
import type { RootStackParamList } from '../navigation/types';
import { guardAddAccount } from '../utils/accountLimits';

const TAB_ACTIONS = new Set(['Apply', 'Services', 'Profile', 'Home', 'Check']);

/**
 * Green promo strip controlled from Admin → Home card.
 * Shown on every main tab when enabled; hidden everywhere when disabled.
 */
export function AdminPromoBanner() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { homePromo } = useAppBranding();
  const { accounts } = useAccounts();
  const { isPremium, maxAccounts } = useSubscription();

  const onPress = useCallback(() => {
    const action = (homePromo.action || 'none').trim();
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
    homePromo.action,
    isPremium,
    maxAccounts,
    navigation,
  ]);

  if (!homePromo.visible) return null;

  const clickable = Boolean(homePromo.action && homePromo.action !== 'none');

  return (
    <PromoBanner
      text={homePromo.text}
      color={homePromo.color}
      onPress={clickable ? onPress : undefined}
    />
  );
}
