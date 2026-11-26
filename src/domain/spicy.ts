/**
 * Spicy mode (D103): an opt-in for adults who both want to take things further, off Pinkilock.
 * Off by default. Turning it on takes a profile (18 or older), a phone or an email on the account,
 * a yes to "I am 18 or older", a yes to the safety rules, and a Discord username (first choice), a
 * Telegram username or a Signal username. Never a phone number.
 *
 * It shows only between two people who both have it on, from day one (no plan needed): on the
 * card of someone Discover showed me, or someone I share an ask or a plan with, nobody blocked.
 * There each can see the other's boundaries and say yes to moving the chat. Only when both said yes does either see the other's
 * username, Discord first. Nobody is ever told that the other said no or has not answered.
 * Pinkilock hosts no chat and no explicit content; the chat happens in Discord or Telegram.
 *
 * The same rules are in SQL (supabase/migrations/20261125000002_spicy.sql: save_spicy, spicy_off,
 * spicy_with, spicy_yes); the mock follows these. SPICY_HANDLE_CASES is the shared table
 * (tests/db/spicy_cases.sql is generated from it: UPDATE_CASES=1 npm run test:unit).
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { AppError, type ErrorCode } from './errors';

/** Limits the person picks from; nobody types them, so nothing can be hidden in one. */
export const BOUNDARIES = ['words_only', 'no_photos', 'no_video', 'face_private', 'ask_first', 'slow'] as const;
export type Boundary = (typeof BOUNDARIES)[number];
export const isBoundary = (b: unknown): b is Boundary => typeof b === 'string' && (BOUNDARIES as readonly string[]).includes(b);

/** The safety rules, in src/i18n as `spicy.rules.r1` to `rN`. All shown before turning on. */
export const SAFETY_RULES = 8;
/** The ones shown again just before a yes: phone number, face, where you are, money. */
export const HANDOFF_RULES = [1, 2, 3, 4] as const;

export type SpicyApp = 'discord' | 'telegram' | 'signal';
/** In the order they are offered and shown: Discord first, Signal last. */
export const SPICY_APPS: readonly SpicyApp[] = ['discord', 'telegram', 'signal'];

export interface Spicy {
  on: boolean;
  /** Stored forms: Discord in lower case, Telegram in lower case with no "@", Signal in lower case. */
  discord: string | null;
  telegram: string | null;
  signal: string | null;
  boundaries: Boundary[];
  /** When it was turned on (or last saved while on). */
  since: number | null;
}

export const spicyOff: Spicy = { on: false, discord: null, telegram: null, signal: null, boundaries: [], since: null };

/** Spicy with one person, as the server answers it for me. */
export interface SpicyPlan {
  /** True only when we both have Spicy on, I can see their card, and nobody blocked. */
  open: boolean;
  /** I said yes to moving the chat. */
  myYes: boolean;
  /** We both said yes: their usernames below. Never says whether they said no. */
  mutual: boolean;
  /** Theirs, once open. */
  theirBoundaries: Boundary[];
  /**
   * The unlock (D105): what each of us has paid towards the 600 credits, and whether it is done.
   * The usernames come only once it is done.
   */
  unlock: { mine: number; theirs: number; done: boolean };
  /**
   * D111: calls happen in Pinkilock now. The usernames wait for a call that counted as kept, and
   * for both of us to choose to share them. I am never told whether they chose to.
   */
  keptCall: boolean;
  myShare: boolean;
  /** Theirs, once mutual, unlocked, a kept call, and both chose to share; Discord first. */
  discord: string | null;
  telegram: string | null;
  signal: string | null;
}

export const spicyClosed: SpicyPlan = { open: false, myYes: false, mutual: false, theirBoundaries: [], unlock: { mine: 0, theirs: 0, done: false }, keptCall: false, myShare: false, discord: null, telegram: null, signal: null };

/** More than six digits anywhere is a phone number, whatever the spaces or dashes between them. */
export function hasPhoneNumber(typed: string): boolean {
  return (typed.match(/[0-9०-९]/g) ?? []).length > 6;
}

/**
 * A typed username in its stored form, or the refusal's code. Empty is null (not given). Discord:
 * 2 to 32 of a-z, 0-9, "_" and ".", no "..", no old "#1234" tags. Telegram: 5 to 32 of a-z, 0-9 and
 * "_", starting with a letter and not ending with "_"; "@" and a t.me link are taken off. Signal:
 * a name of 3 to 32 of a-z, 0-9 and "_" (not starting with a digit), a dot, then 2 to 9 digits.
 */
export function normalizeUsername(app: SpicyApp, typed: string): string | null {
  const raw = typed.trim();
  if (!raw) return null;
  if (hasPhoneNumber(raw)) throw new AppError('PL123');
  let u = raw.toLowerCase();
  if (app === 'discord') {
    u = u.replace(/^@/, '');
    if (!/^[a-z0-9_.]{2,32}$/.test(u) || u.includes('..')) throw new AppError('PL124');
    return u;
  }
  if (app === 'signal') {
    u = u.replace(/^@/, '');
    if (!/^[a-z_][a-z0-9_]{2,31}\.[0-9]{2,9}$/.test(u)) throw new AppError('PL131');
    return u;
  }
  u = u.replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//, '').replace(/^@/, '').replace(/\/$/, '');
  if (!/^[a-z][a-z0-9_]{3,30}[a-z0-9]$/.test(u)) throw new AppError('PL125');
  return u;
}

export interface SpicyInput {
  adult: boolean;
  rules: boolean;
  discord: string;
  telegram: string;
  signal: string;
  boundaries: Boundary[];
}

/**
 * Everything save_spicy checks, in its order: the yeses, a phone or email on the account, the
 * usernames, at least one of them, the boundaries. Answers what would be stored.
 */
export function checkSpicy(input: SpicyInput, linked: boolean): Pick<Spicy, 'discord' | 'telegram' | 'signal' | 'boundaries'> {
  if (!input.adult || !input.rules) throw new AppError('PL127');
  if (!linked) throw new AppError('PL128');
  const discord = normalizeUsername('discord', input.discord);
  const telegram = normalizeUsername('telegram', input.telegram);
  const signal = normalizeUsername('signal', input.signal);
  if (!discord && !telegram && !signal) throw new AppError('PL126');
  if (!input.boundaries.every(isBoundary)) throw new AppError('PL129');
  return { discord, telegram, signal, boundaries: BOUNDARIES.filter((b) => input.boundaries.includes(b)) };
}

/** Where "Open Telegram" goes. Discord and Signal have no link to a username: it is searched for in the app. */
export const telegramLink = (stored: string) => `https://t.me/${stored}`;

/**
 * [app, typed, stored form or error code]. Run through normalizeUsername here and through
 * private.spicy_username in SQL (tests/db/spicy.sql), which must agree on every line.
 */
export const SPICY_HANDLE_CASES: readonly [SpicyApp, string, string | ErrorCode][] = [
  ['discord', 'riya.k', 'riya.k'],
  ['discord', ' Riya_K ', 'riya_k'],
  ['discord', '@riya', 'riya'],
  ['discord', 'ri', 'ri'],
  ['discord', 'r', 'PL124'],
  ['discord', 'riya..k', 'PL124'],
  ['discord', 'riya#1234', 'PL124'],
  ['discord', 'riya k', 'PL124'],
  ['discord', 'riya-k', 'PL124'],
  ['discord', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['discord', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'PL124'],
  ['discord', 'riya2001', 'riya2001'],
  ['discord', 'riya.123456', 'riya.123456'],
  ['discord', 'riya.1234567', 'PL123'],
  ['discord', '9876543210', 'PL123'],
  ['discord', '+91 98765 43210', 'PL123'],
  ['discord', '98-765-432', 'PL123'],
  ['discord', '९८७६५४३२१०', 'PL123'],
  ['discord', 'https://discord.com/users/123456789012345678', 'PL123'],
  ['discord', '', ''],
  ['discord', '   ', ''],
  ['telegram', 'riya_k', 'riya_k'],
  ['telegram', '@Riya_K', 'riya_k'],
  ['telegram', 'https://t.me/riya_k', 'riya_k'],
  ['telegram', 't.me/riya_k/', 'riya_k'],
  ['telegram', 'telegram.me/riyak', 'riyak'],
  ['telegram', 'riyak', 'riyak'],
  ['telegram', 'riya', 'PL125'],
  ['telegram', '1riya', 'PL125'],
  ['telegram', '_riya', 'PL125'],
  ['telegram', 'riya_', 'PL125'],
  ['telegram', 'riya.k', 'PL125'],
  ['telegram', 'riya k', 'PL125'],
  ['telegram', 'riya2001', 'riya2001'],
  ['telegram', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['telegram', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'PL125'],
  ['telegram', '+919876543210', 'PL123'],
  ['telegram', 'riya_9876543', 'PL123'],
  ['telegram', '', ''],
  ['signal', 'riya.01', 'riya.01'],
  ['signal', 'Riya_K.42', 'riya_k.42'],
  ['signal', '@riya.123', 'riya.123'],
  ['signal', 'riya.123456', 'riya.123456'],
  ['signal', 'riya.1', 'PL131'],
  ['signal', 'riya', 'PL131'],
  ['signal', 'ri.01', 'PL131'],
  ['signal', '1riya.01', 'PL131'],
  ['signal', 'riya.k.01', 'PL131'],
  ['signal', 'riya k.01', 'PL131'],
  ['signal', 'riya.1234567', 'PL123'],
  ['signal', '+91 98765 43210', 'PL123'],
  ['signal', '', ''],
];
