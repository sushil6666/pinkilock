/**
 * The invite state machine (ARCHITECTURE.md section 4) as pure functions.
 * The mock backend calls these; the SQL functions in supabase/schema.sql follow the same rules.
 */
import type { Invite } from './types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const ASK_TTL = DAY;
export const CHECK_IN_OPENS_BEFORE = 10 * MIN;
export const CHECK_IN_CLOSES_AFTER = 30 * MIN;
export const MAX_OPEN_ASKS = 3;
export const NOTE_MAX = 80;

export const isOpen = (i: Invite) => i.status === 'sent' || i.status === 'half_locked';
export const isLive = (i: Invite) => isOpen(i) || i.status === 'locked';
export const isDone = (i: Invite) => i.status === 'kept' || i.status === 'flaked';

export const otherId = (i: Invite, meId: string) => (i.fromId === meId ? i.toId : i.fromId);

export function expiryFor(createdAt: number, startsAt: number): number {
  return Math.min(createdAt + ASK_TTL, startsAt);
}

/** What I can do with an open invite right now. */
export type LockRole = 'first' | 'seal' | 'waiting' | 'none';

export function lockRole(i: Invite, meId: string): LockRole {
  if (i.status === 'sent') return i.toId === meId ? 'first' : 'waiting';
  if (i.status === 'half_locked') return i.firstPinkyBy === meId ? 'waiting' : 'seal';
  return 'none';
}

export type CheckInPhase = 'early' | 'open' | 'closed';

export function checkInPhase(i: Invite, now: number): CheckInPhase {
  if (now < i.startsAt - CHECK_IN_OPENS_BEFORE) return 'early';
  if (now <= i.startsAt + CHECK_IN_CLOSES_AFTER) return 'open';
  return 'closed';
}

/** One person puts their pinky out. First one makes it half_locked, second one locks it. */
export function offerPinky(i: Invite, byId: string, now: number): Invite {
  if (i.status === 'sent') {
    if (byId !== i.toId) throw new Error('The person you asked goes first.');
    return { ...i, status: 'half_locked', firstPinkyBy: byId };
  }
  if (i.status === 'half_locked') {
    if (i.firstPinkyBy === byId) return i;
    return { ...i, status: 'locked', lockedAt: now };
  }
  throw new Error('This one is not open any more.');
}

export function decline(i: Invite, byId: string, now: number): Invite {
  if (!isOpen(i)) throw new Error('This one is not open any more.');
  return { ...i, status: 'declined', declinedBy: byId, resolvedAt: now };
}

export function checkIn(i: Invite, byId: string, now: number): Invite {
  if (i.status !== 'locked') throw new Error('Nothing to check in to.');
  if (checkInPhase(i, now) !== 'open') throw new Error('Check-in is not open.');
  const checkIns = i.checkIns.includes(byId) ? i.checkIns : [...i.checkIns, byId];
  if (checkIns.length >= 2) return { ...i, checkIns, status: 'kept', resolvedAt: now };
  return { ...i, checkIns };
}

export function bail(i: Invite, byId: string, now: number): Invite {
  if (i.status !== 'locked') throw new Error('Only a locked plan can be bailed on.');
  return { ...i, status: 'flaked', flakedBy: byId, resolvedAt: now };
}

/**
 * Time passing: asks expire, and a locked plan whose window closed is a flake for whoever did
 * not check in (the first one found if neither did; the mock only ever plays one other person).
 */
export function sweep(i: Invite, now: number): Invite {
  if (isOpen(i) && now >= i.expiresAt) return { ...i, status: 'expired', resolvedAt: now };
  if (i.status === 'locked' && checkInPhase(i, now) === 'closed') {
    const missing = [i.toId, i.fromId].filter((id) => !i.checkIns.includes(id));
    return { ...i, status: 'flaked', flakedBy: missing[0] ?? null, resolvedAt: now };
  }
  return i;
}
