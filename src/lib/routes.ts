/**
 * What every route is called, and which ones a visitor with no profile may open. One list, so
 * the browser tab's title and the gate in `app/_layout.tsx` can never disagree with the routes.
 * Keys are a route's segments joined with "/", as Expo Router reports them. No React, no IO.
 *
 * Titles never carry a name, an idea or a place: a page title is kept in the browser's history
 * and shown on a shared screen.
 */
import { t, type Key } from '../i18n';

export const APP_NAME = 'Pinkilock';

/** Keys into src/i18n (`titles`); null is the app's name alone. */
const TITLES: Record<string, Key | null> = {
  '': null,
  onboarding: 'titles.welcome',
  '(tabs)': 'titles.discover',
  '(tabs)/invites': 'titles.asks',
  '(tabs)/plans': 'titles.plans',
  '(tabs)/me': 'titles.me',
  'profile/[id]': 'titles.profile',
  'report/[id]': 'titles.report',
  'invite/new': 'titles.vibeCheck',
  'invite/[id]': 'titles.vibeCheck',
  'lock/[id]': 'titles.thePinkilock',
  'plan/[id]': 'titles.plan',
  'account/sign-in': 'titles.signIn',
  'account/blocked': 'titles.blocked',
  'account/requests': 'titles.askUs',
  face: 'titles.face',
  'legal/[doc]': 'titles.termsAndPrivacy',
  safety: 'titles.safety',
  'vouch/[token]': 'titles.vouchForAFriend',
  'duo/[token]': 'titles.joinADuo',
  'self-love': 'titles.selfLove',
  'self-love/bounce-back': 'titles.bounceBack',
  couple: 'titles.couple',
  spicy: 'titles.spicy',
  wallet: 'titles.wallet',
  'pink-gold': 'titles.pinkGold',
  talk: 'titles.talk',
  'talk/ai': 'titles.talkAi',
  'talk/listeners': 'titles.talkListeners',
  'talk/listen': 'titles.talkListen',
  'r/[code]': 'titles.invite',
  friends: 'titles.friends',
  '+not-found': 'titles.notFound',
};

/**
 * Open without a profile: the gate itself, onboarding, signing back in, the not-found page, and
 * the terms and privacy policy, which onboarding asks a person to agree to before a profile exists,
 * a friend's vouch link, which is for people who may never join (it shows a first name and a
 * fixed list of phrases, and nothing else), and the safety page, which the terms point to and which
 * holds the emergency numbers: someone in danger should never be asked to sign in first. A friend's
 * invite link (r/[code]) opens too: it keeps the code for after onboarding and shows nothing about the friend.
 * So does a friend's Doubles invite (duo/[token], D118): it shows the friend's first name, as a vouch
 * link does, and keeps the link for after onboarding; joining needs a profile.
 */
const OPEN = new Set(['', 'onboarding', 'account/sign-in', '+not-found', 'legal/[doc]', 'vouch/[token]', 'safety', 'r/[code]', 'duo/[token]']);

const key = (segments: readonly string[]) => segments.join('/');

/** "Plans · Pinkilock". A route that is not in the list gets the app's name alone. */
export function titleFor(segments: readonly string[]): string {
  const title = TITLES[key(segments)];
  return title ? t('titles.withApp', { title: t(title), app: APP_NAME }) : APP_NAME;
}

/** True for every screen that shows or changes something that belongs to a person. */
export function needsProfile(segments: readonly string[]): boolean {
  return !OPEN.has(key(segments));
}

/** Every route the list knows, for the test that compares it with the files in `app/`. */
export const KNOWN_ROUTES = Object.keys(TITLES);
