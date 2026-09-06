import {
  extractBankAccountNumberFromProfile,
  extractBankWithBranchFromProfile,
} from '../../utils/minorAccount';
import { MeroshareClient } from './client';
import {
  MeroshareError,
  isRoleRestrictedMeroshareError,
  isTransientMeroshareError,
  sanitizeMeroshareMessage,
} from './errors';
import type { VerifyField } from './verifyLogin';

export type FetchBankDetailsResult = {
  ok: boolean;
  message: string;
  field: VerifyField | null;
  accountNumber?: string;
  bankName?: string;
  boid?: string;
  demat?: string;
  accountHolderName?: string;
};

function pickAccountHolderName(me: Record<string, unknown>): string | undefined {
  const keys = [
    'name',
    'accountName',
    'clientName',
    'fullName',
    'accountHolderName',
    'customerName',
    'dematAccountName',
  ];
  for (const key of keys) {
    const v = me[key];
    if (typeof v === 'string' && v.trim().length >= 2) {
      return v.trim();
    }
  }
  return undefined;
}

function classifyLoginMessage(msg: string): VerifyField {
  const m = msg.toLowerCase();
  if (/depository|participant|client\s*id|unknown depository/i.test(m)) {
    return 'dp';
  }
  if (/password/.test(m) && !/username/.test(m)) return 'password';
  if (/username|user name|invalid user/.test(m) && !/password/.test(m)) {
    return 'username';
  }
  if (/username|password|credential|unauthorized|invalid/.test(m)) {
    return 'password';
  }
  return 'unknown';
}

/**
 * Login + fetch ASBA bank account number (and BOID/bank name). Skips CRN/PIN probe —
 * for one-time bulk migration after importing legacy backups.
 */
export async function fetchMeroShareBankDetails(args: {
  dpId: string;
  dpCode?: string;
  username: string;
  password: string;
  fallbackBankName?: string;
}): Promise<FetchBankDetailsResult> {
  const username = args.username.trim();
  if (!args.dpId) {
    return {
      ok: false,
      field: 'dp',
      message: 'Missing DP code.',
    };
  }
  if (!username) {
    return {
      ok: false,
      field: 'username',
      message: 'Missing username.',
    };
  }
  if (!args.password) {
    return {
      ok: false,
      field: 'password',
      message: 'Missing password.',
    };
  }

  const client = new MeroshareClient();
  try {
    let session;
    try {
      session = await client.login({
        clientId: args.dpId,
        dpCode: args.dpCode,
        username,
        password: args.password,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Login failed — check DP / username / password';
      if (isTransientMeroshareError(e)) {
        return {
          ok: false,
          field: 'network',
          message: `MeroShare busy: ${msg}`,
        };
      }
      const field =
        e instanceof MeroshareError && e.code === 'NETWORK'
          ? 'network'
          : e instanceof MeroshareError && /depository|participant/i.test(msg)
            ? 'dp'
            : classifyLoginMessage(msg);
      return {
        ok: false,
        field,
        message: msg,
      };
    }

    let accountHolderName: string | undefined;
    let profile: Record<string, unknown> = {};
    try {
      profile = await client.fetchAccountProfileRaw();
      accountHolderName = pickAccountHolderName(profile);
    } catch {
      try {
        const me = await client.fetchOwnDetailRaw();
        profile = me;
        accountHolderName = pickAccountHolderName(me);
      } catch {
        // optional
      }
    }

    const ss2Bank = extractBankWithBranchFromProfile(profile) ?? undefined;
    const fallbackBank = args.fallbackBankName?.trim() || undefined;
    const profileAccountNumber =
      extractBankAccountNumberFromProfile(profile) ?? undefined;

    let bankName: string | undefined = ss2Bank || fallbackBank;
    let accountNumber: string | undefined = profileAccountNumber;

    try {
      const banks = await client.listBanksWithRetry();
      if (banks.length) {
        if (!bankName) bankName = banks[0].name;
        try {
          const branch = await client.getBankBranchDetails(banks[0].id);
          accountNumber = branch.accountNumber || accountNumber;
        } catch (branchErr) {
          if (
            isRoleRestrictedMeroshareError(branchErr) &&
            !bankName &&
            banks[0].name
          ) {
            bankName = banks[0].name;
          }
        }
      }
    } catch (e) {
      const msg = sanitizeMeroshareMessage(
        e instanceof Error ? e.message : 'Could not load bank details',
      );
      if (isRoleRestrictedMeroshareError(e)) {
        if (!bankName && !accountNumber) {
          return {
            ok: false,
            field: 'bank',
            message: 'Bank access blocked for this account role.',
            boid: session.boid,
            demat: session.demat,
            accountHolderName,
          };
        }
      } else if (!isTransientMeroshareError(e) && !bankName && !accountNumber) {
        return {
          ok: false,
          field: 'bank',
          message: msg,
          boid: session.boid,
          demat: session.demat,
          accountHolderName,
        };
      }
    }

    const acct = accountNumber?.trim();
    if (!acct) {
      return {
        ok: false,
        field: 'bank',
        message: 'Login OK but no bank account number returned from MeroShare.',
        boid: session.boid,
        demat: session.demat,
        bankName,
        accountHolderName,
      };
    }

    return {
      ok: true,
      field: null,
      message: 'Bank details fetched.',
      accountNumber: acct,
      bankName,
      boid: session.boid,
      demat: session.demat,
      accountHolderName,
    };
  } finally {
    client.clearSession();
  }
}
