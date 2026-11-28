/**
 * Every error the app can show, with a stable code (docs/build-plan.md, WP0b). The code and a
 * trace id are shown under the message on screen; together they find the cause on the server
 * (OPERATIONS.md, "Trace a bug").
 *
 *   PL  refused by a database function. Same code and same words as the SQL
 *       (supabase/migrations/20261117000007_error_codes.sql and later); tests/unit/errors.test.ts
 *       fails if the two drift apart. The mock throws the same codes.
 *   PA  sign-in (GoTrue's answers, in the app's words).
 *   PC  the app itself: the network, a server error with no code of ours, a crash.
 *
 * A new error takes the next free code in its group, in SQL and here together.
 */
export const ERRORS = {
  PL001: 'Sign in first.',
  PL002: 'Finish setting up first.',
  PL003: 'That person is not around any more.',
  PL004: 'That person is not available.',
  PL010: 'You cannot block yourself.',
  PL011: 'You cannot report yourself.',
  PL012: 'Pick a reason.',
  PL013: 'Keep it under 500 characters.',
  PL014: 'You have sent a lot of reports today. We are looking at them.',
  PL020: 'You cannot ask yourself.',
  PL021: 'Pick a time that has not passed.',
  PL022: 'Unknown idea.',
  PL023: 'You have 3 asks open. Wait for an answer first.',
  PL024: 'You two already have something open.',
  PL025: 'You have sent a lot of asks today. Try again tomorrow.',
  PL026: 'You asked them recently. Give it a few days.',
  PL027: 'You have changed your profile a lot today. Try again tomorrow.',
  PL028: 'You have passed on a lot of people today. Try again tomorrow.',
  PL030: 'That invite is gone.',
  PL031: 'This one expired.',
  PL032: 'The person you asked goes first.',
  PL033: 'This one is not open any more.',
  PL034: 'Nothing to check in to.',
  PL035: 'Check-in is not open.',
  PL036: 'Only a locked plan can be bailed on.',
  PL037: 'Too many wrong codes. Wait five minutes, then try again.',
  PL038: 'They have not opened their code yet. Ask them to open the plan.',
  PL039: 'That code is not right. Check it with them and try again.',
  PL040: 'Only app_open can be logged from the app.',
  PL041: 'That event is too big.',
  PL050: 'That error report was not valid.',
  PL060: 'Use your first name: letters only, 2 to 16.',
  PL061: 'You need to be 18 or older.',
  PL062: 'Pick up to three tags from the list.',
  PL063: 'Pick three to six things you are up for.',
  PL064: 'That is too long.',
  PL065: 'Contacts unlock after a kept promise. Take that out.',
  PL066: 'Add how people reach you after a kept promise.',
  PL067: 'Pick a meeting place from the list.',
  PL068: 'Add your email or phone number first. It keeps your record yours.',
  PL069: 'Pick a line from the list.',
  PL070: 'You changed your name recently. You can change it again 30 days after.',
  PL071: 'You changed your line this week. You can change it again 7 days after.',
  PL072: 'This account is paused while we look at a report.',
  PL073: 'Your line was removed after a report. You can add one again later.',
  PL074: 'Only a kept promise can be rated.',
  PL075: 'Answer both questions.',
  PL076: 'Pinkilock is not open in that city yet.',
  PL077: 'Agree to the terms, the privacy policy and the use of your dating preferences first.',
  PL078: 'Pinkilock is not open in your country yet.',
  PL079: 'That is not something to agree to.',
  PL080: 'Pick what the request is about.',
  PL081: 'That decision is not about you.',
  PL082: 'You have sent a lot of requests today. We will answer the ones we have.',
  PL083: 'Pick times from the list.',
  PL084: 'You have made a few links today. Share the ones you have.',
  PL085: 'This link has expired. Ask your friend for a new one.',
  PL086: 'You cannot vouch here.',
  PL087: 'Pick one to three from the list.',
  PL088: 'You are already in a duo. Leave it first.',
  PL089: 'This duo link has expired. Ask your friend for a new one.',
  PL090: 'That moderation step is not valid.',
  PL091: 'You cannot join this duo.',
  PL092: 'Make a duo with a friend first.',
  PL093: 'They do not have a duo right now.',
  PL094: 'Wait for the other three, then seal it.',
  PL095: 'Pick an area in your new city.',
  PL096: 'Pick your pronouns from the list.',
  PL097: 'That is not an Instagram username: letters, numbers, dots and underscores, up to 30.',
  PL098: 'That is not a Snapchat username: 3 to 15, starting with a letter.',
  PL099: 'Use your WhatsApp number with its country code, like +91 98765 43210.',
  PL100: 'You can flag a handle only from a promise you kept this week.',
  PL101: 'Checking works for Instagram and WhatsApp for now.',
  PL102: 'Checking handles is not switched on yet.',
  PL103: 'Their handle is verified: it was proved from that account.',
  PL104: 'Pick things that are on offer where you live.',
  PL105: 'You moved city this week. You can move again 7 days after.',
  PL106: 'Name your area in letters: 3 to 30, up to 4 words.',
  PL107: 'That photo could not be used. Pick another one.',
  PL108: 'You have three photos. Remove one first.',
  PL109: 'That is enough new photos for this week. Try again in a few days.',
  PL110: 'That photo is not there any more.',
  PL111: 'That sign-in request was not valid.',
  PL112: 'Wait a few minutes before asking for another code.',
  PL113: 'Your new face photo is still being checked.',
  PL114: 'You can change your face photo once a week.',
  PL115: 'Pick a mood from the list.',
  PL116: 'Pick where this note goes.',
  PL117: 'Write a few words, up to 300 characters.',
  PL118: 'Three good things a day is plenty. Add more tomorrow.',
  PL119: 'Your notes are full. Remove one to add another.',
  PL120: 'That note is not there any more.',
  PL121: 'Pause for 1 to 14 days.',
  PL122: 'That step opens on its own day.',
  PL123: 'Usernames only. Never put a phone number here.',
  PL124: 'That is not a Discord username: 2 to 32 lowercase letters, numbers, _ or .',
  PL125: 'That is not a Telegram username: 5 to 32 letters, numbers or _, starting with a letter.',
  PL126: 'Add a Discord, Telegram or Signal username.',
  PL127: 'Confirm you are 18 or older and agree to the safety rules first.',
  PL128: 'Spicy mode needs a phone number or an email on your account.',
  PL129: 'Pick your boundaries from the list.',
  PL130: 'Spicy opens only when you both have it on.',
  PL131: 'That is not a Signal username: 3 to 32 letters, numbers or _, a dot, then 2 to 9 numbers.',
  PL132: 'Not enough credits. Top up or earn some first.',
  PL133: 'Your boost is already on.',
  PL134: 'You have two extra asks already.',
  PL135: 'A stake goes on a locked plan before it starts.',
  PL136: 'Pick a pack from the list.',
  PL137: 'Your wallet is full. Spend some credits first.',
  PL138: 'You already staked this plan.',
  PL139: 'This is paid from bought credits. Top up first.',
  PL140: 'Treats work on a locked plan with a partner place in your city.',
  PL141: 'This plan already has a treat.',
  PL142: 'Two treats a week is plenty.',
  PL143: 'That treat is not there any more.',
  PL144: 'Top-ups are not open yet. You can still earn credits.',
  PL145: 'Your part is paid already.',
  PL146: 'You both need to say yes first.',
  PL147: 'Pick a call length: 5, 10, 15 or 30 minutes.',
  PL148: 'Pick 1 to 8 times, on the hour or half hour, from an hour to a week ahead.',
  PL149: 'Calls are set up once your match is unlocked.',
  PL150: 'There is no call to do that on right now.',
  PL151: 'Moving the call now counts as missing it.',
  PL152: 'Three calls with one person is the most.',
  PL153: 'The call timer opens five minutes before the start.',
  PL154: 'Read the Spicy terms and pass the quiz first.',
  PL155: 'The Spicy terms changed. Read them again and retake the quiz.',
  PL156: 'Agree to the Spicy terms first.',
  PL157: 'Answer every question.',
  PL158: 'Tell us who you are and whom you would like to talk to.',
  PL159: 'That listener is not free right now. Try another.',
  PL160: 'Pick a call length: 10, 20 or 30 minutes.',
  PL161: 'The AI companion is not open yet. Try again later.',
  PL162: 'Write something, up to 800 characters.',
  PL163: 'One message at a time.',
  PL164: 'Use your first name, and say who you are and whom you take calls from.',
  PL165: 'Pick 1 to 4 things you can talk about.',
  PL166: 'Agree to the listener code first.',
  PL167: 'Listeners are 18 or older, with a phone or an email on the account.',
  PL168: 'Check the PAN, the account number, the IFSC and the name.',
  PL169: 'You are not a verified listener yet.',
  PL170: 'There is no call to do that on right now.',
  PL171: 'Your free call is not unlocked yet.',
  PL172: 'That invite link does not work for this account.',
  PL173: 'Calls with a listener are not open yet.',
  PL174: 'You are on a call already.',
  PL175: 'That is a lot of talking for one day. The AI is back tomorrow, or try a listener.',
  PL176: 'Your day pass is still on.',
  PL177: 'Pick what happened.',
  PL178: 'Usernames can be shared after a call that counted.',
  PL179: 'In-app calls are not switched on yet.',
  PL180: 'The call needs your microphone. Allow it for Pinkilock in your settings, then join again.',
  // Saathi sessions (D114). PL178 to PL180 above are Spicy voice (D111).
  PL181: 'Your time with Saathi is up. Continue for another 15 minutes to keep talking.',
  PL182: 'You still have time with Saathi. You can continue in the last 2 minutes.',
  PL183: 'The day pass is no longer sold. Start a 15-minute session instead.',
  PL184: 'You have Pink Gold for a year already.',
  PL185: 'You have no Boosts left. Get one first.',
  PL186: 'You have a lot of Boosts waiting. Use some first.',
  PL187: 'You have 15 asks open. Wait for an answer first.',
  // Paid features paused (D117).
  PL188: 'Paid features are paused for now. Everything else is free to use.',
  PL189: 'You have had your free time with Saathi today. Come back tomorrow.',
  PL190: 'Your free unlock for this week is used. The next one opens 7 days after it.',
  PL191: 'Give 1 to 366 days of Pink Gold, or 1 to 12 Boosts with a reason.',
  // Bring a friend (D118).
  PL192: 'This device could not be checked. Restart the app and try again.',
  PL220: 'Couple mode opens once you both want to meet again.',
  PL221: 'Couple mode is not on any more.',
  PL222: 'You already have Couple mode open. End it first.',
  PL223: 'Couple mode cannot start with them right now.',
  PL224: 'There is no ask for Couple mode to answer.',
  PL225: 'Pick an idea from the list.',
  PL226: 'That one is on your list already.',
  PL227: 'Your date list is full. Remove one to add another.',
  PL228: 'That idea is not on your list any more.',
  PL229: 'Pick what kind of day it is.',
  PL230: 'Pick a real date.',
  PL231: 'Your birthday is on the list already.',
  PL232: 'Twelve special days is the most. Remove one to add another.',
  PL233: 'That day is not yours to remove.',
  // Gentle pushes (D124).
  PL234: 'Turn reminders on or off.',
  // Question of the day (D125).
  PL235: 'Write an answer of up to 300 characters.',
  PL236: 'You have answered today\'s question. A new one comes tomorrow.',
  // Daily relationship check-in (D126).
  PL237: 'Pick how today felt.',
  PL238: 'Keep each note to 500 characters.',
  PL239: 'You have checked in today. Come back tomorrow.',
  PL240: 'Pick a reminder time between 6 pm and 10 pm, or turn it off.',
  // Expert tips (D127).
  PL241: 'Pick a topic from the list.',
  PL242: 'That expert is not listed.',
  PL243: 'Pick a reason from the list.',
  PL244: 'Read and agree to the rules for experts first.',
  PL245: 'Fill in your name, what you do, your licence or training, your city and how we can reach you.',

  PA001: 'Phone sign-in is not switched on yet.',
  PA002: 'Email sign-in is not switched on yet.',
  PA003: 'That does not look right. Check it and try again.',
  PA004: 'That is already on another account. Sign in with it instead.',
  PA005: 'We could not find an account with that. Create one first, then add it from the Me tab.',
  PA006: 'That code did not match or has expired. Check it, or send a new one.',
  PA007: 'Wait a moment before asking for another code.',
  PA008: 'Add a phone number or an email first, or you could not get back in.',
  PA009: 'Sign-in did not work. Try again.',
  PA010: 'The quick check did not finish. Try again.',
  PA011: 'Update Pinkilock to sign in: this version cannot show the quick check.',

  PC001: 'Could not reach the server. Check your connection and try again.',
  PC002: 'Something went wrong on our side. Try again.',
  PC003: 'Locked until you both check in.',
  PC004: 'Something went wrong. Try again.',
  PC009: 'Something broke on this screen.',
} as const;

export type ErrorCode = keyof typeof ERRORS;

/**
 * PL codes the app raises itself, about a database answer that is not an error. PL039: a wrong
 * check-in code comes back as the plan unchanged (an error would undo the server's count of wrong
 * tries), and the app names it. PL144: top-ups are off (no Razorpay keys, or a phone app before Play
 * Billing); the `wallet` Edge Function and the app say it, not a migration. PL161 (no Claude key),
 * PL168 (bank details Razorpay would refuse) and PL173 (no voice provider or no Route) come from the
 * `talk` Edge Function and the app (D108). PL179 (no voice provider for Spicy calls) comes from the
 * `voice` Edge Function and the app, and PL180 (microphone refused) from the app (D111).
 */
export const APP_RAISED_PL: readonly ErrorCode[] = ['PL039', 'PL144', 'PL161', 'PL168', 'PL173', 'PL179', 'PL180'];

/** Refusals that usually mean a block or an account deletion this phone has not heard about yet. */
export const RESYNC_CODES: readonly ErrorCode[] = ['PL003', 'PL004', 'PL030', 'PL033', 'PL034'];

const TRACE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** An 8-character id for one action, sent to the server as `x-trace-id`. Not a secret. */
export function newTrace(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += TRACE_ALPHABET[Math.floor(Math.random() * TRACE_ALPHABET.length)];
  return out;
}

export const isErrorCode = (c: unknown): c is ErrorCode => typeof c === 'string' && c in ERRORS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly trace: string;
  constructor(code: ErrorCode, message?: string, trace?: string) {
    super(message ?? ERRORS[code]);
    this.name = 'AppError';
    this.code = code;
    this.trace = trace ?? newTrace();
  }
}

/** Throw the catalogue's error for a code. `message` only where the words must differ. */
export function fail(code: ErrorCode, message?: string): never {
  throw new AppError(code, message);
}

/** Any thrown value as an AppError. Something that is not ours keeps its words, under `fallback`. */
export function asAppError(e: unknown, fallback: ErrorCode = 'PC004'): AppError {
  if (e instanceof AppError) return e;
  return new AppError(fallback, e instanceof Error && e.message ? e.message : undefined);
}

/** What goes under the message on screen and in a support request: `PL033 · 7F3K2M9Q`. */
export const errorRef = (e: AppError): string => `${e.code} · ${e.trace}`;

const REF = /^(P[LAC]\d{3}) · ([0-9A-Z]{8})$/;

/** The words and the reference, as one string a screen can keep in state. */
export const withRef = (message: string, e: AppError): string => `${message}\n${errorRef(e)}`;

/** Splits what withRef made. Text with no reference comes back as it is. */
export function splitRef(text: string): { message: string; ref: string | null } {
  const cut = text.lastIndexOf('\n');
  if (cut >= 0 && REF.test(text.slice(cut + 1))) return { message: text.slice(0, cut), ref: text.slice(cut + 1) };
  return { message: text, ref: null };
}
