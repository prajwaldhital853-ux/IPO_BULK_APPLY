import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** Android 13+ uses the system photo picker — no READ_MEDIA_* permission needed. */
export async function ensureGalleryAccessForPicker(): Promise<boolean> {
  if (Platform.OS === 'android') return true;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return permission.granted;
}
