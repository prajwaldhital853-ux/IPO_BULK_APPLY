import { AUTH_API_BASE } from '../auth/config';
import { fetchWithTimeout } from '../auth/http';

export type AdminSubscriptionRow = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userCreatedAt: string;
  userAccessLevel: string;
  planId: string;
  planTitle: string;
  amountNpr: number;
  status: string;
  paymentNote: string | null;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  premiumActive: boolean;
  premiumExpiresAt: string | null;
};

export type AdminUserRow = {
  id: string;
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  accessLevel: 'free' | 'pending' | 'premium';
  premiumPlan: string | null;
  premiumExpiresAt: string | null;
  premiumSource: string | null;
  pendingRequest: {
    id: string;
    planId: string;
    planTitle: string;
    amountNpr: number;
    createdAt: string;
  } | null;
  subscriptionRequestCount: number;
  lastSubscriptionAt: string | null;
};

export type AdminStats = {
  pendingCount: number;
  activeCount: number;
  totalRequests: number;
  totalUsers: number;
  newFeedbackCount: number;
};

export type AdminPaymentSettings = {
  qrText: string;
  qrImageUrl: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  whatsapp: string;
  whatsappUrl: string;
};

export type AdminSocialLink = {
  id: string;
  platform: string;
  label: string;
  detail: string;
  url: string;
};

export type AdminContactSettings = {
  companyName: string;
  email: string;
  whatsapp: string;
  whatsappUrl: string;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  socialLinks: AdminSocialLink[];
};

export type AdminPopupNotice = {
  imageUrl: string | null;
};

export type AdminSettings = {
  adminEmail: string;
  payment: AdminPaymentSettings;
  contact: AdminContactSettings;
  popupNotice: AdminPopupNotice;
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function adminFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  return fetch(`${AUTH_API_BASE}${path}`, { ...init, headers });
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<{ accessToken: string; expiresIn: number; email: string }> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${AUTH_API_BASE}/admin/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      },
      60_000,
    );
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Network error: ${e.message}`
        : 'Network error contacting server',
    );
  }

  if (!res.ok) {
    const detail = await parseError(res);
    if (res.status === 401) {
      throw new Error(
        detail ||
          'Invalid admin email or password. Use the email/password set on the server (ADMIN_EMAIL / ADMIN_PASSWORD).',
      );
    }
    throw new Error(detail);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const accessToken = String(json.accessToken ?? json.access_token ?? '');
  if (!accessToken || accessToken === 'undefined') {
    throw new Error('Login succeeded but no access token was returned');
  }
  return {
    accessToken,
    expiresIn: Number(json.expiresIn ?? json.expires_in ?? 86400),
    email: String(json.email ?? email.trim()),
  };
}

export async function fetchAdminStats(token: string): Promise<AdminStats> {
  const res = await adminFetch('/admin/stats', token);
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>;
  return {
    pendingCount: Number(json.pendingCount ?? 0),
    activeCount: Number(json.activeCount ?? 0),
    totalRequests: Number(json.totalRequests ?? 0),
    totalUsers: Number(json.totalUsers ?? 0),
    newFeedbackCount: Number(json.newFeedbackCount ?? 0),
  };
}

function mapUserRow(json: Record<string, unknown>): AdminUserRow {
  const pendingRaw = json.pendingRequest as Record<string, unknown> | null | undefined;
  return {
    id: String(json.id),
    googleSub: String(json.googleSub ?? ''),
    email: String(json.email ?? ''),
    name: String(json.name ?? ''),
    avatarUrl: json.avatarUrl ? String(json.avatarUrl) : null,
    createdAt: String(json.createdAt ?? ''),
    accessLevel: (json.accessLevel as AdminUserRow['accessLevel']) ?? 'free',
    premiumPlan: json.premiumPlan ? String(json.premiumPlan) : null,
    premiumExpiresAt: json.premiumExpiresAt ? String(json.premiumExpiresAt) : null,
    premiumSource: json.premiumSource ? String(json.premiumSource) : null,
    pendingRequest: pendingRaw
      ? {
          id: String(pendingRaw.id),
          planId: String(pendingRaw.planId),
          planTitle: String(pendingRaw.planTitle),
          amountNpr: Number(pendingRaw.amountNpr ?? 0),
          createdAt: String(pendingRaw.createdAt),
        }
      : null,
    subscriptionRequestCount: Number(json.subscriptionRequestCount ?? 0),
    lastSubscriptionAt: json.lastSubscriptionAt ? String(json.lastSubscriptionAt) : null,
  };
}

export async function fetchAdminUsers(
  token: string,
  access?: string,
): Promise<AdminUserRow[]> {
  const q = access && access !== 'all' ? `?access=${encodeURIComponent(access)}` : '';
  const res = await adminFetch(`/admin/users${q}`, token);
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map((row) => mapUserRow(row));
}

function mapRow(json: Record<string, unknown>): AdminSubscriptionRow {
  return {
    id: String(json.id),
    userId: String(json.userId),
    userEmail: String(json.userEmail),
    userName: String(json.userName),
    userCreatedAt: String(json.userCreatedAt ?? ''),
    userAccessLevel: String(json.userAccessLevel ?? 'free'),
    planId: String(json.planId),
    planTitle: String(json.planTitle),
    amountNpr: Number(json.amountNpr ?? 0),
    status: String(json.status),
    paymentNote: json.paymentNote ? String(json.paymentNote) : null,
    adminNote: json.adminNote ? String(json.adminNote) : null,
    createdAt: String(json.createdAt),
    reviewedAt: json.reviewedAt ? String(json.reviewedAt) : null,
    premiumActive: Boolean(json.premiumActive),
    premiumExpiresAt: json.premiumExpiresAt ? String(json.premiumExpiresAt) : null,
  };
}

export async function fetchAdminSubscriptions(
  token: string,
  status?: string,
): Promise<AdminSubscriptionRow[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await adminFetch(`/admin/subscriptions${q}`, token);
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map((row) => mapRow(row));
}

export async function approveSubscription(
  token: string,
  requestId: string,
  adminNote?: string,
): Promise<AdminSubscriptionRow> {
  const res = await adminFetch(`/admin/subscriptions/${requestId}/approve`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminNote }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapRow((await res.json()) as Record<string, unknown>);
}

export async function rejectSubscription(
  token: string,
  requestId: string,
  adminNote?: string,
): Promise<AdminSubscriptionRow> {
  const res = await adminFetch(`/admin/subscriptions/${requestId}/reject`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminNote }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapRow((await res.json()) as Record<string, unknown>);
}

export async function deactivateUserPremium(
  token: string,
  userId: string,
  adminNote?: string,
): Promise<void> {
  const res = await adminFetch(`/admin/users/${userId}/deactivate`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminNote }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteUserSubscription(
  token: string,
  userId: string,
): Promise<void> {
  const res = await adminFetch(`/admin/users/${userId}/subscription`, token, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

function mapPaymentSettings(json: Record<string, unknown>): AdminPaymentSettings {
  const rawUrl = json.qrImageUrl ?? json.qr_image_url;
  return {
    qrText: String(json.qrText ?? ''),
    qrImageUrl: rawUrl ? String(rawUrl) : null,
    bankName: String(json.bankName ?? ''),
    accountName: String(json.accountName ?? ''),
    accountNumber: String(json.accountNumber ?? ''),
    whatsapp: String(json.whatsapp ?? ''),
    whatsappUrl: String(json.whatsappUrl ?? ''),
  };
}

function mapSocialLinks(raw: unknown): AdminSocialLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AdminSocialLink[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    let id = String(row.id ?? '').trim() || `link-${i}`;
    if (seen.has(id)) id = `link-${i}-${Date.now()}`;
    seen.add(id);
    out.push({
      id,
      platform: String(row.platform ?? 'custom').trim().toLowerCase() || 'custom',
      label: String(row.label ?? 'Link').trim() || 'Link',
      detail: String(row.detail ?? '').trim(),
      url: String(row.url ?? '').trim(),
    });
  });
  return out;
}

function mapContactSettings(json: Record<string, unknown>): AdminContactSettings {
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
        detail: 'Open profile',
        url: tiktokUrl,
      });
    }
  }
  return {
    companyName: String(json.companyName ?? ''),
    email: String(json.email ?? ''),
    whatsapp: String(json.whatsapp ?? ''),
    whatsappUrl: String(json.whatsappUrl ?? ''),
    facebookUrl,
    tiktokUrl,
    socialLinks,
  };
}

function mapAdminSettings(json: Record<string, unknown>): AdminSettings {
  const notice = (json.popupNotice ?? json.popup_notice ?? {}) as Record<
    string,
    unknown
  >;
  const rawImage = notice.imageUrl ?? notice.image_url;
  return {
    adminEmail: String(json.adminEmail ?? ''),
    payment: mapPaymentSettings((json.payment as Record<string, unknown>) ?? {}),
    contact: mapContactSettings((json.contact as Record<string, unknown>) ?? {}),
    popupNotice: {
      imageUrl: rawImage ? String(rawImage) : null,
    },
  };
}

export async function fetchAdminSettings(token: string): Promise<AdminSettings> {
  const res = await adminFetch('/admin/settings', token);
  if (!res.ok) throw new Error(await parseError(res));
  return mapAdminSettings((await res.json()) as Record<string, unknown>);
}

export async function updateAdminSettings(
  token: string,
  payload: {
    payment?: Omit<AdminPaymentSettings, 'whatsappUrl' | 'qrImageUrl'> & {
      qrImageBase64?: string;
      clearQrImage?: boolean;
    };
    contact?: AdminContactSettings;
    popupNotice?: {
      imageBase64?: string;
      clearImage?: boolean;
    };
  },
): Promise<AdminSettings> {
  const res = await adminFetch('/admin/settings', token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapAdminSettings((await res.json()) as Record<string, unknown>);
}

export async function uploadAdminPaymentQr(
  token: string,
  uri: string,
  mimeType = 'image/jpeg',
  _fileName = 'payment-qr.jpg',
): Promise<AdminSettings> {
  // Prefer JSON base64 via existing PUT /admin/settings (works without multipart).
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result ?? '');
      const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      if (!raw) reject(new Error('Could not read image'));
      else resolve(raw);
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });

  const current = await fetchAdminSettings(token);
  return updateAdminSettings(token, {
    payment: {
      qrText: current.payment.qrText,
      bankName: current.payment.bankName,
      accountName: current.payment.accountName,
      accountNumber: current.payment.accountNumber,
      whatsapp: current.payment.whatsapp,
      qrImageBase64: `data:${mimeType || blob.type || 'image/jpeg'};base64,${base64}`,
    },
    contact: current.contact,
  });
}

export async function deleteAdminPaymentQr(token: string): Promise<AdminSettings> {
  const current = await fetchAdminSettings(token);
  return updateAdminSettings(token, {
    payment: {
      qrText: current.payment.qrText,
      bankName: current.payment.bankName,
      accountName: current.payment.accountName,
      accountNumber: current.payment.accountNumber,
      whatsapp: current.payment.whatsapp,
      clearQrImage: true,
    },
    contact: current.contact,
  });
}

async function imageUriToDataUrl(
  uri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result ?? '');
      const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      if (!raw) reject(new Error('Could not read image'));
      else resolve(raw);
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
  const mime = mimeType || blob.type || 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

export async function uploadAdminPopupNotice(
  token: string,
  uri: string,
  mimeType = 'image/jpeg',
): Promise<AdminSettings> {
  const dataUrl = await imageUriToDataUrl(uri, mimeType);
  return updateAdminSettings(token, {
    popupNotice: { imageBase64: dataUrl },
  });
}

export async function deleteAdminPopupNotice(
  token: string,
): Promise<AdminSettings> {
  return updateAdminSettings(token, {
    popupNotice: { clearImage: true },
  });
}

export async function changeAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await adminFetch('/admin/password/change', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function requestAdminPasswordReset(email: string): Promise<string> {
  const res = await fetch(`${AUTH_API_BASE}/admin/password/forgot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as { message?: string };
  return json.message ?? 'If that email is registered as admin, a verification code was sent.';
}

export async function resetAdminPassword(
  email: string,
  otp: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${AUTH_API_BASE}/admin/password/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, otp, newPassword }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export type AdminFeedbackRow = {
  id: string;
  kind: 'feedback' | 'feature_request';
  name: string;
  email: string;
  message: string;
  userId: string | null;
  status: 'new' | 'read' | 'resolved';
  createdAt: string;
};

function mapFeedbackRow(json: Record<string, unknown>): AdminFeedbackRow {
  return {
    id: String(json.id),
    kind: (json.kind as AdminFeedbackRow['kind']) ?? 'feedback',
    name: String(json.name ?? ''),
    email: String(json.email ?? ''),
    message: String(json.message ?? ''),
    userId: json.userId ? String(json.userId) : null,
    status: (json.status as AdminFeedbackRow['status']) ?? 'new',
    createdAt: String(json.createdAt ?? ''),
  };
}

export async function fetchAdminFeedback(
  token: string,
  filters?: { kind?: string; status?: string },
): Promise<AdminFeedbackRow[]> {
  const params = new URLSearchParams();
  if (filters?.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  const q = params.toString();
  const res = await adminFetch(`/admin/feedback${q ? `?${q}` : ''}`, token);
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map((row) => mapFeedbackRow(row));
}

export async function updateAdminFeedbackStatus(
  token: string,
  feedbackId: string,
  status: AdminFeedbackRow['status'],
): Promise<AdminFeedbackRow> {
  const res = await adminFetch(`/admin/feedback/${feedbackId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapFeedbackRow((await res.json()) as Record<string, unknown>);
}
