/** Safe back navigation — avoids "GO_BACK was not handled" when stack is empty. */
export function safeGoBack(navigation: {
  canGoBack?: () => boolean;
  goBack: () => void;
  navigate?: (name: string) => void;
}): void {
  if (navigation.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  if (typeof navigation.navigate === 'function') {
    navigation.navigate('MainTabs');
  }
}
