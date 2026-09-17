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
  if (row.status === 'ALLOTTED' || row.status === 'NOT_ALLOTTED') return true;
  const label = `${row.allotmentStatus ?? ''} ${row.message ?? ''}`.trim();
  if (isPublishedAllotmentListStatus(label)) return true;
  return false;
}

/**
 * True when IPO result is not published — use Verified/Unverified UI, not allotment.
 * False → Alloted / Not Allot / Rejected / Others filters.
 *
 * Apply window closed (TRANSACTION_SUCCESS) is NOT the same as result published.
 * Stay on Verified/Unverified until MeroShare shows Alloted / Not Alloted.
 */
export function shouldUseApplicationPhaseStatus(
  company: ApplicationReportRow | null | undefined,
  openCompanyShareIds: ReadonlySet<number>,
): boolean {
  if (!company) return true;

  const s = (company.statusName || '').trim().toUpperCase();

  if (isPublishedAllotmentListStatus(s)) return false;

  if (openCompanyShareIds.has(company.companyShareId)) return true;

  return true;
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
  if (row.status === 'VERIFIED') return 'verified';
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

/** Application-window status (Verified / Unverified / Rejected) — not allotment. */
function formatApplicationPhaseStatusLabel(primary: string): string {
  const t = primary.trim();
  if (!t) return '';
  if (/^unverified$/i.test(t)) return 'Unverified';
  if (/^verified$/i.test(t)) return 'Verified';
  if (/^rejected$/i.test(t)) return 'Rejected';
  if (/not.?allot/i.test(t)) return 'Not Alloted';
  return t;
}

export function humanizeApplicationPhaseStatus(
  listStatus: string,
  detailStatus?: string,
  remarks?: string,
): { code: string; message: string; reason?: string } {
  const primary = (detailStatus || listStatus || '').trim();
  const display = formatApplicationPhaseStatusLabel(primary);
  const statusLine = display || 'Unverified';
  const s = primary.toUpperCase();
  const r = (remarks ?? '').trim();
  const combined = `${listStatus} ${detailStatus ?? ''} ${r}`.toUpperCase();
  const detail = (detailStatus ?? '').trim();
  const detailUpper = detail.toUpperCase();

  if (
    /INSUFFICIENT|NOT ENOUGH|LOW BALANCE|INSUFFICEN|BALANCE.?NOT.?AVAILABLE|INSUFFICIENT.?FUND/i.test(
      combined,
    ) ||
    /BLOCK[_\s-]?FAIL|AMOUNT.?BLOCK.?FAIL|BLOCK.?AMOUNT.?FAIL/i.test(combined)
  ) {
    return {
      code: 'REJECTED',
      message: /reject/i.test(primary) ? statusLine : 'Rejected',
      reason:
        r ||
        'Block Amount Status - Amount Rejected (Insufficient Balance)',
    };
  }
  if (/REJECT|CANCEL/i.test(combined)) {
    return {
      code: 'REJECTED',
      message: /reject/i.test(primary) ? statusLine : 'Rejected',
      reason: r || undefined,
    };
  }
  if (/FAIL|ERROR/.test(s) && !/BLOCK/.test(s)) {
    return {
      code: 'REJECTED',
      message: /reject/i.test(primary) ? statusLine : 'Rejected',
      reason: r || primary || 'Application failed',
    };
  }
  // Report detail is live; list/remarks can still say Unverified after the bank verifies.
  if (detail) {
    if (
      /^VERIFIED$/.test(detailUpper) ||
      (/VERIF/.test(detailUpper) && !/UNVERIF|NOT.?VERIF/.test(detailUpper))
    ) {
      return {
        code: 'VERIFIED',
        message: formatApplicationPhaseStatusLabel(detail) || 'Verified',
        reason: r || undefined,
      };
    }
    if (/^UNVERIFIED$/.test(detailUpper) || /UNVERIF|NOT.?VERIF/.test(detailUpper)) {
      return {
        code: 'UNVERIFIED',
        message: formatApplicationPhaseStatusLabel(detail) || 'Unverified',
        reason: r || undefined,
      };
    }
  }
  if (/UNVERIF|NOT.?VERIF|CURRENTLY\s*UNVERIF/i.test(combined)) {
    return { code: 'UNVERIFIED', message: statusLine, reason: r || undefined };
  }
  if (
    /^VERIFIED$/i.test(primary) ||
    (/VERIF/i.test(s) && !/UNVERIF|NOT.?VERIF/i.test(s))
  ) {
    return { code: 'VERIFIED', message: statusLine, reason: r || undefined };
  }
  if (/TRANSACTION_SUCCESS|APPROVED|APPLIED|SUBMIT/i.test(combined)) {
    return { code: 'UNVERIFIED', message: statusLine || 'Unverified', reason: r || undefined };
  }
  if (/PENDING|WAIT|PROCESS/i.test(combined)) {
    return { code: 'UNVERIFIED', message: statusLine || 'Unverified', reason: r || undefined };
  }
  if (/NOT.?ALLOT|UNALLOT/i.test(combined)) {
    return {
      code: 'UNVERIFIED',
      message: /not.?allot/i.test(primary) ? statusLine : 'Not Alloted',
      reason: r || undefined,
    };
  }
  if (/ALLOT/i.test(s) && !/NOT/.test(s)) {
    return { code: 'VERIFIED', message: statusLine, reason: r || undefined };
  }
  if (primary) {
    return { code: 'UNVERIFIED', message: statusLine, reason: r || undefined };
  }
  return { code: 'UNVERIFIED', message: 'Unverified', reason: r || undefined };
}
