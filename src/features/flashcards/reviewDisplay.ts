/** Return a view-only slice for review cards; the stored entry arrays are never changed. */
export function getVisibleReviewItems<T>(items: readonly T[], limit: number, expanded: boolean): readonly T[] {
  return expanded || items.length <= limit ? items : items.slice(0, limit);
}
