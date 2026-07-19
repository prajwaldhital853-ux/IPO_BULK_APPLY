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

export type ContactSettings = {
  companyName: string;
  email: string;
  whatsapp: string;
  whatsappUrl: string;
  facebookUrl: string | null;
  tiktokUrl: string | null;
};

export type PublicAppSettings = {
  payment: PaymentSettings;
  contact: ContactSettings;
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
  },
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

function mapContact(json: Record<string, unknown>): ContactSettings {
  return {
    companyName: String(json.companyName ?? FALLBACK.contact.companyName),
    email: String(json.email ?? FALLBACK.contact.email),
    whatsapp: String(json.whatsapp ?? FALLBACK.contact.whatsapp),
    whatsappUrl: String(json.whatsappUrl ?? FALLBACK.contact.whatsappUrl),
    facebookUrl: json.facebookUrl ? String(json.facebookUrl) : null,
    tiktokUrl: json.tiktokUrl ? String(json.tiktokUrl) : null,
  };
}

export async function fetchPublicAppSettings(): Promise<PublicAppSettings> {
  try {
    const res = await fetch(`${AUTH_API_BASE}/app/public-settings`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as Record<string, unknown>;
    return {
      payment: mapPayment((json.payment as Record<string, unknown>) ?? {}),
      contact: mapContact((json.contact as Record<string, unknown>) ?? {}),
    };
  } catch {
    return FALLBACK;
  }
}
