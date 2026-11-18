/**
 * The invite state machine (ARCHITECTURE.md section 4) as pure functions.
 * The mock backend calls these; the SQL functions in supabase/migrations follow the same rules.
 */
import { fail } from './errors';
import type { Invite } from './types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const ASK_TTL = DAY;
export const CHECK_IN_OPENS_BEFORE = 10 * MIN;
export const CHECK_IN_CLOSES_AFTER = 30 * MIN;
export const MAX_OPEN_ASKS = 3;
export const NOTE_MAX = 80;
/**
 * Daily limits, the same as send_invite and the passes trigger in supabase/migrations
 * (20261117000011_limits_and_gate.sql). The server is the authority; these let the mock agree.
 */
export const ASKS_PER_DAY = 10;
export const REASK_AFTER = 7 * DAY;
export const PASSES_PER_DAY = 200;
/** Wrong check-in codes before a five-minute wait (WP4). */
export const CODE_TRIES = 5;
export const CODE_LOCK = 5 * MIN;

/** The mock's stand-in for a server-made check-in code: four digits, fixed per plan and person. */
export function mockCheckInCode(inviteId: string, userId: string): string {
  let h = 7;
  for (const ch of `${inviteId}:${userId}`) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
  return String(h % 10_000).padStart(4, '0');
}

export const isOpen = (i: Invite) => i.status === 'sent' || i.status === 'half_locked';
export const isLive = (i: Invite) => isOpen(i) || i.status === 'locked';
export const isDone = (i: Invite) => i.status === 'kept' || i.status === 'flaked';

/**
 * Doubles (docs/build-plan.md F3): two friends ask two friends. The asker's side is `fromId` and
 * `fromFriendId`; the other side is `toId` and `toFriendId`. The SQL in
 * supabase/migrations/20261118000002_double_dates.sql follows the same rules.
 */
export const isDouble = (i: Invite) => !!i.fromFriendId && !!i.toFriendId;
export const peopleOf = (i: Invite): string[] =>
  [i.fromId, i.toId, i.fromFriendId, i.toFriendId].filter((x): x is string => !!x);
export const onAskersSide = (i: Invite, id: string) => id === i.fromId || id === i.fromFriendId;
/** The people whose check-in code proves I met them: the other person, or anyone on the other side. */
export const otherSide = (i: Invite, meId: string): string[] =>
  isDouble(i) ? (onAskersSide(i, meId) ? [i.toId, i.toFriendId!] : [i.fromId, i.fromFriendId!]) : [otherId(i, meId)];
/** My friend on a double (null on a plan for two). */
export const friendOn = (i: Invite, meId: string): string | null =>
  !isDouble(i) ? null : meId === i.fromId ? i.fromFriendId! : meId === i.fromFriendId ? i.fromId : meId === i.toId ? i.toFriendId! : i.toId;
/** Two people on a double who may see each other's contact once it is kept: both came, opposite sides. */
export const canReveal = (i: Invite, meId: string, theirId: string): boolean =>
  i.status === 'kept' && (!isDouble(i)
    ? otherId(i, meId) === theirId
    : otherSide(i, meId).includes(theirId) && i.checkIns.includes(meId) && i.checkIns.includes(theirId));

/**
 * The person on the other side who leads it: on a plan for two, the other person; on a double, the
 * asker or the person asked, whichever is not on my side. Screens show their name.
 */
export function otherId(i: Invite, meId: string): string {
  if (isDouble(i)) return onAskersSide(i, meId) ? i.toId : i.fromId;
  return i.fromId === meId ? i.toId : i.fromId;
}

export function expiryFor(createdAt: number, startsAt: number): number {
  return Math.min(createdAt + ASK_TTL, startsAt);
}

/** What I can do with an open invite right now. */
export type LockRole = 'first' | 'seal' | 'waiting' | 'none';

export function lockRole(i: Invite, meId: string): LockRole {
  if (i.status !== 'sent' && i.status !== 'half_locked') return 'none';
  if (isDouble(i)) {
    const out = i.pinkies ?? [];
    if (meId === i.fromId) return out.length >= 3 ? 'seal' : 'waiting';
    return out.includes(meId) ? 'waiting' : 'first';
  }
  if (i.status === 'sent') return i.toId === meId ? 'first' : 'waiting';
  return i.firstPinkyBy === meId ? 'waiting' : 'seal';
}

export type CheckInPhase = 'early' | 'open' | 'closed';

export function checkInPhase(i: Invite, now: number): CheckInPhase {
  if (now < i.startsAt - CHECK_IN_OPENS_BEFORE) return 'early';
  if (now <= i.startsAt + CHECK_IN_CLOSES_AFTER) return 'open';
  return 'closed';
}

/** One person puts their pinky out. First one makes it half_locked, second one locks it. */
export function offerPinky(i: Invite, byId: string, now: number): Invite {
  if (isDouble(i)) {
    // The three others in any order, then the asker seals it.
    if (i.status !== 'sent' && i.status !== 'half_locked') fail('PL033');
    const out = i.pinkies ?? [];
    if (out.includes(byId)) return i;
    if (byId === i.fromId) {
      if (out.length < 3) fail('PL094');
      return { ...i, status: 'locked', lockedAt: now, pinkies: [...out, byId] };
    }
    return { ...i, status: 'half_locked', firstPinkyBy: i.firstPinkyBy ?? byId, pinkies: [...out, byId] };
  }
  if (i.status === 'sent') {
    if (byId !== i.toId) fail('PL032');
    return { ...i, status: 'half_locked', firstPinkyBy: byId };
  }
  if (i.status === 'half_locked') {
    if (i.firstPinkyBy === byId) return i;
    return { ...i, status: 'locked', lockedAt: now };
  }
  fail('PL033');
}

export function decline(i: Invite, byId: string, now: number): Invite {
  if (!isOpen(i)) fail('PL033');
  return { ...i, status: 'declined', declinedBy: byId, resolvedAt: now };
}

export function checkIn(i: Invite, byId: string, now: number): Invite {
  if (i.status !== 'locked') fail('PL034');
  if (checkInPhase(i, now) !== 'open') fail('PL035');
  const checkIns = i.checkIns.includes(byId) ? i.checkIns : [...i.checkIns, byId];
  if (checkIns.length >= peopleOf(i).length) return { ...i, checkIns, status: 'kept', resolvedAt: now };
  return { ...i, checkIns };
}

export function bail(i: Invite, byId: string, now: number): Invite {
  if (i.status !== 'locked') fail('PL036');
  return { ...i, status: 'flaked', flakedBy: byId, resolvedAt: now };
}

/**
 * Time passing: asks expire, and a locked plan whose window closed is a flake for whoever did
 * not check in (the first one found if neither did; the mock only ever plays one other person).
 */
export function sweep(i: Invite, now: number): Invite {
  if (isOpen(i) && now >= i.expiresAt) return { ...i, status: 'expired', resolvedAt: now };
  if (i.status === 'locked' && checkInPhase(i, now) === 'closed') {
    // A double where someone from each side came is kept for them; the rest are no-shows.
    if (isDouble(i) && i.checkIns.some((id) => onAskersSide(i, id)) && i.checkIns.some((id) => !onAskersSide(i, id))) {
      return { ...i, status: 'kept', resolvedAt: now };
    }
    const missing = (isDouble(i) ? peopleOf(i) : [i.toId, i.fromId]).filter((id) => !i.checkIns.includes(id));
    if (isDouble(i)) return { ...i, status: 'flaked', flakedBy: missing.length === 1 ? missing[0] : null, resolvedAt: now };
    return { ...i, status: 'flaked', flakedBy: missing[0] ?? null, resolvedAt: now };
  }
  return i;
}

/**
 * A block (or an account deletion) ends every live invite between the two people at once.
 * Nobody flaked: it is not a decline, a bail or a no-show, and it moves no one's record.
 * SQL: private.end_live_invites in supabase/migrations/20261117000002_safety.sql.
 */
export function endForBlock(i: Invite, now: number): Invite {
  if (!isLive(i)) return i;
  return { ...i, status: 'ended', resolvedAt: now };
}
