import { Alert } from 'react-native';

export function showLockedAccountAlert(onUpgrade?: () => void) {
  Alert.alert(
    'Account locked',
    'Your plan allows fewer active accounts than you have saved, so the '
      + 'oldest accounts stay active and this one is locked on every phone '
      + 'signed in with your Google account.\n\nDelete an active account to '
      + 'free its slot, or upgrade / ask admin to raise your limit.',
    [
      { text: 'OK', style: 'cancel' },
      ...(onUpgrade ? [{ text: 'Upgrade', onPress: onUpgrade }] : []),
    ],
  );
}
