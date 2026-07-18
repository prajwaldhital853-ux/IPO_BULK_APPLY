import { AUTH_API_BASE } from './config';
import { authFetch } from './http';

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
  const pendingRaw = json.pendingRequest as Record<string, unknown> | null | undefined;
  return {
    active: Boolean(json.active),
    plan: json.plan ? String(json.plan) : null,
    expiresAt: json.expiresAt ? String(json.expiresAt) : null,
    status: (json.status as SubscriptionStatus['status']) ?? 'free',
    pendingRequest: pendingRaw
      ? {
          id: String(pendingRaw.id),
          planId: String(pendingRaw.planId),
          planTitle: String(pendingRaw.planTitle),
          amountNpr: Number(pendingRaw.amountNpr ?? 0),
          status: String(pendingRaw.status),
          paymentNote: pendingRaw.paymentNote ? String(pendingRaw.paymentNote) : null,
          createdAt: String(pendingRaw.createdAt),
        }
      : null,
  };
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
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
