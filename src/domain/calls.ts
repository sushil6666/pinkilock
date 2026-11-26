/**
 * Spicy call times (D106): once a Spicy match is unlocked, the two people set up one call, and
 * Pinkilock checks that it happened. Since D111 (Sushil, 2026-11-26) the call itself happens in
 * Pinkilock, audio only: no camera, no video, nothing recorded. The minutes come from the voice
 * room (LiveKit tells the server who was connected when); the app's check-ins count only when
 * nobody ever reached the room.
 *
 *   * Each person picks up to eight times that suit them (on the hour or half hour, from an hour to
 *     a week ahead) and a minimum length: 5, 10, 15 or 30 minutes. The first time both picked is the
 *     call, and the shorter of the two lengths is the minimum. Both see it before the call.
 *   * The in-app call timer (Sushil, 2026-11-26): during the call both keep Pinkilock open and tap
 *     Start. While it is open and in front, the app checks in with the server every 20 seconds. A
 *     minute counts only when both checked in during it. We never hear or record the call.
 *   * When the hour after the start is over (or both tapped End), the timer decides: enough minutes
 *     together is a kept call; one never opened it is a no-show; one left three or more minutes
 *     before the other is a drop. Anything else (both there, never at the same time) goes to the
 *     confirm fallback: each says what happened.
 *   * Leaving is always allowed. "I felt unsafe or uncomfortable" ends the call for both at any
 *     time, counts against nobody, and opens report and block. Consent comes before the minimum.
 *   * A miss costs the person who missed: a Trust Score drop (a `call_missed` event, nothing else
 *     about Spicy), and their part of the unlock stays paid. The one who showed gets their own part
 *     of the unlock back, once per match. Never the other person's credits, and never a reward.
 *   * One free move per person, asked an hour or more before the start. Later, or a second time,
 *     cancelling counts as missing the call.
 *
 * The same rules are in SQL (supabase/migrations/20261126000001_spicy_calls.sql); the mock follows
 * these. CALL_CASES and ANSWER_CASES are shared with SQL through tests/db/call_cases.sql (generated:
 * UPDATE_CASES=1 npm run test:unit).
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { fail } from './errors';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The minimum lengths on offer. The shorter of the two picks applies. */
export const CALL_MINUTES = [5, 10, 15, 30] as const;
export type CallMinutes = (typeof CALL_MINUTES)[number];
/** Times start on the hour or half hour. */
export const SLOT_MINUTES = 30;
export const MAX_SLOTS = 8;
/** A time is at least this far ahead, and no further than SLOT_DAYS. */
export const SLOT_LEAD_MINUTES = 60;
export const SLOT_DAYS = 7;
/** The timer runs from five minutes before the start to an hour after it. */
export const CALL_EARLY_MINUTES = 5;
export const CALL_WINDOW_MINUTES = 60;
/** How often the open app checks in during a call. */
export const BEAT_SECONDS = 20;
/** "Here" means a check-in in the last 45 seconds. */
export const HERE_SECONDS = 45;
/** Leaving this many minutes before the other is a drop. */
export const DROP_GAP_MINUTES = 3;
/** The free move: once each, an hour or more before the start. */
export const FREE_MOVES = 1;
export const FREE_MOVE_HOURS = 1;
/** In the confirm fallback, the answers are open this long. */
export const ANSWER_HOURS = 24;
/** Someone whose "they missed it" was disputed this many times in SERIAL_DAYS is not taken on their word alone. */
export const SERIAL_REPORTS = 3;
export const SERIAL_DAYS = 30;
/** Calls per match, so a match cannot be farmed for refunds. */
export const MAX_CALLS = 3;

export type CallStatus = 'none' | 'picking' | 'set' | 'asking' | 'done';
export type CallOutcome = 'talked' | 'no_show' | 'dropped' | 'both_missed' | 'unsafe' | 'moved_late' | 'disputed' | 'unsettled' | 'stopped';
export type CallAnswer = 'talked' | 'they_missed' | 'i_missed';
export type Fault = 'a' | 'b' | 'both' | null;

/** A call with one person, as the server answers it for me. */
export interface SpicyCall {
  id: string | null;
  status: CallStatus;
  /** My times and theirs (once they picked). */
  mySlots: number[];
  theirSlots: number[];
  myMinutes: CallMinutes | null;
  theirMinutes: CallMinutes | null;
  /** Both picked and none of the times match. */
  noOverlap: boolean;
  /** Once set: when, and the minimum (the shorter pick). */
  startsAt: number | null;
  minutes: number | null;
  /** The timer: minutes counted together so far, and who is here now. */
  together: number;
  myStarted: boolean;
  theirStarted: boolean;
  meHere: boolean;
  theyHere: boolean;
  myEnded: boolean;
  /** D111: a voice room was opened for this call, and who is connected to it right now. */
  voice: boolean;
  meOnCall: boolean;
  theyOnCall: boolean;
  /** Can I move it for free right now. */
  canMoveFree: boolean;
  /** The confirm fallback. */
  myAnswer: CallAnswer | null;
  answerUntil: number | null;
  /** Once done. */
  outcome: CallOutcome | null;
  /** Who it counts against, from my side. */
  fault: 'me' | 'them' | 'both' | null;
  /** Credits of mine that came back for this call. */
  refunded: number;
  /** I stopped it with "I felt unsafe or uncomfortable". */
  stoppedByMe: boolean;
  /** Calls still possible with this person. */
  callsLeft: number;
}

export const noCall: SpicyCall = {
  id: null, status: 'none', mySlots: [], theirSlots: [], myMinutes: null, theirMinutes: null, noOverlap: false, startsAt: null, minutes: null,
  together: 0, myStarted: false, theirStarted: false, meHere: false, theyHere: false, myEnded: false, voice: false, meOnCall: false, theyOnCall: false, canMoveFree: false, myAnswer: null,
  answerUntil: null, outcome: null, fault: null, refunded: 0, stoppedByMe: false, callsLeft: MAX_CALLS,
};

export const isCallMinutes = (n: unknown): n is CallMinutes => typeof n === 'number' && (CALL_MINUTES as readonly number[]).includes(n);

/** The minimum both see: the shorter pick. */
export const agreedMinutes = (a: CallMinutes, b: CallMinutes): CallMinutes => (a < b ? a : b);

/** My picks, checked and sorted: PL147 for a length off the list, PL148 for times that break the rules. */
export function checkPicks(slots: readonly number[], minutes: number, now: number): number[] {
  if (!isCallMinutes(minutes)) fail('PL147');
  const list = [...new Set(slots)].sort((x, y) => x - y);
  if (!list.length || list.length > MAX_SLOTS) fail('PL148');
  for (const s of list) {
    if (s % (SLOT_MINUTES * MINUTE) !== 0 || s < now + SLOT_LEAD_MINUTES * MINUTE || s > now + SLOT_DAYS * DAY) fail('PL148');
  }
  return list;
}

/** The first time we both picked that is still far enough ahead, or null. */
export function firstOverlap(mine: readonly number[], theirs: readonly number[], now: number): number | null {
  const set = new Set(theirs);
  const both = mine.filter((s) => set.has(s) && s >= now + SLOT_LEAD_MINUTES * MINUTE).sort((x, y) => x - y);
  return both[0] ?? null;
}

/** The times on offer for one day (local), on the hour and half hour, that are far enough ahead. */
export function slotsOn(day: Date, now: number, fromHour = 8, toHour = 24): number[] {
  const out: number[] = [];
  for (let m = fromHour * 60; m < toHour * 60; m += SLOT_MINUTES) {
    const d = new Date(day);
    d.setHours(0, m, 0, 0);
    const at = d.getTime();
    if (at >= now + SLOT_LEAD_MINUTES * MINUTE && at <= now + SLOT_DAYS * DAY) out.push(at);
  }
  return out;
}

/** Minutes in which both checked in (each a list of minute starts). */
export function togetherMinutes(a: readonly number[], b: readonly number[]): number {
  const set = new Set(a);
  return new Set(b.filter((m) => set.has(m))).size;
}

export interface TimerFacts {
  /** The minimum. */
  minutes: number;
  /** Minutes both were there. */
  together: number;
  /** Minutes each was there at all. */
  minsA: number;
  minsB: number;
  /** Each one's last check-in, in minutes from the start; null when never. */
  lastA: number | null;
  lastB: number | null;
}

/**
 * What the timer says, as private.call_verdict in SQL. Enough together: talked. Nobody came: both
 * missed. One never came: their no-show. Together some of it but short: whoever left first by
 * DROP_GAP_MINUTES dropped. Otherwise it cannot tell: 'unclear', and both are asked.
 */
export function callVerdict(f: TimerFacts): { outcome: 'talked' | 'no_show' | 'dropped' | 'both_missed' | 'unclear'; fault: Fault } {
  if (f.together >= f.minutes) return { outcome: 'talked', fault: null };
  if (f.minsA === 0 && f.minsB === 0) return { outcome: 'both_missed', fault: 'both' };
  if (f.minsA === 0) return { outcome: 'no_show', fault: 'a' };
  if (f.minsB === 0) return { outcome: 'no_show', fault: 'b' };
  if (f.together > 0 && f.lastA !== null && f.lastB !== null) {
    if (f.lastA <= f.lastB - DROP_GAP_MINUTES) return { outcome: 'dropped', fault: 'a' };
    if (f.lastB <= f.lastA - DROP_GAP_MINUTES) return { outcome: 'dropped', fault: 'b' };
  }
  return { outcome: 'unclear', fault: null };
}

/**
 * The confirm fallback, as private.answer_verdict in SQL. Both say it happened: talked. Anyone who
 * says they could not make it: theirs. One says the other missed it and the other says it happened,
 * or both blame each other: disputed, nothing counts. One says the other missed it and the other
 * never answers: it counts against them once the answers close, unless the one saying it is a serial
 * reporter. 'wait' while the answers are open and something is still missing.
 */
export function answerVerdict(a: CallAnswer | null, b: CallAnswer | null, serialA: boolean, serialB: boolean, closed: boolean): { outcome: 'talked' | 'no_show' | 'disputed' | 'unsettled' | 'wait'; fault: Fault } {
  if (a === 'i_missed' && b === 'i_missed') return { outcome: 'no_show', fault: 'both' };
  if (a === 'i_missed') return { outcome: 'no_show', fault: 'a' };
  if (b === 'i_missed') return { outcome: 'no_show', fault: 'b' };
  if (a === 'talked' && b === 'talked') return { outcome: 'talked', fault: null };
  if ((a === 'they_missed' && b) || (b === 'they_missed' && a)) return { outcome: 'disputed', fault: null };
  if (!closed) return { outcome: 'wait', fault: null };
  if (a === 'they_missed') return serialA ? { outcome: 'unsettled', fault: null } : { outcome: 'no_show', fault: 'b' };
  if (b === 'they_missed') return serialB ? { outcome: 'unsettled', fault: null } : { outcome: 'no_show', fault: 'a' };
  if (a === 'talked' || b === 'talked') return { outcome: 'talked', fault: null };
  return { outcome: 'unsettled', fault: null };
}

/** The free move: not used yet, and an hour or more before the start. */
export const canMoveFree = (moves: number, startsAt: number, now: number): boolean => moves < FREE_MOVES && startsAt - now >= FREE_MOVE_HOURS * HOUR;

/** The timer is open from a little before the start to an hour after it. */
export const timerOpen = (startsAt: number, now: number): boolean => now >= startsAt - CALL_EARLY_MINUTES * MINUTE && now < startsAt + CALL_WINDOW_MINUTES * MINUTE;

/** [minutes, together, minsA, minsB, lastA, lastB, outcome, fault]: through callVerdict here and private.call_verdict in SQL. */
export const CALL_CASES: readonly [number, number, number, number, number | null, number | null, string, Fault][] = [
  [15, 15, 15, 15, 16, 16, 'talked', null],
  [15, 20, 22, 21, 30, 29, 'talked', null],
  [10, 10, 12, 10, 12, 10, 'talked', null],
  [5, 5, 5, 6, 5, 6, 'talked', null],
  [5, 3, 3, 9, 3, 9, 'dropped', 'a'],
  [30, 29, 30, 30, 32, 31, 'unclear', null],
  [15, 0, 0, 0, null, null, 'both_missed', 'both'],
  [15, 0, 0, 12, null, 14, 'no_show', 'a'],
  [15, 0, 9, 0, 10, null, 'no_show', 'b'],
  [15, 5, 6, 20, 6, 21, 'dropped', 'a'],
  [15, 5, 20, 6, 21, 6, 'dropped', 'b'],
  [15, 5, 6, 8, 6, 8, 'unclear', null],
  [15, 5, 6, 9, 6, 9, 'dropped', 'a'],
  [15, 0, 5, 5, 4, 30, 'unclear', null],
  [30, 12, 13, 40, 13, 50, 'dropped', 'a'],
];

/** [a, b, serialA, serialB, closed, outcome, fault]: through answerVerdict here and private.answer_verdict in SQL. */
export const ANSWER_CASES: readonly [CallAnswer | null, CallAnswer | null, boolean, boolean, boolean, string, Fault][] = [
  ['talked', 'talked', false, false, false, 'talked', null],
  ['talked', null, false, false, false, 'wait', null],
  ['talked', null, false, false, true, 'talked', null],
  [null, null, false, false, true, 'unsettled', null],
  [null, null, false, false, false, 'wait', null],
  ['i_missed', null, false, false, false, 'no_show', 'a'],
  ['talked', 'i_missed', false, false, false, 'no_show', 'b'],
  ['i_missed', 'i_missed', false, false, false, 'no_show', 'both'],
  ['they_missed', 'talked', false, false, false, 'disputed', null],
  ['they_missed', 'they_missed', false, false, false, 'disputed', null],
  ['talked', 'they_missed', false, false, false, 'disputed', null],
  ['they_missed', null, false, false, false, 'wait', null],
  ['they_missed', null, false, false, true, 'no_show', 'b'],
  ['they_missed', null, true, false, true, 'unsettled', null],
  [null, 'they_missed', false, false, true, 'no_show', 'a'],
  [null, 'they_missed', false, true, true, 'unsettled', null],
  ['they_missed', 'i_missed', false, false, false, 'no_show', 'b'],
];

export const BEAT_MS = BEAT_SECONDS * 1000;

/** The stand-in voice room the mock answers (D111): src/lib/voice.ts plays it as silence. */
export const MOCK_VOICE_URL = 'mock://voice';
