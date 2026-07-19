import { authFetch, SESSION_EXPIRED_MESSAGE } from './http';

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    const detail = body.detail ?? `HTTP ${res.status}`;
    if (detail === 'User not found' || detail === 'Missing bearer token') {
      return SESSION_EXPIRED_MESSAGE;
    }
    return detail;
  } catch {
    return res.status === 401 ? SESSION_EXPIRED_MESSAGE : `HTTP ${res.status}`;
  }
}

export async function sendPinResetOtp(): Promise<{ message: string; email: string }> {
  const res = await authFetch('/auth/pin/send-otp', { method: 'POST' });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>;
  return {
    message: String(json.message ?? 'Verification code sent'),
    email: String(json.email ?? ''),
  };
}

export async function verifyPinResetOtp(otp: string): Promise<void> {
  const res = await authFetch('/auth/pin/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
