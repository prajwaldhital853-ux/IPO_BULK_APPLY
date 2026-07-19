export type PendingPremiumInfo = {
  id: string;
  planId: string;
  planTitle: string;
  amountNpr: number;
  status: string;
  paymentNote: string | null;
  createdAt: string;
};

export type PremiumInfo = {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  status: 'free' | 'pending' | 'active';
  pendingRequest: PendingPremiumInfo | null;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
  premium: PremiumInfo;
};

export type MeResponse = {
  user: AuthUser;
  premium: PremiumInfo;
};

function mapUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: String(raw.id),
    email: String(raw.email ?? ''),
    name: String(raw.name ?? ''),
    avatarUrl: raw.avatarUrl ? String(raw.avatarUrl) : null,
  };
}

function mapPremium(raw: Record<string, unknown>): PremiumInfo {
  const pendingRaw =
    (raw.pendingRequest as Record<string, unknown> | null | undefined) ??
    (raw.pending_request as Record<string, unknown> | null | undefined);
  const expiresAtRaw = raw.expiresAt ?? raw.expires_at;
  const active = Boolean(raw.active);
  return {
    active,
    plan: raw.plan ? String(raw.plan) : null,
    expiresAt: expiresAtRaw ? String(expiresAtRaw) : null,
    status:
      (raw.status as PremiumInfo['status']) ??
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

function mapSession(json: Record<string, unknown>): AuthSession {
  return {
    accessToken: String(json.accessToken),
    refreshToken: String(json.refreshToken),
    expiresIn: Number(json.expiresIn ?? 900),
    user: mapUser(json.user as Record<string, unknown>),
    premium: mapPremium(json.premium as Record<string, unknown>),
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

export async function authGoogle(idToken: string, baseUrl: string): Promise<AuthSession> {
  const res = await fetch(`${baseUrl}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapSession((await res.json()) as Record<string, unknown>);
}

export async function authRefresh(
  refreshToken: string,
  baseUrl: string,
): Promise<AuthSession> {
  const res = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapSession((await res.json()) as Record<string, unknown>);
}

export async function authLogout(
  accessToken: string,
  refreshToken: string | null,
  baseUrl: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refreshToken: refreshToken ?? undefined }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function authMe(accessToken: string, baseUrl: string): Promise<MeResponse> {
  const res = await fetch(`${baseUrl}/auth/me`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>;
  return {
    user: mapUser(json.user as Record<string, unknown>),
    premium: mapPremium(json.premium as Record<string, unknown>),
  };
}
