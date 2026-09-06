/** Temporary migration tool — bulk-fetch ASBA bank account numbers after old backup import. */
export const BULK_FETCH_BANK_DETAILS_ENABLED =
  (process.env.EXPO_PUBLIC_BULK_FETCH_BANK_DETAILS ?? 'false').toLowerCase() ===
  'true';
