import * as SecureStore from 'expo-secure-store';

const LAST_USER_KEY = 'nepse_ghar_last_signed_in_user_id';

export async function saveLastSignedInUserId(userId: string): Promise<void> {
  await SecureStore.setItemAsync(LAST_USER_KEY, userId);
}

export async function loadLastSignedInUserId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LAST_USER_KEY);
  } catch {
    return null;
  }
}

export async function clearLastSignedInUserId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LAST_USER_KEY);
  } catch {
    // ignore
  }
}
