import { authFetch } from '../auth/http';

export type CloudNote = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : text || `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data as T;
}

export async function listNotes(): Promise<CloudNote[]> {
  const res = await authFetch('/app/notes');
  return readJson<CloudNote[]>(res);
}

export async function createNote(input: {
  title: string;
  body: string;
  pinned?: boolean;
}): Promise<CloudNote> {
  const res = await authFetch('/app/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      pinned: Boolean(input.pinned),
    }),
  });
  return readJson<CloudNote>(res);
}

export async function updateNote(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean },
): Promise<CloudNote> {
  const res = await authFetch(`/app/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readJson<CloudNote>(res);
}

export async function deleteNote(id: string): Promise<void> {
  const res = await authFetch(`/app/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await readJson<{ ok: boolean }>(res);
}
