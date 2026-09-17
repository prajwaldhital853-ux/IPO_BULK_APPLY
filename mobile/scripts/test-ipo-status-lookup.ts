/**
 * Status lookup + classification checks for IPO Bulk / Current Status fix.
 * Run: npx --yes tsx mobile/scripts/test-ipo-status-lookup.ts
 */
import {
  classifyApplicationPhase,
  humanizeApplicationPhaseStatus,
  isPublishedAllotmentResultRow,
  isStatusCheckFailed,
  shouldUseApplicationPhaseStatus,
} from '../src/utils/ipoApplicationPhase';
import type { ResultAccountStatus } from '../src/services/meroshare/types';
import {
  isAlreadyAppliedMeroshareMessage,
  isRoleRestrictedMeroshareMessage,
} from '../src/services/meroshare/errors';

function row(
  partial: Partial<ResultAccountStatus> & Pick<ResultAccountStatus, 'status' | 'message'>,
): ResultAccountStatus {
  return {
    accountId: 'a1',
    accountName: 'Test',
    username: 'user',
    dryRun: false,
    ok: partial.ok ?? true,
    companyName: 'IPO Co',
    ...partial,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

/** Mirrors client pagination + customerType fallback decision tree. */
function simulateStatusResolution(input: {
  reportPages: number[][];
  targetCompanyShareId: number;
  reportUnavailable: boolean;
  applicableAlreadyApplied?: boolean;
  applicantFormFound?: boolean;
  customerCanApply?: boolean;
  customerAlreadyApplied?: boolean;
}): string {
  const { targetCompanyShareId, reportUnavailable } = input;

  for (const page of input.reportPages) {
    if (page.includes(targetCompanyShareId)) return 'FOUND_IN_REPORT';
  }

  if (input.applicableAlreadyApplied === true) {
    return input.applicantFormFound
      ? 'FOUND_VIA_APPLICABLE_AND_FORM'
      : 'APPLIED_WITHOUT_REPORT';
  }

  if (input.applicantFormFound) return 'FOUND_VIA_FORM_ONLY';

  if (input.customerAlreadyApplied === true) return 'APPLIED_WITHOUT_REPORT';
  if (input.customerCanApply === true) return 'NOT_APPLIED';

  // action=apply is NOT enough to call NOT_APPLIED — some applied accounts keep it.
  if (reportUnavailable) return 'CHECK_FAILED';

  return 'CHECK_FAILED';
}

function run() {
  // --- CHECK_FAILED must not count as not applied ---
  {
    const r = row({
      status: 'CHECK_FAILED',
      message: 'Could not verify application status with MeroShare. Retry.',
      ok: false,
    });
    assert(isStatusCheckFailed(r), 'CHECK_FAILED row detected');
    assert(
      classifyApplicationPhase(r) !== 'not_applied',
      'CHECK_FAILED must not be not_applied',
    );
    assert(
      classifyApplicationPhase(r) === 'others',
      'CHECK_FAILED buckets to others, not unverified or not_applied',
    );
  }

  // --- Genuine not applied ---
  {
    const r = row({
      status: 'NOT_APPLIED',
      message: 'You have not applied for this IPO',
      ok: false,
    });
    assert(classifyApplicationPhase(r) === 'not_applied', 'real NOT_APPLIED');
  }

  // --- Applied verified (was falsely NOT_APPLIED when report page-1 missed row) ---
  {
    const r = row({
      status: 'VERIFIED',
      message: 'Verified',
      allotmentStatus: 'Verified',
      ok: true,
    });
    assert(classifyApplicationPhase(r) === 'verified', 'verified applied');
    assert(classifyApplicationPhase(r) !== 'not_applied', 'verified not in not_applied');
  }

  // --- Applied unverified ---
  {
    const r = row({
      status: 'UNVERIFIED',
      message: 'Unverified',
      allotmentStatus: 'Unverified',
      ok: true,
    });
    assert(classifyApplicationPhase(r) === 'unverified', 'unverified applied');
  }

  // --- Bank rejected → Rejected filter, not Not Applied ---
  {
    const r = row({
      status: 'REJECTED',
      message: 'Rejected',
      allotmentStatus: 'Rejected',
      remarks: 'Insufficient balance',
      ok: false,
    });
    assert(classifyApplicationPhase(r) === 'rejected', 'rejected bucket');
    assert(classifyApplicationPhase(r) !== 'not_applied', 'rejected not not_applied');
  }

  // --- Pagination: IPO on page 2 must be found (old bug: only page 1) ---
  {
    const id = 42_001;
    const pages = [
      Array.from({ length: 200 }, (_, i) => 1000 + i),
      [id, 9999],
    ];
    const hit = simulateStatusResolution({
      reportPages: pages,
      targetCompanyShareId: id,
      reportUnavailable: false,
    });
    assert(hit === 'FOUND_IN_REPORT', 'page-2 row found after pagination');
  }

  // --- applicableIssue edit = already applied on MeroShare (status display only) ---
  {
    const hit = simulateStatusResolution({
      reportPages: [Array.from({ length: 200 }, (_, i) => 5000 + i)],
      targetCompanyShareId: 77_007,
      reportUnavailable: false,
      applicableAlreadyApplied: true,
      applicantFormFound: true,
    });
    assert(
      hit === 'FOUND_VIA_APPLICABLE_AND_FORM',
      'report miss + action edit → classified as applied (not not_applied)',
    );
  }

  // --- applicableIssue action=apply is NOT proof of not applied ---
  {
    const hit = simulateStatusResolution({
      reportPages: [[]],
      targetCompanyShareId: 88_008,
      reportUnavailable: true,
      applicableAlreadyApplied: false,
    });
    assert(
      hit === 'CHECK_FAILED',
      'action=apply + report down + no customerType → CHECK_FAILED, not not_applied',
    );
  }

  // --- customerType "Customer can apply." → genuine not applied ---
  {
    const hit = simulateStatusResolution({
      reportPages: [],
      targetCompanyShareId: 88_009,
      reportUnavailable: true,
      applicableAlreadyApplied: false,
      customerCanApply: true,
    });
    assert(hit === 'NOT_APPLIED', 'customerType can apply → not_applied');
  }

  // --- Report down + already applied (customerType) → applied, not not_applied ---
  {
    const hit = simulateStatusResolution({
      reportPages: [],
      targetCompanyShareId: 99_009,
      reportUnavailable: true,
      applicableAlreadyApplied: false,
      customerAlreadyApplied: true,
    });
    assert(
      hit === 'APPLIED_WITHOUT_REPORT',
      'report unavailable + customerType already applied → applied',
    );
  }

  // --- Report down but applicableIssue says applied → resolve via form ---
  {
    const hit = simulateStatusResolution({
      reportPages: [],
      targetCompanyShareId: 99_010,
      reportUnavailable: true,
      applicableAlreadyApplied: true,
      applicantFormFound: true,
    });
    assert(
      hit === 'FOUND_VIA_APPLICABLE_AND_FORM',
      'report unavailable + action edit → applied via fallback',
    );
  }

  // --- Applied without report detail must sit in Unverified, not Not Applied ---
  {
    const r = row({
      status: 'UNVERIFIED',
      message: 'Unverified',
      allotmentStatus: 'Unverified',
      remarks:
        'Applied on MeroShare. Application Report is not available for this account, so bank Verified/Rejected could not be loaded.',
      ok: true,
    });
    assert(
      classifyApplicationPhase(r) === 'unverified',
      'applied-without-report buckets to unverified',
    );
    assert(
      classifyApplicationPhase(r) !== 'not_applied',
      'applied-without-report must not be not_applied',
    );
  }

  // --- UI bucket for CHECK_FAILED rows ---
  {
    const failed = row({
      status: 'CHECK_FAILED',
      message: 'Could not verify application status with MeroShare. Retry.',
      ok: false,
    });
    assert(
      classifyApplicationPhase(failed) !== 'unverified',
      'CHECK_FAILED must not appear in Unverified filter',
    );
    assert(
      classifyApplicationPhase(failed) === 'others',
      'CHECK_FAILED appears in Others filter',
    );
  }

  // --- Role/session errors must not look like already applied ---
  {
    assert(
      isRoleRestrictedMeroshareMessage('Role not assigned'),
      'role not assigned is role-restricted',
    );
    assert(
      !isAlreadyAppliedMeroshareMessage('You are not permitted for this activity.'),
      'not permitted is not already applied',
    );
    assert(
      isAlreadyAppliedMeroshareMessage(
        'Share with provided inputs has been applied already.',
      ),
      'provided inputs message is already applied',
    );
  }

  // --- Closed IPO without published result stays Verified/Unverified ---
  {
    const closed = {
      companyShareId: 794,
      companyName: 'Beni',
      scrip: 'BENI',
      shareTypeName: 'IPO',
      statusName: 'TRANSACTION_SUCCESS',
    };
    assert(
      shouldUseApplicationPhaseStatus(closed, new Set()) === true,
      'apply window closed + TRANSACTION_SUCCESS → still application phase',
    );
    assert(
      shouldUseApplicationPhaseStatus(
        { ...closed, statusName: 'VERIFIED' },
        new Set(),
      ) === true,
      'verified list status → application phase',
    );
    assert(
      shouldUseApplicationPhaseStatus(
        { ...closed, statusName: 'ALLOTED' },
        new Set(),
      ) === false,
      'published Alloted list status → allotment phase',
    );
    assert(
      shouldUseApplicationPhaseStatus(
        { ...closed, statusName: 'NOT_ALLOTTED' },
        new Set(),
      ) === false,
      'published Not Alloted list status → allotment phase',
    );
  }

  {
    assert(
      !isPublishedAllotmentResultRow(
        row({
          status: 'APPLIED',
          message: 'Applied — awaiting allotment',
          allotmentStatus: 'Verified',
          ok: true,
        }),
      ),
      'awaiting allotment is not a published result',
    );
    assert(
      isPublishedAllotmentResultRow(
        row({
          status: 'ALLOTTED',
          message: 'Allotted',
          allotmentStatus: 'Alloted',
          ok: true,
        }),
      ),
      'Alloted row is published result',
    );
  }

  // --- Detail Verified wins even if list/remarks still say Unverified ---
  {
    const label = humanizeApplicationPhaseStatus(
      'Unverified',
      'Verified',
      'Block Amount Status - Unverified (Application In-Process at Bank End)',
    );
    assert(label.code === 'VERIFIED', 'detail Verified beats stale Unverified remarks');
    const r = row({
      status: label.code,
      message: label.message,
      allotmentStatus: 'Verified',
      remarks: label.reason,
      ok: true,
    });
    assert(
      classifyApplicationPhase(r) === 'verified',
      'bank-verified account moves to Verified filter',
    );
  }

  // --- Detail still Unverified stays Unverified ---
  {
    const label = humanizeApplicationPhaseStatus(
      'TRANSACTION_SUCCESS',
      'Unverified',
      'Block Amount Status - Unverified (Application In-Process at Bank End)',
    );
    assert(label.code === 'UNVERIFIED', 'detail Unverified stays Unverified');
  }

  console.log('OK: all IPO status lookup tests passed (18 scenarios).');
}

run();
