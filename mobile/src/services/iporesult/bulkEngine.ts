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

const ACCOUNT_GAP_MS = 700;
const CAPTCHA_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
 */
export async function runPublicBulkResultCheck(opts: {
  bridge: IpoResultWebBridgeHandle;
  ocr: CaptchaOcrHandle;
  accounts: AccountMeta[];
  company: PublicIpoCompany;
  captcha: PublicCaptcha;
  onProgress?: (msg: string, index: number, total: number) => void;
}): Promise<PublicBulkResultSummary> {
  const resolved = await resolveBoidsForAccounts(opts.accounts);
  const results: PublicBulkResultRow[] = [];
  let captcha = opts.captcha;

  for (let i = 0; i < resolved.length; i++) {
    const row = resolved[i];
    opts.onProgress?.(
      `Checking ${row.account.name} (${i + 1}/${resolved.length})…`,
      i,
      resolved.length,
    );

    if (!row.boid) {
      results.push({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        ok: false,
        allotted: false,
        message: row.error ?? 'Missing BOID',
      });
      continue;
    }

    const masked = maskBoid(row.boid);
    let done = false;
    let lastMessage = 'Captcha solve failed';

    for (let attempt = 0; attempt < CAPTCHA_ATTEMPTS && !done; attempt++) {
      try {
        if (i > 0 || attempt > 0) {
          opts.onProgress?.(
            `Refreshing captcha for ${row.account.name}…`,
            i,
            resolved.length,
          );
          captcha = await reloadPublicCaptchaViaBridge(
            opts.bridge,
            captcha.captchaIdentifier,
          );
        }

        opts.onProgress?.(
          `Auto-solving captcha (${attempt + 1}/${CAPTCHA_ATTEMPTS})…`,
          i,
          resolved.length,
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

        results.push({
          accountId: row.account.id,
          accountName: row.account.name,
          username: row.account.username,
          boidMasked: masked,
          ok: check.ok,
          allotted: check.allotted,
          quantity: check.quantity,
          message: check.message,
        });
        done = true;
      } catch (e) {
        lastMessage = e instanceof Error ? e.message : 'Check failed';
      }
    }

    if (!done) {
      results.push({
        accountId: row.account.id,
        accountName: row.account.name,
        username: row.account.username,
        boidMasked: masked,
        ok: false,
        allotted: false,
        message: lastMessage,
      });
    }

    if (i < resolved.length - 1) {
      await sleep(ACCOUNT_GAP_MS);
    }
  }

  return {
    companyShareId: opts.company.id,
    companyName: opts.company.name,
    source: 'public',
    results,
  };
}
