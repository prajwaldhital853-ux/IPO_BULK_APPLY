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

const ACCOUNT_GAP_MS = 1800;
const CAPTCHA_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isWafBlockError(message: string): boolean {
  return /waf|request rejected|support id|blocked the request|cold webview/i.test(
    message,
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

/**
 * Bulk check = company + accounts only.
 * Captcha is solved automatically (audio → OCR) — never typed by user.
 *
 * Runs strictly one account at a time through this phone's WebView session:
 * that session is the only client that clears CDSC's WAF challenge, so the
 * pacing and request shape here are deliberately kept minimal.
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
  let captcha = opts.captcha;
  const total = resolved.length;

  const emit = (row: PublicBulkResultRow, i: number) => {
    results.push(row);
    opts.onAccountResult?.(row, i, total);
  };

  /** Only spaces out accounts that actually hit CDSC, never skipped ones. */
  let needsGap = false;

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

    // Spinner goes on before the gap, so a row keeps spinning from the moment
    // it is picked up until its own result lands — no idle pause in between.
    opts.onAccountStart?.(row.account.id, i, total);
    if (needsGap) {
      await sleep(ACCOUNT_GAP_MS);
    }
    needsGap = true;

    const masked = maskBoid(row.boid);
    let done = false;
    let lastMessage = 'Captcha solve failed';

    for (let attempt = 0; attempt < CAPTCHA_ATTEMPTS && !done; attempt++) {
      try {
        if (i > 0 || attempt > 0) {
          opts.onProgress?.(
            `Refreshing captcha for ${row.account.name}…`,
            i,
            total,
          );
          captcha = await reloadPublicCaptchaViaBridge(
            opts.bridge,
            captcha.captchaIdentifier,
          );
        }

        opts.onProgress?.(
          `Auto-solving captcha (${attempt + 1}/${CAPTCHA_ATTEMPTS})…`,
          i,
          total,
        );
        const userCaptcha = await solvePublicCaptcha(captcha, opts.ocr);

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
          continue;
        }

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
        if (
          attempt < CAPTCHA_ATTEMPTS - 1 &&
          isWafBlockError(lastMessage) &&
          opts.bridge.resetSession
        ) {
          opts.onProgress?.(
            `Refreshing CDSC session for ${row.account.name}…`,
            i,
            total,
          );
          await opts.bridge.resetSession(90000);
          await sleep(1500);
          const home = await loadPublicHomeViaBridge(opts.bridge);
          captcha = home.captcha;
          lastMessage = 'CDSC session refreshed';
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
  }

  return {
    companyShareId: opts.company.id,
    companyName: opts.company.name,
    source: 'public',
    results,
  };
}
