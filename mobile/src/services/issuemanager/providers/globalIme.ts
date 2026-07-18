import { companyKey, imFetch } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

const API = 'https://globalimecapital.com/api/v1/public';
const ORIGIN = 'https://www.globalimecapital.com';
const REFERER = `${ORIGIN}/ipo-fpo-share-allotment-check`;

type CompanyRow = {
  id?: number | string;
  name?: string;
  slug?: string;
  type?: string;
};

type ListPayload = {
  status?: string;
  data?: CompanyRow[];
  message?: string;
};

type CheckPayload = {
  status?: string;
  message?: string;
  data?: {
    allotted_kitta?: number | string;
    alloted_kitta?: number | string;
    quantity?: number | string;
    kitta?: number | string;
    [key: string]: unknown;
  };
};

function qtyFrom(data: Record<string, unknown> | undefined): number | undefined {
  if (!data) return undefined;
  for (const k of [
    'allotted_kitta',
    'alloted_kitta',
    'kitta',
    'qty',
    'quantity',
  ]) {
    const v = data[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v != null && String(v).trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

async function listCompanies(): Promise<IssueManagerCompany[]> {
  const res = await imFetch(
    `${API}/companies?type=share-allotment-check`,
    {
      method: 'GET',
      headers: {
        Origin: ORIGIN,
        Referer: REFERER,
      },
    },
  );
  if (res.status !== 200 || !res.json) {
    throw new Error(
      `Global IME Capital: company list failed (HTTP ${res.status})`,
    );
  }
  const body = res.json as ListPayload;
  const rows = body.data ?? [];
  return rows
    .filter((r) => r.id != null && r.name)
    .map((r) => {
      const rawId = String(r.id);
      return {
        key: companyKey('global_ime', rawId),
        provider: 'global_ime',
        rawId,
        name: String(r.name).trim(),
        providerLabel: 'Global IME Capital',
      };
    });
}

async function checkBoid(
  company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  const res = await imFetch(`${API}/share-allotment-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Referer: REFERER,
    },
    body: JSON.stringify({
      boid,
      company_id: Number(company.rawId) || company.rawId,
    }),
  });

  const body = (res.json ?? {}) as CheckPayload;
  const msg = (body.message || '').toLowerCase();

  // Not allotted / no match
  if (
    res.status === 422 ||
    msg.includes('did not match') ||
    msg.includes('not alloted') ||
    msg.includes('not allotted')
  ) {
    return {
      ok: true,
      allotted: false,
      message: body.message || 'Not allotted',
    };
  }

  if (res.status !== 200) {
    return {
      ok: false,
      allotted: false,
      message: body.message || `Global IME check failed (HTTP ${res.status})`,
    };
  }

  const quantity = qtyFrom(body.data as Record<string, unknown> | undefined);
  const allotted =
    body.status === 'success' ||
    quantity != null ||
    msg.includes('congrat') ||
    msg.includes('allot');

  if (!allotted) {
    return {
      ok: true,
      allotted: false,
      message: body.message || 'Not allotted',
    };
  }

  return {
    ok: true,
    allotted: true,
    quantity,
    message:
      quantity != null
        ? `Allotted ${quantity} kitta`
        : body.message || 'Allotted',
  };
}

export const globalImeProvider: IssueManagerProvider = {
  id: 'global_ime',
  label: 'Global IME Capital',
  listCompanies,
  checkBoid,
};
