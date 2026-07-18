import { prabhuProvider } from './providers/prabhu';
import { sanimaProvider } from './providers/sanima';
import { siddharthaProvider } from './providers/siddhartha';
import { nimbAceProvider } from './providers/nimbAce';
import { himalayanProvider } from './providers/himalayan';
import { nmbProvider } from './providers/nmb';
import { globalImeProvider } from './providers/globalIme';
import { rbbProvider } from './providers/rbb';
import { kumariProvider } from './providers/kumari';
import { nabilProvider } from './providers/nabil';
import { nicAsiaProvider } from './providers/nicAsia';
import { cdscProvider } from './providers/cdsc';
import { isCdscBackendConfigured } from './backendConfig';
import type {
  IssueManagerCheckResult,
  IssueManagerCompany,
  IssueManagerProvider,
} from './types';
import { NEPAL_ISSUE_MANAGERS } from './catalog';

const PROVIDER_LIST_TIMEOUT_MS = 22_000;

/**
 * Live issue-manager bulk-check providers (free, no captcha). These are the
 * primary path — 11 SEBON managers.
 */
export const ISSUE_MANAGERS: IssueManagerProvider[] = [
  prabhuProvider,
  sanimaProvider,
  siddharthaProvider,
  nimbAceProvider,
  himalayanProvider,
  nmbProvider,
  globalImeProvider,
  rbbProvider,
  kumariProvider,
  nabilProvider,
  nicAsiaProvider,
];

/**
 * CDSC portal fallback (server-side captcha model + 2Captcha). Only active when
 * the backend is configured; covers IPOs outside the 11 managers.
 */
export const FALLBACK_PROVIDERS: IssueManagerProvider[] = isCdscBackendConfigured()
  ? [cdscProvider]
  : [];

/** All providers whose companies are merged into the picker. */
export const ACTIVE_PROVIDERS: IssueManagerProvider[] = [
  ...ISSUE_MANAGERS,
  ...FALLBACK_PROVIDERS,
];

export function getProvider(id: string): IssueManagerProvider {
  const found = ACTIVE_PROVIDERS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Unknown issue manager: ${id}`);
  }
  return found;
}

export type CompanyLoadResult = {
  companies: IssueManagerCompany[];
  /** Per-provider errors (some sources can fail without blocking others). */
  errors: Array<{ provider: string; label: string; message: string }>;
  liveProviderCount: number;
  catalogTotal: number;
};


async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: timed out after ${Math.round(ms / 1000)}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Normalize company / scrip labels for duplicate detection. */
export function normalizeCompanyLabel(value: string): string {
  return value
    .replace(/\s*\(via CDSC\)\s*$/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Aliases used to match an issue-manager IPO against the CDSC portal list. */
export function managerCompanyAliases(company: IssueManagerCompany): string[] {
  const out = new Set<string>();
  const name = normalizeCompanyLabel(company.name);
  if (name) out.add(name);
  if (company.scrip) {
    const scrip = normalizeCompanyLabel(company.scrip);
    if (scrip) out.add(scrip);
  }
  // Flowvity portals often expose scrip as the dropdown label.
  if (name.length <= 12 && !name.includes(' ')) {
    out.add(name);
  }
  return [...out];
}

export function buildManagerAliasSet(
  companies: IssueManagerCompany[],
): Set<string> {
  const aliases = new Set<string>();
  for (const company of companies) {
    for (const alias of managerCompanyAliases(company)) {
      aliases.add(alias);
    }
  }
  return aliases;
}

/** Keep CDSC rows only when no live issue manager already covers that IPO. */
export function filterCdscOnlyCompanies(
  cdscCompanies: IssueManagerCompany[],
  managerAliases: Set<string>,
): IssueManagerCompany[] {
  return cdscCompanies.filter((company) => {
    const aliases = managerCompanyAliases(company);
    return !aliases.some((alias) => managerAliases.has(alias));
  });
}

async function loadFromProviders(
  providers: IssueManagerProvider[],
): Promise<CompanyLoadResult> {
  const settled = await Promise.allSettled(
    providers.map(async (p) => {
      const companies = await withTimeout(
        p.listCompanies(),
        PROVIDER_LIST_TIMEOUT_MS,
        p.label,
      );
      return { provider: p, companies };
    }),
  );

  const companies: IssueManagerCompany[] = [];
  const errors: CompanyLoadResult['errors'] = [];

  for (let i = 0; i < settled.length; i++) {
    const p = providers[i];
    const item = settled[i];
    if (item.status === 'fulfilled') {
      companies.push(...item.value.companies);
    } else {
      const message =
        item.reason instanceof Error
          ? item.reason.message
          : 'Failed to load companies';
      errors.push({ provider: p.id, label: p.label, message });
    }
  }

  companies.sort((a, b) => a.name.localeCompare(b.name));
  return {
    companies,
    errors,
    liveProviderCount: providers.length,
    catalogTotal: NEPAL_ISSUE_MANAGERS.length,
  };
}

/**
 * Primary path — load IPOs from the 11 live issue managers only.
 */
export async function loadIssueManagerCompanies(): Promise<CompanyLoadResult> {
  return loadFromProviders(ISSUE_MANAGERS);
}

/**
 * Fallback path — CDSC portal companies not already listed by issue managers.
 */
export async function loadCdscFallbackCompanies(
  managerCompanies: IssueManagerCompany[],
): Promise<CompanyLoadResult> {
  if (!isCdscBackendConfigured()) {
    return {
      companies: [],
      errors: [],
      liveProviderCount: 0,
      catalogTotal: NEPAL_ISSUE_MANAGERS.length,
    };
  }

  const result = await loadFromProviders(FALLBACK_PROVIDERS);
  const managerAliases = buildManagerAliasSet(managerCompanies);
  return {
    ...result,
    companies: filterCdscOnlyCompanies(result.companies, managerAliases),
  };
}

/**
 * Merge company lists: 11 managers first, then CDSC-only extras.
 * Prefer {@link loadIssueManagerCompanies} + {@link loadCdscFallbackCompanies}
 * when the UI should show manager IPOs before CDSC finishes.
 */
export async function loadAllIssueManagerCompanies(): Promise<CompanyLoadResult> {
  const primary = await loadIssueManagerCompanies();
  if (!isCdscBackendConfigured()) {
    return primary;
  }

  const fallback = await loadCdscFallbackCompanies(primary.companies);
  return {
    companies: [...primary.companies, ...fallback.companies].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    errors: [...primary.errors, ...fallback.errors],
    liveProviderCount: ISSUE_MANAGERS.length + FALLBACK_PROVIDERS.length,
    catalogTotal: NEPAL_ISSUE_MANAGERS.length,
  };
}

export async function checkViaIssueManager(
  company: IssueManagerCompany,
  boid: string,
): Promise<IssueManagerCheckResult> {
  return getProvider(company.provider).checkBoid(company, boid);
}
