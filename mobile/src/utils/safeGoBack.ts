/** Safe back navigation — avoids "GO_BACK was not handled" when stack is empty. */
export function safeGoBack(navigation: {
  canGoBack?: () => boolean;
  goBack: () => void;
  pop?: (count?: number) => void;
  navigate?: (name: string) => void;
}): void {
  // Prefer pop() — same tick as the press, no extra work before native dismiss.
  if (typeof navigation.pop === 'function' && navigation.canGoBack?.()) {
    navigation.pop();
    return;
  }
  if (navigation.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  if (typeof navigation.navigate === 'function') {
    navigation.navigate('MainTabs');
  }
}
