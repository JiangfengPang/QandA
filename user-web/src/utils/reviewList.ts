export const REVIEW_INITIAL_RENDER_COUNT = 16;
export const REVIEW_RENDER_BATCH_SIZE = 12;
export const REVIEW_SCROLL_LOAD_THRESHOLD_PX = 280;

export function initialReviewRenderCount(total: number) {
  return Math.min(Math.max(0, Math.floor(total)), REVIEW_INITIAL_RENDER_COUNT);
}

export function nextReviewRenderCount(total: number, current: number, batchSize = REVIEW_RENDER_BATCH_SIZE) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeCurrent = Math.min(safeTotal, Math.max(0, Math.floor(current)));
  const safeBatch = Math.max(1, Math.floor(batchSize));
  return Math.min(safeTotal, safeCurrent + safeBatch);
}
