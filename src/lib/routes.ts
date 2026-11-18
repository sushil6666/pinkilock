/**
 * What every route is called, and which ones a visitor with no profile may open. One list, so
 * the browser tab's title and the gate in `app/_layout.tsx` can never disagree with the routes.
 * Keys are a route's segments joined with "/", as Expo Router reports them. No React, no IO.
 *
 * Titles never carry a name, an idea or a place: a page title is kept in the browser's history
 * and shown on a shared screen.
 */
export const APP_NAME = 'Pinkilock';

const TITLES: Record<string, string> = {
  '': APP_NAME,
  onboarding: 'Welcome',
  '(tabs)': 'Discover',
  '(tabs)/invites': 'Asks',
  '(tabs)/plans': 'Plans',
  '(tabs)/me': 'Me',
  'profile/[id]': 'Profile',
  'report/[id]': 'Report',
  'invite/new': 'Vibe check',
  'invite/[id]': 'Vibe check',
  'lock/[id]': 'The Pinkilock',
  'plan/[id]': 'Plan',
  'account/sign-in': 'Sign in',
  'account/blocked': 'Blocked',
  'account/requests': 'Ask us',
  'legal/[doc]': 'Terms and privacy',
  safety: 'Safety',
  'vouch/[token]': 'Vouch for a friend',
  'duo/[token]': 'Join a duo',
  '+not-found': 'Not found',
};

/**
 * Open without a profile: the gate itself, onboarding, signing back in, the not-found page, and
 * the terms and privacy policy, which onboarding asks a person to agree to before a profile exists,
 * and a friend's vouch link, which is for people who may never join (it shows a first name and a
 * fixed list of phrases, and nothing else).
 */
const OPEN = new Set(['', 'onboarding', 'account/sign-in', '+not-found', 'legal/[doc]', 'vouch/[token]']);

const key = (segments: readonly string[]) => segments.join('/');

/** "Plans · Pinkilock". A route that is not in the list gets the app's name alone. */
export function titleFor(segments: readonly string[]): string {
  const title = TITLES[key(segments)];
  return title && title !== APP_NAME ? `${title} · ${APP_NAME}` : APP_NAME;
}

/** True for every screen that shows or changes something that belongs to a person. */
export function needsProfile(segments: readonly string[]): boolean {
  return !OPEN.has(key(segments));
}

/** Every route the list knows, for the test that compares it with the files in `app/`. */
export const KNOWN_ROUTES = Object.keys(TITLES);
