export type LinkedAccount = {
  id: string;
  name: string;
  dpId: string;
  dpName: string;
  username: string;
  /** Demo only — later moved to SecureStore */
  password?: string;
  bankName?: string;
  crn?: string;
  pin?: string;
  verified?: boolean;
};
