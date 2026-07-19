import { AUTH_API_BASE } from './config';
import { authFetch, SESSION_EXPIRED_MESSAGE } from './http';

export type PendingSubscription = {
  id: string;
  planId: string;
  planTitle: string;
  amountNpr: number;
  status: string;
  paymentNote: string | null;
  createdAt: string;
};

export type SubscriptionStatus = {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  status: 'free' | 'pending' | 'active';
  pendingRequest: PendingSubscription | null;
};

export type PaymentInfo = {
  qrText: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  whatsappUrl: string;
};

function mapStatus(json: Record<string, unknown>): SubscriptionStatus {
  const pendingRaw =
    (json.pendingRequest as Record<string, unknown> | null | undefined) ??
    (json.pending_request as Record<string, unknown> | null | undefined);
  const expiresAtRaw = json.expiresAt ?? json.expires_at;
  const active = Boolean(json.active);
  return {
    active,
    plan: json.plan ? String(json.plan) : null,
    expiresAt: expiresAtRaw ? String(expiresAtRaw) : null,
    status:
      (json.status as SubscriptionStatus['status']) ??
      (active ? 'active' : pendingRaw ? 'pending' : 'free'),
    pendingRequest: pendingRaw
      ? {
          id: String(pendingRaw.id),
          planId: String(pendingRaw.planId ?? pendingRaw.plan_id),
          planTitle: String(pendingRaw.planTitle ?? pendingRaw.plan_title),
          amountNpr: Number(pendingRaw.amountNpr ?? pendingRaw.amount_npr ?? 0),
          status: String(pendingRaw.status),
          paymentNote: pendingRaw.paymentNote
            ? String(pendingRaw.paymentNote)
            : pendingRaw.payment_note
              ? String(pendingRaw.payment_note)
              : null,
          createdAt: String(pendingRaw.createdAt ?? pendingRaw.created_at),
        }
      : null,
  };
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    const detail = body.detail ?? `HTTP ${res.status}`;
    if (detail === 'Missing bearer token') return SESSION_EXPIRED_MESSAGE;
    return detail;
  } catch {
    return res.status === 401 ? SESSION_EXPIRED_MESSAGE : `HTTP ${res.status}`;
  }
}

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatus | null> {
  const res = await authFetch('/auth/subscription/status');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(await parseError(res));
  return mapStatus((await res.json()) as Record<string, unknown>);
}

export async function fetchPaymentInfo(): Promise<PaymentInfo> {
  const res = await fetch(`${AUTH_API_BASE}/auth/subscription/payment-info`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>;
  return {
    qrText: String(json.qrText ?? ''),
    bankName: String(json.bankName ?? ''),
    accountName: String(json.accountName ?? ''),
    accountNumber: String(json.accountNumber ?? ''),
    whatsappUrl: String(json.whatsappUrl ?? ''),
  };
}

export async function submitSubscriptionRequest(
  planId: string,
  paymentNote?: string,
): Promise<SubscriptionStatus> {
  const res = await authFetch('/auth/subscription/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, paymentNote }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapStatus((await res.json()) as Record<string, unknown>);
}

export async function cancelPendingSubscription(): Promise<SubscriptionStatus> {
  const res = await authFetch('/auth/subscription/cancel-pending', {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapStatus((await res.json()) as Record<string, unknown>);
}
