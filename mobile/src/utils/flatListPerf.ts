/** Shared FlatList tuning for long account lists (200–500+ rows). */
export const ACCOUNT_LIST_FLAT_PROPS = {
  initialNumToRender: 14,
  maxToRenderPerBatch: 10,
  windowSize: 8,
  removeClippedSubviews: true,
  updateCellsBatchingPeriod: 50,
} as const;
