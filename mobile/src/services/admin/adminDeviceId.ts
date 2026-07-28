import * as SecureStore from 'expo-secure-store';

const KEY = 'nepse:admin:device-id:v1';

function randomId(): string {
  const bytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256),
  );
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable per-install id used for admin login lockouts (not the user account). */
export async function getAdminDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing && existing.trim()) return existing.trim();
    const next = `ng-${randomId()}`;
    await SecureStore.setItemAsync(KEY, next);
    return next;
  } catch {
    // SecureStore unavailable (web / restricted) — ephemeral fallback
    return `ng-tmp-${Date.now().toString(36)}`;
  }
}
