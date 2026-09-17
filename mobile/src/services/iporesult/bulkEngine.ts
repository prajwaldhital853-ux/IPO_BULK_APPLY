import type { AccountMeta } from '../../types/account';
import { resolveBoidsForAccounts } from '../../utils/resolveBoid';
import { maskBoid } from '../../utils/boid';
import type { IpoResultWebBridgeHandle } from '../../components/IpoResultWebBridge';
import type { CaptchaOcrHandle } from '../../components/CaptchaOcrBridge';
import type { PublicIpoCompany, PublicCaptcha } from './parse';
import {
  assertBridgeOk,
  parseCaptchaReload,
  parseCheckPayload,
  parseHomePayload,
} from './parse';
import { solvePublicCaptcha } from './solveCaptcha';

/** Spacing between CDSC submissions — scales up on very long bulk runs. */
const ACCOUNT_GAP_MS = 450;
const CAPTCHA_ATTEMPTS = 5;
/** Proactive captcha refresh interval (works for 600+ account batches). */
const SOFT_REFRESH_EVERY = 8;
const DEEP_REFRESH_EVERY = 50;
const SOFT_REFRESH_PAUSE_MS = 1400;
const DEEP_REFRESH_PAUSE_MS = 2800;
const WAF_SOFT_RETRY_MS = 1200;
const WAF_HARD_RESET_AFTER = 2;
const CAPTCHA_RATE_LIMIT_PAUSE_MS = 2500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function gapMsForCount(cdscCheckCount: number): number {
  if (cdscCheckCount >= 400) return 900;
  if (cdscCheckCount >= 200) return 750;
  if (cdscCheckCount >= 100) return 600;
  if (cdscCheckCount >= 50) return 520;
  return ACCOUNT_GAP_MS;
}

function softRefreshInterval(cdscCheckCount: number): number {
  if (cdscCheckCount >= 600) return 4;
  if (cdscCheckCount >= 300) return 6;
  return SOFT_REFRESH_EVERY;
}

function needsSoftRefresh(cdscCheckCount: number): boolean {
  if (cdscCheckCount <= 0) return false;
  const interval = softRefreshInterval(cdscCheckCount);
  return cdscCheckCount % interval === 0;
}

function needsDeepRefresh(cdscCheckCount: number): boolean {
  return cdscCheckCount > 0 && cdscCheckCount % DEEP_REFRESH_EVERY === 0;
}

function isWafBlockError(message: string): boolean {
  return /waf|request rejected|support id|blocked the request|cold webview/i.test(
    message,
  );
}

function isCaptchaRateLimitError(message: string): boolean {
  return /429|rate limit|captcha auto-solve failed/i.test(message);
}

/** Errors that often clear on a second pass after a fresh CDSC session. */
export function isRetriableCdscError(message: string): boolean {
  return (
    isWafBlockError(message) ||
    isCaptchaRateLimitError(message) ||
    /invalid captcha|captcha auto-solve|session reset|not ready|timed out|iporesult session/i.test(
      message,
    )
  );
}

export type PublicBulkResultRow = {
  accountId: string;
  accountName: string;
  username: string;
  boidMasked?: string;
  ok: boolean;
  allotted: boolean;
  quantity?: number;
  message: string;
};

export type PublicBulkResultSummary = {
  companyShareId: number;
  companyName: string;
  source: 'public';
  results: PublicBulkResultRow[];
};

export async function loadPublicHomeViaBridge(
  bridge: IpoResultWebBridgeHandle,
): Promise<{ companies: PublicIpoCompany[]; captcha: PublicCaptcha }> {
  await bridge.whenReady();
  const res = await bridge.fetchHome();
  assertBridgeOk(res, 'Company list');
  if (!res.ok && !res.text.trim()) {
    throw new Error(`Company list HTTP ${res.status}`);
  }
  return parseHomePayload(res.text);
}

export async function reloadPublicCaptchaViaBridge(
  bridge: IpoResultWebBridgeHandle,
  captchaIdentifier: string,
): Promise<PublicCaptcha> {
  await bridge.whenReady();
  const res = await bridge.reloadCaptcha(captchaIdentifier);
  assertBridgeOk(res, 'Captcha reload');
  return parseCaptchaReload(res.text);
}

async function tryReloadCaptcha(
  bridge: IpoResultWebBridgeHandle,
  captchaIdentifier: string,
): Promise<PublicCaptcha | null> {
  try {
    return await reloadPublicCaptchaViaBridge(bridge, captchaIdentifier);
  } catch {
    return null;
  }
}

/**
 * Fast WAF recovery — captcha reload only. Full home/reset is slow and often
 * re-triggers WAF; use only after several soft failures.
 */
async function recoverFromWaf(
  bridge: IpoResultWebBridgeHandle,
  captcha: PublicCaptcha,
  wafStrikes: number,
): Promise<PublicCaptcha | null> {
  const soft = await tryReloadCaptcha(bridge, captcha.captchaIdentifier);
  if (soft) {
    await sleep(WAF_SOFT_RETRY_MS);
    return soft;
  }

  if (wafStrikes < WAF_HARD_RESET_AFTER || !bridge.resetSession) {
    return null;
  }

  try {
    await bridge.resetSession(90_000);
    await sleep(2500);
    const reloaded = await tryReloadCaptcha(bridge, captcha.captchaIdentifier);
    if (reloaded) return reloaded;
    const home = await loadPublicHomeViaBridge(bridge);
    return home.captcha;
  } catch {
    return await tryReloadCaptcha(bridge, captcha.captchaIdentifier);
  }
}

/** Proactive session keep-alive during long bulk runs (100s–600s of accounts). */
async function proactiveSessionRefresh(
  bridge: IpoResultWebBridgeHandle,
  captcha: PublicCaptcha,
  deep: boolean,
): Promise<PublicCaptcha> {
  await sleep(deep ? DEEP_REFRESH_PAUSE_MS : SOFT_REFRESH_PAUSE_MS);
  const reloaded = await tryReloadCaptcha(bridge, captcha.captchaIdentifier);
  if (reloaded) return reloaded;
  if (!deep) return captcha;
  try {
    const home = await loadPublicHomeViaBridge(bridge);
    return home.captcha;
  } catch {
    return captcha;
  }
}

/**
 * Bulk check = company + accounts only.
 * Captcha is solved on-device (bulkFast) — never hits rate-limited backend ONNX.
 */
export async function runPublicBulkResultCheck(opts: {
  bridge: IpoResultWebBridgeHandle;
  ocr: CaptchaOcrHandle;
  accounts: AccountMeta[];
  company: PublicIpoCompany;
  captcha: PublicCaptcha;
  onProgress?: (msg: string, index: number, total: number) => void;
  onAccountStart?: (accountId: string, index: number, total: number) => void;
  onAccountResult?: (
    row: PublicBulkResultRow,
    index: number,
    total: number,
  ) => void;
}): Promise<PublicBulkResultSummary> {
  opts.onProgress?.('Resolving account BOIDs…', 0, opts.accounts.length);
  const resolved = await resolveBoidsForAccounts(opts.accounts, {
    concurrency: 2,
  });
  const results: PublicBulkResultRow[] = [];
  let captcha = opts.captcha;
  const total = resolved.length;
  let cdscCheckCount = 0;
  let wafStrikes = 0;
  let needsGap = false;

  const emit = (row: PublicBulkResultRow, i: number) => {
    results.push(row);
    opts.onAccountResult?.(row, i, total);
  };

  const prefetchNextCaptcha = async () => {
    const next = await tryReloadCaptcha(
      opts.bridge,
      captcha.captchaIdentifier,
    );
    if (next) captcha = next;
  };

  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    opts.onProgress?.(
      `Checking ${row.account.name} (${i + 1}/${total})…`,
      i,
      total,
    );

    if (!row.boid) {
      emit({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        ok: false,
        allotted: false,
        message: row.error ?? 'Missing BOID',
      }, i);
      continue;
    }

    opts.onAccountStart?.(row.account.id, i, total);
    if (needsGap) {
      await sleep(gapMsForCount(cdscCheckCount));
    }
    needsGap = true;

    if (needsDeepRefresh(cdscCheckCount)) {
      opts.onProgress?.(
        `Deep CDSC refresh (${cdscCheckCount} checked) — long batch pause…`,
        i,
        total,
      );
      captcha = await proactiveSessionRefresh(opts.bridge, captcha, true);
      wafStrikes = 0;
    } else if (needsSoftRefresh(cdscCheckCount)) {
      opts.onProgress?.(
        `Keeping CDSC session fresh (${cdscCheckCount} checked)…`,
        i,
        total,
      );
      captcha = await proactiveSessionRefresh(opts.bridge, captcha, false);
    }

    const masked = maskBoid(row.boid);
    let done = false;
    let lastMessage = 'Captcha solve failed';

    for (let attempt = 0; attempt < CAPTCHA_ATTEMPTS && !done; attempt++) {
      try {
        if (attempt > 0) {
          opts.onProgress?.(
            `Refreshing captcha for ${row.account.name}…`,
            i,
            total,
          );
          const fresh = await tryReloadCaptcha(
            opts.bridge,
            captcha.captchaIdentifier,
          );
          if (fresh) captcha = fresh;
        }

        opts.onProgress?.(
          `Auto-solving captcha (${attempt + 1}/${CAPTCHA_ATTEMPTS})…`,
          i,
          total,
        );
        const userCaptcha = await solvePublicCaptcha(captcha, opts.ocr, {
          bulkFast: true,
        });

        const res = await opts.bridge.checkResult({
          companyShareId: String(opts.company.id),
          boid: row.boid,
          userCaptcha,
          captchaIdentifier: captcha.captchaIdentifier,
        });
        assertBridgeOk(res, 'Result check');
        const check = parseCheckPayload(res.text);

        if (check.needsCaptcha) {
          lastMessage = check.message;
          const fresh = await tryReloadCaptcha(
            opts.bridge,
            captcha.captchaIdentifier,
          );
          if (fresh) captcha = fresh;
          continue;
        }

        wafStrikes = 0;
        emit({
          accountId: row.account.id,
          accountName: row.account.name,
          username: row.account.username,
          boidMasked: masked,
          ok: check.ok,
          allotted: check.allotted,
          quantity: check.quantity,
          message: check.message,
        }, i);
        done = true;
      } catch (e) {
        lastMessage = e instanceof Error ? e.message : 'Check failed';
        if (attempt >= CAPTCHA_ATTEMPTS - 1) continue;

        if (isWafBlockError(lastMessage)) {
          wafStrikes += 1;
          opts.onProgress?.(
            `Recovering CDSC session for ${row.account.name}…`,
            i,
            total,
          );
          const recovered = await recoverFromWaf(
            opts.bridge,
            captcha,
            wafStrikes,
          );
          if (recovered) captcha = recovered;
          continue;
        }

        if (isCaptchaRateLimitError(lastMessage)) {
          opts.onProgress?.(
            `Captcha solver busy — waiting before retry…`,
            i,
            total,
          );
          await sleep(CAPTCHA_RATE_LIMIT_PAUSE_MS);
          const fresh = await tryReloadCaptcha(
            opts.bridge,
            captcha.captchaIdentifier,
          );
          if (fresh) captcha = fresh;
          continue;
        }

        // Captcha solve failed — refresh and retry.
        if (/captcha auto-solve failed/i.test(lastMessage)) {
          const fresh = await tryReloadCaptcha(
            opts.bridge,
            captcha.captchaIdentifier,
          );
          if (fresh) captcha = fresh;
          await sleep(800);
          continue;
        }
      }
    }

    if (!done) {
      emit({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        boidMasked: masked,
        ok: false,
        allotted: false,
        message: lastMessage,
      }, i);
    }

    cdscCheckCount += 1;

    const hasMoreCdsc = resolved
      .slice(i + 1)
      .some((r) => Boolean(r.boid));
    // Prefetch next captcha unless a proactive refresh just ran / is next.
    const nextCount = cdscCheckCount;
    if (
      hasMoreCdsc &&
      !needsSoftRefresh(nextCount) &&
      !needsDeepRefresh(nextCount)
    ) {
      await prefetchNextCaptcha();
    }
  }

  return {
    companyShareId: opts.company.id,
    companyName: opts.company.name,
    source: 'public',
    results,
  };
}
