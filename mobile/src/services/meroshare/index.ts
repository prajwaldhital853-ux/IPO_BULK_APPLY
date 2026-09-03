export { MeroshareClient, DEMO_OPENINGS, humanizeApplicationStatus } from './client';
export { runBulkApply, loadOpenIssuesForUi, loadAllOpenIssuesForUi, loadCurrentOpenIssuesForUi } from './applyEngine';
export {
  runBulkResultCheck,
  loadCheckableIssuesForUi,
  loadApplicationReportDetailForUi,
  loadAllApplicationDetailsForUi,
} from './resultEngine';
export {
  verifyMeroshareLogin,
  verifyAccountForSave,
} from './verifyLogin';
export type { VerifyAccountResult, VerifyField } from './verifyLogin';
export {
  fetchCapitalList,
  resolveClientId,
  getStaticCapitalList,
} from './capital';
export { fetchCaptchaPayload, solveCaptchaInteractive } from './captcha';
export { importPortfolioFromMeroshare } from './portfolioImport';
export type { ImportedHolding, ImportResult, ImportPortfolioOpts } from './portfolioImport';
export { runBulkPortfolioCheck } from './bulkPortfolioEngine';
export type { BulkPortfolioAccountResult } from './bulkPortfolioEngine';
export type {
  OpenIssue,
  ApplyAccountResult,
  BulkApplySummary,
  ApplyRequest,
  ResultAccountStatus,
  BulkResultSummary,
  ApplicationReportRow,
  ApplicationReportDetail,
  PortfolioHoldingRow,
} from './types';
export type { CapitalDp } from './capital';
export {
  MeroshareError,
  sanitizeMeroshareMessage,
  isTransientMeroshareError,
  isRoleRestrictedMeroshareError,
  isRoleRestrictedMeroshareMessage,
} from './errors';
