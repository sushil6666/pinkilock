/**
 * The one seam between the app and wherever data lives.
 *
 * Screens and the store only know this interface. `mock/mockBackend.ts` implements it today with
 * seeded data, latency and a simulated other person; a Supabase implementation maps each method
 * to one rpc() or select() (ARCHITECTURE.md section 8) and `subscribe` to a Realtime channel.
 */
import type { Mood, NoteKind, SelfLove } from '../domain/selfLove';
import type { Spicy, SpicyInput, SpicyPlan } from '../domain/spicy';
import type { Account, BlockedPerson, ContactCheck, Invite, MyContact, MyPhoto, NewInvite, NewReport, OnboardingInput, CodeKind, CodeMode, PickedPhoto, Profile, Reveal } from '../domain/types';

export interface Snapshot {
  me: Profile | null;
  myContact: MyContact | null;
  profiles: Profile[];
  invites: Invite[];
  passedIds: string[];
  /** My duo partner (docs/build-plan.md F3), or null. Their card is in `profiles`. */
  duoId?: string | null;
}

/** Rows that changed. The store merges them by id. */
export interface Changes {
  me?: Profile;
  myContact?: MyContact;
  profiles?: Profile[];
  invites?: Invite[];
  passedIds?: string[];
  /** My duo partner changed: a new id, or null when the duo ended. Absent when it did not change. */
  duoId?: string | null;
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

export type PrivacyRequestKind = 'score_review' | 'data_question' | 'correction' | 'appeal' | 'other';

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

  /**
   * More people for Discover. Live, they come from the server's discover() (20 at a time, 200
   * different people a day), because no one can read the whole user base; the mock has them all.
   */
  moreProfiles(): Promise<Changes>;
  /**
   * After a kept promise: "Worth showing up?", "See them again?", and whether I felt unsafe. Once
   * only; the other person never sees it and it never touches a Trust Score.
   */
  rateDate(inviteId: string, answer: { worth: boolean; again: boolean; unsafe: boolean }): Promise<void>;
  /** Whether I answered, and whether we both want round two (never whether they said no). */
  dateFeedback(inviteId: string): Promise<{ rated: boolean; roundTwo: boolean }>;
  /** Ask a person about my data, my Trust Score, a correction, or appeal a decision about my account (WP8). */
  fileRequest(kind: PrivacyRequestKind, detail: string, actionId?: number): Promise<void>;
  /** What moderators did about my account, and why. */
  myModeration(): Promise<{ id: number; action: string; reason: string; at: number }[]>;
  /** A link a friend can open to vouch for me (three a day; each good for 7 days and three friends). */
  createVouchLink(): Promise<string>;
  /** Whose link this is (first name), or null when it has expired. */
  vouchFor(token: string): Promise<string | null>;
  /** Vouch for a friend: one to three phrases from the list. Anyone can, signed in or not. */
  vouch(token: string, phrases: string[]): Promise<void>;
  /**
   * Duos (docs/build-plan.md F3). A link a friend with a profile opens in the app to make a duo
   * with me: three a day, good for one day, one use. Everyone is in one duo at most.
   */
  createDuoLink(): Promise<string>;
  /** Whose duo link this is (first name), or null when it cannot be joined. */
  duoLinkName(token: string): Promise<string | null>;
  joinDuo(token: string): Promise<Changes>;
  /** Ends my duo for both of us. Doubles already made keep their four people. */
  leaveDuo(): Promise<Changes>;
  /** When I am usually free (market review). Any time when empty. */
  saveAvailability(windows: string[]): Promise<Changes>;
  /** My own profile line, if a new one is waiting for review or was not accepted. Null when the card shows what I wrote. */
  myLineReview(): Promise<{ text: string; status: 'pending' | 'held' | 'rejected' } | null>;
  pass(profileId: string): Promise<Changes>;
  restorePasses(): Promise<Changes>;

  sendInvite(input: NewInvite): Promise<Changes>;
  /** Do my half of the lock. Receiver goes first, sender seals. */
  offerPinky(inviteId: string): Promise<Changes>;
  declineInvite(inviteId: string): Promise<Changes>;
  /**
   * My 4-digit code for a plan whose check-in is open. I show it (or read it out) to the other
   * person; they enter it to check in, and I enter theirs (WP4). Never in a push or Realtime.
   */
  myCheckInCode(inviteId: string): Promise<string>;
  /** Check in with the other person's code. A wrong code is PL039; five wrong codes wait five minutes (PL037). */
  checkIn(inviteId: string, theirCode: string): Promise<Changes>;
  /** Mock only: the code the made-up other person would read out to me, so the flow can be tried alone. */
  demoTheirCode?(inviteId: string): string;
  bail(inviteId: string): Promise<Changes>;

  /**
   * Photos behind the lock (D088): up to three, each checked by a person before anyone sees it,
   * and then shown only where the reveal is (after a kept promise). Live, a photo goes through
   * the `photo` Edge Function, which strips its metadata; no client writes to storage.
   */
  myPhotos(): Promise<MyPhoto[]>;
  addPhoto(photo: PickedPhoto): Promise<MyPhoto[]>;
  removePhoto(id: string): Promise<MyPhoto[]>;

  /**
   * My face on my card (D095): taken with the camera, checked by a person, then shown on my card to
   * whoever is shown the card. One waits at a time and the old one stays up meanwhile; a new one
   * once a week (straight away after a held one). The list is my face rows, oldest first.
   */
  myFace(): Promise<MyPhoto[]>;
  addFace(photo: PickedPhoto): Promise<MyPhoto[]>;
  removeFace(id: string): Promise<MyPhoto[]>;

  /**
   * Refuses unless the invite is kept: the reveal is gated on the server, not by a blur. On a
   * double, `profileId` picks whom (someone on the other side; both of us must have checked in).
   */
  getReveal(inviteId: string, profileId?: string): Promise<Reveal>;

  /**
   * Contact handles (D077, D078). After a kept plan, either person can say the other's handle did
   * not work (within a week, once per plan); it counts against the owner's Trust Score. I learn how
   * many flags my current handle has, never from whom. A proof is a code I send from my own account
   * to Pinkilock; `boot` and `myContactStatus` say when it has arrived.
   */
  reportBadContact(inviteId: string, ownerId: string): Promise<void>;
  myContactFlags(): Promise<number>;
  startContactCheck(): Promise<ContactCheck>;
  myContactStatus(): Promise<MyContact | null>;

  /**
   * Self love (D101): mine alone. Nobody else can read any of it, and it never goes into a log, a
   * push or an error report. Each call answers with the whole of it as it now stands.
   */
  selfLove(): Promise<SelfLove>;
  /** Today's mood; a second one the same day replaces the first. */
  saveMood(mood: Mood): Promise<SelfLove>;
  /** A gratitude note (three a day), a journal entry or a boundary. Up to 300 characters, 200 notes. */
  addSelfNote(kind: NoteKind, body: string): Promise<SelfLove>;
  removeSelfNote(id: string): Promise<SelfLove>;
  /** Off Discover for 1 to 14 days; 0 comes back now. Plans and asks already made carry on. */
  pauseDiscover(days: number): Promise<SelfLove>;
  /** Starts the 3-day reset from day one (again, if one was running). */
  startReset(): Promise<SelfLove>;
  /** Ticks a day of the reset; each opens on its own day. */
  doResetStep(day: number): Promise<SelfLove>;

  /**
   * Spicy mode (D103): off unless I turn it on. It needs a phone or an email on the account, the
   * 18+ yes, the safety rules, and a Discord or Telegram username (never a phone number).
   */
  spicy(): Promise<Spicy>;
  /** Turns it on, or saves new usernames or boundaries while on. */
  saveSpicy(input: SpicyInput): Promise<Spicy>;
  /** One tap: off, and the usernames, boundaries and every yes are gone. */
  spicyOff(): Promise<Spicy>;
  /**
   * With one person, from day one: open only when we both have it on and I can see their card
   * (Discover showed them, or we share an ask or plan), nobody blocked. Their usernames come only
   * when we both said yes; nothing ever says that they said no.
   */
  spicyWith(profileId: string): Promise<SpicyPlan>;
  /** Yes, move our chat; false takes my yes back. PL130 when it is not open. */
  spicyYes(profileId: string, yes: boolean): Promise<SpicyPlan>;

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
