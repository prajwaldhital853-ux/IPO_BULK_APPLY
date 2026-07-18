import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getActiveUserId, scopedPinKey, scopedPinLockKey } from './userScope';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

type PinRecord = {
  hash: string;
  salt: string;
};

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
}

export async function hasPin(userId?: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(scopedPinKey(userId ?? getActiveUserId()));
    return Boolean(raw);
  } catch {
    return false;
  }
}

export async function setupPin(pin: string, userId?: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
  const salt = Crypto.randomUUID();
  const hash = await hashPin(pin, salt);
  const record: PinRecord = { hash, salt };
  await SecureStore.setItemAsync(
    scopedPinKey(userId ?? getActiveUserId()),
    JSON.stringify(record),
  );
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

  const raw = await SecureStore.getItemAsync(scopedPinKey(uid));
  if (!raw) return false;
  const record = JSON.parse(raw) as PinRecord;
  const hash = await hashPin(pin, record.salt);
  if (hash === record.hash) {
    await SecureStore.deleteItemAsync(scopedPinKey(uid).replace('_pin_hash', '_pin_fails'));
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
}
