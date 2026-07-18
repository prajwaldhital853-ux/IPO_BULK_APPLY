import AsyncStorage from '@react-native-async-storage/async-storage';
import { HISTORY_BASE, LEGACY_HISTORY_KEY, scopedAsyncKey } from './userScope';

/** key = `${accountId}:${companyShareId}` */
type HistoryMap = Record<string, { kitta: number; at: string; dryRun: boolean }>;

function historyKey(): string {
  return scopedAsyncKey(HISTORY_BASE);
}

function entryKey(accountId: string, companyShareId: number) {
  return `${accountId}:${companyShareId}`;
}

async function loadMap(): Promise<HistoryMap> {
  try {
    let raw = await AsyncStorage.getItem(historyKey());
    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_HISTORY_KEY);
    }
    if (!raw) return {};
    return JSON.parse(raw) as HistoryMap;
  } catch {
    return {};
  }
}

async function saveMap(map: HistoryMap): Promise<void> {
  await AsyncStorage.setItem(historyKey(), JSON.stringify(map));
}

export async function loadApplyHistory(): Promise<HistoryMap> {
  return loadMap();
}

export async function hasApplied(
  accountId: string,
  companyShareId: number,
): Promise<boolean> {
  const map = await loadMap();
  return isAppliedInMap(map, accountId, companyShareId);
}

export async function markApplied(args: {
  accountId: string;
  companyShareId: number;
  kitta: number;
  dryRun: boolean;
}): Promise<void> {
  const map = await loadMap();
  map[entryKey(args.accountId, args.companyShareId)] = {
    kitta: args.kitta,
    at: new Date().toISOString(),
    dryRun: args.dryRun,
  };
  await saveMap(map);
}

export async function markAppliedMany(
  rows: {
    accountId: string;
    companyShareId: number;
    kitta: number;
    dryRun: boolean;
  }[],
): Promise<void> {
  const map = await loadMap();
  for (const row of rows) {
    map[entryKey(row.accountId, row.companyShareId)] = {
      kitta: row.kitta,
      at: new Date().toISOString(),
      dryRun: row.dryRun,
    };
  }
  await saveMap(map);
}

export function isAppliedInMap(
  map: HistoryMap,
  accountId: string,
  companyShareId: number,
): boolean {
  const row = map[entryKey(accountId, companyShareId)];
  return Boolean(row && row.dryRun === false);
}

export async function clearApplyHistoryForAccount(
  accountId: string,
): Promise<void> {
  const map = await loadMap();
  const prefix = `${accountId}:`;
  let changed = false;
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) await saveMap(map);
}
