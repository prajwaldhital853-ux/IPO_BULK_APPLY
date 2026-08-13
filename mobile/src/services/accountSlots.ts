import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { AUTH_ENABLED } from '../auth/config';
import { authFetch } from '../auth/http';
import { getInstallDeviceId } from '../../storage/installDeviceId';

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
  claimedTotal: number;
  thisDeviceCount: number;
  otherDevicesTotal: number;
  deviceCount: number;
  message: string;
  devices: SlotDevice[];
};

let lastStatus: SlotStatus | null = null;

export function getLastSlotStatus(): SlotStatus | null {
  return lastStatus;
}

function deviceLabel(): string {
  const model = Device.modelName?.trim();
  const name = Device.deviceName?.trim();
  if (model && name && name !== model) return `${model} (${name})`.slice(0, 128);
  return (model || name || Platform.OS).slice(0, 128);
}

async function payload(accountCount: number) {
  return {
    deviceId: await getInstallDeviceId(),
    deviceLabel: deviceLabel(),
    platform: Platform.OS,
    accountCount: Math.max(0, Math.floor(accountCount)),
  };
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
  const status = mapStatus(json);
  lastStatus = status;
  return status;
}

export async function reportAccountSlots(
  accountCount: number,
): Promise<SlotStatus | null> {
  if (!AUTH_ENABLED) return null;
  try {
    const body = await payload(accountCount);
    const res = await authFetch('/app/account-slots/report', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return null;
    return await readStatus(res);
  } catch {
    return null;
  }
}

/** Ask server if this Google account can add one more slot across all phones. */
export async function checkCanAddAcrossDevices(
  currentCount: number,
): Promise<SlotStatus | null> {
  if (!AUTH_ENABLED) return null;
  const body = await payload(currentCount);
  const res = await authFetch('/app/account-slots/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) return null;
  return await readStatus(res);
}
