/**
 * Talk mode (D108) and the free first call (D109) in the mock, as in
 * supabase/migrations/20261126000003_talk.sql. Made-up listeners pick up a moment after they are
 * rung; the AI is a few kind lines that follow the same rules (always an AI, never flirts, help
 * lines on a mention of self-harm), so the whole of it can be tried with no keys. When I listen, a
 * made-up caller rings a few seconds after I say I am taking calls.
 */
import { fail } from '../../domain/errors';
import {
  AI_GAP_SECONDS, AI_MESSAGES_PER_DAY, AI_PASS, AI_PASS_MS, CALL_LENGTHS, CODE_VERSION, FREE_CALL_MINUTES, LISTENER_PER_MINUTE, REFERRAL_CODE, RING_SECONDS,
  TALK_GONE_SECONDS, aiCharge, aiToneFor, callHold, checkAiMessage, checkKyc, checkListener, emptyTalk, freeReason, mentionsHarm, minuteOf, referralCode, talkMatch, talkSplit,
  type AiTone, type Accepts, type CallLength, type FreeCall, type FreeReason, type ListenerCard, type ListenerStatus, type ProfileDone, type Sex, type Talk, type TalkCall,
  type TalkCallEnd, type TalkReportReason, type Topic, type Want,
} from '../../domain/talk';
import { dayOf } from '../../domain/selfLove';
import type { LedgerKind } from '../../domain/wallet';
import type { Backend } from '../backend';
import { t } from '../../i18n';

const MINUTE = 60_000;
const ANSWER_AFTER = 2500;
const VERIFY_AFTER = 3000;
const CALLER_RINGS_AFTER = 6000;
const FRIEND_VERIFIES_AFTER = 4000;

/** The made-up listeners. i18n: data */
const LISTENERS: (ListenerCard & { accepts: Accepts })[] = [
  { id: 'l_asha', firstName: 'Asha', sex: 'woman', accepts: 'anyone', topics: ['lonely', 'stress', 'new_city'], calls: 41 },
  { id: 'l_meera', firstName: 'Meera', sex: 'woman', accepts: 'women', topics: ['breakup', 'family'], calls: 23 },
  { id: 'l_rohan', firstName: 'Rohan', sex: 'man', accepts: 'anyone', topics: ['work', 'exams', 'stress'], calls: 18 },
  { id: 'l_kabir', firstName: 'Kabir', sex: 'man', accepts: 'men', topics: ['just_talk', 'lonely'], calls: 9 },
  { id: 'l_sam', firstName: 'Sam', sex: 'unsaid', accepts: 'anyone', topics: ['just_talk', 'stress'], calls: 12 },
];
/** The made-up caller who rings me when I listen. i18n: data */
const DEMO_CALLER = 'Priya';

interface MockTalkCall {
  id: string;
  listening: boolean;
  other: string;
  name: string;
  length: number;
  free: boolean;
  hold: number;
  rangAt: number;
  startedAt: number | null;
  myMins: number[];
  theirMins: number[];
  endedAt: number | null;
  end: TalkCallEnd | null;
  together: number;
  charged: number;
  refunded: number;
}

export interface MockTalkDb {
  sex: Sex | null;
  want: Want;
  passUntil: number | null;
  freeCall: FreeCall;
  freeReason: FreeReason | null;
  aiDays: Record<string, number>;
  lastAi: number;
  chats: Record<string, { harm: boolean; minutes: number[]; messages: number; at: number }>;
  calls: MockTalkCall[];
  blocks: string[];
  reports: { call: string; reason: TalkReportReason; at: number }[];
  code: string;
  friendsJoined: number;
  friendVerifiesAt: number | null;
  referredBy: string | null;
  listener: null | {
    status: ListenerStatus; firstName: string; sex: Sex; accepts: Accepts; topics: Topic[]; availableUntil: number | null; availableSince: number | null;
    bankLast4: string | null; checkingSince: number | null; payouts: { call: string; payout: number; free: boolean; at: number }[]; demoRang: boolean;
  };
}

export interface MockTalkContext {
  /** Loads the mock database, checks there is a profile (PL002), and gives my Talk part of it. */
  open(): Promise<{ talk: MockTalkDb; now: number }>;
  save(): void;
  /** Moves credits as private.wallet_move does (PL132 when short). */
  move(kind: LedgerKind, paid: number, earned: number, ref?: string): void;
  /** Earned first, then bought (PL132 when short). */
  spend(kind: LedgerKind, cost: number, ref?: string): void;
  balance(): { paid: number; earned: number };
  profileDone(): ProfileDone;
  linked(): boolean;
  age(): number;
  blocked(id: string): boolean;
}

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyMockTalk(): MockTalkDb {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += abc[Math.floor(Math.random() * abc.length)];
  return {
    sex: null, want: 'anyone', passUntil: null, freeCall: 'locked', freeReason: null, aiDays: {}, lastAi: 0, chats: {}, calls: [], blocks: [], reports: [], code,
    friendsJoined: 0, friendVerifiesAt: null, referredBy: null, listener: null,
  };
}

export function createMockTalk(ctx: MockTalkContext): Pick<Backend,
  'talk' | 'talkStatus' | 'talkSettings' | 'talkAi' | 'talkAiPass' | 'talkListeners' | 'talkCall' | 'talkAnswer' | 'talkBeat' | 'talkEnd' | 'talkReport' | 'talkBlock'
  | 'talkVoice' | 'talkListenerApply' | 'talkListenerKyc' | 'talkListenerAvailable' | 'claimReferral'> & { demoFriendJoins(): Promise<Talk> } {
  const together = (c: MockTalkCall) => Math.min(c.myMins.filter((m) => c.theirMins.includes(m)).length, c.length);

  function settle(tk: MockTalkDb, c: MockTalkCall, end: TalkCallEnd, now: number) {
    if (c.end) return;
    const n = c.startedAt ? together(c) : 0;
    const cost = c.free ? 0 : n * LISTENER_PER_MINUTE;
    if (!c.listening && c.hold - cost > 0) ctx.move('talk_back', c.hold - cost, 0, c.id);
    if (c.listening && n > 0 && tk.listener) tk.listener.payouts.push({ call: c.id, payout: talkSplit(n).payout, free: c.free, at: now });
    if (!c.listening && c.free && n > 0) tk.freeCall = 'used';
    Object.assign(c, { end, endedAt: now, together: n, charged: c.listening ? 0 : cost, refunded: c.listening ? 0 : Math.max(c.hold - cost, 0) });
  }

  /** What the server's sweep and the made-up people do, worked out on each read. */
  function tick(tk: MockTalkDb, now: number) {
    for (const c of tk.calls) {
      if (c.end) continue;
      if (!c.startedAt && !c.listening && now - c.rangAt >= ANSWER_AFTER) c.startedAt = c.rangAt + ANSWER_AFTER;
      if (!c.startedAt && now - c.rangAt > RING_SECONDS * 1000) settle(tk, c, 'missed', now);
      else if (c.startedAt && now - Math.max(c.myMins[c.myMins.length - 1] ?? c.startedAt, c.startedAt) > (TALK_GONE_SECONDS + 60) * 1000) settle(tk, c, together(c) >= c.length ? 'talked' : 'gone', now);
    }
    const l = tk.listener;
    if (l?.status === 'checking' && l.checkingSince && now - l.checkingSince >= VERIFY_AFTER) l.status = 'verified';
    if (l?.availableUntil && l.availableUntil < now) l.availableUntil = null;
    if (l?.availableUntil && l.availableSince && !l.demoRang && now - l.availableSince >= CALLER_RINGS_AFTER && !tk.calls.some((c) => !c.end)) {
      l.demoRang = true;
      tk.calls.push({ id: newId('tc'), listening: true, other: 'demo_caller', name: DEMO_CALLER, length: 20, free: false, hold: 0, rangAt: now, startedAt: null,
        myMins: [], theirMins: [], endedAt: null, end: null, together: 0, charged: 0, refunded: 0 });
    }
    if (tk.friendVerifiesAt && now >= tk.friendVerifiesAt) tk.friendVerifiesAt = null;
    if (tk.freeCall === 'locked') {
      const why = freeReason(ctx.profileDone(), tk.friendsJoined > 0 && !tk.friendVerifiesAt ? tk.friendsJoined : 0);
      if (why) Object.assign(tk, { freeCall: 'ready', freeReason: why });
    }
  }

  function view(tk: MockTalkDb, now: number): Talk {
    const c = [...tk.calls].reverse().find((x) => !x.end || (x.endedAt ?? 0) > now - 10 * MINUTE) ?? null;
    const bal = ctx.balance();
    const l = tk.listener;
    const call: TalkCall | null = c && {
      id: c.id, status: c.end ? 'done' : c.startedAt ? 'live' : 'ringing', listening: c.listening, name: c.name, length: c.length, free: c.free, startedAt: c.startedAt,
      together: c.end ? c.together : together(c), theyHere: !c.end && !!c.startedAt, end: c.end, charged: c.charged, refunded: c.refunded,
    };
    return {
      ...emptyTalk(),
      sex: tk.sex, want: tk.want, passUntil: tk.passUntil && tk.passUntil > now ? tk.passUntil : null, aiToday: tk.aiDays[dayOf(now)] ?? 0,
      freeCall: tk.freeCall, freeReason: tk.freeReason, profile: ctx.profileDone(), referralCode: tk.code,
      friendsJoined: tk.friendsJoined, friendsVerified: tk.friendsJoined > 0 && !tk.friendVerifiesAt ? tk.friendsJoined : 0,
      paid: bal.paid, balance: bal.paid + bal.earned,
      listener: l && {
        status: l.status, firstName: l.firstName, sex: l.sex, accepts: l.accepts, topics: l.topics, availableUntil: l.availableUntil, codeVersion: CODE_VERSION, bankLast4: l.bankLast4,
        calls: l.payouts.length, paidOut: 0, pending: l.payouts.reduce((a, p) => a + p.payout, 0),
      },
      call,
      open: { ai: true, voice: true, payouts: true },
    };
  }

  async function change(work: (tk: MockTalkDb, now: number) => void): Promise<Talk> {
    const { talk: tk, now } = await ctx.open();
    tick(tk, now);
    work(tk, now);
    ctx.save();
    return view(tk, now);
  }
  const myCall = (tk: MockTalkDb, id: string) => {
    const c = tk.calls.find((x) => x.id === id && !x.end);
    if (!c) fail('PL170');
    return c;
  };
  const listFor = (tk: MockTalkDb) =>
    LISTENERS.filter((l) => talkMatch(tk.sex!, tk.want, l.sex, l.accepts) && !tk.blocks.includes(l.id) && !ctx.blocked(l.id))
      .map(({ accepts: _a, ...card }) => card);

  /** The mock companion: a few kind lines, by the same rules as the real one. */
  function mockReply(text: string, harm: boolean, n: number, tone: AiTone): string {
    const low = text.toLowerCase();
    if (harm) return t('talk.mock.harm');
    if (/\b(human|real person|bot|are you real|robot|ai\?)\b/.test(low)) return t('talk.mock.isAi');
    // Never sexual, whatever the tone (D113).
    if (/\b(sex|sexy|nude|nudes|naked|horny)\b/.test(low)) return t('talk.mock.noSexual');
    if (/\b(love you|date me|kiss|flirt|girlfriend|boyfriend|hot|cute|beautiful|handsome)\b/.test(low)) return t(tone === 'flirty' ? 'talk.mock.flirty' : 'talk.mock.noFlirt');
    if (/\b(person|someone real|listener|talk to a human)\b/.test(low)) return t('talk.mock.person');
    const lines = ['talk.mock.l1', 'talk.mock.l2', 'talk.mock.l3', 'talk.mock.l4'] as const;
    return t(lines[n % lines.length]);
  }

  return {
    async talk() {
      return change(() => undefined);
    },
    async talkStatus() {
      return { ai: true, voice: true, payouts: true };
    },
    talkSettings: (sex, want) =>
      change((tk) => {
        if (!['woman', 'man', 'unsaid'].includes(sex) || !['opposite', 'same', 'anyone'].includes(want) || (sex === 'unsaid' && want !== 'anyone')) fail('PL158');
        Object.assign(tk, { sex, want });
      }),
    async talkAi(chat, history, text, tone) {
      const { talk: tk, now } = await ctx.open();
      tick(tk, now);
      const body = checkAiMessage(text);
      if (now - tk.lastAi < AI_GAP_SECONDS * 1000) fail('PL163');
      const day = dayOf(now);
      if ((tk.aiDays[day] ?? 0) >= AI_MESSAGES_PER_DAY) fail('PL175');
      let id = chat && tk.chats[chat] && now - tk.chats[chat].at < 6 * 60 * MINUTE ? chat : null;
      if (!id) {
        id = newId('chat');
        tk.chats[id] = { harm: false, minutes: [], messages: 0, at: now };
      }
      const ch = tk.chats[id];
      if (!ch.harm && mentionsHarm(body)) ch.harm = true;
      const minute = minuteOf(now);
      const cost = aiCharge({ passUntil: tk.passUntil, harm: ch.harm, minutePaid: ch.minutes.includes(minute) }, now);
      if (cost) ctx.spend('talk_ai', cost, `${id}:${minute}`);
      if (!ch.minutes.includes(minute)) ch.minutes.push(minute);
      Object.assign(ch, { messages: ch.messages + 1, at: now });
      tk.aiDays = { [day]: (tk.aiDays[day] ?? 0) + 1 };
      tk.lastAi = now;
      ctx.save();
      await new Promise((r) => setTimeout(r, 700));
      return { chat: id, reply: mockReply(body, ch.harm, history.length, aiToneFor(tone, ch.harm)), harm: ch.harm, charged: cost };
    },
    talkAiPass: () =>
      change((tk, now) => {
        if (tk.passUntil && tk.passUntil > now) fail('PL176');
        ctx.spend('talk_pass', AI_PASS, `pass:${now}`);
        tk.passUntil = now + AI_PASS_MS;
      }),
    async talkListeners() {
      const { talk: tk, now } = await ctx.open();
      tick(tk, now);
      if (!tk.sex) fail('PL158');
      const busy = new Set(tk.calls.filter((c) => !c.end).map((c) => c.other));
      return listFor(tk).filter((l) => !busy.has(l.id));
    },
    talkCall: (listenerId, length, free) =>
      change((tk, now) => {
        if (!tk.sex) fail('PL158');
        const len = free ? FREE_CALL_MINUTES : length;
        if (!free && !(CALL_LENGTHS as readonly number[]).includes(length)) fail('PL160');
        if (free && tk.freeCall !== 'ready') fail('PL171');
        if (tk.calls.some((c) => !c.end)) fail('PL174');
        const l = listFor(tk).find((x) => x.id === listenerId);
        if (!l) fail('PL159');
        const hold = callHold(len, free);
        if (ctx.balance().paid < hold) fail('PL139');
        const id = newId('tc');
        if (hold) ctx.move('talk_hold', -hold, 0, id);
        tk.calls.push({ id, listening: false, other: l.id, name: l.firstName, length: len, free, hold, rangAt: now, startedAt: null, myMins: [], theirMins: [], endedAt: null, end: null, together: 0, charged: 0, refunded: 0 });
      }),
    talkAnswer: (callId, yes) =>
      change((tk, now) => {
        const c = myCall(tk, callId);
        if (!c.listening || c.startedAt) fail('PL170');
        if (yes) c.startedAt = now;
        else settle(tk, c, 'declined', now);
      }),
    talkBeat: (callId) =>
      change((tk, now) => {
        const c = myCall(tk, callId);
        if (!c.startedAt) return;
        const m = minuteOf(now);
        // The made-up person stays on the line for the whole call.
        if (!c.myMins.includes(m)) c.myMins.push(m);
        if (!c.theirMins.includes(m)) c.theirMins.push(m);
        if (together(c) >= c.length) settle(tk, c, 'talked', now);
      }),
    talkEnd: (callId) =>
      change((tk, now) => {
        const c = myCall(tk, callId);
        settle(tk, c, !c.startedAt ? 'missed' : together(c) > 0 ? 'talked' : 'ended_early', now);
      }),
    talkReport: (callId, reason) =>
      change((tk, now) => {
        const c = tk.calls.find((x) => x.id === callId && (!x.end || (x.endedAt ?? 0) > now - 24 * 60 * MINUTE));
        if (!c) fail('PL170');
        if (!['sexual', 'contact', 'meet', 'money', 'abuse', 'unsafe', 'other'].includes(reason)) fail('PL177');
        if (!tk.reports.some((r) => r.call === c.id)) tk.reports.push({ call: c.id, reason, at: now });
        if (!tk.blocks.includes(c.other)) tk.blocks.push(c.other);
        settle(tk, c, 'reported', now);
      }),
    talkBlock: (callId) =>
      change((tk, now) => {
        const c = tk.calls.find((x) => x.id === callId && (!x.end || (x.endedAt ?? 0) > now - 24 * 60 * MINUTE));
        if (!c) fail('PL170');
        if (!tk.blocks.includes(c.other)) tk.blocks.push(c.other);
        settle(tk, c, 'blocked', now);
      }),
    // The mock has no voice: the call screen says so and runs the timer.
    async talkVoice() {
      return null;
    },
    talkListenerApply: (input) =>
      change((tk) => {
        if (!ctx.linked() || ctx.age() < 18) fail('PL167');
        const ok = checkListener(input);
        if (tk.listener?.status === 'removed') fail('PL169');
        tk.listener = { status: tk.listener?.status ?? 'applied', availableUntil: null, availableSince: null, bankLast4: null, checkingSince: null, payouts: [], demoRang: false,
          ...tk.listener, firstName: ok.firstName, sex: ok.sex, accepts: ok.accepts, topics: ok.topics };
      }),
    talkListenerKyc: (kyc) =>
      change((tk, now) => {
        if (!tk.listener || !['applied', 'checking'].includes(tk.listener.status)) fail('PL169');
        const ok = checkKyc(kyc);
        Object.assign(tk.listener, { status: 'checking', bankLast4: ok.account.slice(-4), checkingSince: now });
      }),
    talkListenerAvailable: (on) =>
      change((tk, now) => {
        if (on && tk.listener?.status !== 'verified') fail('PL169');
        if (tk.listener) Object.assign(tk.listener, { availableUntil: on ? now + 2 * 60 * MINUTE : null, availableSince: on ? now : null, demoRang: on ? false : tk.listener.demoRang });
      }),
    claimReferral: (raw) =>
      change((tk) => {
        const code = referralCode(raw);
        if (!REFERRAL_CODE.test(code) || code === tk.code || tk.referredBy) fail('PL172');
        tk.referredBy = code;
      }),
    /** Mock only: a made-up friend joins with my link, and verifies a few seconds later. */
    demoFriendJoins: () =>
      change((tk, now) => {
        tk.friendsJoined += 1;
        tk.friendVerifiesAt = now + FRIEND_VERIFIES_AFTER;
      }),
  };
}

export type MockTalk = ReturnType<typeof createMockTalk>;
export type { CallLength };
