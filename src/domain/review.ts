/**
 * When the store's review prompt may show (D110): at most once in REVIEW_GAP_DAYS on a phone, and
 * only after a happy moment. Pure TypeScript, for the unit test; src/lib/review.ts shows the prompt.
 */
export type ReviewMoment = 'kept_plan' | 'match' | 'good_call';
export const REVIEW_GAP_DAYS = 60;
const DAY = 86_400_000;

export function mayAsk(lastAsked: number | null, now: number): boolean {
  return lastAsked === null || now - lastAsked >= REVIEW_GAP_DAYS * DAY;
}
