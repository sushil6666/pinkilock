/**
 * The one seam between the app and wherever data lives.
 *
 * Screens and the store only know this interface. `mock/mockBackend.ts` implements it today with
 * seeded data, latency and a simulated other person; a Supabase implementation maps each method
 * to one rpc() or select() (ARCHITECTURE.md section 8) and `subscribe` to a Realtime channel.
 */
import type { Mood, NoteKind, SelfLove } from '../domain/selfLove';
import type { CityEvent } from '../domain/weekly';
import type { CityStanding } from '../domain/streaks';
import type { Couple, DayKind } from '../domain/couple';
import type { CallAnswer, CallMinutes, SpicyCall } from '../domain/calls';
import type { Spicy, SpicyInput, SpicyPlan } from '../domain/spicy';
import type { QuizResult, SpicyTerms } from '../domain/spicyQuiz';
import type { SpicyShare, TopUpStatus, TreatItem, TreatPartner, Wallet } from '../domain/wallet';
import type { MyReferrals } from '../domain/referrals';
import type { Switches } from '../domain/paid';
import type { AiReply, AiSession, AiTone, AiTurn, CallLength, KycInput, ListenerCard, ListenerInput, Sex, Talk, TalkOpen, TalkReportReason, Want } from '../domain/talk';
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

  /** What is on in my city now and in the next two weeks (D121), soonest first, at most 12. Written by the team. */
  cityEvents(): Promise<CityEvent[]>;

  /**
   * Where I stand in my city (D122): my top-percent bucket for keeping promises and the share of the
   * city's plans kept this month. Only mine, never a name or a rank; nothing until the city has 20 people to compare.
   */
  cityStanding(): Promise<CityStanding>;

  /**
   * Couple mode (D120): only after a match (a kept plan for two, both want round two), and only the
   * two of us see it. Each call answers with the whole of it as it now stands.
   */
  couple(): Promise<Couple>;
  /** Ask them, or say yes when they asked me first. PL220 without a match, PL222 when mine is open, PL223 when theirs is. */
  coupleAsk(profileId: string): Promise<Couple>;
  /** Yes or no to their ask (PL224 when there is none). A no ends it quietly. */
  coupleAnswer(yes: boolean): Promise<Couple>;
  /** Ends it for both, or takes my ask back. Nothing says why. */
  coupleEnd(): Promise<Couple>;
  /** An idea from my city's catalogue onto our date list (PL225 to PL227); I heart it as I add it. */
  coupleAddIdea(ideaId: string): Promise<Couple>;
  /** Heart it (again: take it back), mark it done (again: not done), or take it off (PL228). */
  coupleIdea(id: string, action: 'heart' | 'done' | 'remove'): Promise<Couple>;
  /** A special day from the list, `YYYY-MM-DD` (PL229 to PL232). */
  coupleAddDay(kind: DayKind, day: string): Promise<Couple>;
  /** Only a day I added (PL233). */
  coupleRemoveDay(id: string): Promise<Couple>;
  /** I did this week's challenge, or take my tick back. */
  coupleChallenge(done: boolean): Promise<Couple>;

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
  /**
   * The Spicy terms and quiz (D107): where I stand with the terms in force. Spicy turns on, and
   * stays open on cards and plans, only after a pass for this version.
   */
  spicyTerms(): Promise<SpicyTerms>;
  /**
   * My answers, one letter per question in SPICY_QUIZ order, for the version I read. All right is a
   * pass and is kept; otherwise the wrong questions come back and nothing is kept. PL155 when the
   * terms changed, PL156 without the yes, PL157 when an answer is missing.
   */
  passSpicyQuiz(version: number, agree: boolean, answers: string[]): Promise<QuizResult>;

  /**
   * Spicy mode's unlock (D105): once we both said yes, 600 bought credits to Pinkilock show the
   * usernames: 'half' pays 300 (once), 'full' pays whatever is left, so the one who paid half can
   * pay the rest. Never goes to the other person; comes back if the match closes before it is paid.
   */
  spicyPay(profileId: string, share: SpicyShare): Promise<SpicyPlan>;

  /**
   * Spicy call times (D106), on an unlocked match only (PL130 when Spicy is not open, PL149 before
   * the unlock). Each picks times and a minimum length; the first time both picked is the call and
   * the shorter length applies. The in-app timer counts a minute only when both apps checked in
   * during it. What happened, and who it counts against, is decided on the server.
   */
  spicyCall(profileId: string): Promise<SpicyCall>;
  /** My times (1 to 8, on the half hour, an hour to a week ahead) and my minimum. PL147, PL148, PL152. */
  spicyCallPick(profileId: string, slots: number[], minutes: CallMinutes): Promise<SpicyCall>;
  /** The open app checks in during the call (every BEAT_SECONDS). PL153 outside the timer's hour. */
  spicyCallBeat(profileId: string): Promise<SpicyCall>;
  /** I am done; with `unsafe` ("I felt unsafe or uncomfortable") it ends for both at once and counts against nobody. */
  spicyCallEnd(profileId: string, unsafe: boolean): Promise<SpicyCall>;
  /** The free move (once, an hour or more ahead); otherwise PL151, or with `anyway` it counts as my miss. */
  spicyCallMove(profileId: string, anyway: boolean): Promise<SpicyCall>;
  /** The confirm fallback, when the timer could not tell. */
  spicyCallAnswer(profileId: string, answer: CallAnswer): Promise<SpicyCall>;
  /**
   * D111: the voice room for my call with them, while the timer is open: a microphone-only token
   * from the `voice` Edge Function (PL179 where voice is not set up yet). The mock answers a stand-in
   * that src/lib/voice.ts plays as silence.
   */
  spicyVoice(profileId: string): Promise<{ url: string; token: string }>;
  /** D111: share my usernames with them (or take that back), only after a kept call (PL178). */
  spicyShare(profileId: string, share: boolean): Promise<SpicyPlan>;

  /**
   * The credits wallet (D104): a closed loop. Credits are bought (Razorpay) or earned, and spent
   * only here. Never withdrawn, never sent to another person. Each call answers with the whole of
   * it as it now stands.
   */
  wallet(): Promise<Wallet>;
  /** Opening the app counts for the streak (seven days in a row earns credits). */
  walletVisit(): Promise<Wallet>;
  /**
   * The server's switches (D117): `paid` says whether payments are on. Off, nothing is sold and the
   * app shows no prices; the features stay. Read once at boot; on any error the app assumes off.
   */
  switches(): Promise<Switches>;
  /** Whether top-ups are open here (Razorpay keys set, payments on), and in test mode. */
  topUpStatus(): Promise<TopUpStatus>;
  /**
   * Buy a pack. Live, on the website: the `wallet` Edge Function makes a Razorpay order, Razorpay
   * Checkout takes the payment, and the function checks the signature and credits it. Refused
   * (PL144) where top-ups are not open; the phone apps wait for Play Billing (O15).
   */
  topUp(packId: string): Promise<Wallet>;
  /** My card first on Discover in my city for a day (PL133 while one is on). */
  boost(): Promise<Wallet>;
  /** One more open ask for a day, two at most (PL134). */
  buyExtraAsk(): Promise<Wallet>;
  /** 50 credits on a locked plan, back when it is kept (or they flake), lost if I do not show. */
  stakePlan(inviteId: string): Promise<Wallet>;
  /** Partner places in our city that could hand over a treat on this plan; empty when none. */
  treatOptions(inviteId: string): Promise<TreatPartner[]>;
  /** Cover their coffee, dessert or movie: bought credits, held until the plan is kept. */
  treatPlan(inviteId: string, partnerId: string, item: TreatItem): Promise<Wallet>;
  /** The person treated says no thanks; it goes back to the giver. */
  declineTreat(inviteId: string): Promise<Wallet>;

  /**
   * Talk mode (D108): an AI companion and verified listeners, never linked to Spicy mode or to
   * anything anyone else can see. Each call answers with the whole of it as it now stands.
   */
  talk(): Promise<Talk>;
  /** What is set up on the server: the AI (a Claude key), voice (LiveKit) and payouts (Route). */
  talkStatus(): Promise<TalkOpen>;
  /** Who I am, to match listeners, and whom I would like to talk to (PL158). */
  talkSettings(sex: Sex, want: Want): Promise<Talk>;
  /**
   * One message to the AI companion. The chat is held by the phone and sent with each message (the
   * last AI_HISTORY turns); the server keeps none of it. PL161 when the AI is not set up. `tone` is
   * Saathi's tone (D113); a chat that mentioned self-harm is warm whatever is sent.
   */
  talkAi(chat: string | null, history: AiTurn[], text: string, tone: AiTone): Promise<AiReply & { chat: string }>;
  /**
   * Start, or continue, a Saathi session (D114): AI_SESSION_CREDITS for AI_SESSION_MINUTES, from the
   * wallet (PL132 when short: top up, then try again; the chat stays). Free with a pass or after a
   * mention of self-harm. PL182 when there is still more than AI_CONTINUE_MINUTES left.
   */
  talkAiSession(chat: string | null): Promise<AiSession>;
  /** The day pass: no longer sold (PL183, D114). */
  talkAiPass(): Promise<Talk>;
  /** Listeners free now who take calls from me, as I asked. */
  talkListeners(): Promise<ListenerCard[]>;
  /** Ring a listener: bought credits for the length are held (none on the free call). */
  talkCall(listenerId: string, length: CallLength, free: boolean): Promise<Talk>;
  /** The listener picks up, or says not now. */
  talkAnswer(callId: string, yes: boolean): Promise<Talk>;
  /** The open app checks in during the call (every TALK_BEAT_SECONDS). */
  talkBeat(callId: string): Promise<Talk>;
  talkEnd(callId: string): Promise<Talk>;
  talkReport(callId: string, reason: TalkReportReason): Promise<Talk>;
  talkBlock(callId: string): Promise<Talk>;
  /** A voice room for a live call, or null where voice is not set up yet. */
  talkVoice(callId: string): Promise<{ url: string; token: string } | null>;
  /** Become a listener (PL164 to PL167). */
  talkListenerApply(input: ListenerInput): Promise<Talk>;
  /** Identity, PAN and bank, straight to Razorpay Route through the `talk` Edge Function (PL168, PL173). */
  talkListenerKyc(kyc: KycInput): Promise<Talk>;
  /** Taking calls for two hours, or not now (PL169 until verified). */
  talkListenerAvailable(on: boolean): Promise<Talk>;
  /** A friend's link (D109), within a week of joining, once (PL172). */
  claimReferral(code: string): Promise<Talk>;
  /** Mock only: a made-up friend joins with my link and verifies a moment later. */
  demoFriendJoins?(): Promise<Talk>;
  /**
   * Bring a friend (D118): my link, how many friends joined and count, my rewards, and my own
   * checklist if I joined with a link. Opening it gives any rewards that are due.
   */
  myReferrals(): Promise<MyReferrals>;
  /** This app's own device id (src/lib/device.ts), so one phone cannot make many friends (PL192). */
  noteDevice(device: string): Promise<void>;
  /** Mock only: a made-up friend joins with my link and counts a moment later. */
  demoReferral?(): Promise<MyReferrals>;

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
