import { useEffect } from 'react';
import { isExpoGo } from '../services/push/notifications';
import { navigateFromNotification } from '../navigation/navigationRef';

type PushData = {
  type?: string;
  symbol?: string;
  offeringId?: string;
  matchKey?: string;
  companyName?: string;
  screen?: string;
  tabScreen?: string;
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
    case 'admin_custom': {
      const screen = String(data?.screen || '').trim();
      const tabScreen = String(data?.tabScreen || '').trim();
      if (screen === 'MainTabs' && tabScreen) {
        navigateFromNotification('MainTabs', { screen: tabScreen as 'Home' });
        break;
      }
      if (screen === 'StockDetail' && data?.symbol) {
        navigateFromNotification('StockDetail', { symbol: String(data.symbol) });
        break;
      }
      if (screen) {
        navigateFromNotification(screen as 'Subscription', undefined);
      }
      break;
    }
    default:
      navigateFromNotification('MainTabs', { screen: 'Home' });
      break;
  }
}

function extractData(
  response: {
    notification?: { request?: { content?: { data?: unknown } } };
  } | null | undefined,
): PushData | undefined {
  const raw = response?.notification?.request?.content?.data;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as PushData;
}

/**
 * Routes notification taps to the correct screen (Apply tab for IPO alerts, etc.).
 * Skipped in Expo Go — remote push is not available there (SDK 53+).
 */
export function NotificationRouter() {
  useEffect(() => {
    if (isExpoGo()) return;

    let sub: { remove: () => void } | undefined;

    void (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const response = await Notifications.getLastNotificationResponseAsync();
        const data = extractData(response);
        if (data?.type) routeForPush(data);

        sub = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            routeForPush(extractData(response));
          },
        );
      } catch {
        // Push routing is production-APK only.
      }
    })();

    return () => sub?.remove();
  }, []);

  return null;
}
