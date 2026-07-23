import * as SecureStore from 'expo-secure-store';
import type { DraftCapital } from '../types/account';
import { getActiveUserId } from './userScope';

function draftKey(): string {
  return `nepse_ghar_${getActiveUserId()}_capital_draft_v1`;
}

export async function loadCapitalDraft(): Promise<DraftCapital | null> {
  try {
    const raw = await SecureStore.getItemAsync(draftKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftCapital;
    if (!parsed?.dpId || !parsed?.username || !parsed?.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCapitalDraft(draft: DraftCapital): Promise<void> {
  await SecureStore.setItemAsync(draftKey(), JSON.stringify(draft));
}

export async function clearCapitalDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(draftKey());
  } catch {
    // ignore
  }
}
