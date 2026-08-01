import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@nepse_ghar/broker_flow_intel_v1';

export type BrokerFlowKind = 'top-holders' | 'top-releases';

/** Day/session cache — invalidated when floorsheet API publishes a new sheet. */
export type BrokerFlowDiskEntry = {
  /** Floorsheet session date (YYYY-MM-DD). */
  sessionDate: string;
  /** Max contract id when cached — changes when the sheet is updated. */
  maxContractId: number;
  tradesScanned: number;
  at: number;
  /** Serialized PremiumIntelSnapshot JSON. */
  snap: Record<string, unknown>;
};

export type BrokerFlowDiskStore = Partial<
  Record<BrokerFlowKind, BrokerFlowDiskEntry>
>;

export async function loadBrokerFlowDiskCache(): Promise<BrokerFlowDiskStore> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BrokerFlowDiskStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveBrokerFlowDiskCache(
  store: BrokerFlowDiskStore,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore quota / disk errors
  }
}

export async function clearBrokerFlowDiskCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
