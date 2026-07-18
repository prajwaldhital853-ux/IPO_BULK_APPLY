import { companyKey, imFetch } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

type CompanyRow = { companyCode?: string };
type ListPayload = {
  status?: number;
  data?: { companyList?: CompanyRow[]; message?: string };
};
type CheckPayload = {
  status?: number;
  data?: {
    allotmentList?: Array<{ boid?: string; qty?: number | string }>;
    message?: string;
  };
};

/**
 * Flowvity / Prabhu-style allotment API used by several capitals:
 * GET {base}/adminapi/v1/public/ipo-allotment-company
 * GET {base}/adminapi/v1/public/ipo-allotment?boid=&companyCode=
 */
export function createFlowvityProvider(opts: {
  id: string;
  label: string;
  /** e.g. https://www.prabhucapital.com or https://flowvity.nimbacecapital.com */
  apiBase: string;
  origin?: string;
  referer?: string;
}): IssueManagerProvider {
  const apiRoot = `${opts.apiBase.replace(/\/$/, '')}/adminapi/v1`;
  const origin = opts.origin ?? opts.apiBase;
  const referer = opts.referer ?? opts.apiBase;

  return {
    id: opts.id,
    label: opts.label,
    async listCompanies(): Promise<IssueManagerCompany[]> {
      const res = await imFetch(`${apiRoot}/public/ipo-allotment-company`, {
        method: 'GET',
        headers: { Origin: origin, Referer: referer },
      });
      if (res.status !== 200 || !res.json) {
        throw new Error(
          `${opts.label}: company list failed (HTTP ${res.status})`,
        );
      }
      const body = res.json as ListPayload;
      const rows = body.data?.companyList ?? [];
      return rows
        .map((r) => (r.companyCode ?? '').trim())
        .filter(Boolean)
        .map((code) => ({
          key: companyKey(opts.id, code),
          provider: opts.id,
          rawId: code,
          name: code,
          providerLabel: opts.label,
        }));
    },
    async checkBoid(
      company: IssueManagerCompany,
      boid: string,
    ): Promise<IssueManagerCheckResult> {
      const qs = new URLSearchParams({
        boid,
        companyCode: company.rawId,
      }).toString();
      const res = await imFetch(`${apiRoot}/public/ipo-allotment?${qs}`, {
        method: 'GET',
        headers: { Origin: origin, Referer: referer },
      });
      if (res.status !== 200 || !res.json) {
        return {
          ok: false,
          allotted: false,
          message: `${opts.label} check failed (HTTP ${res.status})`,
        };
      }
      const body = res.json as CheckPayload;
      const list = body.data?.allotmentList ?? [];
      if (!list.length) {
        return {
          ok: true,
          allotted: false,
          message: body.data?.message || 'Not allotted',
        };
      }
      const qtyRaw = list[0]?.qty;
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
    },
  };
}
