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
  PL030: 'That invite is gone.',
  PL031: 'This one expired.',
  PL032: 'The person you asked goes first.',
  PL033: 'This one is not open any more.',
  PL034: 'Nothing to check in to.',
  PL035: 'Check-in is not open.',
  PL036: 'Only a locked plan can be bailed on.',
  PL040: 'Only app_open can be logged from the app.',
  PL050: 'That error report was not valid.',
  PL060: 'Use your first name: letters only, 2 to 16.',
  PL061: 'You need to be 18 or older.',
  PL062: 'Pick up to three tags from the list.',
  PL063: 'Pick three to six things you are up for.',
  PL064: 'That is too long.',
  PL065: 'Contacts unlock after a kept promise. Take that out.',
  PL066: 'Add how people reach you after a kept promise.',

  PA001: 'Phone sign-in is not switched on yet.',
  PA002: 'Email sign-in is not switched on yet.',
  PA003: 'That does not look right. Check it and try again.',
  PA004: 'That is already on another account. Sign in with it instead.',
  PA005: 'No account uses that yet. Set one up first, then add it in Me.',
  PA006: 'That code did not match or has expired. Check it, or send a new one.',
  PA007: 'Wait a moment before asking for another code.',
  PA008: 'Add a phone number or an email first, or you could not get back in.',
  PA009: 'Sign-in did not work. Try again.',

  PC001: 'Could not reach the server. Check your connection and try again.',
  PC002: 'Something went wrong on our side. Try again.',
  PC003: 'Locked until you both check in.',
  PC004: 'Something went wrong. Try again.',
  PC009: 'Something broke on this screen.',
} as const;

export type ErrorCode = keyof typeof ERRORS;

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
