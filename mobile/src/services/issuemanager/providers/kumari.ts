import { companyKey, imFetch } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

const API = 'https://api-web.kumaricapital.com';
const ORIGIN = 'https://kumaricapital.com';
const ALLOTMENT_CATEGORY = 2;

type CompanyRow = {
  id?: number;
  company_name?: string;
};

type SearchTypeRow = {
  id?: number;
  title?: string;
  company?: number;
  search_category?: number;
  status?: string;
};

/**
 * Kumari share-details search.
 * Company picker = allotment search types (IPO/FPO lines) under category 2.
 * rawId format: `${companyId}|${searchTypeId}`
 */
async function listCompanies(): Promise<IssueManagerCompany[]> {
  const [companiesRes, typesRes] = await Promise.all([
    imFetch(`${API}/items/company?limit=-1`, {
      method: 'GET',
      headers: { Origin: ORIGIN, Referer: `${ORIGIN}/share-details` },
    }),
    imFetch(`${API}/items/share_details_search_type?limit=-1`, {
      method: 'GET',
      headers: { Origin: ORIGIN, Referer: `${ORIGIN}/share-details` },
    }),
  ]);

  if (companiesRes.status !== 200 || !companiesRes.json) {
    throw new Error(
      `Kumari Capital: company list failed (HTTP ${companiesRes.status})`,
    );
  }
  if (typesRes.status !== 200 || !typesRes.json) {
    throw new Error(
      `Kumari Capital: search types failed (HTTP ${typesRes.status})`,
    );
  }

  const companies = (
    (companiesRes.json as { data?: CompanyRow[] }).data ?? []
  ).reduce<Record<number, string>>((acc, row) => {
    if (row.id != null && row.company_name) {
      acc[row.id] = row.company_name.trim();
    }
    return acc;
  }, {});

  const types = (
    (typesRes.json as { data?: SearchTypeRow[] }).data ?? []
  ).filter(
    (t) =>
      t.id != null &&
      t.company != null &&
      t.search_category === ALLOTMENT_CATEGORY &&
      (t.status == null || t.status === 'published'),
  );

  return types.map((t) => {
    const companyName = companies[t.company!] ?? `Company ${t.company}`;
    const title = (t.title ?? '').trim();
    const name = title ? `${companyName} — ${title}` : companyName;
    const rawId = `${t.company}|${t.id}`;
    return {
      key: companyKey('kumari', rawId),
      provider: 'kumari',
      rawId,
      name,
      providerLabel: 'Kumari Capital',
    };
  });
}

async function checkBoid(
  company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  const [companyId, searchTypeId] = company.rawId.split('|');
  if (!companyId || !searchTypeId) {
    return { ok: false, allotted: false, message: 'Invalid Kumari company id' };
  }

  const qs = new URLSearchParams({
    holderId: boid,
    type: companyId,
    share_details_search_type: searchTypeId,
  }).toString();

  const res = await imFetch(`${API}/sharedetails/search-details?${qs}`, {
    method: 'GET',
    headers: { Origin: ORIGIN, Referer: `${ORIGIN}/share-details` },
  });

  if (res.status !== 200 || !res.json) {
    return {
      ok: false,
      allotted: false,
      message: `Kumari check failed (HTTP ${res.status})`,
    };
  }

  const data = (res.json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: true, allotted: false, message: 'Not allotted' };
  }

  const row = data[0] as Record<string, unknown>;
  let quantity: number | undefined;
  for (const k of [
    'allotted_kitta',
    'alloted_kitta',
    'kitta',
    'qty',
    'quantity',
    'allotted',
  ]) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      quantity = v;
      break;
    }
    if (v != null && String(v).trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) {
        quantity = n;
        break;
      }
    }
  }

  return {
    ok: true,
    allotted: true,
    quantity,
    message:
      quantity != null ? `Allotted ${quantity} kitta` : 'Allotted',
  };
}

export const kumariProvider: IssueManagerProvider = {
  id: 'kumari',
  label: 'Kumari Capital',
  listCompanies,
  checkBoid,
};
