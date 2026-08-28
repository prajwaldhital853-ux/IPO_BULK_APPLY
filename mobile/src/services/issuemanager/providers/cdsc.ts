import { companyKey, imFetch } from '../http';
import {
  CDSC_BACKEND_URL,
  cdscBackendHeaders,
} from '../backendConfig';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

type CompanyRow = {
  id: number;
  name: string;
  scrip?: string | null;
  firstSeenAt?: number | null;
};
type CheckRow = {
  boid: string;
  ok: boolean;
  allotted: boolean;
  quantity?: number | null;
  message: string;
  cached?: boolean;
};

function backendError(res: {
  status: number;
  json: unknown;
  text: string;
}, fallback: string): string {
  const detail = (res.json as { detail?: string } | null)?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return `CDSC backend: ${detail.trim()}`;
  }
  return fallback;
}

async function listCompanies(): Promise<IssueManagerCompany[]> {
  const res = await imFetch(`${CDSC_BACKEND_URL}/cdsc/companies`, {
    method: 'GET',
    headers: await cdscBackendHeaders(),
    credentials: 'omit',
    timeoutMs: 45_000,
  });
  if (res.status !== 200 || !res.json) {
    throw new Error(
      backendError(
        res,
        `CDSC backend: companies failed (HTTP ${res.status})`,
      ),
    );
  }
  const rows = (res.json as { companies?: CompanyRow[] }).companies ?? [];
  return rows
    .filter((r) => r.id != null && r.name)
    .map((r) => {
      const rawId = String(r.id);
      const scrip = r.scrip?.trim() || undefined;
      const listedAt =
        typeof r.firstSeenAt === 'number' && r.firstSeenAt > 0
          ? r.firstSeenAt
          : undefined;
      return {
        key: companyKey('cdsc', rawId),
        provider: 'cdsc',
        rawId,
        name: r.name.trim(),
        providerLabel: 'CDSC portal (fallback)',
        scrip,
        listedAt,
      };
    });
}

async function checkBoid(
  company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  const res = await imFetch(`${CDSC_BACKEND_URL}/cdsc/check`, {
    method: 'POST',
    headers: await cdscBackendHeaders(),
    credentials: 'omit',
    // CDSC solve + submit can take a few seconds per BOID.
    timeoutMs: 90_000,
    body: JSON.stringify({
      companyShareId: Number(company.rawId) || company.rawId,
      boids: [boid],
    }),
  });

  if (res.status !== 200 || !res.json) {
    return {
      ok: false,
      allotted: false,
      message: `CDSC backend check failed (HTTP ${res.status})`,
    };
  }

  const rows = (res.json as { results?: CheckRow[] }).results ?? [];
  const row = rows[0];
  if (!row) {
    return { ok: false, allotted: false, message: 'CDSC backend: empty result' };
  }
  return {
    ok: row.ok,
    allotted: row.allotted,
    quantity: row.quantity ?? undefined,
    message: row.message,
  };
}

export const cdscProvider: IssueManagerProvider = {
  id: 'cdsc',
  label: 'CDSC portal (fallback)',
  listCompanies,
  checkBoid,
};
