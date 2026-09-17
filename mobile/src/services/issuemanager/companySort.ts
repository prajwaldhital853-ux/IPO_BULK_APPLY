import type { IssueManagerCompany } from './types';
import { managerCompanyAliases } from './registry';

/** Newest CDSC / issue-manager results first; undated rows keep name order below. */
export function sortIpoCompanies(
  companies: IssueManagerCompany[],
): IssueManagerCompany[] {
  return [...companies].sort((a, b) => {
    const at = a.listedAt ?? 0;
    const bt = b.listedAt ?? 0;
    if (bt !== at) return bt - at;
    return a.name.localeCompare(b.name);
  });
}

function isCdscProvider(provider: string): boolean {
  return provider === 'cdsc';
}

/** Issue-manager rows first; CDSC-only extras after (each group newest-first). */
export function partitionIpoCompanies(companies: IssueManagerCompany[]): {
  managers: IssueManagerCompany[];
  cdscExtras: IssueManagerCompany[];
} {
  const managers: IssueManagerCompany[] = [];
  const cdscExtras: IssueManagerCompany[] = [];
  for (const row of companies) {
    if (isCdscProvider(row.provider)) {
      cdscExtras.push(row);
    } else {
      managers.push(row);
    }
  }
  return { managers, cdscExtras };
}

export function pickNewestIpoCompany(
  companies: IssueManagerCompany[],
): IssueManagerCompany | null {
  const { managers, cdscExtras } = partitionIpoCompanies(companies);
  const bestManager = sortIpoCompanies(managers)[0];
  const bestCdsc = sortIpoCompanies(cdscExtras)[0];
  if (!bestManager) return bestCdsc ?? null;
  if (!bestCdsc) return bestManager;
  const managerAt = bestManager.listedAt ?? 0;
  const cdscAt = bestCdsc.listedAt ?? 0;
  return cdscAt > managerAt ? bestCdsc : bestManager;
}

/** Copy CDSC first-seen timestamps onto matching issue-manager rows. */
export function inheritListedAtFromCdsc(
  managers: IssueManagerCompany[],
  cdsc: IssueManagerCompany[],
): IssueManagerCompany[] {
  const byAlias = new Map<string, number>();
  for (const row of cdsc) {
    if (!row.listedAt) continue;
    for (const alias of managerCompanyAliases(row)) {
      byAlias.set(alias, Math.max(byAlias.get(alias) ?? 0, row.listedAt));
    }
  }
  return managers.map((row) => {
    let best = row.listedAt ?? 0;
    for (const alias of managerCompanyAliases(row)) {
      best = Math.max(best, byAlias.get(alias) ?? 0);
    }
    return best > 0 ? { ...row, listedAt: best } : row;
  });
}

export function mergeIpoCompanyLists(
  managers: IssueManagerCompany[],
  cdscExtras: IssueManagerCompany[],
  phoneExtras: IssueManagerCompany[] = [],
  /** Full CDSC portal rows (incl. duplicates of managers) — used only for listedAt. */
  cdscDatingSource?: IssueManagerCompany[],
): IssueManagerCompany[] {
  const seen = new Set<string>();
  const allCdsc =
    cdscDatingSource && cdscDatingSource.length > 0
      ? cdscDatingSource
      : [...cdscExtras, ...phoneExtras];

  const datedManagers = inheritListedAtFromCdsc(managers, allCdsc);
  const datedManagerList = sortIpoCompanies(datedManagers);

  const cdscRows: IssueManagerCompany[] = [];
  for (const row of [...cdscExtras, ...phoneExtras]) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    cdscRows.push(row);
  }

  // Issue managers always appear first — CDSC is supplemental (CDSC-only IPOs).
  return [...datedManagerList, ...sortIpoCompanies(cdscRows)];
}

export function detectNewlyPublishedCompanies(
  prevKeys: Set<string>,
  next: IssueManagerCompany[],
): IssueManagerCompany[] {
  return next.filter((row) => row.listedAt && !prevKeys.has(row.key));
}
