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
