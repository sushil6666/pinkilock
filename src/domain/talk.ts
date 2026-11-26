/**
 * Talk mode (D107): "Feeling alone? Talk to someone." A quiet corner next to Self love, for when
 * someone wants to be listened to. It is not dating and it never touches Spicy mode: nothing here
 * reads, writes or links to it, and nothing from Talk mode is ever shown on a card.
 *
 *   * The AI companion: there day and night, cheaper. Always labelled AI, it never says or hints that
 *     it is a person, never flirts and never takes part in sexual roleplay. It is paid by the minute
 *     (a minute counts when I sent something in it) or with a day pass. When someone mentions
 *     self-harm or suicide, charging stops for the rest of that chat, the reply points to Tele-MANAS
 *     14416 and other help lines, and it offers a person. The words are never stored: the chat lives
 *     on the phone for as long as the page is open; the server keeps only minutes and credits.
 *   * A real listener: a verified person (identity, PAN and bank checked through Razorpay Route,
 *     then a person at Pinkilock), first names only, voice only, in the app, never recorded. I pick
 *     who I would like to talk to (a woman or a man, matched to me as the opposite or the same sex,
 *     or anyone) and each listener says whom they take calls from. Both follow the listener code.
 *     Either can end, report or block at any time; a report holds the listener's payout.
 *   * Paying a listener: bought credits only (a reward is a thank-you, not money for a person).
 *     Credits for the longest length are held when the call starts; only the minutes we were both
 *     on the line are charged, and the rest come back. Of what a call is worth, 60% is the
 *     listener's and 40% Pinkilock's, with GST on Pinkilock's part; TDS under section 194-O is held
 *     from the listener's payout. Payouts go through Razorpay Route. A CA checks all of it (O17).
 *   * The first call with a person is free (D108), once: unlocked by a friend who joins with my
 *     link and verifies, or by a finished profile (a checked face photo, a verified handle and plans
 *     I am up for). Never for a rating or a review.
 *
 * The same rules are in SQL (supabase/migrations/20261126000002_talk.sql); the mock follows these.
 * MATCH_CASES, HARM_CASES and SPLIT_CASES are shared with SQL through tests/db/talk_cases.sql
 * (generated: UPDATE_CASES=1 npm run test:unit).
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { fail } from './errors';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// --- The AI companion --------------------------------------------------------------------------
/** Credits for each minute in which I sent something. */
export const AI_PER_MINUTE = 3;
/** Or a day of the companion for this, however much I write. */
export const AI_PASS = 49;
export const AI_PASS_HOURS = 24;
/** What one message can hold, how much of the chat goes with each one, and a day's fair use. */
export const AI_MESSAGE_MAX = 800;
export const AI_HISTORY = 16;
export const AI_MESSAGES_PER_DAY = 250;
/** Two seconds between messages, so a stuck key cannot run up a bill. */
export const AI_GAP_SECONDS = 2;

// --- Listeners ---------------------------------------------------------------------------------
/** Credits a minute with a listener; bought credits only. */
export const LISTENER_PER_MINUTE = 10;
/** The longest a call can run; credits for it are held at the start and what is left comes back. */
export const CALL_LENGTHS = [10, 20, 30] as const;
export type CallLength = (typeof CALL_LENGTHS)[number];
/** The free first call runs up to this long. */
export const FREE_CALL_MINUTES = 15;
/** A call nobody answered in this long stops ringing, and nothing is charged. */
export const RING_SECONDS = 60;
/** The open app checks in this often during a call; a minute counts when both did. */
export const TALK_BEAT_SECONDS = 20;
/** No check-in from either side for this long ends the call. */
export const TALK_GONE_SECONDS = 90;
/** A good call, for the review ask (D109): this many minutes together, ended normally, nobody reported. */
export const GOOD_CALL_MINUTES = 5;

export type Sex = 'woman' | 'man' | 'unsaid';
export const SEXES: readonly Sex[] = ['woman', 'man', 'unsaid'];
/** Whom I would like to talk to. */
export type Want = 'opposite' | 'same' | 'anyone';
export const WANTS: readonly Want[] = ['opposite', 'same', 'anyone'];
/** Whom a listener takes calls from. */
export type Accepts = 'women' | 'men' | 'anyone';
export const ACCEPTS: readonly Accepts[] = ['women', 'men', 'anyone'];

/** What a listener can talk about: a fixed list, so nothing on a listener's card is free text. */
export const TOPICS = ['lonely', 'stress', 'breakup', 'family', 'work', 'exams', 'new_city', 'just_talk'] as const;
export type Topic = (typeof TOPICS)[number];
export const MAX_TOPICS = 4;

/**
 * The listener code. Every listener agrees to all of it before their first call, again when it
 * changes (CODE_VERSION), and it is shown to the caller on the call screen.
 */
export const LISTENER_CODE = ['voice', 'names', 'contact', 'meet', 'record', 'flirt', 'advice', 'help', 'money'] as const;
export const CODE_VERSION = 1;

/**
 * As private.talk_match in SQL. "Opposite" and "same" need both to have said woman or man; a
 * listener who said neither is only for "anyone". A listener's choice is about the caller.
 */
export function talkMatch(callerSex: Sex, want: Want, listenerSex: Sex, accepts: Accepts): boolean {
  if (accepts === 'women' && callerSex !== 'woman') return false;
  if (accepts === 'men' && callerSex !== 'man') return false;
  if (want === 'anyone') return true;
  if (callerSex === 'unsaid' || listenerSex === 'unsaid') return false;
  return want === 'same' ? callerSex === listenerSex : callerSex !== listenerSex;
}

/** The shared table: caller sex, want, listener sex, accepts, match. */
export const MATCH_CASES: readonly [Sex, Want, Sex, Accepts, boolean][] = [
  ['woman', 'opposite', 'man', 'anyone', true],
  ['woman', 'opposite', 'woman', 'anyone', false],
  ['woman', 'same', 'woman', 'women', true],
  ['woman', 'same', 'man', 'anyone', false],
  ['man', 'opposite', 'woman', 'anyone', true],
  ['man', 'opposite', 'woman', 'women', false],
  ['man', 'same', 'man', 'men', true],
  ['man', 'anyone', 'woman', 'men', true],
  ['man', 'anyone', 'man', 'women', false],
  ['woman', 'anyone', 'unsaid', 'anyone', true],
  ['woman', 'opposite', 'unsaid', 'anyone', false],
  ['unsaid', 'anyone', 'woman', 'anyone', true],
  ['unsaid', 'opposite', 'man', 'anyone', false],
  ['unsaid', 'anyone', 'woman', 'women', false],
  ['unsaid', 'same', 'unsaid', 'anyone', false],
];

// --- Self-harm: the hand-off -------------------------------------------------------------------
/**
 * Words that mean someone may be thinking of hurting themselves, in English, Hinglish and Hindi.
 * As private.mentions_harm in SQL: the text is lower-cased, ASCII marks and a few others (curly
 * quotes, the danda) become spaces, and a phrase must appear between spaces. Missing a real
 * one costs far more than a false alarm (which only makes the chat free and shows the help lines),
 * so the list errs wide. The AI is told to watch for the rest. Reviewed with the mental-health
 * adviser before launch (O18).
 */
export const HARM_PHRASES: readonly string[] = [
  'suicide', 'suicidal', 'kill myself', 'killing myself', 'end my life', 'end it all', 'take my life', 'take my own life',
  'want to die', 'wanna die', 'better off dead', 'no reason to live', 'dont want to live', 'don t want to live', 'do not want to live',
  'hurt myself', 'hurting myself', 'harm myself', 'self harm', 'selfharm', 'cut myself', 'cutting myself', 'overdose',
  'hang myself', 'jump off', 'not worth living', 'kms',
  'marna chahta', 'marna chahti', 'mar jaun', 'mar jaau', 'mar jaana', 'khudkushi', 'aatmahatya', 'atmahatya', 'jeena nahi', 'jina nahi',
  'खुदकुशी', 'आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'मर जाऊं', 'मर जाऊँ', 'जीना नहीं',
];

/** As private.harm_text in SQL: lower case, marks to spaces, runs of spaces to one. */
export function harmText(text: string): string {
  const t = text.toLowerCase().replace(/[^a-z0-9\u0080-\uffff]|[\u00a0\u2018\u2019\u201c\u201d\u2026\u0964\u0965]/g, ' ').replace(/ +/g, ' ').trim();
  return ` ${t} `;
}
export function mentionsHarm(text: string): boolean {
  const t = harmText(text);
  return HARM_PHRASES.some((p) => t.includes(` ${p} `));
}

/** The shared table: text, whether it asks for the hand-off. */
export const HARM_CASES: readonly [string, boolean][] = [
  ['I feel like I want to die', true],
  ['sometimes I think about suicide.', true],
  ['I might hurt myself tonight', true],
  ['KMS lol this exam', true],
  ['main marna chahta hoon', true],
  ['मुझे आत्महत्या के ख़याल आते हैं', true],
  ['I dont want to live like this', true],
  ['This traffic is killing me', false],
  ['my phone died, so annoying', false],
  ['I want to diet before the wedding', false],
  ['skills are important', false],
  ['I feel lonely in this new city', false],
];

// --- What a listener call is worth -------------------------------------------------------------
/**
 * A credit is valued at the lowest price anyone pays for one (₹499 for 650: 76 paise), so a
 * listener is never paid for value Pinkilock did not receive.
 */
export const CREDIT_PAISE = 76;
export const HOST_PERCENT = 60;
/** GST on Pinkilock's part, included in the price people paid (18%). */
export const GST_PERCENT = 18;
/** TDS under section 194-O, in hundredths of a percent: 0.1% of the gross since 1 October 2024 (CA to confirm, O17). */
export const TDS_BASIS_POINTS = 10;

export interface TalkSplit {
  /** What the call is worth, in paise. */
  gross: number;
  /** The listener's 60%, before TDS. */
  host: number;
  /** Pinkilock's 40%, GST included. */
  pinkilock: number;
  /** The GST inside Pinkilock's part. */
  gst: number;
  /** TDS held from the listener's part. */
  tds: number;
  /** What goes to the listener's bank. */
  payout: number;
}

/** As private.talk_split in SQL. A free call is worth the same to the listener; Pinkilock pays it. */
export function talkSplit(minutes: number): TalkSplit {
  const gross = minutes * LISTENER_PER_MINUTE * CREDIT_PAISE;
  const host = Math.floor((gross * HOST_PERCENT) / 100);
  const pinkilock = gross - host;
  const gst = Math.round((pinkilock * GST_PERCENT) / (100 + GST_PERCENT));
  const tds = Math.ceil((gross * TDS_BASIS_POINTS) / 10_000);
  return { gross, host, pinkilock, gst, tds, payout: host - tds };
}

/** The shared table: minutes, then gross, host, pinkilock, gst, tds and payout in paise. */
export const SPLIT_CASES: readonly [number, number, number, number, number, number, number][] = [
  [0, 0, 0, 0, 0, 0, 0],
  [1, 760, 456, 304, 46, 1, 455],
  [5, 3800, 2280, 1520, 232, 4, 2276],
  [15, 11400, 6840, 4560, 696, 12, 6828],
  [30, 22800, 13680, 9120, 1391, 23, 13657],
];

/** Credits held for a call of this length, from bought credits; a free call holds none. */
export function callHold(length: number, free: boolean): number {
  if (free) return 0;
  if (!(CALL_LENGTHS as readonly number[]).includes(length)) fail('PL156');
  return length * LISTENER_PER_MINUTE;
}

// --- The free first call (D108) ----------------------------------------------------------------
export type FreeCall = 'locked' | 'ready' | 'used';
export type FreeReason = 'referral' | 'profile';

/** A finished profile: a checked face photo, a verified handle, and at least one plan I am up for. */
export interface ProfileDone {
  face: boolean;
  handle: boolean;
  plans: boolean;
}
export const profileDone = (p: ProfileDone): boolean => p.face && p.handle && p.plans;

/** Why the free call opened, or null. A friend's sign-up counts once they have verified (a phone or an email). */
export function freeReason(profile: ProfileDone, friendsVerified: number): FreeReason | null {
  if (friendsVerified > 0) return 'referral';
  if (profileDone(profile)) return 'profile';
  return null;
}

/** A friend can use a link within this many days of joining, once, and never their own. */
export const REFERRAL_DAYS = 7;
/** My link's code: 8 letters and digits with no look-alikes. */
export const REFERRAL_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const referralCode = (raw: string): string => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

// --- The state the screens show ----------------------------------------------------------------
export interface TalkOpen {
  /** The AI has a key on the server. */
  ai: boolean;
  /** In-app voice has a provider (LiveKit) set up. */
  voice: boolean;
  /** Listener sign-up and payouts go through Razorpay Route. */
  payouts: boolean;
}

export type ListenerStatus = 'applied' | 'checking' | 'verified' | 'paused' | 'removed';

export interface MyListener {
  status: ListenerStatus;
  firstName: string;
  sex: Sex;
  accepts: Accepts;
  topics: Topic[];
  /** Taking calls until then, or null. */
  availableUntil: number | null;
  /** Agreed to this version of the code. */
  codeVersion: number;
  /** The last four digits of the bank account Razorpay checked; nothing else about it is kept. */
  bankLast4: string | null;
  calls: number;
  /** Paise paid out and waiting, after TDS. */
  paidOut: number;
  pending: number;
}

export interface ListenerCard {
  id: string;
  firstName: string;
  sex: Sex;
  topics: Topic[];
  calls: number;
}

export type TalkCallStatus = 'ringing' | 'live' | 'done';
export type TalkCallEnd = 'talked' | 'missed' | 'declined' | 'ended_early' | 'reported' | 'blocked' | 'gone';

export interface TalkCall {
  id: string;
  status: TalkCallStatus;
  /** I am the listener on this call. */
  listening: boolean;
  /** The other person's first name. */
  name: string;
  length: number;
  free: boolean;
  startedAt: number | null;
  /** Minutes we were both on the line. */
  together: number;
  theyHere: boolean;
  end: TalkCallEnd | null;
  /** Credits charged in the end, and how many came back. */
  charged: number;
  refunded: number;
}

export interface Talk {
  sex: Sex | null;
  want: Want;
  /** The AI day pass runs until then, or null. */
  passUntil: number | null;
  /** Messages to the AI today. */
  aiToday: number;
  freeCall: FreeCall;
  freeReason: FreeReason | null;
  /** What still opens the free call by a finished profile. */
  profile: ProfileDone;
  referralCode: string;
  /** Friends who joined with my link, and how many of them have verified. */
  friendsJoined: number;
  friendsVerified: number;
  /** Bought credits, for listener calls. */
  paid: number;
  balance: number;
  listener: MyListener | null;
  /** A call that is ringing or on, either side; else the last one, if it just ended. */
  call: TalkCall | null;
  open: TalkOpen;
}

export const emptyTalk = (): Talk => ({
  sex: null, want: 'anyone', passUntil: null, aiToday: 0, freeCall: 'locked', freeReason: null, profile: { face: false, handle: false, plans: false },
  referralCode: '', friendsJoined: 0, friendsVerified: 0, paid: 0, balance: 0, listener: null, call: null, open: { ai: false, voice: false, payouts: false },
});

// --- The AI chat, as the phone holds it ---------------------------------------------------------
export interface AiTurn {
  role: 'me' | 'ai';
  text: string;
}
export interface AiReply {
  reply: string;
  /** A mention of self-harm: show the help lines and the person. Charging has stopped for this chat. */
  harm: boolean;
  /** Credits taken for this message (0 with a pass, in a minute already paid, or after a mention). */
  charged: number;
}

/** A message to send: trimmed, not empty, not too long (PL158). */
export function checkAiMessage(text: string): string {
  const t = text.trim();
  if (!t || t.length > AI_MESSAGE_MAX) fail('PL158');
  return t;
}

/** The part of the chat that goes with a message: the last AI_HISTORY turns, each cut to size. */
export function aiHistory(turns: readonly AiTurn[]): AiTurn[] {
  return turns.slice(-AI_HISTORY).map((x) => ({ role: x.role, text: x.text.slice(0, AI_MESSAGE_MAX * 2) }));
}

/** As private.talk_ai_charge in SQL: what one message costs. */
export function aiCharge(o: { passUntil: number | null; harm: boolean; minutePaid: boolean }, now: number): number {
  if (o.harm || o.minutePaid || (o.passUntil !== null && o.passUntil > now)) return 0;
  return AI_PER_MINUTE;
}

export const minuteOf = (t: number): number => Math.floor(t / MINUTE) * MINUTE;
export const AI_PASS_MS = AI_PASS_HOURS * HOUR;

/** The listener's application: a first name (2 to 20 letters), 1 to 4 topics, and the whole code. */
export interface ListenerInput {
  firstName: string;
  sex: Sex;
  accepts: Accepts;
  topics: Topic[];
  code: boolean;
}

/** As the checks in talk_listener_apply. */
export function checkListener(input: ListenerInput): ListenerInput {
  const firstName = input.firstName.trim();
  if (!/^\p{L}[\p{L}\p{M} '-]{1,19}$/u.test(firstName) || firstName.includes(' ')) fail('PL160');
  if (!SEXES.includes(input.sex) || !ACCEPTS.includes(input.accepts)) fail('PL160');
  const topics = TOPICS.filter((x) => input.topics.includes(x));
  if (topics.length < 1 || topics.length > MAX_TOPICS || topics.length !== new Set(input.topics).size) fail('PL161');
  if (!input.code) fail('PL162');
  return { ...input, firstName, topics };
}

/** Bank details go straight to Razorpay; only the last four digits of the account come back. */
export interface KycInput {
  pan: string;
  account: string;
  ifsc: string;
  /** As on the bank account. */
  holder: string;
}
export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export function checkKyc(k: KycInput): KycInput {
  const pan = k.pan.trim().toUpperCase();
  const ifsc = k.ifsc.trim().toUpperCase();
  const account = k.account.replace(/\s/g, '');
  const holder = k.holder.trim();
  if (!PAN.test(pan) || !IFSC.test(ifsc) || !/^\d{9,18}$/.test(account) || holder.length < 3 || holder.length > 60) fail('PL164');
  return { pan, ifsc, account, holder };
}

/** The topics the caller wants, if any: listeners who cover them come first. */
export function sortListeners(list: readonly ListenerCard[], topics: readonly Topic[]): ListenerCard[] {
  const score = (l: ListenerCard) => l.topics.filter((x) => topics.includes(x)).length;
  return [...list].sort((a, b) => score(b) - score(a) || b.calls - a.calls || a.firstName.localeCompare(b.firstName));
}
