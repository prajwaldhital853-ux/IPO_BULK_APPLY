import type { OpenIssue } from '../services/meroshare/types';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseIssueDate(raw?: string): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
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
