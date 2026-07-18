import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getActiveUserId, scopedPinKey, scopedPinLockKey } from './userScope';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const MAX_HISTORY = 20;

type PinRecord = {
  hash: string;
  salt: string;
};

function pinHistoryKey(userId: string): string {
  return `nepse_ghar_${userId}_pin_history`;
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
}

async function loadPinHistory(userId: string): Promise<PinRecord[]> {
  try {
    const raw = await SecureStore.getItemAsync(pinHistoryKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PinRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendPinHistory(record: PinRecord, userId: string): Promise<void> {
  const history = await loadPinHistory(userId);
  history.push(record);
  await SecureStore.setItemAsync(
    pinHistoryKey(userId),
    JSON.stringify(history.slice(-MAX_HISTORY)),
  );
}

async function pinMatchesRecord(pin: string, record: PinRecord): Promise<boolean> {
  return (await hashPin(pin, record.salt)) === record.hash;
}

async function loadCurrentPinRecord(userId: string): Promise<PinRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(scopedPinKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as PinRecord;
  } catch {
    return null;
  }
}

export async function hasPin(userId?: string): Promise<boolean> {
  return Boolean(await loadCurrentPinRecord(userId ?? getActiveUserId()));
}

export async function isPinReused(pin: string, userId?: string): Promise<boolean> {
  const uid = userId ?? getActiveUserId();
  const current = await loadCurrentPinRecord(uid);
  if (current && (await pinMatchesRecord(pin, current))) return true;
  const history = await loadPinHistory(uid);
  for (const record of history) {
    if (await pinMatchesRecord(pin, record)) return true;
  }
  return false;
}

export async function setupPin(pin: string, userId?: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
  const uid = userId ?? getActiveUserId();
  const salt = Crypto.randomUUID();
  const hash = await hashPin(pin, salt);
  const record: PinRecord = { hash, salt };
  await SecureStore.setItemAsync(scopedPinKey(uid), JSON.stringify(record));
}

export async function changePin(
  currentPin: string,
  newPin: string,
  userId?: string,
): Promise<void> {
  const uid = userId ?? getActiveUserId();
  const ok = await verifyPin(currentPin, uid);
  if (!ok) throw new Error('Current PIN is incorrect');
  if (!/^\d{4}$/.test(newPin)) throw new Error('PIN must be 4 digits');
  if (await isPinReused(newPin, uid)) {
    throw new Error('Choose a PIN you have not used before on this account');
  }
  const current = await loadCurrentPinRecord(uid);
  if (current) await appendPinHistory(current, uid);
  await setupPin(newPin, uid);
}

export async function verifyPin(pin: string, userId?: string): Promise<boolean> {
  const uid = userId ?? getActiveUserId();
  const lockRaw = await SecureStore.getItemAsync(scopedPinLockKey(uid));
  if (lockRaw) {
    const until = Number(lockRaw);
    if (Number.isFinite(until) && Date.now() < until) {
      throw new Error('PIN locked. Try again later.');
    }
    await SecureStore.deleteItemAsync(scopedPinLockKey(uid));
  }

  const record = await loadCurrentPinRecord(uid);
  if (!record) return false;
  const hash = await hashPin(pin, record.salt);
  if (hash === record.hash) {
    await SecureStore.deleteItemAsync(`${scopedPinKey(uid)}_fails`);
    return true;
  }

  const failKey = `${scopedPinKey(uid)}_fails`;
  const fails = Number((await SecureStore.getItemAsync(failKey)) ?? '0') + 1;
  await SecureStore.setItemAsync(failKey, String(fails));
  if (fails >= MAX_ATTEMPTS) {
    await SecureStore.setItemAsync(scopedPinLockKey(uid), String(Date.now() + LOCK_MS));
    await SecureStore.deleteItemAsync(failKey);
    throw new Error('Too many attempts. PIN locked for 15 minutes.');
  }
  return false;
}

export async function clearPin(userId?: string): Promise<void> {
  const uid = userId ?? getActiveUserId();
  await SecureStore.deleteItemAsync(scopedPinKey(uid));
  await SecureStore.deleteItemAsync(scopedPinLockKey(uid));
  await SecureStore.deleteItemAsync(pinHistoryKey(uid));
  await SecureStore.deleteItemAsync(`${scopedPinKey(uid)}_fails`);
}
