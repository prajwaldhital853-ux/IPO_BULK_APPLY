import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { navigateFromNotification } from '../navigation/navigationRef';

type PushData = {
  type?: string;
  symbol?: string;
  offeringId?: string;
  matchKey?: string;
  companyName?: string;
};

function routeForPush(data: PushData | undefined): void {
  const type = String(data?.type || '').trim();
  if (!type) return;

  switch (type) {
    case 'ipo_open':
    case 'ipo_last_day':
    case 'ipo_closed':
      navigateFromNotification('MainTabs', {
        screen: 'Apply',
        params: {
          highlightSymbol: data?.symbol,
          highlightMatchKey: data?.matchKey,
          highlightName: data?.companyName,
        },
      });
      break;
    case 'bulk_transaction':
      navigateFromNotification('BulkTransactions');
      break;
    case 'price_alert':
      if (data?.symbol) {
        navigateFromNotification('StockDetail', { symbol: String(data.symbol) });
      } else {
        navigateFromNotification('PriceAlert');
      }
      break;
    case 'subscription_approved':
    case 'subscription_rejected':
    case 'subscription_submitted':
    case 'premium_deactivated':
    case 'account_limit_updated':
    case 'account_blocked':
      navigateFromNotification('Subscription');
      break;
    case 'market_open':
    case 'market_close':
      navigateFromNotification('MainTabs', { screen: 'Home' });
      break;
    default:
      navigateFromNotification('MainTabs', { screen: 'Home' });
      break;
  }
}

function extractData(
  response: Notifications.NotificationResponse | null | undefined,
): PushData | undefined {
  const raw = response?.notification?.request?.content?.data;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as PushData;
}

/**
 * Routes notification taps to the correct screen (Apply tab for IPO alerts, etc.).
 */
export function NotificationRouter() {
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = extractData(response);
      if (data?.type) routeForPush(data);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        routeForPush(extractData(response));
      },
    );

    return () => sub.remove();
  }, []);

  return null;
}
