import { AUTH_API_BASE } from '../auth/config';
import { authFetch } from '../auth/http';

export type FeedbackKind = 'feedback' | 'feature_request';

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string | Array<{ msg?: string }> };
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      const parts = body.detail
        .map((item) => item?.msg)
        .filter((msg): msg is string => Boolean(msg));
      if (parts.length) return parts.join('\n');
    }
    return `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function submitFeedback(payload: {
  kind: FeedbackKind;
  name?: string;
  email?: string;
  message: string;
}): Promise<string> {
  const res = await authFetch('/app/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as { id?: string };
  return String(json.id ?? '');
}
