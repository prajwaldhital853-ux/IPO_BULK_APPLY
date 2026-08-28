import { isProbablyHtml, parseJsonBody } from '../meroshare/http';
import type { BridgeHttpResult } from '../../components/IpoResultWebBridge';

export type PublicIpoCompany = {
  id: number;
  name: string;
  scrip?: string;
  /** Higher = newer; derived from CDSC API list order when no timestamp exists. */
  listedAt?: number;
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
    .map((company, index, list) => ({
      ...company,
      // CDSC home payload is usually newest-first — preserve that order.
      listedAt: list.length - index,
    }));

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

function pickQuantity(...candidates: unknown[]): number | undefined {
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** CDSC often puts qty only in the message: "Alloted quantity : 10" */
function quantityFromMessage(message: string): number | undefined {
  const patterns = [
    /allot(?:ed|ted)?\s*quantity\s*[:=\-–]?\s*(\d+)/i,
    /quantity\s*[:=\-–]?\s*(\d+)/i,
    /(\d+)\s*kitta/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
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
  const body =
    data.body && typeof data.body === 'object'
      ? (data.body as Record<string, unknown>)
      : null;
  const success = Boolean(data.success ?? data.ok ?? body?.success);
  const message = String(
    data.message ??
      data.msg ??
      data.error ??
      body?.message ??
      body?.msg ??
      (success ? 'OK' : 'No result'),
  );
  const quantity = pickQuantity(
    data.quantity,
    data.allotedQuantity,
    data.allottedQuantity,
    data.kitta,
    data.appliedKitta,
    data.shareQuantity,
    body?.quantity,
    body?.allotedQuantity,
    body?.allottedQuantity,
    body?.kitta,
    body?.shareQuantity,
    quantityFromMessage(message),
  );

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
  const isAllotted = allotted && !notAllotted;

  return {
    ok: true,
    allotted: isAllotted,
    quantity: isAllotted ? quantity : undefined,
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
