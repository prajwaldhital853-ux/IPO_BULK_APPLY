import { isProbablyHtml, parseJsonBody } from '../meroshare/http';
import type { BridgeHttpResult } from '../../components/IpoResultWebBridge';

export type PublicIpoCompany = {
  id: number;
  name: string;
  scrip?: string;
};

export type PublicCaptcha = {
  captchaIdentifier: string;
  /** Base64 image (no data: prefix) */
  captchaImageBase64: string;
  audioCaptcha?: string;
};

export type PublicHomePayload = {
  companies: PublicIpoCompany[];
  captcha: PublicCaptcha;
};

export type PublicResultCheck = {
  ok: boolean;
  allotted: boolean;
  quantity?: number;
  message: string;
  needsCaptcha?: boolean;
  raw?: unknown;
};

function isBlocked(text: string): boolean {
  return (
    isProbablyHtml(text) ||
    /request rejected/i.test(text) ||
    /support id/i.test(text)
  );
}

function normalizeCompany(row: Record<string, unknown>): PublicIpoCompany | null {
  const id = Number(
    row.id ?? row.companyShareId ?? row.companyShareID ?? row.value ?? 0,
  );
  if (!id) return null;
  const name = String(
    row.name ??
      row.companyName ??
      row.companyShareName ??
      row.label ??
      `Company ${id}`,
  );
  const scrip = row.scrip ?? row.companyCode ?? row.script;
  return {
    id,
    name,
    scrip: scrip != null ? String(scrip) : undefined,
  };
}

function normalizeCaptcha(raw: Record<string, unknown>): PublicCaptcha | null {
  const captchaIdentifier = String(
    raw.captchaIdentifier ?? raw.captchaId ?? raw.id ?? '',
  );
  let image = String(raw.captcha ?? raw.captchaImage ?? raw.image ?? '');
  if (image.startsWith('data:')) {
    image = image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  }
  if (!captchaIdentifier || !image) return null;
  return {
    captchaIdentifier,
    captchaImageBase64: image,
    audioCaptcha:
      raw.audioCaptcha != null ? String(raw.audioCaptcha) : undefined,
  };
}

/**
 * Official portal home payload:
 * { success, body: { companyShareList, captchaData } }
 * (same shape used by Play Store IPO Result apps)
 */
export function parseHomePayload(text: string): PublicHomePayload {
  if (isBlocked(text)) {
    throw new Error(
      'iporesult.cdsc.com.np blocked the request (WAF). Open the site in Chrome on this phone; if it works there, retry here.',
    );
  }
  const data = parseJsonBody<Record<string, unknown>>(text, 'iporesult home');
  const body =
    data.body && typeof data.body === 'object'
      ? (data.body as Record<string, unknown>)
      : data;

  const listRaw =
    body.companyShareList ??
    body.companyShares ??
    (Array.isArray(body) ? body : null) ??
    data.companyShareList;

  const rows = Array.isArray(listRaw) ? listRaw : [];
  const companies = rows
    .map((r) =>
      r && typeof r === 'object'
        ? normalizeCompany(r as Record<string, unknown>)
        : null,
    )
    .filter((c): c is PublicIpoCompany => c != null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const captchaRaw =
    (body.captchaData as Record<string, unknown> | undefined) ??
    (data.captchaData as Record<string, unknown> | undefined) ??
    body;

  const captcha = normalizeCaptcha(
    captchaRaw && typeof captchaRaw === 'object' ? captchaRaw : {},
  );
  if (!companies.length) {
    throw new Error(
      'No companies listed on iporesult yet (results not published).',
    );
  }
  if (!captcha) {
    throw new Error('Captcha missing from iporesult response.');
  }
  return { companies, captcha };
}

export function parseCaptchaReload(text: string): PublicCaptcha {
  if (isBlocked(text)) {
    throw new Error('Captcha reload blocked by WAF');
  }
  const data = parseJsonBody<Record<string, unknown>>(
    text,
    'iporesult captcha',
  );
  const body =
    data.body && typeof data.body === 'object'
      ? (data.body as Record<string, unknown>)
      : data;
  const nested =
    (body.captchaData as Record<string, unknown> | undefined) ?? body;
  const captcha = normalizeCaptcha(nested);
  if (!captcha) {
    throw new Error('Could not parse reloaded captcha');
  }
  return captcha;
}

export function parseCheckPayload(text: string): PublicResultCheck {
  if (isBlocked(text)) {
    return {
      ok: false,
      allotted: false,
      message: 'iporesult.cdsc.com.np blocked the request (WAF).',
    };
  }
  const data = parseJsonBody<Record<string, unknown>>(text, 'iporesult check');
  const success = Boolean(data.success ?? data.ok);
  const message = String(
    data.message ?? data.msg ?? data.error ?? (success ? 'OK' : 'No result'),
  );
  const qtyRaw =
    data.quantity ??
    data.allotedQuantity ??
    data.allottedQuantity ??
    data.kitta ??
    data.appliedKitta;
  const quantity =
    qtyRaw != null && !Number.isNaN(Number(qtyRaw))
      ? Number(qtyRaw)
      : undefined;

  const lower = message.toLowerCase();
  if (/captcha|security\s*code|invalid\s*code/.test(lower)) {
    return {
      ok: false,
      allotted: false,
      message,
      needsCaptcha: true,
      raw: data,
    };
  }

  const allotted =
    Boolean(success) &&
    (/congrat|allot|alloted|allotted/.test(lower) ||
      (quantity != null && quantity > 0));
  const notAllotted = /not\s*allot|sorry/.test(lower);

  return {
    ok: true,
    allotted: allotted && !notAllotted,
    quantity: allotted && !notAllotted ? quantity : undefined,
    message,
    raw: data,
  };
}

export function assertBridgeOk(res: BridgeHttpResult, label: string): void {
  if (isBlocked(res.text)) {
    throw new Error(
      `${label}: CDSC WAF still blocking the in-app browser. Chrome can work while a cold WebView needs a moment — tap refresh. If it keeps failing, force-close the app and reopen.`,
    );
  }
}
