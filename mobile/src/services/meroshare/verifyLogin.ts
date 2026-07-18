import { MeroshareClient } from './client';
import { MeroshareError } from './errors';

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
  /** How far verification got */
  stage?: 'login' | 'profile' | 'bank' | 'crn_pin' | 'complete';
  /** True when login/bank OK but CRN/PIN could not be live-checked (no open IPO) */
  crnPinDeferred?: boolean;
};

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

    // 2) Profile / bank must load for a real ASBA-ready account
    let bankName: string | undefined;
    try {
      const banks = await client.listBanks();
      if (!banks.length) {
        return {
          ok: false,
          field: 'bank',
          message:
            'Login OK, but no bank is linked on MeroShare. Link your bank in the official app first.',
          stage: 'bank',
          boid: session.boid,
          demat: session.demat,
        };
      }
      bankName = banks[0].name;
      await client.getBankBranchDetails(banks[0].id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load bank details';
      return {
        ok: false,
        field: 'bank',
        message: `Login OK, but bank details failed: ${msg}`,
        stage: 'bank',
        boid: session.boid,
        demat: session.demat,
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
      };
    }
    if (probe.kind === 'impossible') {
      return {
        ok: false,
        field: 'unknown',
        message: probe.message,
        stage: 'crn_pin',
        boid: session.boid,
        demat: session.demat,
        bankName,
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
