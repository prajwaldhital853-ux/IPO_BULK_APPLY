export type CaptchaPayload = {
  captchaId: string;
  /** data-url or remote URL for UI if interactive captcha needed */
  image?: string;
};

export type MeroshareSession = {
  token: string;
  refreshToken?: string;
  clientId: number;
  username: string;
  boid?: string;
  demat?: string;
  dpCode?: string;
  /** ownDetail.clientCode — required by myPortfolio (NOT the 5-digit DP code) */
  clientCode?: string;
};

export type OpenIssue = {
  id: number;
  companyShareId: number;
  companyName: string;
  scrip: string;
  shareTypeName: string;
  shareGroupName?: string;
  issueOpenDate?: string;
  issueCloseDate?: string;
  maxUnit?: number;
  minUnit?: number;
  /** True when MeroShare returns action "edit" (already applied) */
  alreadyApplied?: boolean;
};

export type ApplyRequest = {
  companyShareId: number;
  appliedKitta: number;
  crnNumber: string;
  transactionPIN: string;
  accountId: string;
  accountName: string;
  username: string;
  dpId: string;
  dpCode?: string;
};

export type ApplyAccountResult = {
  accountId: string;
  accountName: string;
  username: string;
  ok: boolean;
  dryRun: boolean;
  message: string;
  companyName?: string;
  kitta?: number;
};

export type BulkApplySummary = {
  dryRun: boolean;
  companyName: string;
  companyShareId: number;
  kitta: number;
  results: ApplyAccountResult[];
  stoppedEarly: boolean;
};

export type ResultAccountStatus = {
  accountId: string;
  accountName: string;
  username: string;
  ok: boolean;
  dryRun: boolean;
  status: string;
  message: string;
  companyName?: string;
  /** Applied kitta from report when available */
  appliedKitta?: number;
  /** Allotment outcome when available */
  allotmentStatus?: string;
  /** Block amount / remarks from report detail */
  remarks?: string;
};

export type PortfolioHoldingRow = {
  script: string;
  scriptDesc?: string;
  quantity: number;
  lastTransactionPrice: number | null;
  previousClosingPrice: number | null;
  valueAtLtp: number | null;
};

export type ApplicationReportRow = {
  companyShareId: number;
  companyName: string;
  scrip: string;
  shareTypeName: string;
  statusName: string;
  applicantFormId?: number;
  appliedKitta?: number;
  appliedDate?: string;
};

/** Full Application Report detail (MeroShare report/detail). */
export type ApplicationReportDetail = {
  companyShareId: number;
  companyName: string;
  scrip: string;
  shareTypeName: string;
  statusName: string;
  applicantFormId?: number;
  appliedKitta?: number;
  /** Units actually allotted (only meaningful when allotted). */
  allottedKitta?: number;
  amount?: number | null;
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
  /** 16-digit demat / BOID of the applicant. */
  boid?: string;
  appliedDate?: string;
  remarks?: string;
  /** Short rejection/allotment reason (e.g. "Insufficient balance"). */
  reason?: string;
};

export type BulkResultSummary = {
  dryRun: boolean;
  companyName: string;
  companyShareId: number;
  results: ResultAccountStatus[];
  stoppedEarly: boolean;
};
