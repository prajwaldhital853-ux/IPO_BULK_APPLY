import { MeroshareClient } from './client';
import type { AccountMeta } from '../../types/account';
import { isMockAccountId } from '../../data/mockAccounts';
import {
  ageYears,
  daysUntilMajority,
  extractDobFromOwnDetail,
  formatCountdownLabel,
  holderTypeFromDob,
  isMinorFromDob,
} from '../../utils/minorAccount';

export type MinorFetchResult = {
  accountId: string;
  accountName: string;
  username: string;
  dpName: string;
  isMinor: boolean;
  dateOfBirth: string | null;
  daysLeft: number | null;
  age: number | null;
  guardianName?: string;
  /** Where DOB came from for this fetch */
  source: 'local' | 'meroshare' | 'none' | 'error';
  detail: string;
};

/**
 * Resolve whether an account is minor: local DOB first, else MeroShare ownDetail.
 * Optionally persist newly discovered DOB via `onDobFound`.
 */
export async function fetchMinorAccountInfo(
  account: AccountMeta,
  password: string | null | undefined,
  onDobFound?: (dob: string) => Promise<void>,
): Promise<MinorFetchResult> {
  const base = {
    accountId: account.id,
    accountName: account.name,
    username: account.username,
    dpName: account.dpName,
    guardianName: account.guardianName,
  };

  const fromLocal = (dob: string, source: 'local' | 'meroshare'): MinorFetchResult => {
    const daysLeft = daysUntilMajority(dob);
    const age = ageYears(dob);
    const isMinor = isMinorFromDob(dob);
    return {
      ...base,
      isMinor,
      dateOfBirth: dob,
      daysLeft,
      age,
      source,
      detail: isMinor
        ? formatCountdownLabel(daysLeft)
        : 'Major (18+) — not listed as minor',
    };
  };

  if (account.dateOfBirth) {
    return fromLocal(account.dateOfBirth, 'local');
  }

  // Demo / mock seeds already carry DOB on meta when present.
  if (isMockAccountId(account.id)) {
    if (account.dateOfBirth) {
      return fromLocal(account.dateOfBirth, 'local');
    }
    // Legacy mock without DOB
    if (account.holderType === 'minor') {
      return {
        ...base,
        isMinor: true,
        dateOfBirth: null,
        daysLeft: null,
        age: null,
        source: 'local',
        detail: 'Marked minor locally — add DOB for countdown',
      };
    }
    return {
      ...base,
      isMinor: false,
      dateOfBirth: null,
      daysLeft: null,
      age: null,
      source: 'none',
      detail: 'No DOB on demo account',
    };
  }

  if (!password) {
    return {
      ...base,
      isMinor: false,
      dateOfBirth: null,
      daysLeft: null,
      age: null,
      source: 'error',
      detail: 'Password not saved — re-add account',
    };
  }

  try {
    const client = new MeroshareClient();
    await client.login({
      clientId: account.dpId,
      username: account.username,
      password,
      dpCode: account.dpCode,
      dpName: account.dpName,
    });
    const detail = await client.fetchOwnDetailRaw();
    client.clearSession();
    const dob = extractDobFromOwnDetail(detail);
    if (dob) {
      if (onDobFound) {
        try {
          await onDobFound(dob);
        } catch {
          /* persist is best-effort */
        }
      }
      return fromLocal(dob, 'meroshare');
    }
    return {
      ...base,
      isMinor: account.holderType === 'minor',
      dateOfBirth: null,
      daysLeft: null,
      age: null,
      source: 'none',
      detail:
        account.holderType === 'minor'
          ? 'Marked minor locally — MeroShare did not return DOB'
          : 'MeroShare did not return DOB — enter DOB to classify',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'MeroShare check failed';
    return {
      ...base,
      isMinor: account.holderType === 'minor',
      dateOfBirth: account.dateOfBirth ?? null,
      daysLeft: daysUntilMajority(account.dateOfBirth),
      age: ageYears(account.dateOfBirth),
      source: 'error',
      detail: msg,
    };
  }
}

export function minorMetaFromDob(dob: string): Pick<
  AccountMeta,
  'dateOfBirth' | 'holderType'
> {
  return {
    dateOfBirth: dob,
    holderType: holderTypeFromDob(dob),
  };
}
