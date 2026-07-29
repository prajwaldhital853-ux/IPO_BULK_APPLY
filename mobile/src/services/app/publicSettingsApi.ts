import {
  DEFAULT_LEGAL_PAGES,
  mapLegalPages,
  type LegalPages,
} from '../../content/legalDefaults';
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

export type PopupNoticeItem = {
  id: string;
  kind: 'image' | 'text';
  imageUrl: string | null;
  text: string | null;
};

export type PublicSubscriptionPlan = {
  id: string;
  title: string;
  priceLabel: string;
  amountNpr: number;
  period: string;
  days: number;
  maxAccounts: number;
  perks: string[];
};

export type HomePromoSettings = {
  visible: boolean;
  text: string;
  action: string;
  color: string;
};

export type HomePromoPageKey =
  | 'home'
  | 'apply'
  | 'services'
  | 'check'
  | 'profile';

export type HomePromoPages = Record<HomePromoPageKey, HomePromoSettings>;

export type PublicAppSettings = {
  payment: PaymentSettings;
  contact: ContactSettings;
  popupNotice: { items: PopupNoticeItem[] };
  subscriptionPlans: PublicSubscriptionPlan[];
  appLogoUrl: string | null;
  homePromo: HomePromoSettings;
  homePromos: HomePromoPages;
  legalPages: LegalPages;
};

export const DEFAULT_HOME_PROMO: HomePromoSettings = {
  visible: true,
  text:
    'Add your MeroShare account to bulk apply for IPOs — tap here to get started',
  action: 'AddCapital',
  color: '#1B5E20',
};

export const HOME_PROMO_PAGE_KEYS: HomePromoPageKey[] = [
  'home',
  'apply',
  'services',
  'check',
  'profile',
];

export function defaultHomePromos(
  seed: HomePromoSettings = DEFAULT_HOME_PROMO,
): HomePromoPages {
  return {
    home: { ...seed },
    apply: { ...seed },
    services: { ...seed },
    check: { ...seed },
    profile: { ...seed },
  };
}

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
  popupNotice: { items: [] },
  subscriptionPlans: [],
  appLogoUrl: null,
  homePromo: { ...DEFAULT_HOME_PROMO },
  homePromos: defaultHomePromos(),
  legalPages: mapLegalPages(DEFAULT_LEGAL_PAGES),
};

function mapSubscriptionPlans(raw: unknown): PublicSubscriptionPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicSubscriptionPlan[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = String(row.id ?? '').trim();
    if (!id) continue;
    const amountNpr = Number(row.amountNpr ?? row.amount_npr ?? 0);
    const days = Number(row.days ?? 0);
    const maxAccounts = Number(row.maxAccounts ?? row.max_accounts ?? 50);
    if (!Number.isFinite(amountNpr) || amountNpr < 1) continue;
    const perksRaw = row.perks;
    const perks: string[] = [];
    if (Array.isArray(perksRaw)) {
      for (const p of perksRaw) {
        const s = String(p).trim();
        if (s) perks.push(s);
      }
    }
    out.push({
      id,
      title: String(row.title ?? id).trim() || id,
      priceLabel: String(row.priceLabel ?? row.price_label ?? `Rs ${amountNpr}`),
      amountNpr: Math.floor(amountNpr),
      period: String(row.period ?? '').trim() || `${Math.max(1, Math.floor(days))} days`,
      days: Math.max(1, Math.floor(days) || 30),
      maxAccounts: Math.max(1, Math.floor(maxAccounts) || 50),
      perks,
    });
  }
  return out;
}

function mapHomePromo(raw: unknown): HomePromoSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_HOME_PROMO };
  const row = raw as Record<string, unknown>;
  const text = String(row.text ?? '').trim();
  const action = String(row.action ?? DEFAULT_HOME_PROMO.action).trim();
  const visibleRaw = row.visible;
  const visible =
    typeof visibleRaw === 'boolean'
      ? visibleRaw
      : visibleRaw == null
        ? true
        : Boolean(Number(visibleRaw));
  let color = String(row.color ?? DEFAULT_HOME_PROMO.color).trim();
  if (!color.startsWith('#')) color = `#${color}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(color) && !/^#[0-9A-Fa-f]{3}$/.test(color)) {
    color = DEFAULT_HOME_PROMO.color;
  }
  return {
    visible,
    text: text || DEFAULT_HOME_PROMO.text,
    action: action || 'none',
    color: color.toUpperCase(),
  };
}

function mapHomePromos(
  raw: unknown,
  legacyHome: HomePromoSettings,
): HomePromoPages {
  const seed = legacyHome ?? DEFAULT_HOME_PROMO;
  const base = defaultHomePromos(seed);
  if (!raw || typeof raw !== 'object') return base;
  const row = raw as Record<string, unknown>;
  const out = { ...base };
  for (const key of HOME_PROMO_PAGE_KEYS) {
    if (row[key] != null) {
      out[key] = mapHomePromo(row[key]);
    }
  }
  return out;
}

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
    const rawItems = Array.isArray(notice.items) ? notice.items : [];
    const items: PopupNoticeItem[] = rawItems
      .map((entry, i) => {
        if (!entry || typeof entry !== 'object') return null;
        const row = entry as Record<string, unknown>;
        const id = String(row.id ?? '').trim() || `notice-${i}`;
        const text = String(row.text ?? '').trim();
        const rawImage = row.imageUrl ?? row.image_url;
        const kind =
          String(row.kind ?? '').toLowerCase() === 'text' || (text && !rawImage)
            ? 'text'
            : 'image';
        if (kind === 'text') {
          if (!text) return null;
          return { id, kind: 'text' as const, imageUrl: null, text };
        }
        if (!rawImage) return null;
        return {
          id,
          kind: 'image' as const,
          imageUrl: String(rawImage),
          text: null,
        };
      })
      .filter(Boolean) as PopupNoticeItem[];
    if (!items.length) {
      const legacy = notice.imageUrl ?? notice.image_url;
      if (legacy) {
        items.push({
          id: 'legacy',
          kind: 'image',
          imageUrl: String(legacy),
          text: null,
        });
      }
    }
    return {
      payment: mapPayment((json.payment as Record<string, unknown>) ?? {}),
      contact: mapContact((json.contact as Record<string, unknown>) ?? {}),
      popupNotice: { items },
      subscriptionPlans: mapSubscriptionPlans(
        json.subscriptionPlans ?? json.subscription_plans,
      ),
      appLogoUrl: json.appLogoUrl || json.app_logo_url
        ? String(json.appLogoUrl ?? json.app_logo_url)
        : null,
      homePromo: mapHomePromo(json.homePromo ?? json.home_promo),
      homePromos: (() => {
        const legacy = mapHomePromo(json.homePromo ?? json.home_promo);
        return mapHomePromos(json.homePromos ?? json.home_promos, legacy);
      })(),
      legalPages: mapLegalPages(json.legalPages ?? json.legal_pages),
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
