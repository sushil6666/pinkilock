/**
 * What a profile and an ask may contain (docs/build-plan.md, WP1). The server is the authority:
 * `save_profile` and `send_invite` in supabase/migrations enforce the same rules with the same
 * error codes. This copy lets the app say no before the server does, and makes the mock behave
 * the same. tests/unit/profile.test.ts runs one table of lines through this file, and
 * tests/db/profile_rules.sql runs the same table through the SQL.
 *
 * The contact check stops the plain cases (a handle, a link, a number, "add me on ..."). It does
 * not stop an invented code; that needs review before a line is shown (WP1, not built yet).
 */
import { AppError } from './errors';
import { IDEAS, VIBES } from './ideas';
import type { OnboardingInput } from './types';

export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const AREA_MAX = 40;
export const PRONOUNS_MAX = 20;
export const TAGLINE_MAX = 80;
export const PLACE_MAX = 60;
export const VIBES_MAX = 3;
export const IDEAS_MIN = 3;
export const IDEAS_MAX = 6;
export const HANDLE_MIN = 2;
export const HANDLE_MAX = 40;

/** A first name: one word of letters. No digits, spaces, dots, underscores or symbols. */
export function nameOk(name: string): boolean {
  const n = name.trim();
  const length = [...n].length;
  return length >= NAME_MIN && length <= NAME_MAX && !/[\d\s\p{P}\p{S}]/u.test(n);
}

const APPS = 'instagram|insta|snapchat|whatsapp|telegram|discord|facebook|tiktok|twitter|wechat|kakao|linkedin';
const PHRASES = 'add me|find me on|dm me|text me|call me|ping me|hit me up|my number|my handle|my id|decode';
const DIGIT_WORDS = 'zero|one|two|three|four|five|six|seven|eight|nine';

/** The same five patterns as private.looks_like_contact in SQL. Keep them identical. */
const CONTACT_PATTERNS: RegExp[] = [
  /@/,
  new RegExp('(https?://|www\\.|[a-z0-9-]+\\.(com|in|me|io|co|net|org|app|ly|gg|link)([^a-z]|$))'),
  /[0-9]([ .()-]*[0-9]){4,}/,
  new RegExp(`(^|[^a-z])(${APPS}|ig|${PHRASES})([^a-z]|$)`),
  new RegExp(`(^|[^a-z])(${DIGIT_WORDS})([^a-z]+(${DIGIT_WORDS})){3,}([^a-z]|$)`),
];

/** True when a line looks like a way to reach the writer outside the app. */
export function looksLikeContact(text: string | null | undefined): boolean {
  const t = (text ?? '').toLowerCase();
  return CONTACT_PATTERNS.some((p) => p.test(t));
}

const ideaIds = new Set(IDEAS.map((i) => i.id));
const vibeSet = new Set(VIBES);

/** Throws the same coded error the server would for a profile it would refuse. */
export function checkProfile(p: Pick<OnboardingInput, 'name' | 'age' | 'area' | 'pronouns' | 'tagline' | 'vibes' | 'ideaIds'>): void {
  if (!nameOk(p.name)) throw new AppError('PL060');
  if (!Number.isInteger(p.age) || p.age < 18 || p.age > 99) throw new AppError('PL061');
  if (p.vibes.length > VIBES_MAX || new Set(p.vibes).size !== p.vibes.length || p.vibes.some((v) => !vibeSet.has(v))) throw new AppError('PL062');
  if (p.ideaIds.length < IDEAS_MIN || p.ideaIds.length > IDEAS_MAX || new Set(p.ideaIds).size !== p.ideaIds.length || p.ideaIds.some((id) => !ideaIds.has(id))) throw new AppError('PL063');
  if ([...p.area.trim()].length > AREA_MAX || [...p.pronouns.trim()].length > PRONOUNS_MAX || [...p.tagline.trim()].length > TAGLINE_MAX) throw new AppError('PL064');
  if (looksLikeContact(p.tagline) || looksLikeContact(p.area) || looksLikeContact(p.pronouns)) throw new AppError('PL065');
}

export function checkContact(kind: string, handle: string): void {
  const h = handle.trim();
  if (!['Instagram', 'Snapchat', 'WhatsApp'].includes(kind) || h.length < HANDLE_MIN || h.length > HANDLE_MAX) throw new AppError('PL066');
}

/** The one line and the place on an ask. */
export function checkAsk(note: string, place: string): void {
  if ([...place.trim()].length > PLACE_MAX) throw new AppError('PL064');
  if (looksLikeContact(note) || looksLikeContact(place)) throw new AppError('PL065');
}

/**
 * One table for both copies of the contact check: [line, should it be refused].
 * tests/unit/profile.test.ts and tests/db/profile_rules.sql both run it.
 */
export const CONTACT_CASES: [string, boolean][] = [
  ['dm me on insta @xavier.real', true],
  ['@aanya', true],
  ['aanya.frames on IG', true],
  ['find me on snapchat', true],
  ['whatsapp is easier', true],
  ['telegram: sam_k', true],
  ['call me 98765 43210', true],
  ['9876543210', true],
  ['+91 (98765) 43-210', true],
  ['98.76.54.32.10', true],
  ['wa.me/919876543210', true],
  ['https://example.com/me', true],
  ['www.example.org', true],
  ['sam-k.io', true],
  ['add me, you know where', true],
  ['text me after', true],
  ['hit me up', true],
  ['my number is in the name', true],
  ['my handle is the same everywhere', true],
  ['nine eight seven six five, then four three two one zero', true],
  ['One Two Three Four', true],
  ['decode the first letters', true],
  ['Insta', true],
  ['discord gang', true],
  ['Will judge your boba order. Lovingly.', false],
  ['Ten minutes of coffee, zero minutes of small talk.', false],
  ['Three songs. I will know everything about you.', false],
  ['Golden hour or nothing.', false],
  ['born in 1999, 5 feet 10', false],
  ['my toxic trait: I am always early', false],
  ['the ick: clapping when the plane lands', false],
  ['ask me about my plants', false],
  ['Bandra West', false],
  ['Sector 15, Noida', false],
  ['she/her', false],
  ['Boba counter, Linking Road', false],
  ['one more round, then two more', false],
  ['big fan of bad puns', false],
  ['coming in hot', false],
  ['i will be early. it is a whole thing.', false],
  ['you, me, twenty minutes. that is the pitch.', false],
  ['pinky promise to keep it pg. ish.', false],
  ['Co-op game, 2 rounds', false],
  ['signal me with a wave', false],
];
