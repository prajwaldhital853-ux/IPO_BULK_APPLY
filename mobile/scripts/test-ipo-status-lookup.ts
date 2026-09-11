/**
 * Status lookup + classification checks for IPO Bulk / Current Status fix.
 * Run: npx --yes tsx mobile/scripts/test-ipo-status-lookup.ts
 */
import {
  classifyApplicationPhase,
  isStatusCheckFailed,
} from '../src/utils/ipoApplicationPhase';
import type { ResultAccountStatus } from '../src/services/meroshare/types';

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

/** Mirrors client pagination + applicableIssue fallback decision tree. */
function simulateStatusResolution(input: {
  reportPages: number[][];
  targetCompanyShareId: number;
  reportUnavailable: boolean;
  applicableAlreadyApplied?: boolean;
  applicantFormFound?: boolean;
}): string {
  const { targetCompanyShareId, reportUnavailable } = input;

  if (reportUnavailable) return 'CHECK_FAILED';

  for (const page of input.reportPages) {
    if (page.includes(targetCompanyShareId)) return 'FOUND_IN_REPORT';
  }

  if (input.applicableAlreadyApplied === true) {
    return input.applicantFormFound
      ? 'FOUND_VIA_APPLICABLE_AND_FORM'
      : 'FOUND_VIA_APPLICABLE';
  }
  if (input.applicableAlreadyApplied === false) return 'NOT_APPLIED';

  if (input.applicantFormFound) return 'FOUND_VIA_FORM_ONLY';

  return 'NOT_APPLIED';
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
      classifyApplicationPhase(r) === 'unverified',
      'CHECK_FAILED buckets to unverified (retry), not not_applied',
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

  // --- applicableIssue says fresh apply → genuinely not applied ---
  {
    const hit = simulateStatusResolution({
      reportPages: [[]],
      targetCompanyShareId: 88_008,
      reportUnavailable: false,
      applicableAlreadyApplied: false,
    });
    assert(hit === 'NOT_APPLIED', 'applicableIssue fresh → not_applied');
  }

  // --- CDSC flake: empty report → CHECK_FAILED, not false not_applied ---
  {
    const hit = simulateStatusResolution({
      reportPages: [],
      targetCompanyShareId: 1,
      reportUnavailable: true,
    });
    assert(hit === 'CHECK_FAILED', 'report unavailable → CHECK_FAILED');
  }

  console.log('OK: all IPO status lookup tests passed (9 scenarios).');
}

run();
