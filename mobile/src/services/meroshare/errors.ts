export class MeroshareError extends Error {
  code: 'AUTH' | 'CAPTCHA' | 'NETWORK' | 'RATE' | 'APPLY' | 'UNKNOWN';
  constructor(
    code: MeroshareError['code'],
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'MeroshareError';
  }
}

/** User-facing copy when MeroShare reports an existing or in-flight application. */
export const ALREADY_APPLIED_USER_MSG =
  'This IPO has already been applied for this account.';

/** Shown on apply cards / summary when inputs were already used for this IPO. */
export const ALREADY_APPLIED_DISPLAY_MSG =
  'Share with provided inputs has been applied already.';

/** User-facing copy when a previous application was rejected by the bank. */
export const REJECTED_APPLICANT_USER_MSG =
  'Your bank rejected the previous application for this IPO. Check Current IPO Status for the reason, fix the issue, then tap Reapply if the IPO is still open.';

export function buildRejectedApplicantUserMessage(
  remarks?: string | null,
): string {
  const reason = String(remarks ?? '').trim();
  if (!reason) return REJECTED_APPLICANT_USER_MSG;
  return `Your bank rejected the previous application for this IPO (${reason}). Fix this issue, then tap Reapply if the IPO is still open.`;
}

/** Flaky CDSC / MeroShare responses that usually succeed on a short retry. */
export function isTransientMeroshareMessage(message: string): boolean {
  if (
    isAlreadyAppliedMeroshareMessage(message) ||
    isRejectedApplicantMeroshareMessage(message)
  ) {
    return false;
  }
  return /unable to (process|proceed)|try again|temporarily|at the moment|timeout|timed out|network request failed|502|503|504|ECONNRESET|ETIMEDOUT|HTML response|captive portal|rate.?limit|too many requests|please wait|no authorization token|retry once/i.test(
    message,
  );
}

export function isTransientMeroshareError(error: unknown): boolean {
  if (error instanceof MeroshareError) {
    if (error.code === 'AUTH' || error.code === 'CAPTCHA') return false;
    if (error.code === 'NETWORK' || error.code === 'RATE') return true;
    return isTransientMeroshareMessage(error.message);
  }
  if (error instanceof Error) {
    return isTransientMeroshareMessage(error.message);
  }
  return false;
}

/** CDSC blocks some APIs (bank list, portfolio) for minor / restricted roles. */
export function isRoleRestrictedMeroshareMessage(message: string): boolean {
  return /role\s*not\s*authorized|not\s*authorized\s*for|access\s*denied|permission\s*denied|insufficient\s*privilege|forbidden\s*role/i.test(
    message,
  );
}

/**
 * Account already has an application for this company share (or bank is still processing it).
 *
 * CDSC also returns vague technical lines on repeat apply (same account + same IPO), e.g.
 * "You are not permitted for this activity." — same handling as IPO BULK on Play Store.
 */
export function isAlreadyAppliedMeroshareMessage(message: string): boolean {
  const m = String(message ?? '').trim();
  if (!m) return false;
  return (
    /already\s*applied|has already been applied|duplicate application|application already exist|you have already applied|cannot apply again|already submitted|application\s+in\s+process|application\s+is\s+in\s+process|apply\s+in\s+process|this ipo is already applied/i.test(
      m,
    ) ||
    /not\s*permitted\s*for\s*this\s*activity/i.test(m)
  );
}

/** True for bulk-apply result rows that mean "already applied" (not a real failure). */
export function isAlreadyAppliedApplyMessage(message: string): boolean {
  const m = message.trim();
  return (
    isAlreadyAppliedMeroshareMessage(message) ||
    m === ALREADY_APPLIED_USER_MSG ||
    m === ALREADY_APPLIED_DISPLAY_MSG
  );
}

/** MeroShare blocks editing a rejected application record (user may reapply if IPO is open). */
export function isRejectedApplicantMeroshareMessage(message: string): boolean {
  return /cannot\s+edit\s+rejected|rejected\s+applicant|cannot\s+modify\s+rejected|edit\s+rejected\s+applicant/i.test(
    message,
  );
}

export function isRejectedApplicantApplyMessage(
  message: string,
  rejectedPrevious?: boolean,
): boolean {
  return (
    Boolean(rejectedPrevious) ||
    isRejectedApplicantMeroshareMessage(message) ||
    message.trim() === REJECTED_APPLICANT_USER_MSG ||
    /^your bank rejected the previous application/i.test(message.trim())
  );
}

export function isRoleRestrictedMeroshareError(error: unknown): boolean {
  if (error instanceof MeroshareError) {
    return isRoleRestrictedMeroshareMessage(error.message);
  }
  if (error instanceof Error) {
    return isRoleRestrictedMeroshareMessage(error.message);
  }
  return false;
}

/** Strip HTTP status noise from user-facing MeroShare error text. */
export function sanitizeMeroshareMessage(message: string): string {
  let m = String(message ?? '').trim();
  if (!m) return m;
  m = m.replace(/\s*\(HTTP\s+\d{3}(?:\s*·\s*[^)]+)?\)/gi, '');
  m = m.replace(/\s*\(HTTP\s+\d{3}\)/gi, '');
  m = m.replace(/\s*HTTP\s+\d{3}(?:\s+from\s+\S+)?\s*$/gi, '');
  m = m.replace(/^HTTP\s+\d{3}(?:\s+from\s+\S+)?[:\s-]*/i, '');
  return m.trim().replace(/\s{2,}/g, ' ');
}

export async function withMeroshareRetries<T>(
  run: () => Promise<T>,
  opts: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await run();
    } catch (e) {
      lastError = e;
      if (!isTransientMeroshareError(e) || i === attempts - 1) break;
      const wait = 900 * (i + 1) + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new MeroshareError(
        'UNKNOWN',
        opts.label ? `${opts.label} failed` : 'MeroShare request failed',
      );
}
