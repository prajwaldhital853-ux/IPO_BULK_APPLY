import type { ApplyAccountResult } from '../services/meroshare/types';
import {
  ALREADY_APPLIED_DISPLAY_MSG,
  isAlreadyAppliedApplyMessage,
} from '../services/meroshare/errors';
import { sanitizeMeroshareMessage } from '../services/meroshare';

export type ApplyOutcome =
  | 'applied'
  | 'already_applied'
  | 'invalid_crn'
  | 'invalid_pin'
  | 'invalid_login'
  | 'insufficient_balance'
  | 'missing_secrets'
  | 'other';

export function resolveApplyOutcome(row: ApplyAccountResult): ApplyOutcome {
  if (isAlreadyAppliedApplyMessage(row.message)) return 'already_applied';
  if (row.ok) return 'applied';
  const m = row.message.toLowerCase();
  if (/missing password|missing crn|missing pin/i.test(m)) return 'missing_secrets';
  if (/wrong crn|invalid crn/i.test(m)) return 'invalid_crn';
  if (
    /wrong transaction pin|invalid pin|incorrect pin|wrong pin|transaction pin/i.test(
      m,
    )
  ) {
    return 'invalid_pin';
  }
  if (
    /wrong password|invalid username|invalid password|credential|unauthorized|wrong depository/i.test(
      m,
    )
  ) {
    return 'invalid_login';
  }
  if (/insufficient|balance|block.?fail/i.test(m)) return 'insufficient_balance';
  return 'other';
}

export function isApplySuccessOutcome(outcome: ApplyOutcome): boolean {
  return outcome === 'applied' || outcome === 'already_applied';
}

export function applyOutcomeNeedsUpdate(outcome: ApplyOutcome): boolean {
  return (
    outcome === 'invalid_crn' ||
    outcome === 'invalid_pin' ||
    outcome === 'invalid_login'
  );
}

export function applyDisplayMessage(row: ApplyAccountResult): string {
  const outcome = resolveApplyOutcome(row);
  if (outcome === 'already_applied') return ALREADY_APPLIED_DISPLAY_MSG;
  return sanitizeMeroshareMessage(row.message);
}

export function applyOutcomeLabel(outcome: ApplyOutcome): string {
  switch (outcome) {
    case 'applied':
      return 'Applied';
    case 'already_applied':
      return 'Already Applied';
    case 'invalid_crn':
      return 'Invalid CRN';
    case 'invalid_pin':
      return 'Invalid PIN';
    case 'invalid_login':
      return 'Invalid login';
    case 'insufficient_balance':
      return 'Insufficient balance';
    case 'missing_secrets':
      return 'Missing CRN/PIN';
    default:
      return 'Not applied';
  }
}

export function countApplyOutcomes(
  rows: ApplyAccountResult[],
): Record<ApplyOutcome, number> {
  const counts: Record<ApplyOutcome, number> = {
    applied: 0,
    already_applied: 0,
    invalid_crn: 0,
    invalid_pin: 0,
    invalid_login: 0,
    insufficient_balance: 0,
    missing_secrets: 0,
    other: 0,
  };
  for (const row of rows) {
    counts[resolveApplyOutcome(row)] += 1;
  }
  return counts;
}
