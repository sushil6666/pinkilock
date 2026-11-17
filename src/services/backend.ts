/**
 * The one seam between the app and wherever data lives.
 *
 * Screens and the store only know this interface. `mock/mockBackend.ts` implements it today with
 * seeded data, latency and a simulated other person; a Supabase implementation maps each method
 * to one rpc() or select() (ARCHITECTURE.md section 8) and `subscribe` to a Realtime channel.
 */
import type { Account, BlockedPerson, Invite, MyContact, NewInvite, NewReport, OnboardingInput, CodeKind, CodeMode, Profile, Reveal } from '../domain/types';

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
/** One error a phone showed, as sent to the server (OPERATIONS.md, "Trace a bug"). */
export interface ClientErrorReport {
  code: string;
  trace: string | null;
  route: string;
  appVersion: string;
  platform: 'ios' | 'android' | 'web' | null;
}

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
   * Tell the server about an error this phone showed: its code, trace id, screen and build. No
   * content ever goes with it. Over the limit (30 an hour) it is dropped, never refused.
   */
  logClientError(report: ClientErrorReport): Promise<void>;

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
   * Sign-in codes, by text (`phone`, E.164) or by email (`email`, lower case). `link` adds the
   * number or address to the person already signed in, so the id and history stay; `sign_in` gets
   * back into an existing account on a new phone (no new accounts are made this way).
   */
  account(): Promise<Account>;
  sendCode(kind: CodeKind, address: string, mode: CodeMode): Promise<void>;
  verifyCode(kind: CodeKind, address: string, code: string, mode: CodeMode): Promise<Snapshot>;
  /** Only once a phone or an email is linked: otherwise signing out would lose the account. */
  signOut(): Promise<Snapshot>;

  /** Prototype tools (Me tab), mock only. The live backend rejects them. */
  demoReset(): Promise<Snapshot>;
  demoBringForward(inviteId: string): Promise<Changes>;
}
