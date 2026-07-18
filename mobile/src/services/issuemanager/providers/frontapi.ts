import { companyKey, imFetch } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';

type CompanyRow = { id?: number | string; name?: string };
type FilterOk = {
  error?: boolean;
  data?: {
    allotments?: Array<Record<string, unknown>>;
  };
  message?: string;
};

function extractQty(
  allotments: Array<Record<string, unknown>> | undefined,
): number | undefined {
  if (!allotments?.length) return undefined;
  const row = allotments[0];
  for (const k of [
    'allotted_kitta',
    'alloted_kitta',
    'kitta',
    'qty',
    'quantity',
  ]) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v != null && String(v).trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/**
 * Sanima-style Laravel frontapi used by Sanima, NMB, etc:
 * GET {site}/frontapi/en/ipo
 * GET {site}/frontapi/en/ipo/filter?companyId=&boidNumber=
 */
export function createFrontApiProvider(opts: {
  id: string;
  label: string;
  /** e.g. https://www.sanima.capital */
  siteBase: string;
  refererPath?: string;
}): IssueManagerProvider {
  const site = opts.siteBase.replace(/\/$/, '');
  const api = `${site}/frontapi/en`;
  const referer = `${site}${opts.refererPath ?? '/'}`;

  return {
    id: opts.id,
    label: opts.label,
    async listCompanies(): Promise<IssueManagerCompany[]> {
      const res = await imFetch(`${api}/ipo`, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Origin: site,
          Referer: referer,
        },
      });
      if (res.status !== 200 || !Array.isArray(res.json)) {
        throw new Error(
          `${opts.label}: company list failed (HTTP ${res.status})`,
        );
      }
      const rows = res.json as CompanyRow[];
      return rows
        .filter((r) => r.id != null && r.name)
        .map((r) => {
          const rawId = String(r.id);
          return {
            key: companyKey(opts.id, rawId),
            provider: opts.id,
            rawId,
            name: String(r.name).trim(),
            providerLabel: opts.label,
          };
        });
    },
    async checkBoid(
      company: IssueManagerCompany,
      boid: string,
    ): Promise<IssueManagerCheckResult> {
      const qs = new URLSearchParams({
        companyId: company.rawId,
        boidNumber: boid,
      }).toString();
      const res = await imFetch(`${api}/ipo/filter?${qs}`, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Origin: site,
          Referer: referer,
        },
      });

      if (res.status === 422) {
        const msg =
          (res.json as { message?: string } | null)?.message ??
          'Invalid BOID or company';
        return { ok: false, allotted: false, message: msg };
      }

      // Official UIs treat many non-200 responses as not allotted
      if (res.status !== 200 || !res.json) {
        return { ok: true, allotted: false, message: 'Not allotted' };
      }

      const body = res.json as FilterOk;
      if (body.error === false) {
        const allotments = body.data?.allotments ?? [];
        const quantity = extractQty(allotments);
        return {
          ok: true,
          allotted: true,
          quantity,
          message:
            quantity != null ? `Allotted ${quantity} kitta` : 'Allotted',
        };
      }

      return {
        ok: true,
        allotted: false,
        message: body.message || 'Not allotted',
      };
    },
  };
}
