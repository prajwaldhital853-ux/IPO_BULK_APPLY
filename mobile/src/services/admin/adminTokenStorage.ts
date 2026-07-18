import * as SecureStore from 'expo-secure-store';

const ADMIN_TOKEN_KEY = 'nepse_ghar_admin_token';

export async function saveAdminToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ADMIN_TOKEN_KEY, token);
}

export async function loadAdminToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearAdminToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}
