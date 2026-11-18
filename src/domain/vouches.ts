/**
 * Friend vouches (from the market review): a friend, sent a link, picks up to three things from a
 * fixed list. Picked, never typed, so a vouch can carry nothing else. Labelled on the card as
 * friends' words, not checked by Pinkilock. The same list is checked in SQL (vouch()).
 */
export const VOUCH_PHRASES = [
  'always on time',
  'great listener',
  'funniest person I know',
  'kind to strangers',
  'good in a crisis',
  'makes everyone comfortable',
  'keeps their word',
  'gives the best advice',
] as const;

export const VOUCH_MAX_PICKS = 3;
