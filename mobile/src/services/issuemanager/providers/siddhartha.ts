import { companyKey, imFetch } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

const AJAX =
  'https://www.siddharthacapital.com/wp-admin/admin-ajax.php';
const PAGE =
  'https://www.siddharthacapital.com/check-share-allotment-ipo-fpo/';

type ListPayload = {
  success?: boolean;
  data?: string[];
  message?: string;
};

type SearchRow = {
  company_name?: string;
  full_name?: string;
  boid?: string;
  app_kitta?: number | string;
  alloted_kitta?: number | string;
};

type SearchPayload = {
  success?: boolean;
  data?: SearchRow | unknown[];
  message?: string;
};

async function listCompanies(): Promise<IssueManagerCompany[]> {
  const res = await imFetch(AJAX, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: 'https://www.siddharthacapital.com',
      Referer: PAGE,
    },
    body: 'action=ipo_list_company',
  });
  if (res.status !== 200 || !res.json) {
    throw new Error(
      `Siddhartha Capital: company list failed (HTTP ${res.status})`,
    );
  }
  const body = res.json as ListPayload;
  if (!body.success || !Array.isArray(body.data)) {
    throw new Error(body.message || 'Siddhartha Capital: empty company list');
  }
  return body.data
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      key: companyKey('siddhartha', name),
      provider: 'siddhartha' as const,
      rawId: name,
      name,
      providerLabel: 'Siddhartha Capital',
    }));
}

async function checkBoid(
  company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  const body = new URLSearchParams({
    action: 'ipo_search',
    companyname: company.rawId,
    boid,
  }).toString();
  const res = await imFetch(AJAX, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: 'https://www.siddharthacapital.com',
      Referer: PAGE,
    },
    body,
  });
  if (res.status !== 200 || !res.json) {
    return {
      ok: false,
      allotted: false,
      message: `Siddhartha check failed (HTTP ${res.status})`,
    };
  }
  const payload = res.json as SearchPayload;
  if (!payload.success) {
    return {
      ok: false,
      allotted: false,
      message: payload.message || 'Search failed',
    };
  }

  // Official JS: object (no .length) = allotted; array/empty = not allotted
  const data = payload.data;
  if (data && !Array.isArray(data) && typeof data === 'object') {
    const row = data as SearchRow;
    const qtyRaw = row.alloted_kitta;
    const quantity =
      typeof qtyRaw === 'number'
        ? qtyRaw
        : qtyRaw != null && String(qtyRaw).trim() !== ''
          ? Number(qtyRaw)
          : undefined;
    return {
      ok: true,
      allotted: true,
      quantity: Number.isFinite(quantity) ? quantity : undefined,
      message:
        quantity != null && Number.isFinite(quantity)
          ? `Allotted ${quantity} kitta`
          : 'Allotted',
    };
  }

  return {
    ok: true,
    allotted: false,
    message: 'Not allotted',
  };
}

export const siddharthaProvider: IssueManagerProvider = {
  id: 'siddhartha',
  label: 'Siddhartha Capital',
  listCompanies,
  checkBoid,
};
