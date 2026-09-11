import type { ApplicationReportRow } from '../services/meroshare/types';
import type { ResultAccountStatus } from '../services/meroshare/types';

export type ApplicationPhaseKind =
  | 'verified'
  | 'unverified'
  | 'rejected'
  | 'not_applied'
  | 'others';

/** MeroShare report could not be loaded — not the same as genuinely not applied. */
export function isStatusCheckFailed(row: ResultAccountStatus): boolean {
  return (
    row.status === 'CHECK_FAILED' ||
    /could not verify application status/i.test(row.message)
  );
}

/** List-row / company status indicates published allotment (not bank-verify window). */
export function isPublishedAllotmentListStatus(statusName: string): boolean {
  const s = (statusName || '').trim().toUpperCase();
  if (s === 'ALLOTTED' || s === 'ALLOTED') return true;
  if (/NOT.?ALLOT|UNALLOT|NOT_ALLOTTED/.test(s)) return true;
  return false;
}

/** Per-account check result shows published allotment outcome. */
export function isPublishedAllotmentResultRow(
  row: ResultAccountStatus,
): boolean {
  const text = `${row.status} ${row.allotmentStatus ?? ''} ${row.message} ${
    row.remarks ?? ''
  }`.toUpperCase();
  if (row.status === 'ALLOTTED' || row.status === 'NOT_ALLOTTED') return true;
  if (/NOT.?ALLOT|UNALLOT|NOT_ALLOTTED/.test(text)) return true;
  if (/ALLOT/.test(text) && !/NOT.?ALLOT/.test(text)) return true;
  return false;
}

/**
 * True when IPO result is not published — use Verified/Unverified UI, not allotment.
 * False → Alloted / Not Allot / Rejected / Others filters.
 */
export function shouldUseApplicationPhaseStatus(
  company: ApplicationReportRow | null | undefined,
  openCompanyShareIds: ReadonlySet<number>,
): boolean {
  if (!company) return false;

  const s = (company.statusName || '').trim().toUpperCase();

  // Published allotment on the company list row → allotment-phase UI.
  if (isPublishedAllotmentListStatus(s)) return false;

  // IPO still open for applications → application-phase UI.
  if (openCompanyShareIds.has(company.companyShareId)) return true;

  if (!s || s === 'OPEN' || s === 'CREATE_APPROVE') return true;

  // Closed applied issue: list often shows TRANSACTION_SUCCESS while detail has Alloted/Not Alloted.
  if (s === 'TRANSACTION_SUCCESS' || s === 'APPROVED') return false;

  // Application-window statuses (bank verification still in progress).
  if (/^VERIFIED$|^UNVERIFIED$|^REJECTED$/i.test(s)) return true;
  if (
    /VERIF|UNVERIF|REJECT|PENDING|APPLIED|PROCESS/i.test(s) &&
    !/ALLOT/.test(s)
  ) {
    return true;
  }

  return false;
}

export function classifyApplicationPhase(
  row: ResultAccountStatus,
): ApplicationPhaseKind {
  if (isStatusCheckFailed(row)) return 'others';

  if (
    row.status === 'NOT_APPLIED' ||
    /no application found|not applied|have not applied/i.test(row.message)
  ) {
    return 'not_applied';
  }

  const meroshareStatus = (row.allotmentStatus || row.message || '').trim();
  const statusUpper = meroshareStatus.toUpperCase();

  if (/^verified$/i.test(meroshareStatus)) return 'verified';
  if (/^rejected$/i.test(meroshareStatus)) return 'rejected';
  if (/^unverified$/i.test(meroshareStatus)) return 'unverified';

  // Published allotment labels should not sit in Unverified when mis-routed.
  if (/^allot/i.test(meroshareStatus) && !/^not/i.test(meroshareStatus)) {
    return 'verified';
  }
  if (/not\s*allot/i.test(statusUpper)) return 'rejected';

  if (row.status === 'VERIFIED') return 'verified';
  if (row.status === 'REJECTED' || !row.ok) return 'rejected';
  if (row.status === 'UNVERIFIED') return 'unverified';

  const raw = `${row.status} ${row.allotmentStatus ?? ''} ${row.message}`.toUpperCase();
  if (/REJECT|FAIL|ERROR|CANCEL/i.test(raw)) return 'rejected';
  if (/VERIF/.test(raw) && !/UNVERIF|NOT.?VERIF/.test(raw)) return 'verified';
  if (/UNVERIF|NOT.?VERIF|PENDING|APPLIED|PROCESS/i.test(raw)) return 'unverified';
  return 'unverified';
}

export function applicationPhaseStatusLine(row: ResultAccountStatus): string {
  if (isStatusCheckFailed(row)) {
    return row.message.trim() || 'Could not verify status';
  }
  const kind = classifyApplicationPhase(row);
  if (kind === 'not_applied') return 'NOT APPLIED';
  const label = (row.allotmentStatus || row.message || '').trim();
  if (label) return label;
  if (kind === 'rejected') return 'Rejected';
  if (kind === 'verified') return 'Verified';
  return 'Unverified';
}

export function applicationPhaseRemarks(row: ResultAccountStatus): string | null {
  const kind = classifyApplicationPhase(row);
  if (kind === 'not_applied') return null;
  const text = (row.remarks ?? '').trim();
  if (!text) return null;
  if (text.toLowerCase() === applicationPhaseStatusLine(row).toLowerCase()) {
    return null;
  }
  return text;
}
