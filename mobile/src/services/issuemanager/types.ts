export type IssueManagerCompany = {
  /** Stable key across providers: `${provider}:${rawId}` */
  key: string;
  provider: string;
  /** Provider-native id/code used in check calls */
  rawId: string;
  name: string;
  providerLabel: string;
  /** Stock symbol when known — used to skip CDSC duplicates of manager IPOs. */
  scrip?: string;
};

export type IssueManagerCheckResult = {
  ok: boolean;
  allotted: boolean;
  quantity?: number;
  message: string;
};

export type IssueManagerProvider = {
  id: string;
  label: string;
  listCompanies: () => Promise<IssueManagerCompany[]>;
  checkBoid: (
    company: IssueManagerCompany,
    boid: string,
  ) => Promise<IssueManagerCheckResult>;
};
