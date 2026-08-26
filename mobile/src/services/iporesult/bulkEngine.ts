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

const ACCOUNT_GAP_MS = 650;
const ACCOUNT_GAP_MAX_MS = 2800;
const ACCOUNT_PAUSE_MS = 2200;
const CAPTCHA_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isWafBlockError(message: string): boolean {
  return /waf|request rejected|support id|blocked the request|cold webview/i.test(
    message,
  );
}

/** Full session reset only for portal blocks — not wrong captcha. */
function isHardWafBlock(message: string): boolean {
  return (
    isWafBlockError(message) &&
    !/captcha|invalid\s*code|security\s*code/i.test(message)
  );
}

type BulkThrottle = {
  acquire: () => Promise<void>;
  backoff: (message: string) => void;
  relax: () => void;
};

function createBulkThrottle(): BulkThrottle {
  let gapMs = ACCOUNT_GAP_MS;
  let nextSlot = 0;
  let pauseUntil = 0;

  return {
    async acquire() {
      const now = Date.now();
      const pause = Math.max(0, pauseUntil - now);
      if (pause > 0) await sleep(pause);
      const slot = Math.max(Date.now(), nextSlot);
      nextSlot = slot + gapMs;
      const wait = slot - Date.now();
      if (wait > 0) await sleep(wait);
    },
    backoff(message: string) {
      const isWaf = isWafBlockError(message);
      gapMs = Math.min(
        ACCOUNT_GAP_MAX_MS,
        Math.round(gapMs * (isWaf ? 1.65 : 1.35)),
      );
      pauseUntil = Math.max(
        pauseUntil,
        Date.now() + (isWaf ? ACCOUNT_PAUSE_MS : 1200),
      );
    },
    relax() {
      gapMs = Math.max(ACCOUNT_GAP_MS, Math.round(gapMs * 0.92));
    },
  };
}

type CaptchaReady = {
  captcha: PublicCaptcha;
  digits: string;
};

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

async function prepareCaptcha(
  bridge: IpoResultWebBridgeHandle,
  ocr: CaptchaOcrHandle,
  captcha: PublicCaptcha,
  reload: boolean,
  onProgress?: (msg: string) => void,
): Promise<CaptchaReady> {
  let c = captcha;
  if (reload) {
    onProgress?.('Refreshing captcha…');
    c = await reloadPublicCaptchaViaBridge(bridge, captcha.captchaIdentifier);
  }
  onProgress?.('Auto-solving captcha…');
  const digits = await solvePublicCaptcha(c, ocr, { bulkFast: true });
  return { captcha: c, digits };
}

/**
 * Bulk check = company + accounts only.
 * Captcha is solved automatically — pipelined between accounts when possible.
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
  const resolved = await resolveBoidsForAccounts(opts.accounts);
  const results: PublicBulkResultRow[] = [];
  let sessionCaptcha = opts.captcha;
  const total = resolved.length;
  const throttle = createBulkThrottle();
  let prefetch: Promise<CaptchaReady> | null = null;

  const emit = (row: PublicBulkResultRow, i: number) => {
    results.push(row);
    opts.onAccountResult?.(row, i, total);
  };

  const progress = (msg: string, i: number) => {
    opts.onProgress?.(msg, i, total);
  };

  const startPrefetch = (fromCaptcha: PublicCaptcha) => {
    prefetch = prepareCaptcha(
      opts.bridge,
      opts.ocr,
      fromCaptcha,
      true,
      (m) => progress(m, -1),
    );
  };

  const cancelPrefetch = () => {
    prefetch = null;
  };

  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    progress(`Checking ${row.account.name} (${i + 1}/${total})…`, i);

    if (!row.boid) {
      cancelPrefetch();
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
    await throttle.acquire();

    const masked = maskBoid(row.boid);
    let done = false;
    let lastMessage = 'Captcha solve failed';
    let ready: CaptchaReady | null = null;

    try {
      if (prefetch) {
        ready = await prefetch;
        prefetch = null;
      } else if (i === 0) {
        ready = await prepareCaptcha(
          opts.bridge,
          opts.ocr,
          sessionCaptcha,
          false,
          (m) => progress(m, i),
        );
      } else {
        ready = await prepareCaptcha(
          opts.bridge,
          opts.ocr,
          sessionCaptcha,
          true,
          (m) => progress(m, i),
        );
      }
    } catch (e) {
      lastMessage = e instanceof Error ? e.message : 'Captcha prepare failed';
      throttle.backoff(lastMessage);
      emit({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        boidMasked: masked,
        ok: false,
        allotted: false,
        message: lastMessage,
      }, i);
      continue;
    }

    for (let attempt = 0; attempt < CAPTCHA_ATTEMPTS && !done; attempt++) {
      if (attempt > 0) {
        cancelPrefetch();
        try {
          progress(
            `Retry captcha (${attempt + 1}/${CAPTCHA_ATTEMPTS})…`,
            i,
          );
          ready = await prepareCaptcha(
            opts.bridge,
            opts.ocr,
            ready!.captcha,
            true,
            (m) => progress(m, i),
          );
        } catch (e) {
          lastMessage = e instanceof Error ? e.message : 'Captcha failed';
          throttle.backoff(lastMessage);
          continue;
        }
      }

      try {
        const res = await opts.bridge.checkResult({
          companyShareId: String(opts.company.id),
          boid: row.boid,
          userCaptcha: ready!.digits,
          captchaIdentifier: ready!.captcha.captchaIdentifier,
        });
        assertBridgeOk(res, 'Result check');
        const check = parseCheckPayload(res.text);

        if (check.needsCaptcha) {
          lastMessage = check.message;
          continue;
        }

        sessionCaptcha = ready!.captcha;
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
        throttle.relax();

        if (i < resolved.length - 1) {
          startPrefetch(sessionCaptcha);
        }
      } catch (e) {
        lastMessage = e instanceof Error ? e.message : 'Check failed';
        throttle.backoff(lastMessage);
        if (
          attempt < CAPTCHA_ATTEMPTS - 1 &&
          isHardWafBlock(lastMessage) &&
          opts.bridge.resetSession
        ) {
          cancelPrefetch();
          progress(`Refreshing CDSC session for ${row.account.name}…`, i);
          await opts.bridge.resetSession(90000);
          await sleep(1200);
          const home = await loadPublicHomeViaBridge(opts.bridge);
          sessionCaptcha = home.captcha;
          lastMessage = 'CDSC session refreshed';
          try {
            ready = await prepareCaptcha(
              opts.bridge,
              opts.ocr,
              sessionCaptcha,
              false,
              (m) => progress(m, i),
            );
          } catch (prepErr) {
            lastMessage =
              prepErr instanceof Error ? prepErr.message : lastMessage;
          }
          continue;
        }
      }
    }

    if (!done) {
      cancelPrefetch();
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
  }

  return {
    companyShareId: opts.company.id,
    companyName: opts.company.name,
    source: 'public',
    results,
  };
}
