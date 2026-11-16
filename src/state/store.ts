/**
 * Client state: a cache of what the backend returned, plus the little that is only about this
 * session. Every action is "call the backend, merge the rows it returned" (ARCHITECTURE.md
 * section 3). Nothing here knows whether the backend is the mock or Supabase.
 */
import { create } from 'zustand';
import type { Invite, MyContact, NewInvite, OnboardingInput, Profile } from '../domain/types';
import { backend, type Changes, type Notice, type Snapshot } from '../services';

interface State {
  ready: boolean;
  bootError: string | null;
  me: Profile | null;
  myContact: MyContact | null;
  profiles: Profile[];
  invites: Invite[];
  passedIds: string[];
  notice: Notice | null;

  boot(): Promise<void>;
  completeOnboarding(input: OnboardingInput): Promise<void>;
  updateMe(patch: Partial<OnboardingInput>): Promise<void>;
  pass(profileId: string): Promise<void>;
  restorePasses(): Promise<void>;
  sendInvite(input: NewInvite): Promise<Invite>;
  offerPinky(inviteId: string): Promise<void>;
  declineInvite(inviteId: string): Promise<void>;
  checkIn(inviteId: string): Promise<void>;
  bail(inviteId: string): Promise<void>;
  demoReset(): Promise<void>;
  demoBringForward(inviteId: string): Promise<void>;
  dismissNotice(): void;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[] | undefined): T[] {
  if (!incoming?.length) return current;
  const map = new Map(incoming.map((x) => [x.id, x]));
  const merged = current.map((x) => map.get(x.id) ?? x);
  const fresh = incoming.filter((x) => !current.some((c) => c.id === x.id));
  return [...fresh, ...merged];
}

function merge(s: State, c: Changes): Partial<State> {
  return {
    me: c.me ?? s.me,
    myContact: c.myContact ?? s.myContact,
    profiles: mergeById(s.profiles, c.profiles),
    invites: mergeById(s.invites, c.invites),
    passedIds: c.passedIds ?? s.passedIds,
  };
}

const fromSnapshot = (snap: Snapshot): Partial<State> => ({
  me: snap.me, myContact: snap.myContact, profiles: snap.profiles, invites: snap.invites, passedIds: snap.passedIds,
});

let subscribed = false;

export const useStore = create<State>((set, get) => {
  const apply = async (work: Promise<Changes>) => {
    const changes = await work;
    set((s) => merge(s, changes));
    return changes;
  };

  return {
    ready: false,
    bootError: null,
    me: null,
    myContact: null,
    profiles: [],
    invites: [],
    passedIds: [],
    notice: null,

    async boot() {
      if (!subscribed) {
        subscribed = true;
        backend.subscribe((e) => set((s) => ({ ...merge(s, e.changes), notice: e.notice ?? s.notice })));
      }
      try {
        const snap = await backend.boot();
        set({ ...fromSnapshot(snap), ready: true, bootError: null });
      } catch (e) {
        set({ ready: true, bootError: e instanceof Error ? e.message : 'Could not reach the server.' });
      }
    },

    async completeOnboarding(input) {
      set(fromSnapshot(await backend.completeOnboarding(input)));
    },
    async updateMe(patch) {
      await apply(backend.updateMe(patch));
    },
    async pass(profileId) {
      await apply(backend.pass(profileId));
    },
    async restorePasses() {
      await apply(backend.restorePasses());
    },
    async sendInvite(input) {
      const changes = await apply(backend.sendInvite(input));
      return changes.invites![0];
    },
    async offerPinky(inviteId) {
      await apply(backend.offerPinky(inviteId));
    },
    async declineInvite(inviteId) {
      await apply(backend.declineInvite(inviteId));
    },
    async checkIn(inviteId) {
      await apply(backend.checkIn(inviteId));
    },
    async bail(inviteId) {
      await apply(backend.bail(inviteId));
    },
    async demoReset() {
      set({ ...fromSnapshot(await backend.demoReset()), notice: null });
    },
    async demoBringForward(inviteId) {
      await apply(backend.demoBringForward(inviteId));
    },
    dismissNotice() {
      if (get().notice) set({ notice: null });
    },
  };
});

/** Everyone I can see, me included, by id. */
export function usePerson(id: string | undefined): Profile | undefined {
  return useStore((s) => (id && s.me?.id === id ? s.me : s.profiles.find((p) => p.id === id)));
}

export const useInvite = (id: string | undefined) => useStore((s) => s.invites.find((i) => i.id === id));
