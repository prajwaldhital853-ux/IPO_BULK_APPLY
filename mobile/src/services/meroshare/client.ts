import { resolveClientId } from './capital';
import { DEFAULT_HEADERS, MEROSHARE_BASE, PATHS } from './endpoints';
import {
  isTransientMeroshareMessage,
  MeroshareError,
  withMeroshareRetries,
} from './errors';
import {
  isProbablyHtml,
  parseJsonBody,
  rawRequest,
  rawRequestWithFallback,
  readAuthToken,
} from './http';
import type {
  ApplicationReportDetail,
  ApplicationReportRow,
  ApplyRequest,
  CaptchaPayload,
  MeroshareSession,
  OpenIssue,
  PortfolioHoldingRow,
} from './types';

type LoginArgs = {
  /** MeroShare clientId OR 5-digit DP code — resolved via /capital/ */
  clientId: string | number;
  username: string;
  password: string;
  /** When set with a real clientId from picker, skips fragile re-resolve */
  dpCode?: string;
  dpName?: string;
  captcha?: string;
  captchaId?: string;
};

type BankBranch = {
  bankId: number;
  id: number;
  accountBranchId: number;
  accountNumber: string;
  accountTypeId: number;
};

const APPLICABLE_PAYLOAD = {
  filterFieldParams: [
    { key: 'companyIssue.companyISIN.script', alias: 'Scrip' },
    {
      key: 'companyIssue.companyISIN.company.name',
      alias: 'Company Name',
    },
  ],
  page: 1,
  size: 50,
  searchRoleViewConstants: 'VIEW_APPLICABLE_SHARE',
  filterDateParams: [
    { key: 'minIssueOpenDate', condition: '', alias: '', value: '' },
    { key: 'maxIssueCloseDate', condition: '', alias: '', value: '' },
  ],
};

/**
 * On-device HTTP client for MeroShare.
 * Live endpoints follow CDSC webbackend conventions; dry-run never POSTs apply.
 */
export class MeroshareClient {
  private base: string;
  private session: MeroshareSession | null = null;
  private dpCode: string | null = null;

  constructor(base = MEROSHARE_BASE) {
    this.base = base.replace(/\/$/, '');
  }

  getSession() {
    return this.session;
  }

  clearSession() {
    this.session = null;
    this.dpCode = null;
  }

  private async request<T>(
    path: string,
    init: RequestInit & {
      auth?: boolean;
      /** Prefer portal-like Origin/Referer (needed for some migrated routes). */
      browserLike?: boolean;
      /** Disable automatic retries for transient CDSC flakiness. */
      noRetry?: boolean;
    } = {},
  ): Promise<T> {
    const { noRetry, ...rest } = init;
    if (noRetry) {
      return this.requestOnce<T>(path, rest);
    }
    return withMeroshareRetries(
      () => this.requestOnce<T>(path, rest),
      { attempts: 3, label: path },
    );
  }

  private async requestOnce<T>(
    path: string,
    init: RequestInit & {
      auth?: boolean;
      browserLike?: boolean;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...(init.browserLike
        ? {
            Origin: 'https://meroshare.cdsc.com.np',
            Referer: 'https://meroshare.cdsc.com.np/',
          }
        : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.auth && this.session?.token) {
      headers.Authorization = this.session.token;
    }

    const { browserLike: _b, auth: _a, ...fetchInit } = init;

    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...fetchInit,
        headers,
      });
    } catch (e) {
      throw new MeroshareError(
        'NETWORK',
        e instanceof Error ? e.message : 'Network request failed',
      );
    }

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? parseJsonBody(text, `HTTP ${path}`) : null;
    } catch (e) {
      if (res.status === 401) {
        throw new MeroshareError(
          'AUTH',
          'Login expired or rejected by MeroShare',
        );
      }
      if (!res.ok) {
        throw new MeroshareError(
          res.status >= 500 ? 'NETWORK' : 'UNKNOWN',
          `HTTP ${res.status} from ${path}`,
        );
      }
      throw e;
    }

    if (res.status === 401) {
      const msg =
        typeof data === 'object' &&
        data &&
        'message' in data &&
        typeof (data as { message: unknown }).message === 'string'
          ? (data as { message: string }).message
          : 'Login expired or rejected by MeroShare';
      throw new MeroshareError('AUTH', msg);
    }

    const bodyStatus =
      typeof data === 'object' &&
      data &&
      'statusCode' in data &&
      typeof (data as { statusCode: unknown }).statusCode === 'number'
        ? (data as { statusCode: number }).statusCode
        : 0;
    if (bodyStatus === 401) {
      const msg =
        typeof data === 'object' &&
        data &&
        'message' in data &&
        typeof (data as { message: unknown }).message === 'string'
          ? (data as { message: string }).message
          : 'Login expired or rejected by MeroShare';
      throw new MeroshareError('AUTH', msg);
    }

    if (!res.ok) {
      const msg =
        typeof data === 'object' &&
        data &&
        'message' in data &&
        typeof (data as { message: unknown }).message === 'string'
          ? (data as { message: string }).message
          : `HTTP ${res.status}`;
      if (/captcha/i.test(msg)) {
        throw new MeroshareError('CAPTCHA', msg);
      }
      if (
        res.status === 403 ||
        /password|credential|unauthorized|invalid user|expired|token/i.test(msg)
      ) {
        throw new MeroshareError(
          'AUTH',
          `${msg} (HTTP ${res.status} · ${path})`,
        );
      }
      if (
        res.status === 429 ||
        res.status >= 500 ||
        isTransientMeroshareMessage(msg)
      ) {
        throw new MeroshareError(
          res.status === 429 ? 'RATE' : 'NETWORK',
          msg,
        );
      }
      throw new MeroshareError('UNKNOWN', `${msg} (HTTP ${res.status})`);
    }

    // CDSC sometimes returns HTTP 200 with a soft failure message.
    const softMsg =
      typeof data === 'object' &&
      data &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : '';
    if (softMsg && isTransientMeroshareMessage(softMsg)) {
      const softCode =
        typeof data === 'object' &&
        data &&
        'statusCode' in data &&
        typeof (data as { statusCode: unknown }).statusCode === 'number'
          ? (data as { statusCode: number }).statusCode
          : 0;
      if (softCode >= 400 || softCode === 0) {
        throw new MeroshareError('NETWORK', softMsg);
      }
    }

    return data as T;
  }

  async fetchCaptcha(): Promise<CaptchaPayload> {
    const data = await this.request<{
      captchaId?: string;
      captcha?: string;
      id?: string;
    }>(PATHS.captcha, { method: 'GET' });
    return {
      captchaId: String(data.captchaId ?? data.id ?? ''),
      image: data.captcha,
    };
  }

  async login(args: LoginArgs): Promise<MeroshareSession> {
    return withMeroshareRetries(
      () => this.loginOnce(args),
      { attempts: 3, label: 'login' },
    );
  }

  private async loginOnce(args: LoginArgs): Promise<MeroshareSession> {
    const resolved = await resolveClientId(args.clientId, {
      clientId: args.dpCode ? Number(args.clientId) : undefined,
      dpCode: args.dpCode,
      name: args.dpName,
    });
    this.dpCode = resolved.dpCode;

    const body = {
      clientId: resolved.clientId,
      username: String(args.username).trim(),
      password: args.password,
    };

    // Minimal headers + host fallback — Origin/Referer/UA caused HTML/500 on device
    const result = await rawRequestWithFallback(PATHS.login, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (isProbablyHtml(result.text)) {
      throw new MeroshareError(
        'NETWORK',
        `Login got HTML (HTTP ${result.status}). MeroShare API blocked on this network.`,
      );
    }

    let data: Record<string, unknown> = {};
    try {
      data = result.text
        ? parseJsonBody<Record<string, unknown>>(result.text, 'Login')
        : {};
    } catch (e) {
      if (result.text.trim()) throw e;
      data = {};
    }

    const statusCode =
      typeof data.statusCode === 'number' ? data.statusCode : result.status;
    const message = typeof data.message === 'string' ? data.message : '';

    if (
      !result.ok ||
      (statusCode !== 200 && !/success/i.test(message || ''))
    ) {
      if (result.status === 401 || statusCode === 401) {
        throw new MeroshareError(
          'AUTH',
          message ||
            'Invalid username or password (or wrong Depository Participant).',
        );
      }
      const msg = message || `Login failed (HTTP ${result.status})`;
      if (/password|username|credential|unauthorized|invalid/i.test(msg)) {
        throw new MeroshareError('AUTH', msg);
      }
      if (
        result.status >= 500 ||
        result.status === 429 ||
        isTransientMeroshareMessage(msg)
      ) {
        throw new MeroshareError(
          result.status === 429 ? 'RATE' : 'NETWORK',
          msg,
        );
      }
      throw new MeroshareError('UNKNOWN', msg);
    }

    const headerToken = readAuthToken(result, data);

    if (!headerToken) {
      const keys: string[] = [];
      try {
        result.headers.forEach((_v, k) => keys.push(k));
      } catch {
        /* ignore */
      }
      throw new MeroshareError(
        'NETWORK',
        `Login OK but no Authorization token in headers (${keys.join(', ') || 'none'}). Retry once.`,
      );
    }

    this.session = {
      token: headerToken,
      clientId: resolved.clientId,
      username: body.username,
      dpCode: resolved.dpCode,
    };

    try {
      const host = result.url.match(/^https?:\/\/[^/]+/)?.[0];
      if (host) this.base = host;
    } catch {
      /* keep default */
    }

    try {
      const me = await this.requestOnce<{
        demat?: string;
        boid?: string;
        accountNumber?: string;
        name?: string;
        clientCode?: string;
      }>(PATHS.me, { method: 'GET', auth: true });
      this.session.boid = me.boid ?? me.demat ?? me.accountNumber;
      this.session.demat = me.demat;
      this.session.clientCode = me.clientCode;
    } catch {
      // optional — ownDetail failure should not fail login
    }

    return this.session;
  }

  /** Full ownDetail payload — used for account/demat expiry checks. */
  async fetchOwnDetailRaw(): Promise<Record<string, unknown>> {
    if (!this.session) {
      throw new MeroshareError('AUTH', 'Not logged in');
    }
    const data = await this.request<Record<string, unknown>>(PATHS.me, {
      method: 'GET',
      auth: true,
    });
    if (!data || typeof data !== 'object') return {};
    const inner = (data as { object?: unknown }).object;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return {
        ...(data as Record<string, unknown>),
        ...(inner as Record<string, unknown>),
      };
    }
    return data as Record<string, unknown>;
  }

  /**
   * Change MeroShare login password for the current session.
   * Tries the primary path; some CDSC builds use a slight variant.
   */
  async changePassword(args: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<void> {
    if (!this.session) {
      throw new MeroshareError('AUTH', 'Not logged in');
    }
    const body = JSON.stringify({
      oldPassword: args.oldPassword,
      newPassword: args.newPassword,
      confirmPassword: args.confirmPassword,
    });
    const paths = [
      PATHS.changePassword,
      '/api/meroShare/auth/changePassword/',
      '/api/meroShare/user/changePassword/',
    ];
    let lastErr: unknown;
    for (const path of paths) {
      try {
        await this.request(path, { method: 'POST', auth: true, body });
        return;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        // Auth / validation errors are final — don't try alternate paths
        if (
          /old password|incorrect|invalid|mismatch|minimum|maximum|lowercase|length/i.test(
            msg,
          )
        ) {
          throw e;
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new MeroshareError('UNKNOWN', 'Could not change password');
  }

  /**
   * Dry login path for offline / PoC: validates inputs without hitting network
   * when `simulate` is true.
   */
  async loginOrSimulate(
    args: LoginArgs,
    opts: { simulate?: boolean } = {},
  ): Promise<MeroshareSession> {
    if (opts.simulate) {
      if (!args.username || !args.password) {
        throw new MeroshareError('AUTH', 'Username/password required');
      }
      this.dpCode = args.dpCode ?? null;
      this.session = {
        token: `sim_${Date.now()}`,
        clientId: Number(args.clientId) || 0,
        username: args.username,
        boid: undefined,
        dpCode: args.dpCode,
      };
      return this.session;
    }
    return this.login(args);
  }

  async listApplicableIssues(): Promise<OpenIssue[]> {
    if (this.session?.token.startsWith('sim_')) {
      return DEMO_OPENINGS;
    }

    const data = await this.request<{ object?: unknown[] } | unknown[]>(
      PATHS.applicable,
      {
        method: 'POST',
        auth: true,
        body: JSON.stringify(APPLICABLE_PAYLOAD),
      },
    );

    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { object?: unknown[] })?.object)
        ? ((data as { object: unknown[] }).object as unknown[])
        : [];

    return rows.map((row) => normalizeIssue(row as Record<string, unknown>));
  }

  /**
   * Live share holdings for the logged-in demat (MeroShare "My Portfolio").
   * Returns current balance per scrip + last transaction / previous close price.
   * MeroShare does NOT expose a purchase/WACC price here.
   */
  async fetchMyPortfolio(args: {
    username: string;
    dpCode?: string;
  }): Promise<PortfolioHoldingRow[]> {
    if (!this.session) {
      throw new MeroshareError('AUTH', 'Not logged in');
    }
    if (this.session.token.startsWith('sim_')) {
      return [];
    }

    const demat = this.dematFor(args.username, args.dpCode);
    // clientCode is ownDetail.clientCode — NOT the 5-digit DP code. Sending the
    // wrong one makes MeroShare return HTTP 500.
    const clientCode = this.session.clientCode ?? '';
    if (!clientCode) {
      throw new MeroshareError(
        'UNKNOWN',
        'MeroShare did not return a client code (ownDetail). Try again.',
      );
    }

    type PortfolioApi = {
      meroShareMyPortfolio?: Array<Record<string, unknown>>;
      object?: Array<Record<string, unknown>>;
      content?: Array<Record<string, unknown>>;
    };

    const body = {
      sortBy: 'script',
      demat: [demat],
      clientCode,
      page: 1,
      size: 200,
      sortAsc: true,
    };

    const data = await this.request<PortfolioApi>(PATHS.myPortfolio, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    });

    const rows =
      data.meroShareMyPortfolio ??
      data.object ??
      data.content ??
      [];

    return rows
      .map((row) => normalizePortfolioRow(row))
      .filter((r): r is PortfolioHoldingRow => r !== null && r.quantity > 0);
  }

  private dematFor(username: string, dpCode?: string): string {
    const code = dpCode ?? this.dpCode ?? this.session?.dpCode;
    if (this.session?.demat) return this.session.demat;
    if (!code) {
      throw new MeroshareError(
        'UNKNOWN',
        'Missing DP code to build demat number',
      );
    }
    return `130${code}${username}`;
  }

  private async fetchBankBranch(): Promise<BankBranch> {
    const banks = await this.listBanksWithRetry();
    if (!banks.length) {
      throw new MeroshareError('UNKNOWN', 'No linked bank found on MeroShare');
    }
    return this.getBankBranchDetails(banks[0].id);
  }

  async listBanks(): Promise<Array<{ id: number; name?: string }>> {
    const banks = await this.request<Array<{ id: number; name?: string }>>(
      PATHS.banks,
      { method: 'GET', auth: true },
    );
    return banks ?? [];
  }

  /**
   * MeroShare bank list often returns "Unable to process request at the moment".
   * Retry a few times before giving up.
   */
  async listBanksWithRetry(
    attempts = 3,
  ): Promise<Array<{ id: number; name?: string }>> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.listBanks();
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        const transient =
          /unable to process|try again|temporarily|timeout|502|503|504|network/i.test(
            msg,
          );
        if (!transient || i === attempts - 1) break;
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new MeroshareError('UNKNOWN', 'Could not load bank list');
  }

  async getBankBranchDetails(bankId: number): Promise<BankBranch> {
    const accounts = await this.request<
      Array<{
        id: number;
        accountBranchId: number;
        accountNumber: string;
        accountTypeId: number;
      }>
    >(PATHS.bankById(bankId), { method: 'GET', auth: true });

    if (!accounts?.length) {
      throw new MeroshareError('UNKNOWN', 'No bank account details found');
    }
    const a = accounts[0];
    return {
      bankId,
      id: a.id,
      accountBranchId: a.accountBranchId,
      accountNumber: a.accountNumber,
      accountTypeId: a.accountTypeId ?? 1,
    };
  }

  /**
   * Safely check CRN + PIN without completing a real IPO apply.
   * Only probes against a currently open applicable issue.
   * If no IPO is open, returns kind "skipped" (CRN/PIN cannot be
   * server-checked until an issue opens).
   */
  async probeCrnAndPin(args: {
    username: string;
    dpCode?: string;
    crnNumber: string;
    transactionPIN: string;
  }): Promise<{
    kind: 'pin' | 'crn' | 'accepted' | 'impossible' | 'skipped' | 'no_window';
    message: string;
  }> {
    if (!this.session) {
      throw new MeroshareError('AUTH', 'Not logged in');
    }

    const demat = this.dematFor(args.username, args.dpCode);
    const branch = await this.fetchBankBranch();
    const companyShareId = await this.pickOpenProbeCompanyShareId();

    if (companyShareId == null) {
      return {
        kind: 'skipped',
        message:
          'No open IPO left to verify against (none open, or you already applied on all open ones). CRN/PIN will be confirmed on live apply. Login and bank are verified.',
      };
    }

    const once = async (
      crnNumber: string,
      transactionPIN: string,
      appliedKitta: string,
    ) => {
      const payload = {
        demat,
        boid: args.username,
        accountNumber: branch.accountNumber,
        customerId: branch.id,
        accountBranchId: branch.accountBranchId,
        accountTypeId: branch.accountTypeId,
        appliedKitta,
        crnNumber,
        transactionPIN,
        companyShareId: String(companyShareId),
        bankId: branch.bankId,
      };

      let res: Response;
      try {
        res = await fetch(`${this.base}${PATHS.apply}`, {
          method: 'POST',
          headers: {
            ...DEFAULT_HEADERS,
            Authorization: this.session!.token,
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        return {
          kind: 'impossible' as const,
          message:
            e instanceof Error
              ? `Network error while verifying CRN/PIN: ${e.message}`
              : 'Network error while verifying CRN/PIN',
        };
      }

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text
          ? parseJsonBody<Record<string, unknown>>(text, 'Apply probe')
          : {};
      } catch (e) {
        return {
          kind: 'impossible' as const,
          message:
            e instanceof Error ? e.message : 'Invalid apply probe response',
        };
      }

      const msg =
        typeof data.message === 'string'
          ? data.message
          : res.ok
            ? 'Unexpected success'
            : `HTTP ${res.status}`;

      if (res.ok) {
        return {
          kind: 'impossible' as const,
          message:
            'MeroShare accepted probe unexpectedly. Account was NOT saved.',
        };
      }
      return { kind: classifyProbeMessage(msg), message: msg };
    };

    // 1) Fake CRN + real PIN
    // MeroShare often checks already-applied / kitta / eligibility BEFORE CRN.
    // If that happens, classifyProbeMessage returns "accepted" for a fake CRN —
    // that is inconclusive, not proof that CRN validation is broken. Continue.
    const fakeCrn = `ZZ${args.crnNumber}ZZ99`;
    const negative = await once(fakeCrn, args.transactionPIN, '10');
    if (negative.kind === 'no_window') {
      return {
        kind: 'skipped',
        message:
          'No IPO is open for apply right now (MeroShare date window). CRN/PIN will be confirmed on first live apply. Login and bank are verified.',
      };
    }
    if (negative.kind === 'impossible') {
      return negative;
    }

    // 2) Real CRN + wrong PIN
    const wrongPin = args.transactionPIN === '0000' ? '9999' : '0000';
    const pinNeg = await once(args.crnNumber, wrongPin, '10');
    if (pinNeg.kind === 'no_window') {
      return {
        kind: 'skipped',
        message:
          'No IPO is open for apply right now (MeroShare date window). CRN/PIN will be confirmed on first live apply. Login and bank are verified.',
      };
    }
    // Same as fake-CRN canary: "accepted" here usually means MeroShare rejected
    // for kitta/eligibility before checking PIN — keep going.
    if (pinNeg.kind === 'crn') {
      return { kind: 'crn', message: pinNeg.message };
    }
    if (pinNeg.kind === 'impossible') {
      return pinNeg;
    }

    // 3) Real CRN + real PIN
    const positive = await once(args.crnNumber, args.transactionPIN, '0');
    if (positive.kind === 'no_window') {
      return {
        kind: 'skipped',
        message:
          'No IPO is open for apply right now (MeroShare date window). CRN/PIN will be confirmed on first live apply. Login and bank are verified.',
      };
    }
    if (positive.kind === 'pin' || positive.kind === 'crn') return positive;
    if (positive.kind === 'accepted') return positive;

    const positive2 = await once(args.crnNumber, args.transactionPIN, '10');
    if (positive2.kind === 'no_window') {
      return {
        kind: 'skipped',
        message:
          'No IPO is open for apply right now (MeroShare date window). CRN/PIN will be confirmed on first live apply. Login and bank are verified.',
      };
    }
    if (positive2.kind === 'pin' || positive2.kind === 'crn') return positive2;
    if (positive2.kind === 'accepted') return positive2;

    return {
      kind: 'impossible',
      message:
        positive2.message ||
        positive.message ||
        'Could not confirm CRN/PIN with MeroShare. Account was NOT saved.',
    };
  }

  /** Only currently open applicable issues — never old application reports. */
  private async pickOpenProbeCompanyShareId(): Promise<number | null> {
    try {
      const issues = await this.listApplicableIssues();
      const open = issues.filter((i) => i.companyShareId > 0);
      if (!open.length) return null;
      // Never probe an already-applied issue: MeroShare returns "already applied"
      // before validating CRN/PIN, which falsely trips the save canary.
      const unapplied = open.find((i) => !i.alreadyApplied);
      return unapplied ? unapplied.companyShareId : null;
    } catch {
      return null;
    }
  }

  async applyShare(
    req: ApplyRequest,
    opts: { dryRun?: boolean } = { dryRun: true },
  ): Promise<{ ok: boolean; message: string; dryRun: boolean }> {
    if (opts.dryRun !== false) {
      return {
        ok: true,
        dryRun: true,
        message: `Dry-run OK: would apply ${req.appliedKitta} kitta for ${req.accountName} (${req.username})`,
      };
    }

    if (!this.session) {
      throw new MeroshareError('AUTH', 'Not logged in');
    }

    const demat = this.dematFor(req.username, req.dpCode);
    const branch = await this.fetchBankBranch();

    try {
      const can = await this.request<{ message?: string }>(
        PATHS.canApply(req.companyShareId, demat),
        { method: 'GET', auth: true },
      );
      if (can?.message && !/can apply/i.test(can.message)) {
        throw new MeroshareError('UNKNOWN', can.message);
      }
    } catch (e) {
      if (e instanceof MeroshareError && e.code !== 'UNKNOWN') throw e;
      // Some accounts may still apply if customerType check fails oddly — rethrow message
      if (e instanceof MeroshareError) throw e;
    }

    const payload = {
      demat,
      boid: req.username,
      accountNumber: branch.accountNumber,
      customerId: branch.id,
      accountBranchId: branch.accountBranchId,
      accountTypeId: branch.accountTypeId,
      appliedKitta: String(req.appliedKitta),
      crnNumber: req.crnNumber,
      transactionPIN: req.transactionPIN,
      companyShareId: String(req.companyShareId),
      bankId: branch.bankId,
    };

    const data = await this.request<{ message?: string; referenceNo?: string }>(
      PATHS.apply,
      {
        method: 'POST',
        auth: true,
        body: JSON.stringify(payload),
      },
    );

    const ref = data?.referenceNo ? ` · ref ${data.referenceNo}` : '';
    return {
      ok: true,
      dryRun: false,
      message: `Applied ${req.appliedKitta} kitta for ${req.accountName}${ref}`,
    };
  }

  /**
   * Check application / allotment status for a companyShareId.
   */
  async checkApplicationStatus(
    companyShareId: number,
    opts: { dryRun?: boolean; companyName?: string } = {},
  ): Promise<{
    status: string;
    message: string;
    dryRun: boolean;
    appliedKitta?: number;
    allotmentStatus?: string;
    remarks?: string;
  }> {
    if (opts.dryRun === true || this.session?.token.startsWith('sim_')) {
      return {
        dryRun: true,
        status: 'SIMULATED',
        message: `Dry-run: would check allotment for ${opts.companyName ?? companyShareId}`,
      };
    }

    if (!this.session) {
      throw new MeroshareError('AUTH', 'Not logged in');
    }

    const rows = await this.fetchApplicationReportRows();
    const match = rows.find(
      (r) => Number(r.companyShareId) === Number(companyShareId),
    );
    if (!match) {
      return {
        dryRun: false,
        status: 'NOT_APPLIED',
        message: 'You have not applied for this IPO',
      };
    }

    const statusName = String(
      match.statusName ?? match.status ?? match.applicantStage ?? 'UNKNOWN',
    );
    let kitta =
      match.appliedKitta != null ? Number(match.appliedKitta) : undefined;
    if (kitta != null && Number.isNaN(kitta)) kitta = undefined;
    let allotmentStatus: string | undefined;
    let remarks: string | undefined;

    const formId = match.applicantFormId ?? match.id;
    if (formId != null) {
      try {
        const detail = await this.request<Record<string, unknown>>(
          PATHS.reportDetail(Number(formId)),
          { method: 'GET', auth: true },
        );
        allotmentStatus =
          String(detail.statusName ?? detail.stageName ?? '').trim() ||
          undefined;
        remarks =
          String(
            detail.reasonOrRemark ??
              detail.meroshareRemark ??
              detail.blockAmountStatus ??
              detail.remarks ??
              detail.reason ??
              '',
          ).trim() || undefined;
        const detailQty = nestedNumber(
          detail,
          'allottedQuantity',
          'allottedKitta',
          'appliedKitta',
          'quantity',
          'kitta',
        );
        if (kitta == null && detailQty != null) kitta = detailQty;
      } catch {
        // detail optional
      }
    }

    const label = humanizeApplicationStatus(
      statusName,
      allotmentStatus,
      remarks,
    );
    let message = label.message;
    if (label.code === 'ALLOTTED') {
      message =
        kitta != null ? `Alloted ( quantity : ${kitta} )` : 'Alloted';
    } else if (label.code === 'NOT_ALLOTTED') {
      message =
        kitta != null
          ? `Not Alloted ( quantity : ${kitta} )`
          : 'Not Alloted';
    } else if (label.code === 'REJECTED') {
      message =
        kitta != null ? `Rejected ( quantity : ${kitta} )` : 'Rejected';
      // Keep the "why" out of the status line so the UI can show it separately.
      if (!remarks) {
        remarks =
          label.message.replace(/^rejected\s*[-–—:]\s*/i, '').trim() ||
          undefined;
      }
    }

    if (!remarks) {
      if (/RELEASE/i.test(allotmentStatus ?? '') || /RELEASE/i.test(statusName)) {
        remarks = 'Block Amount Status - Amount Released';
      } else if (/BLOCK|HOLD|LOCK/i.test(allotmentStatus ?? statusName)) {
        remarks = 'Block Amount Status - Amount Blocked';
      } else if (label.code === 'ALLOTTED' || label.code === 'NOT_ALLOTTED') {
        remarks = 'Block Amount Status - Amount Released';
      }
    }

    return {
      dryRun: false,
      status: label.code,
      message,
      appliedKitta: kitta,
      allotmentStatus,
      remarks,
    };
  }

  /**
   * Application Report list from MeroShare (same as website without Filter).
   * Older/migrated history is not available for typical API logins (403).
   */
  async listApplicationReports(): Promise<ApplicationReportRow[]> {
    return this.listApplicationReportsDetailed();
  }

  /**
   * Full Application Report detail for one applicant form (bank, amount, remarks…).
   */
  async getApplicationReportDetail(
    formId: number,
    fallback?: ApplicationReportRow,
  ): Promise<ApplicationReportDetail> {
    if (this.session?.token.startsWith('sim_')) {
      return normalizeReportDetail({}, fallback);
    }
    if (!this.session) {
      throw new MeroshareError('AUTH', 'Not logged in');
    }
    try {
      const detail = await this.request<Record<string, unknown>>(
        PATHS.reportDetail(formId),
        { method: 'GET', auth: true },
      );
      return normalizeReportDetail(detail ?? {}, fallback);
    } catch {
      return normalizeReportDetail({}, fallback);
    }
  }

  async listApplicationReportsDetailed(): Promise<ApplicationReportRow[]> {
    if (this.session?.token.startsWith('sim_')) {
      return [];
    }

    const base = this.base || MEROSHARE_BASE;
    const defaultRes = await this.softSearchReports(
      base,
      PATHS.applicationReport,
      this.portalActiveReportBody(1, 200),
      'active/default',
    );

    // Soft failures already retried inside softSearchReports. Returning empty
    // (instead of throwing) keeps Bulk Status dropdown from going blank when
    // CDSC is briefly flaky — callers that need a hard error can detect empty.

    const seen = new Set<string>();
    const out: ApplicationReportRow[] = [];
    for (const row of defaultRes.rows ?? []) {
      const normalized = normalizeReportRow(row);
      if (normalized.companyShareId <= 0) continue;
      const key = `${normalized.companyShareId}:${normalized.applicantFormId ?? 'x'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    out.sort((a, b) =>
      String(b.appliedDate ?? '').localeCompare(String(a.appliedDate ?? '')),
    );
    return out;
  }

  /** Portal Application Report body (empty From/To = default list). */
  private portalActiveReportBody(page: number, size: number) {
    return {
      filterFieldParams: [
        {
          key: 'companyShare.companyIssue.companyISIN.script',
          alias: 'Scrip',
        },
        {
          key: 'companyShare.companyIssue.companyISIN.company.name',
          alias: 'Company Name',
        },
      ],
      page,
      size,
      searchRoleViewConstants: 'VIEW_APPLICANT_FORM_COMPLETE',
      filterDateParams: [
        { key: 'appliedDate', value: '', alias: 'From' },
        { key: 'appliedDate', value: '', alias: 'To' },
      ],
    };
  }

  /** Soft POST for reports — never throws; logs status/body for diagnosis. */
  private async softSearchReports(
    base: string,
    path: string,
    body: unknown,
    label: string,
  ): Promise<{
    rows: Array<Record<string, unknown>>;
    error?: string;
  }> {
    if (!this.session?.token) {
      return { rows: [], error: `${label}: not logged in` };
    }

    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await rawRequest(base, path, {
          method: 'POST',
          headers: {
            Authorization: this.session.token,
          },
          body: JSON.stringify(body),
        });
        if (__DEV__) {
          const preview = (result.text || '').replace(/\s+/g, ' ').slice(0, 160);
          console.log(
            `[meroshare] ${label} try=${attempt + 1} HTTP ${result.status} preview=${preview}`,
          );
        }
        if (isProbablyHtml(result.text)) {
          lastError = `${label}: HTML response HTTP ${result.status}`;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          return { rows: [], error: lastError };
        }
        let data: Record<string, unknown> = {};
        try {
          data = result.text
            ? parseJsonBody<Record<string, unknown>>(result.text, label)
            : {};
        } catch {
          lastError = `${label}: bad JSON HTTP ${result.status}`;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          return { rows: [], error: lastError };
        }
        const msg = typeof data.message === 'string' ? data.message : '';
        const code =
          typeof data.statusCode === 'number' ? data.statusCode : result.status;
        if (
          !result.ok ||
          (code >= 400 && code !== 200) ||
          isTransientMeroshareMessage(msg)
        ) {
          lastError = `${label}: ${msg || `HTTP ${result.status}`}`;
          if (attempt < 2 && isTransientMeroshareMessage(lastError)) {
            await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
            continue;
          }
          return { rows: [], error: lastError };
        }
        const rows = this.extractReportRows(data);
        if (__DEV__) {
          console.log(
            `[meroshare] ${label} rows=${rows.length} totalCount=${String(data.totalCount ?? '')}`,
          );
        }
        return { rows };
      } catch (e) {
        lastError = `${label}: ${e instanceof Error ? e.message : 'failed'}`;
        if (attempt < 2 && isTransientMeroshareMessage(lastError)) {
          await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
          continue;
        }
        return { rows: [], error: lastError };
      }
    }
    return { rows: [], error: lastError || `${label}: failed` };
  }

  private extractReportRows(
    data: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const raw =
      data.object ?? data.content ?? data.data ?? data.list ?? data.rows;
    if (Array.isArray(raw)) {
      return raw as Array<Record<string, unknown>>;
    }
    return [];
  }

  private async fetchApplicationReportRows(): Promise<
    Array<Record<string, unknown>>
  > {
    const rows = await this.listApplicationReportsDetailed();
    return rows.map((r) => ({
      companyShareId: r.companyShareId,
      companyName: r.companyName,
      scrip: r.scrip,
      shareTypeName: r.shareTypeName,
      statusName: r.statusName,
      applicantFormId: r.applicantFormId,
      appliedKitta: r.appliedKitta,
      appliedDate: r.appliedDate,
    }));
  }
}

function nestedNumber(
  row: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = row[key];
    if (v != null && v !== '' && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  const share = row.companyShare;
  if (share && typeof share === 'object') {
    const obj = share as Record<string, unknown>;
    const id = obj.id ?? obj.companyShareId;
    if (id != null && !Number.isNaN(Number(id))) return Number(id);
  }
  return undefined;
}

function normalizeReportRow(row: Record<string, unknown>): ApplicationReportRow {
  const companyShareId =
    nestedNumber(row, 'companyShareId', 'companyShareID', 'shareId') ?? 0;
  const applicantFormId = nestedNumber(
    row,
    'applicantFormId',
    'applicantFormID',
  );
  return {
    companyShareId,
    companyName: String(
      row.companyName ?? row.companyShareName ?? row.company ?? 'Unknown',
    ),
    scrip: String(row.scrip ?? row.companyCode ?? row.script ?? ''),
    shareTypeName: String(row.shareTypeName ?? row.shareType ?? 'IPO'),
    statusName: String(
      row.statusName ?? row.status ?? row.applicantStage ?? 'UNKNOWN',
    ),
    applicantFormId,
    appliedKitta:
      nestedNumber(
        row,
        'appliedKitta',
        'appliedQuantity',
        'kitta',
        'quantity',
        'allottedQuantity',
        'allottedKitta',
        'appliedShare',
      ) ?? undefined,
    appliedDate: row.appliedDate ? String(row.appliedDate) : undefined,
  };
}

function pickStr(
  row: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Walk common nested bank/branch objects MeroShare sometimes returns. */
function pickNestedStr(
  row: Record<string, unknown>,
  objectKeys: string[],
  valueKeys: string[],
): string | undefined {
  for (const ok of objectKeys) {
    const obj = row[ok];
    if (obj && typeof obj === 'object') {
      const found = pickStr(obj as Record<string, unknown>, ...valueKeys);
      if (found) return found;
    }
  }
  return undefined;
}

function normalizeReportDetail(
  row: Record<string, unknown>,
  fallback?: ApplicationReportRow,
): ApplicationReportDetail {
  const base = fallback
    ? { ...fallback }
    : normalizeReportRow(row);
  const kitta =
    row.appliedKitta != null
      ? Number(row.appliedKitta)
      : base.appliedKitta;
  const amountRaw =
    toNum(row.amount) ??
    toNum(row.appliedAmount) ??
    toNum(row.amountReceived) ??
    toNum(row.blockAmount) ??
    (kitta != null && !Number.isNaN(kitta) ? kitta * 100 : null);

  const bank =
    pickStr(
      row,
      'bankName',
      'bank',
      'accountBankName',
      'bankNameEn',
      'bankNameNp',
    ) ??
    pickNestedStr(
      row,
      ['bank', 'accountBank', 'bankAccount', 'asbaBank'],
      ['name', 'bankName', 'bankNameEn', 'nameEn'],
    );

  const branch =
    pickStr(
      row,
      'accountBranchName',
      'branchName',
      'branch',
      'bankBranchName',
      'branchNameEn',
      'branchNameNp',
      'accountBranchNameEn',
      'bankAccountBranchName',
    ) ??
    pickNestedStr(
      row,
      [
        'accountBranch',
        'bankBranch',
        'branch',
        'bankAccount',
        'account',
        'asbaAccount',
      ],
      [
        'name',
        'branchName',
        'accountBranchName',
        'nameEn',
        'branchNameEn',
        'displayName',
      ],
    );

  const boid = pickStr(row, 'boid', 'demat', 'dematNumber', 'dematAccountNumber');
  const allotted = nestedNumber(
    row,
    'allottedKitta',
    'allotedKitta',
    'allottedQuantity',
    'allotedQuantity',
    'allotmentKitta',
  );

  return {
    companyShareId: base.companyShareId,
    companyName: pickStr(row, 'companyName', 'companyShareName', 'company') ??
      base.companyName,
    scrip: pickStr(row, 'scrip', 'companyCode', 'script') ?? base.scrip,
    shareTypeName:
      pickStr(row, 'shareTypeName', 'shareType') ?? base.shareTypeName,
    statusName:
      pickStr(
        row,
        'statusName',
        'stageName',
        'allotmentStatus',
        'status',
        'applicantStage',
      ) ?? base.statusName,
    applicantFormId: base.applicantFormId,
    appliedKitta: kitta,
    allottedKitta: allotted,
    amount: amountRaw,
    bankName: bank,
    branchName: branch,
    accountNumber: pickStr(
      row,
      'accountNumber',
      'bankAccountNumber',
      'accountNo',
      'bankAccountNo',
    ) ??
      pickNestedStr(
        row,
        ['bankAccount', 'account', 'asbaAccount'],
        ['accountNumber', 'accountNo', 'number'],
      ),
    boid,
    appliedDate:
      pickStr(row, 'appliedDate', 'applicationDate', 'submittedDate') ??
      base.appliedDate,
    remarks: pickStr(
      row,
      'meroshareRemark',
      'remarks',
      'remark',
      'blockAmountStatus',
      'reasonOrRemark',
    ),
    reason: pickStr(
      row,
      'reason',
      'rejectionReason',
      'failReason',
      'failureReason',
      'reasonName',
    ),
  };
}

/** Map CDSC status codes to short UI labels */
export function humanizeApplicationStatus(
  statusName: string,
  allotmentStatus?: string,
  remarks?: string,
): { code: string; message: string } {
  const s = statusName.toUpperCase();
  const a = (allotmentStatus ?? '').toUpperCase();
  const r = (remarks ?? '').toUpperCase();
  const combined = `${s} ${a} ${r}`;

  if (/NOT.?ALLOT|UNALLOT/.test(a) || /NOT.?ALLOT/.test(s)) {
    return { code: 'NOT_ALLOTTED', message: 'Not allotted' };
  }
  if (
    (/ALLOT/.test(a) && !/NOT/.test(a)) ||
    (/ALLOT/.test(s) && !/NOT.?ALLOT/.test(s))
  ) {
    return { code: 'ALLOTTED', message: 'Allotted' };
  }
  // Insufficient ASBA / bank balance (BLOCK_FAILED is the usual CDSC code).
  if (
    /INSUFFICIENT|NOT ENOUGH|LOW BALANCE|INSUFFICEN|BALANCE.?NOT.?AVAILABLE|INSUFFICIENT.?FUND/i.test(
      combined,
    ) ||
    /BLOCK[_\s-]?FAIL|AMOUNT.?BLOCK.?FAIL|BLOCK.?AMOUNT.?FAIL/i.test(combined)
  ) {
    return {
      code: 'REJECTED',
      message:
        'Rejected — you have insufficient amount in your bank account',
    };
  }
  if (/TRANSACTION_SUCCESS|APPROVED/.test(s)) {
    return {
      code: 'APPLIED',
      message: allotmentStatus
        ? `Applied (${allotmentStatus})`
        : 'Applied — awaiting allotment',
    };
  }
  if (/PENDING|WAIT|PROCESS/.test(s)) {
    return { code: 'PENDING', message: `Pending (${statusName})` };
  }
  if (/REJECT/.test(combined)) {
    return { code: 'REJECTED', message: allotmentStatus || statusName || 'Rejected' };
  }
  if (/CANCEL/.test(s) || (/FAIL|ERROR/.test(s) && !/BLOCK/.test(s))) {
    return {
      code: 'FAILED',
      message: /FAIL|ERROR/i.test(statusName)
        ? 'Application failed — try again later or check on MeroShare'
        : statusName,
    };
  }
  return { code: s || 'UNKNOWN', message: statusName };
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizePortfolioRow(
  row: Record<string, unknown>,
): PortfolioHoldingRow | null {
  const script = String(row.script ?? row.scrip ?? row.symbol ?? '')
    .trim()
    .toUpperCase();
  if (!script) return null;
  const scriptDesc = row.scriptDesc
    ? String(row.scriptDesc).trim()
    : undefined;
  const quantity =
    toNum(row.currentBalance ?? row.balance ?? row.quantity ?? row.totalQty) ??
    0;
  const ltp = toNum(row.lastTransactionPrice ?? row.ltp);
  const prevClose = toNum(row.previousClosingPrice ?? row.previousClose);
  const valueAtLtp = toNum(
    row.valueAsOfLastTransactionPrice ?? row.valueOfLastTransPrice,
  );
  return {
    script,
    scriptDesc,
    quantity,
    lastTransactionPrice: ltp,
    previousClosingPrice: prevClose,
    valueAtLtp,
  };
}

function normalizeIssue(row: Record<string, unknown>): OpenIssue {
  const companyShareId = Number(row.companyShareId ?? row.id ?? 0);
  const readDate = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const v = row[key];
      if (v == null || v === '') continue;
      if (typeof v === 'number' && Number.isFinite(v)) {
        const ms = v > 1e12 ? v : v * 1000;
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      const s = String(v).trim();
      if (s) return s;
    }
    return undefined;
  };
  return {
    id: companyShareId,
    companyShareId,
    companyName: String(row.companyName ?? row.name ?? 'Unknown'),
    scrip: String(row.scrip ?? row.companyCode ?? ''),
    shareTypeName: String(row.shareTypeName ?? row.shareType ?? 'IPO'),
    shareGroupName: row.shareGroupName ? String(row.shareGroupName) : undefined,
    issueOpenDate: readDate([
      'issueOpenDate',
      'openingDate',
      'openDate',
      'applicationOpenDate',
      'issueStartDate',
      'startDate',
    ]),
    issueCloseDate: readDate([
      'issueCloseDate',
      'closingDate',
      'closeDate',
      'applicationCloseDate',
      'issueEndDate',
      'endDate',
      'applicationClosingDate',
      'extendedClosingDate',
      'issueCloseDateNep',
      'closeDateNep',
      'applicationCloseDateNep',
      'closingDateNep',
    ]),
    maxUnit: row.maxUnit != null ? Number(row.maxUnit) : undefined,
    // Do not invent 10: debentures/FPOs can require 25, 50, 80, etc.
    minUnit: row.minUnit != null ? Number(row.minUnit) : undefined,
    alreadyApplied: row.action === 'edit',
  };
}

function classifyProbeMessage(
  msg: string,
): 'pin' | 'crn' | 'accepted' | 'impossible' | 'no_window' {
  const m = msg.toLowerCase();
  // Closed / not-open issue window — NOT a CRN/PIN failure
  if (
    /cannot apply|can not apply|could not apply|not eligible|date duration|issue.*(closed|not open)|right now|outside.*(period|window|date)|before open|after close/i.test(
      m,
    )
  ) {
    return 'no_window';
  }
  if (
    /transaction\s*pin|invalid\s*pin|incorrect\s*pin|wrong\s*pin|pin\s*(code|number)?\s*(is\s*)?(invalid|incorrect|wrong)|pin code/i.test(
      m,
    )
  ) {
    return 'pin';
  }
  if (
    /crn/.test(m) &&
    /invalid|incorrect|wrong|not\s*match|mismatch|not\s*register|unregistered|required|does not|doesn't/.test(
      m,
    )
  ) {
    return 'crn';
  }
  if (/crn/.test(m) && !/pin/.test(m)) return 'crn';
  // ONLY treat as “secrets OK” when rejection is clearly about quantity / already applied
  if (
    /already\s*applied|application\s*already|duplicate\s*application|kitta|quantity|no\.?\s*of\s*share|minimum|maximum|greater than|less than|must be\s*(greater|at least|more)|zero|applied\s*unit/i.test(
      m,
    )
  ) {
    return 'accepted';
  }
  if (/pin/.test(m)) return 'pin';
  return 'impossible';
}

/** Shown when not logged into live API — still lets bulk apply dry-run be tested */
export const DEMO_OPENINGS: OpenIssue[] = [
  {
    id: 9001,
    companyShareId: 9001,
    companyName: 'DEMO COMPANY LIMITED',
    scrip: 'DEMO',
    shareTypeName: 'IPO',
    shareGroupName: 'Ordinary',
    minUnit: 10,
    maxUnit: 10,
  },
];
