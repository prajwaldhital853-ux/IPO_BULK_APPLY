import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { AUTH_ENABLED } from './auth/config';
import { authFetch } from './auth/http';
import { getInstallDeviceId } from '../storage/installDeviceId';

export type SlotDevice = {
  deviceId: string;
  deviceLabel: string;
  platform: string;
  accountCount: number;
  lastSeenAt: string;
  isThisDevice: boolean;
};

export type SlotStatus = {
  allowed: boolean;
  maxAccounts: number;
  /** Unique demats claimed across every phone on this Google account. */
  claimedTotal: number;
  thisDeviceCount: number;
  otherDevicesTotal: number;
  deviceCount: number;
  message: string;
  /** Active demats, chosen by the server: first N in the order they were added. */
  activeKeys: string[];
  lockedKeys: string[];
  devices: SlotDevice[];
};

function deviceLabel(): string {
  const model = Device.modelName?.trim();
  const name = Device.deviceName?.trim();
  if (model && name && name !== model) return `${model} (${name})`.slice(0, 128);
  return (model || name || Platform.OS).slice(0, 128);
}

async function payload(keys: string[]) {
  return {
    deviceId: await getInstallDeviceId(),
    deviceLabel: deviceLabel(),
    platform: Platform.OS,
    accountCount: keys.length,
    keys,
    syncKeys: true,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function mapStatus(json: Record<string, unknown>): SlotStatus {
  const devicesRaw = Array.isArray(json.devices) ? json.devices : [];
  return {
    allowed: Boolean(json.allowed),
    maxAccounts: Number(json.maxAccounts ?? 0),
    claimedTotal: Number(json.claimedTotal ?? 0),
    thisDeviceCount: Number(json.thisDeviceCount ?? 0),
    otherDevicesTotal: Number(json.otherDevicesTotal ?? 0),
    deviceCount: Number(json.deviceCount ?? 0),
    message: String(json.message ?? ''),
    activeKeys: strings(json.activeKeys),
    lockedKeys: strings(json.lockedKeys),
    devices: devicesRaw.map((d) => {
      const row = d as Record<string, unknown>;
      return {
        deviceId: String(row.deviceId ?? ''),
        deviceLabel: String(row.deviceLabel ?? 'Device'),
        platform: String(row.platform ?? 'android'),
        accountCount: Number(row.accountCount ?? 0),
        lastSeenAt: String(row.lastSeenAt ?? ''),
        isThisDevice: Boolean(row.isThisDevice),
      };
    }),
  };
}

async function readStatus(res: Response): Promise<SlotStatus> {
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const detail = json.detail != null ? String(json.detail) : `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return mapStatus(json);
}

/**
 * Register this phone's demats for the signed-in Google account and read back
 * which of them are active. Demats missing from `keys` are released, so
 * deleting an account here frees that slot on every phone.
 */
export async function syncAccountSlots(
  keys: string[],
): Promise<SlotStatus | null> {
  if (!AUTH_ENABLED) return null;
  try {
    const res = await authFetch('/app/account-slots/sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await payload(keys)),
    });
    if (res.status === 401) return null;
    return await readStatus(res);
  } catch {
    return null;
  }
}

/** Ask the server whether this Google account can claim one more demat. */
export async function checkCanAddAcrossDevices(
  keys: string[],
  candidateKey?: string,
): Promise<SlotStatus | null> {
  if (!AUTH_ENABLED) return null;
  const res = await authFetch('/app/account-slots/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(await payload(keys)),
      candidateKey: candidateKey ?? '',
    }),
  });
  if (res.status === 401) return null;
  return await readStatus(res);
}
