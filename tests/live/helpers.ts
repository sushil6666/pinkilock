/** Shared by the live tests: a "person" is the app's own Supabase backend with a session of its own. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import type { Invite, OnboardingInput } from '../../src/domain/types';
import type { Backend, BackendEvent } from '../../src/services/backend';
import { createSupabaseBackend, type SessionStorage } from '../../src/services/supabase/supabaseBackend';

export const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or use npm run test:live:local).');

// GitHub's runners are outside the open countries, so the live-test workflow gives each run a
// token that gets a first profile past the network-country check (PL078, decision D063). Every
// request to the project carries it; nothing else changes. Unset locally, where there is no check.
const NETWORK_TOKEN = process.env.E2E_NETWORK_TOKEN;
if (NETWORK_TOKEN) {
  const plainFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const target = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    if (!target.startsWith(URL!)) return plainFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('x-pinkilock-test-token', NETWORK_TOKEN);
    return plainFetch(input, { ...init, headers });
  };
}

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

const DB = process.env.E2E_DB_URL;
const sqlOne = (q: string): string => execFileSync('psql', [DB!, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', q], { encoding: 'utf8' }).trim();

/**
 * Whether the project's link gate is on (asks and pinkies need an email or phone, WP2). The deploy
 * switches it on once a mail sender or SMS provider exists, and then an anonymous test person can
 * neither ask nor be seen in Discover. Read once, with the database URL; false without one.
 */
export const LINK_GATE = !!DB && sqlOne(`select private.config_on('require_linked')`) === 't';

/**
 * With the gate on, a test person is linked as soon as they are set up, the way a real person
 * would link an email: here by marking the account in the database, since the test has no
 * mailbox on a hosted project. The address is on a reserved domain that can never receive mail.
 */
export const TEST_EMAIL_DOMAIN = 'e2e.pinkilock.invalid';
function linkInDb(id: string) {
  sqlOne(`update auth.users set is_anonymous = false, email = 'test-' || id || '@${TEST_EMAIL_DOMAIN}' where id = '${id}'`);
}

export function person(name: string): Person {
  const storage = memoryStorage();
  const backend = createSupabaseBackend(URL!, KEY!, storage);
  if (LINK_GATE) {
    const setUp = backend.completeOnboarding.bind(backend);
    backend.completeOnboarding = async (input) => {
      const snap = await setUp(input);
      linkInDb(snap.me!.id);
      return snap;
    };
  }
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
  name, age: 24, area: 'Bandra West', pronouns: '', tagline: 'automated test, please ignore', vibes: ['foodie'],
  ideaIds: ['boba_run', 'video_coffee', 'chai_walk'], contactKind: 'Instagram', contactHandle: handle,
  consents: ['adult', 'terms', 'privacy', 'sensitive'],
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
