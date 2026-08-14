import AsyncStorage from '@react-native-async-storage/async-storage';
import { scopedAsyncKey } from './userScope';

const BASE = 'stale_release_timer_v1';

type Stored = {
  releaseAt: string;
};

function key() {
  return scopedAsyncKey(BASE);
}

export async function loadStaleReleaseAt(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(key());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    const at = Date.parse(parsed.releaseAt);
    if (!Number.isFinite(at) || at <= Date.now()) {
      await AsyncStorage.removeItem(key());
      return null;
    }
    return parsed.releaseAt;
  } catch {
    return null;
  }
}

export async function clearStaleReleaseAt(): Promise<void> {
  try {
    await AsyncStorage.removeItem(key());
  } catch {
    // ignore
  }
}

/**
 * Keep the first freeze time so closing the sheet / app does not restart
 * the 20-minute countdown.
 */
export async function rememberStaleReleaseAt(
  serverReleaseAt: string,
): Promise<string> {
  const serverMs = Date.parse(serverReleaseAt);
  const stored = await loadStaleReleaseAt();
  const storedMs = stored ? Date.parse(stored) : NaN;
  let chosen = serverReleaseAt;
  if (Number.isFinite(storedMs) && Number.isFinite(serverMs)) {
    chosen = new Date(Math.min(storedMs, serverMs)).toISOString();
  } else if (Number.isFinite(storedMs)) {
    chosen = stored as string;
  }
  try {
    await AsyncStorage.setItem(key(), JSON.stringify({ releaseAt: chosen }));
  } catch {
    // ignore
  }
  return chosen;
}

export function secondsUntil(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil((ms - Date.now()) / 1000));
}
