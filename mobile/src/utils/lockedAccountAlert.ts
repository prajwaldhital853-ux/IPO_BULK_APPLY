import { Alert } from 'react-native';

export function showLockedAccountAlert(
  onChoose: (() => void) | null,
  onUpgrade?: () => void,
) {
  Alert.alert(
    'Account locked',
    onChoose
      ? 'This account is over your plan limit. It stays saved on this phone, but you cannot apply or open MeroShare until you include it in your active set — or upgrade / ask admin to raise the limit.'
      : 'This account is over your plan limit. Your active set is locked for this plan. Upgrade or ask admin to raise the limit to use this account.',
    [
      { text: 'Cancel', style: 'cancel' },
      ...(onUpgrade
        ? [{ text: 'Upgrade', onPress: onUpgrade }]
        : []),
      ...(onChoose
        ? [{ text: 'Choose accounts', onPress: onChoose }]
        : []),
    ],
  );
}
