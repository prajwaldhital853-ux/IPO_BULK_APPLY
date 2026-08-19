import { MeroshareClient } from './client';
import { MeroshareError } from './errors';
import { extractBankWithBranchFromProfile } from '../../utils/minorAccount';

export type VerifyField =
  | 'dp'
  | 'username'
  | 'password'
  | 'crn'
  | 'pin'
  | 'bank'
  | 'network'
  | 'unknown';

export type VerifyAccountResult = {
  ok: boolean;
  message: string;
  /** Which input to highlight — null when ok */
  field: VerifyField | null;
  boid?: string;
  demat?: string;
  bankName?: string;
  /** Linked ASBA bank account number */
  accountNumber?: string;
  /** Account holder name from MeroShare ownDetail */
  accountHolderName?: string;
  /** How far verification got */
  stage?: 'login' | 'profile' | 'bank' | 'crn_pin' | 'complete';
  /** True when login/bank OK but CRN/PIN could not be live-checked (no open IPO) */
  crnPinDeferred?: boolean;
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
  // CDSC often returns combined "Invalid Username or Password"
  if (/username|password|credential|unauthorized|invalid/.test(m)) {
    return 'password';
  }
  return 'unknown';
}

/**
 * Classify apply / ASBA error into CRN, PIN, or "credentials accepted".
 * "accepted" means MeroShare rejected for another reason after CRN+PIN looked OK
 * (already applied, invalid kitta, company not found, etc.).
 */
function classifyApplyProbe(msg: string): 'pin' | 'crn' | 'accepted' | 'unknown' {
  const m = msg.toLowerCase();
  if (
    /transaction\s*pin|invalid\s*pin|incorrect\s*pin|wrong\s*pin|pin\s*(code|number)?\s*(is\s*)?(invalid|incorrect|wrong)/i.test(
      m,
    )
  ) {
    return 'pin';
  }
  if (
    /crn|customer\s*reference|reference\s*number/.test(m) &&
    /invalid|incorrect|wrong|not\s*match|mismatch|not\s*register|unregistered/.test(
      m,
    )
  ) {
    return 'crn';
  }
  if (/crn/.test(m) && /invalid|incorrect|wrong|not/.test(m)) return 'crn';
  if (
    /already\s*applied|duplicate|exist|cannot\s*apply|not\s*eligible|kitta|quantity|unit|minimum|maximum|share\s*id|company\s*share|not\s*found|invalid\s*request/i.test(
      m,
    )
  ) {
    return 'accepted';
  }
  return 'unknown';
}

function isTransientMeroShareError(msg: string): boolean {
  return /unable to process|try again|temporarily|timeout|502|503|504|network request failed/i.test(
    msg,
  );
}

/**
 * Full live verify before saving an account.
 * Saves only when DP + username + password + CRN + PIN check out against MeroShare.
 *
 * CRN/PIN are validated via a safe apply probe (kitta `0` / already-applied issue)
 * that must NOT succeed as a real IPO application.
 */
export async function verifyAccountForSave(args: {
  dpId: string;
  dpCode?: string;
  username: string;
  password: string;
  crn: string;
  pin: string;
}): Promise<VerifyAccountResult> {
  const username = args.username.trim();
  const crn = args.crn.trim();
  const pin = args.pin.trim();

  if (!args.dpId) {
    return {
      ok: false,
      field: 'dp',
      message: 'Select your Depository Participant (must match MeroShare).',
      stage: 'login',
    };
  }
  if (!username) {
    return {
      ok: false,
      field: 'username',
      message: 'Username is required (usually last 8 digits of BOID).',
      stage: 'login',
    };
  }
  if (!args.password) {
    return {
      ok: false,
      field: 'password',
      message: 'Password is required.',
      stage: 'login',
    };
  }
  if (!crn) {
    return {
      ok: false,
      field: 'crn',
      message: 'CRN number is required (from your bank / ASBA).',
      stage: 'crn_pin',
    };
  }
  if (crn.length < 4) {
    return {
      ok: false,
      field: 'crn',
      message: 'CRN looks too short to be valid.',
      stage: 'crn_pin',
    };
  }
  if (!/^\d{4}$/.test(pin)) {
    return {
      ok: false,
      field: 'pin',
      message: 'Transaction PIN must be exactly 4 digits.',
      stage: 'crn_pin',
    };
  }

  const client = new MeroshareClient();
  try {
    // 1) Login — DP + username + password
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
      if (isTransientMeroShareError(msg)) {
        return {
          ok: false,
          field: 'network',
          message: `MeroShare is temporarily busy: ${msg}. Wait a moment and tap Verify & Save again.`,
          stage: 'login',
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
        message:
          field === 'dp'
            ? `Depository Participant does not match: ${msg}`
            : field === 'username'
              ? `Username does not match MeroShare: ${msg}`
              : field === 'password'
                ? `Username or password does not match MeroShare: ${msg}`
                : field === 'network'
                  ? `Network error: ${msg}`
                  : msg,
        stage: 'login',
      };
    }

    // Profile from My Details (SS2): bank-with-branch + holder name + DOB
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

    // ASBA bank list is flaky — prefer My Details bankName (includes branch)
    let bankName: string | undefined = ss2Bank;
    let accountNumber: string | undefined;
    let bankDeferred = false;
    try {
      const banks = await client.listBanksWithRetry();
      if (!banks.length) {
        if (!ss2Bank) {
          return {
            ok: false,
            field: 'bank',
            message:
              'Login OK, but no bank is linked on MeroShare. Link your bank in the official app first.',
            stage: 'bank',
            boid: session.boid,
            demat: session.demat,
            accountHolderName,
          };
        }
      } else {
        if (!bankName) bankName = banks[0].name;
        try {
          const branch = await client.getBankBranchDetails(banks[0].id);
          accountNumber = branch.accountNumber;
        } catch {
          // account number is optional when My Details already has the bank
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load bank details';
      if (ss2Bank) {
        bankName = ss2Bank;
      } else if (!isTransientMeroShareError(msg)) {
        return {
          ok: false,
          field: 'bank',
          message: `Login OK, but bank details failed: ${msg}`,
          stage: 'bank',
          boid: session.boid,
          demat: session.demat,
          accountHolderName,
        };
      } else {
        bankDeferred = true;
        if (!bankName) {
          const fromProfile =
            (typeof profile.bankName === 'string' && profile.bankName) ||
            (typeof profile.bank === 'string' && profile.bank) ||
            null;
          if (fromProfile) bankName = fromProfile;
        }
      }
    }

    if (bankDeferred) {
      return {
        ok: true,
        field: null,
        message:
          'Login OK. MeroShare bank list is temporarily unavailable. Account can be saved — CRN/PIN will be confirmed on first live IPO apply.',
        stage: 'complete',
        boid: session.boid,
        demat: session.demat,
        bankName,
        accountNumber,
        accountHolderName,
        crnPinDeferred: true,
      };
    }

    // 3) CRN + PIN probe (needs an open IPO; otherwise deferred)
    const probe = await client.probeCrnAndPin({
      username,
      dpCode: args.dpCode ?? session.dpCode,
      crnNumber: crn,
      transactionPIN: pin,
    });

    if (probe.kind === 'pin') {
      return {
        ok: false,
        field: 'pin',
        message: `Transaction PIN does not match your MeroShare account: ${probe.message}`,
        stage: 'crn_pin',
        boid: session.boid,
        demat: session.demat,
        bankName,
        accountHolderName,
      };
    }
    if (probe.kind === 'crn') {
      return {
        ok: false,
        field: 'crn',
        message: `CRN does not match your bank / MeroShare ASBA: ${probe.message}`,
        stage: 'crn_pin',
        boid: session.boid,
        demat: session.demat,
        bankName,
        accountHolderName,
      };
    }
    if (probe.kind === 'impossible') {
      // CDSC outages ("Unable to process…") — allow save; confirm on live apply
      if (isTransientMeroShareError(probe.message)) {
        return {
          ok: true,
          field: null,
          message:
            'Login OK. MeroShare is temporarily busy, so CRN/PIN were not confirmed yet. Account can be saved — they will be checked on first live IPO apply.',
          stage: 'complete',
          boid: session.boid,
          demat: session.demat,
          bankName,
          accountNumber,
          accountHolderName,
          crnPinDeferred: true,
        };
      }
      return {
        ok: false,
        field: 'unknown',
        message: probe.message,
        stage: 'crn_pin',
        boid: session.boid,
        demat: session.demat,
        bankName,
        accountHolderName,
      };
    }
    if (probe.kind === 'skipped' || probe.kind === 'no_window') {
      return {
        ok: true,
        field: null,
        message: probe.message,
        stage: 'complete',
        boid: session.boid,
        demat: session.demat,
        bankName,
        accountNumber,
        accountHolderName,
        crnPinDeferred: true,
      };
    }

    return {
      ok: true,
      field: null,
      message:
        'All credentials match MeroShare (DP, username, password, CRN, PIN). Account can be saved.',
      stage: 'complete',
      boid: session.boid,
      demat: session.demat,
      bankName,
      accountNumber,
      accountHolderName,
      crnPinDeferred: false,
    };
  } finally {
    client.clearSession();
  }
}

/** @deprecated Prefer verifyAccountForSave */
export async function verifyMeroshareLogin(args: {
  dpId: string;
  dpCode?: string;
  dpName?: string;
  username: string;
  password: string;
  simulate?: boolean;
}): Promise<{
  ok: boolean;
  simulated: boolean;
  message: string;
  boid?: string;
}> {
  if (args.simulate) {
    if (!args.username.trim() || !args.password || !args.dpId) {
      return {
        ok: false,
        simulated: true,
        message: 'DP, username and password are required',
      };
    }
    return {
      ok: true,
      simulated: true,
      message: 'Credentials accepted locally (simulated)',
    };
  }

  const client = new MeroshareClient();
  try {
    const session = await client.login({
      clientId: args.dpId,
      dpCode: args.dpCode,
      dpName: args.dpName,
      username: args.username.trim(),
      password: args.password,
    });
    return {
      ok: true,
      simulated: false,
      message: 'Logged into MeroShare successfully',
      boid: session.boid,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Verify failed';
    const looksNetwork =
      /JSON|HTML|network|internet|timeout|failed to fetch/i.test(msg);
    return {
      ok: false,
      simulated: false,
      message: looksNetwork
        ? msg
        : msg,
    };
  } finally {
    client.clearSession();
  }
}

export { classifyLoginMessage };
