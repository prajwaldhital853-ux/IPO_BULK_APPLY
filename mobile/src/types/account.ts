/** Derived from date of birth (under 18 → minor). */
export type AccountHolderType = 'major' | 'minor';

/** Public account meta (safe for AsyncStorage) */
export type AccountMeta = {
  id: string;
  name: string;
  /**
   * MeroShare login clientId (capital.id), e.g. "174".
   * Older accounts may still store the 5-digit DP code here — runtime resolves both.
   */
  dpId: string;
  dpName: string;
  /** 5-digit depository code (e.g. "13700") for demat construction */
  dpCode?: string;
  username: string;
  bankName?: string;
  /** Linked ASBA bank account number (from MeroShare bank detail) */
  accountNumber?: string;
  verified?: boolean;
  /**
   * False when account was saved while no IPO was open — CRN/PIN are checked
   * on the first live Apply against a real opening.
   */
  crnPinVerified?: boolean;
  /** Last 4 of BOID once known from Meroshare */
  boidHint?: string;
  /** Full 16-digit demat / BOID (130 + DP code + username) for public IPO result */
  demat?: string;
  /**
   * MeroShare ownDetail.clientCode — cached after first portfolio fetch
   * so bulk checks can skip an extra API round-trip per account.
   */
  meroClientCode?: string;
  /** ISO date when the account was added on this device */
  addedAt?: string;
  /**
   * Holder date of birth as `YYYY-MM-DD` (A.D.).
   * When set and age < 18, account is auto-classified as minor.
   */
  dateOfBirth?: string;
  /**
   * Under-18 vs adult — derived from dateOfBirth when present.
   * Defaults to major when missing (older saves).
   */
  holderType?: AccountHolderType;
  /** Optional guardian / parent name when holder is a minor */
  guardianName?: string;
  /** When true, opening IPO lists prefer this account on Apply. */
  isPrimary?: boolean;
  /**
   * User opted out — account cannot bulk apply, check results, or run bulk status.
   */
  inactive?: boolean;
};

/** Sensitive fields — SecureStore only */
export type AccountSecrets = {
  password: string;
  crn: string;
  pin: string;
};

/** Combined view used by UI after secrets are merged (never persist whole object) */
export type LinkedAccount = AccountMeta & Partial<AccountSecrets>;

export type DraftCapital = {
  dpId: string;
  dpName: string;
  dpCode?: string;
  username: string;
  password: string;
};
