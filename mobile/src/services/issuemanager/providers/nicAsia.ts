import { companyKey } from '../http';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from '../types';
import { imFetch } from '../http';

const PAGE = 'https://www.nicasiacapital.com/ipo-result';
const ORIGIN = 'https://www.nicasiacapital.com';

const NIC_COMPANY: IssueManagerCompany = {
  key: companyKey('nic_asia', 'all'),
  provider: 'nic_asia',
  rawId: 'all',
  name: 'NIC Asia Capital (check by BOID)',
  providerLabel: 'NIC Asia Capital',
};

/**
 * NIC Asia IPO result form is BOID-only (no company dropdown).
 * Always expose one row so it never disappears if the probe request fails.
 */
async function listCompanies(): Promise<IssueManagerCompany[]> {
  return [NIC_COMPANY];
}

async function checkBoid(
  _company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  const body = new URLSearchParams({
    boid,
    name: '',
  }).toString();

  let res;
  try {
    res = await imFetch(PAGE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
        Origin: ORIGIN,
        Referer: PAGE,
      },
      body,
    });
  } catch (e) {
    return {
      ok: false,
      allotted: false,
      message:
        e instanceof Error
          ? e.message
          : 'NIC Asia unreachable — check phone internet / retry',
    };
  }

  const text = res.text || '';
  const lower = text.toLowerCase();

  if (res.status !== 200) {
    return {
      ok: false,
      allotted: false,
      message: `NIC Asia check failed (HTTP ${res.status})`,
    };
  }

  if (lower.includes('no records found')) {
    return { ok: true, allotted: false, message: 'Not allotted' };
  }

  const qtyMatch =
    text.match(/Allot(?:t)?ed\s*Kitta[\s\S]{0,160}?>(\d+)</i) ??
    text.match(/>(\d+)<\/td>\s*<\/tr>/i);

  if (qtyMatch) {
    const quantity = Number(qtyMatch[1]);
    return {
      ok: true,
      allotted: quantity > 0,
      quantity: quantity > 0 ? quantity : undefined,
      message:
        quantity > 0 ? `Allotted ${quantity} kitta` : 'Not allotted',
    };
  }

  if (
    (lower.includes('alloted') ||
      lower.includes('allotted') ||
      lower.includes('kitta')) &&
    !lower.includes('no records found')
  ) {
    return { ok: true, allotted: true, message: 'Allotted' };
  }

  return {
    ok: false,
    allotted: false,
    message: 'NIC Asia: could not parse result — site may be down',
  };
}

export const nicAsiaProvider: IssueManagerProvider = {
  id: 'nic_asia',
  label: 'NIC Asia Capital',
  listCompanies,
  checkBoid,
};
