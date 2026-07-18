import { companyKey, imFetch } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

const API = 'https://api.rbbmbl.com.np/api';
const ORIGIN = 'https://www.rbbmbl.com.np';

type CompanyRow = { id?: number | string; name?: string };

type CheckPayload = {
  message?: string;
  allotted_data?: number | string;
  total?: number | string;
  error?: Record<string, string[]>;
};

async function listCompanies(): Promise<IssueManagerCompany[]> {
  const res = await imFetch(`${API}/company/ipo-result-check`, {
    method: 'GET',
    headers: { Origin: ORIGIN, Referer: `${ORIGIN}/result/allotment-result-check` },
  });
  if (res.status !== 200 || !Array.isArray(res.json)) {
    throw new Error(
      `RBB Merchant Banking: company list failed (HTTP ${res.status})`,
    );
  }
  const rows = res.json as CompanyRow[];
  return rows
    .filter((r) => r.id != null && r.name)
    .map((r) => {
      const rawId = String(r.id);
      return {
        key: companyKey('rbb', rawId),
        provider: 'rbb',
        rawId,
        name: String(r.name).trim(),
        providerLabel: 'RBB Merchant Banking',
      };
    });
}

async function checkBoid(
  company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  const res = await imFetch(`${API}/ipo-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Referer: `${ORIGIN}/result/allotment-result-check`,
    },
    body: JSON.stringify({
      company_id: Number(company.rawId) || company.rawId,
      boid,
    }),
  });

  const body = (res.json ?? {}) as CheckPayload;
  const msg = (body.message || '').toLowerCase();

  if (
    res.status === 422 ||
    msg.includes('not allotted') ||
    msg.includes('not alloted')
  ) {
    return {
      ok: true,
      allotted: false,
      message: body.message || 'Not allotted',
    };
  }

  if (res.status === 401 || res.status === 400) {
    // validation / not allotted style errors
    if (msg.includes('not allot') || msg.includes('sorry')) {
      return { ok: true, allotted: false, message: body.message || 'Not allotted' };
    }
    return {
      ok: false,
      allotted: false,
      message: body.message || `RBB check failed (HTTP ${res.status})`,
    };
  }

  if (res.status !== 200) {
    return {
      ok: false,
      allotted: false,
      message: body.message || `RBB check failed (HTTP ${res.status})`,
    };
  }

  const qtyRaw = body.allotted_data ?? body.total;
  const quantity =
    typeof qtyRaw === 'number'
      ? qtyRaw
      : qtyRaw != null && String(qtyRaw).trim() !== ''
        ? Number(qtyRaw)
        : undefined;

  if (quantity == null && !msg.includes('success') && !msg.includes('allot')) {
    return {
      ok: true,
      allotted: false,
      message: body.message || 'Not allotted',
    };
  }

  return {
    ok: true,
    allotted: true,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    message:
      quantity != null && Number.isFinite(quantity)
        ? `Allotted ${quantity} kitta`
        : body.message || 'Allotted',
  };
}

export const rbbProvider: IssueManagerProvider = {
  id: 'rbb',
  label: 'RBB Merchant Banking',
  listCompanies,
  checkBoid,
};
