import type { OpenIssue } from '../services/meroshare/types';
import type { CdscIssueStat } from '../services/nepse/cdscIssues';
import type { PublicOffering } from '../services/nepse/publicOffering';
import { bsToAd } from './bsDate';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function slug(raw?: string | null): string {
  return (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** LSBD2092 (MeroShare/CDSC) ↔ LSD2092 (ShareHub) and similar variants. */
function symbolsMatch(a?: string | null, b?: string | null): boolean {
  const sa = slug(a);
  const sb = slug(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const da = sa.replace(/\D/g, '');
  const db = sb.replace(/\D/g, '');
  if (!da || da !== db) return false;
  // Same numeric tail + same 2-letter prefix (LS / NM / …)
  return sa.slice(0, 2) === sb.slice(0, 2);
}

/** MeroShare often sends Bikram Sambat years (e.g. 2082) while CDSC uses AD. */
function looksLikeBsYear(year: number): boolean {
  return year > 2050;
}

export function parseIssueDate(raw?: string): Date | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (looksLikeBsYear(y)) {
      try {
        const ad = bsToAd({ year: y, month: m, day: d });
        return new Date(ad.year, ad.month - 1, ad.day);
      } catch {
        // fall through
      }
    }
    const local = new Date(y, m - 1, d);
    if (!Number.isNaN(local.getTime())) return local;
  }

  const slash = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    const y = Number(slash[3]);
    if (looksLikeBsYear(y)) {
      try {
        const ad = bsToAd({ year: y, month: m, day: d });
        return new Date(ad.year, ad.month - 1, ad.day);
      } catch {
        // fall through
      }
    }
    const local = new Date(y, m - 1, d);
    if (!Number.isNaN(local.getTime())) return local;
  }

  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Apply-window close date for an offering.
 * Do NOT prefer extendedClosingDate first — ShareHub often sets an extension
 * far past the real CDSC apply deadline (e.g. close 08-04, extended 08-13).
 */
function offeringClose(row: PublicOffering): string | null {
  if (row.closingDate && parseIssueDate(row.closingDate)) return row.closingDate;
  if (row.cdsc?.closeDate && parseIssueDate(row.cdsc.closeDate)) {
    return row.cdsc.closeDate;
  }
  if (row.extendedClosingDate && parseIssueDate(row.extendedClosingDate)) {
    return row.extendedClosingDate;
  }
  return null;
}

function pickGeneralPublic<T extends { audience?: string | null }>(
  rows: T[],
): T {
  const gp = rows.find((r) =>
    /general\s*public|for\s*general/i.test(r.audience ?? ''),
  );
  return gp ?? rows[0];
}

function matchOffering(
  offerings: PublicOffering[],
  issue: OpenIssue,
): PublicOffering | null {
  if (issue.scrip) {
    const bySym = offerings.filter((o) => symbolsMatch(o.symbol, issue.scrip));
    if (bySym.length === 1) return bySym[0];
    if (bySym.length > 1) {
      const type = slug(issue.shareTypeName);
      const typed = bySym.filter(
        (o) =>
          slug(o.type).includes(type) || type.includes(slug(o.type)),
      );
      return pickGeneralPublic(typed.length ? typed : bySym);
    }
  }
  const name = slug(issue.companyName);
  if (!name) return null;
  const byName = offerings.filter(
    (o) =>
      slug(o.name) === name ||
      slug(o.name).includes(name) ||
      name.includes(slug(o.name)),
  );
  return byName.length ? pickGeneralPublic(byName) : null;
}

function matchCdsc(
  stats: CdscIssueStat[],
  issue: OpenIssue,
): CdscIssueStat | null {
  if (issue.scrip) {
    const bySym = stats.filter((s) => symbolsMatch(s.symbol, issue.scrip));
    if (bySym.length) return pickGeneralPublic(bySym);
  }
  const name = slug(issue.companyName);
  if (!name) return null;
  const byName = stats.filter(
    (s) =>
      slug(s.company) === name ||
      slug(s.company).includes(name) ||
      name.includes(slug(s.company)),
  );
  return byName.length ? pickGeneralPublic(byName) : null;
}

function resolveCloseDateString(
  issue: OpenIssue,
  offerings: PublicOffering[],
  cdscStats: CdscIssueStat[],
): string | null {
  // CDSC ipolist close date is the live apply deadline (authoritative).
  const cdsc = matchCdsc(cdscStats, issue);
  if (cdsc?.closeDate && parseIssueDate(cdsc.closeDate)) return cdsc.closeDate;

  const offering = matchOffering(offerings, issue);
  const fromOffering = offering ? offeringClose(offering) : null;
  if (fromOffering && parseIssueDate(fromOffering)) return fromOffering;

  if (parseIssueDate(issue.issueCloseDate)) return issue.issueCloseDate ?? null;

  return null;
}

/** IPO accepting applications now (open date passed, close not passed). */
export function isCurrentIssue(issue: OpenIssue, now = new Date()): boolean {
  const today = startOfDay(now);
  const open = parseIssueDate(issue.issueOpenDate);
  const close = parseIssueDate(issue.issueCloseDate);
  if (open && startOfDay(open) > today) return false;
  if (close && startOfDay(close) < today) return false;
  return true;
}

/** Calendar days from today until close date (0 = closes today). */
export function calendarDaysUntilClose(close: Date, now = new Date()): number {
  const today = startOfDay(now);
  const endDay = startOfDay(close);
  return Math.round((endDay.getTime() - today.getTime()) / 86400000);
}

/** Human label for days remaining until issue close (apply window). */
export function daysLeftForIssue(issue?: OpenIssue | null): string | null {
  const close = parseIssueDate(issue?.issueCloseDate);
  if (!close) return null;
  const days = calendarDaysUntilClose(close);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Last day to apply';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

/** Fill / correct close dates from public offerings + CDSC ipolist. */
export async function enrichIssuesWithClosingDates(
  issues: OpenIssue[],
): Promise<OpenIssue[]> {
  if (!issues.length) return issues;

  let offerings: PublicOffering[] = [];
  let cdscStats: CdscIssueStat[] = [];

  try {
    const { loadAllPublicOfferings } = await import(
      '../services/nepse/publicOffering'
    );
    const { loadCdscIssueStats } = await import('../services/nepse/cdscIssues');
    [offerings, cdscStats] = await Promise.all([
      loadAllPublicOfferings().catch(() => [] as PublicOffering[]),
      loadCdscIssueStats().catch(() => [] as CdscIssueStat[]),
    ]);
  } catch {
    return issues;
  }

  if (!offerings.length && !cdscStats.length) return issues;

  return issues.map((issue) => {
    const close = resolveCloseDateString(issue, offerings, cdscStats);
    if (!close) return issue;
    if (close === issue.issueCloseDate) return issue;
    return { ...issue, issueCloseDate: close };
  });
}

/** IPO not open for application yet. */
export function isUpcomingIssue(issue: OpenIssue, now = new Date()): boolean {
  const open = parseIssueDate(issue.issueOpenDate);
  if (!open) return false;
  return startOfDay(open) > startOfDay(now);
}

export function formatIssueRange(issue: OpenIssue): string {
  const open = issue.issueOpenDate?.slice(0, 10) ?? '—';
  const close = issue.issueCloseDate?.slice(0, 10) ?? '—';
  return `${open} → ${close}`;
}
