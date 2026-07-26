import { AUTH_API_BASE } from '../auth/config';

export type PaymentSettings = {
  qrText: string;
  qrImageUrl: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  whatsapp: string;
  whatsappUrl: string;
};

export type SocialLink = {
  id: string;
  platform: string;
  label: string;
  detail: string;
  url: string;
};

export type ContactSettings = {
  companyName: string;
  email: string;
  whatsapp: string;
  whatsappUrl: string;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  socialLinks: SocialLink[];
};

export type PublicAppSettings = {
  payment: PaymentSettings;
  contact: ContactSettings;
  popupNotice: { imageUrl: string | null };
};

const FALLBACK: PublicAppSettings = {
  payment: {
    qrText: 'NEPSE GHAR Premium|Kalash Financial Solution',
    qrImageUrl: null,
    bankName: 'Kalash Financial Solution Pvt. Ltd.',
    accountName: 'Kalash Financial Solution',
    accountNumber: '0123456789',
    whatsapp: '9779709133067',
    whatsappUrl: 'https://wa.me/9779709133067',
  },
  contact: {
    companyName: 'Kalash Financial Solution Pvt. Ltd.',
    email: 'kalashfinancialsolution@gmail.com',
    whatsapp: '9709133067',
    whatsappUrl: 'https://wa.me/9779709133067',
    facebookUrl: null,
    tiktokUrl: 'https://www.tiktok.com/@unique_share_market',
    socialLinks: [
      {
        id: 'fallback-tiktok',
        platform: 'tiktok',
        label: 'TikTok',
        detail: '@unique_share_market',
        url: 'https://www.tiktok.com/@unique_share_market',
      },
    ],
  },
  popupNotice: { imageUrl: null },
};

function mapPayment(json: Record<string, unknown>): PaymentSettings {
  const rawImage = json.qrImageUrl ?? json.qr_image_url;
  return {
    qrText: String(json.qrText ?? FALLBACK.payment.qrText),
    qrImageUrl: rawImage ? String(rawImage) : null,
    bankName: String(json.bankName ?? FALLBACK.payment.bankName),
    accountName: String(json.accountName ?? FALLBACK.payment.accountName),
    accountNumber: String(json.accountNumber ?? FALLBACK.payment.accountNumber),
    whatsapp: String(json.whatsapp ?? FALLBACK.payment.whatsapp),
    whatsappUrl: String(json.whatsappUrl ?? FALLBACK.payment.whatsappUrl),
  };
}

function mapSocialLinks(raw: unknown): SocialLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SocialLink[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    const label = String(row.label ?? row.platform ?? 'Link').trim();
    if (!url && !label) return;
    let id = String(row.id ?? '').trim() || `link-${i}`;
    if (seen.has(id)) id = `link-${i}-${Date.now()}`;
    seen.add(id);
    out.push({
      id,
      platform: String(row.platform ?? 'custom').trim().toLowerCase() || 'custom',
      label: label || 'Link',
      detail: String(row.detail ?? '').trim(),
      url,
    });
  });
  return out;
}

function mapContact(json: Record<string, unknown>): ContactSettings {
  let socialLinks = mapSocialLinks(json.socialLinks ?? json.social_links);
  const facebookUrl = json.facebookUrl ? String(json.facebookUrl) : null;
  const tiktokUrl = json.tiktokUrl ? String(json.tiktokUrl) : null;
  if (!socialLinks.length) {
    if (facebookUrl) {
      socialLinks.push({
        id: 'legacy-facebook',
        platform: 'facebook',
        label: 'Facebook',
        detail: 'Open page',
        url: facebookUrl,
      });
    }
    if (tiktokUrl) {
      socialLinks.push({
        id: 'legacy-tiktok',
        platform: 'tiktok',
        label: 'TikTok',
        detail: tiktokUrl
          .replace(/^https?:\/\/(www\.)?tiktok\.com\//, '@'),
        url: tiktokUrl,
      });
    }
  }
  return {
    companyName: String(json.companyName ?? FALLBACK.contact.companyName),
    email: String(json.email ?? FALLBACK.contact.email),
    whatsapp: String(json.whatsapp ?? FALLBACK.contact.whatsapp),
    whatsappUrl: String(json.whatsappUrl ?? FALLBACK.contact.whatsappUrl),
    facebookUrl,
    tiktokUrl,
    socialLinks,
  };
}

export async function fetchPublicAppSettings(): Promise<PublicAppSettings> {
  try {
    const res = await fetch(`${AUTH_API_BASE}/app/public-settings`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as Record<string, unknown>;
    const notice = (json.popupNotice ?? json.popup_notice ?? {}) as Record<
      string,
      unknown
    >;
    const rawNotice = notice.imageUrl ?? notice.image_url;
    return {
      payment: mapPayment((json.payment as Record<string, unknown>) ?? {}),
      contact: mapContact((json.contact as Record<string, unknown>) ?? {}),
      popupNotice: {
        imageUrl: rawNotice ? String(rawNotice) : null,
      },
    };
  } catch {
    return FALLBACK;
  }
}

/** Resolve relative API image paths against AUTH_API_BASE. */
export function resolvePublicMediaUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${AUTH_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
