/**
 * The one seam between the app and wherever data lives.
 *
 * Screens and the store only know this interface. `mock/mockBackend.ts` implements it today with
 * seeded data, latency and a simulated other person; a Supabase implementation maps each method
 * to one rpc() or select() (ARCHITECTURE.md section 8) and `subscribe` to a Realtime channel.
 */
import type { Account, BlockedPerson, Invite, MyContact, NewInvite, NewReport, OnboardingInput, PhoneMode, Profile, Reveal } from '../domain/types';

export interface Snapshot {
  me: Profile | null;
  myContact: MyContact | null;
  profiles: Profile[];
  invites: Invite[];
  passedIds: string[];
}

/** Rows that changed. The store merges them by id. */
export interface Changes {
  me?: Profile;
  myContact?: MyContact;
  profiles?: Profile[];
  invites?: Invite[];
  passedIds?: string[];
  /**
   * Rows I can no longer see: someone blocked (either way), or someone who deleted their account.
   * The store drops them. The app is never told which of those it was.
   */
  removed?: { profiles?: string[]; invites?: string[] };
}

export type PushPlatform = 'ios' | 'android';

export type Notice = { tone: 'pink' | 'volt' | 'flare'; title: string; body: string; inviteId?: string };

/** Something the other person (or the clock) did. */
export interface BackendEvent {
  changes: Changes;
  notice?: Notice;
}

export interface Backend {
  /** 'mock' runs on seeded data in the phone; 'supabase' is the live database. */
  readonly kind: 'mock' | 'supabase';
  boot(): Promise<Snapshot>;
  completeOnboarding(input: OnboardingInput): Promise<Snapshot>;
  updateMe(patch: Partial<OnboardingInput>): Promise<Changes>;

  pass(profileId: string): Promise<Changes>;
  restorePasses(): Promise<Changes>;

  sendInvite(input: NewInvite): Promise<Changes>;
  /** Do my half of the lock. Receiver goes first, sender seals. */
  offerPinky(inviteId: string): Promise<Changes>;
  declineInvite(inviteId: string): Promise<Changes>;
  checkIn(inviteId: string): Promise<Changes>;
  bail(inviteId: string): Promise<Changes>;

  /** Refuses unless the invite is kept: the reveal is gated on the server, not by a blur. */
  getReveal(inviteId: string): Promise<Reveal>;

  subscribe(listener: (e: BackendEvent) => void): () => void;

  /**
   * Hand this device's Expo push token to the server, which is the only thing that ever sends a
   * push (ARCHITECTURE.md section 6). The app never sends one and never sees anyone else's token.
   */
  registerPushToken(token: string, platform: PushPlatform): Promise<void>;
  /** This device should stop getting pushes (signing out, permission withdrawn). */
  unregisterPushToken(token: string): Promise<void>;

  /**
   * Safety (ARCHITECTURE.md section 5). A block hides the two people from each other and ends
   * every live invite between them, enforced by RLS. A report always blocks as well, and goes
   * where no client can read it.
   */
  block(profileId: string): Promise<Changes>;
  unblock(profileId: string): Promise<Changes>;
  blockedPeople(): Promise<BlockedPerson[]>;
  report(input: NewReport): Promise<Changes>;

  /** Everything the backend holds about me, as a JSON document. */
  exportMyData(): Promise<string>;
  /**
   * Deletes me for good: profile, contact, invites, device tokens. The behaviour log keeps its
   * rows without my id. Afterwards the backend is signed out and `boot` starts a new person.
   */
  deleteAccount(): Promise<Snapshot>;

  /**
   * Phone sign-in. `link` adds a number to the person already signed in, so the id and history
   * stay; `sign_in` gets back into an existing account on a new phone (no new accounts this way).
   */
  account(): Promise<Account>;
  sendPhoneCode(phone: string, mode: PhoneMode): Promise<void>;
  verifyPhoneCode(phone: string, code: string, mode: PhoneMode): Promise<Snapshot>;
  /** Only once a phone is linked: otherwise signing out would lose the account. */
  signOut(): Promise<Snapshot>;

  /** Prototype tools (Me tab), mock only. The live backend rejects them. */
  demoReset(): Promise<Snapshot>;
  demoBringForward(inviteId: string): Promise<Changes>;
}
