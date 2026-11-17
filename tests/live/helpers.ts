/** Shared by the live tests: a "person" is the app's own Supabase backend with a session of its own. */
import assert from 'node:assert/strict';
import type { Invite, OnboardingInput } from '../../src/domain/types';
import type { Backend, BackendEvent } from '../../src/services/backend';
import { createSupabaseBackend, type SessionStorage } from '../../src/services/supabase/supabaseBackend';

export const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or use npm run test:live:local).');

export const MIN = 60_000;
/** pg_cron fires on the minute; allow one full cycle plus slack. */
export const SWEEP_WAIT = 100_000;

export { memoryStorage } from './helpers.memory';
import { memoryStorage } from './helpers.memory';

export interface Person {
  name: string;
  backend: Backend;
  storage: ReturnType<typeof memoryStorage>;
  id: string;
  events: BackendEvent[];
  /** Resolves with the first event (past or future) that matches. */
  hears(what: string, match: (e: BackendEvent) => boolean, timeout?: number): Promise<BackendEvent>;
  /** Forget what was heard so far, so the next `hears` is about what happens next. */
  quiet(): void;
}

export function person(name: string): Person {
  const storage = memoryStorage();
  const backend = createSupabaseBackend(URL!, KEY!, storage);
  const events: BackendEvent[] = [];
  const waiters = new Set<(e: BackendEvent) => void>();
  backend.subscribe((e) => {
    events.push(e);
    waiters.forEach((w) => w(e));
  });
  return {
    name, backend, storage, events, id: '',
    quiet: () => void (events.length = 0),
    hears(what, match, timeout = 15_000) {
      const seen = events.find(match);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(w);
          reject(new Error(`${name} never heard: ${what} (waited ${timeout / 1000}s, got ${events.length} other events)`));
        }, timeout);
        const w = (e: BackendEvent) => {
          if (!match(e)) return;
          clearTimeout(timer);
          waiters.delete(w);
          resolve(e);
        };
        waiters.add(w);
      });
    },
  };
}

export const profile = (name: string, handle: string): OnboardingInput => ({
  name, age: 24, area: 'Bandra', pronouns: '', tagline: 'automated test, please ignore', vibes: ['foodie'],
  ideaIds: ['boba_run', 'video_coffee', 'chai_walk'], contactKind: 'Instagram', contactHandle: handle,
});

export const inviteIs = (id: string, status: Invite['status']) => (e: BackendEvent) =>
  !!e.changes.invites?.some((i) => i.id === id && i.status === status);

export const one = (c: { invites?: Invite[] }): Invite => {
  assert.equal(c.invites?.length, 1, 'the backend returns exactly the invite it changed');
  return c.invites![0];
};

/** Check in the way two people at the same table do: `who` enters the code `other` shows them (WP4). */
export async function checkInWith(who: Person, other: Person, inviteId: string) {
  const code = await other.backend.myCheckInCode(inviteId);
  return who.backend.checkIn(inviteId, code);
}
