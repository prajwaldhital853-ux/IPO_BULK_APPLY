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

export function pickNewestIpoCompany(
  companies: IssueManagerCompany[],
): IssueManagerCompany | null {
  return sortIpoCompanies(companies)[0] ?? null;
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
    if (row.listedAt) return row;
    let best = 0;
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
): IssueManagerCompany[] {
  const seen = new Set<string>();
  const merged: IssueManagerCompany[] = [];
  const allCdsc = [...cdscExtras, ...phoneExtras];

  const datedManagers = inheritListedAtFromCdsc(managers, allCdsc);
  for (const row of [...datedManagers, ...cdscExtras, ...phoneExtras]) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    merged.push(row);
  }
  return sortIpoCompanies(merged);
}

export function detectNewlyPublishedCompanies(
  prevKeys: Set<string>,
  next: IssueManagerCompany[],
): IssueManagerCompany[] {
  return next.filter((row) => row.listedAt && !prevKeys.has(row.key));
}
