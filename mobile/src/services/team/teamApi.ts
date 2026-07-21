import { AUTH_API_BASE } from '../auth/config';

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  email: string | null;
  whatsapp: string | null;
  accent: string;
  photoUrl: string | null;
  sortOrder: number;
};

export type TeamMemberInput = {
  name: string;
  role?: string;
  bio?: string;
  email?: string | null;
  whatsapp?: string | null;
  accent?: string;
  sortOrder?: number;
  /** data URL or raw base64 for a new photo. */
  photoBase64?: string | null;
  clearPhoto?: boolean;
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function mapMember(json: Record<string, unknown>): TeamMember {
  const rawPhoto = json.photoUrl ?? json.photo_url;
  const photoUrl = rawPhoto
    ? String(rawPhoto).startsWith('http')
      ? String(rawPhoto)
      : `${AUTH_API_BASE}${String(rawPhoto)}`
    : null;
  return {
    id: String(json.id),
    name: String(json.name ?? ''),
    role: String(json.role ?? ''),
    bio: String(json.bio ?? ''),
    email: json.email ? String(json.email) : null,
    whatsapp: json.whatsapp ? String(json.whatsapp) : null,
    accent: String(json.accent ?? '#42A5F5'),
    photoUrl,
    sortOrder: Number(json.sortOrder ?? json.sort_order ?? 0),
  };
}

/** Public: anyone can list team members (used by Profile > Team Members). */
export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const res = await fetch(`${AUTH_API_BASE}/app/team`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map(mapMember);
}

function adminHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function adminFetchTeam(token: string): Promise<TeamMember[]> {
  const res = await fetch(`${AUTH_API_BASE}/admin/team`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const json = (await res.json()) as Record<string, unknown>[];
  return json.map(mapMember);
}

export async function adminCreateTeamMember(
  token: string,
  input: TeamMemberInput,
): Promise<TeamMember> {
  const res = await fetch(`${AUTH_API_BASE}/admin/team`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapMember((await res.json()) as Record<string, unknown>);
}

export async function adminUpdateTeamMember(
  token: string,
  id: string,
  input: TeamMemberInput,
): Promise<TeamMember> {
  const res = await fetch(`${AUTH_API_BASE}/admin/team/${id}`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return mapMember((await res.json()) as Record<string, unknown>);
}

export async function adminDeleteTeamMember(
  token: string,
  id: string,
): Promise<void> {
  const res = await fetch(`${AUTH_API_BASE}/admin/team/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(await parseError(res));
}
