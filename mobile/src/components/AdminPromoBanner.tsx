import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PromoBanner } from './PromoBanner';
import { useAccounts } from '../context/AccountsContext';
import { useAppBranding } from '../context/AppBrandingContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import type { RootStackParamList } from '../navigation/types';
import type { HomePromoPageKey } from '../services/app/publicSettingsApi';
import {
  ensureGoogleSignedInForAddAccount,
  guardAddAccountAsync,
} from '../utils/accountLimits';

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
  const { isAuthenticated, signInWithGoogle } = useAuth();

  const onPress = useCallback(() => {
    const action = (promo.action || 'none').trim();
    if (!action || action === 'none') return;

    if (action === 'AddCapital') {
      void (async () => {
        if (
          !(await ensureGoogleSignedInForAddAccount(
            isAuthenticated,
            signInWithGoogle,
          ))
        ) {
          return;
        }
        if (
          !(await guardAddAccountAsync({
            currentCount: accounts.length,
            isPremium,
            maxAccounts,
            onUpgrade: () => navigation.navigate('Subscription'),
          }))
        ) {
          return;
        }
        navigation.navigate('AddCapital');
      })();
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
    isAuthenticated,
    isPremium,
    maxAccounts,
    navigation,
    signInWithGoogle,
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
