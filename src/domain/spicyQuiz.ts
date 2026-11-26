/**
 * Spicy terms and quiz (D107): before Spicy mode turns on, the person reads the Spicy terms, agrees
 * to them, and answers five questions about what they read. Only all five right opens it. The pass
 * is kept by version: when the terms change, SPICY_TERMS_VERSION goes up and Spicy pauses for
 * everyone until they read the new terms and pass the quiz again (it closes on cards and plans too).
 *
 * The server holds the same key and decides (supabase/migrations/20261126000002_spicy_quiz.sql:
 * spicy_terms, pass_spicy_quiz, and the check in save_spicy and spicy_with_for). A pass is a row in
 * public.consents (kind 'spicy', version 'spicy-N'), so it is in the data download and goes with
 * the account. QUIZ_CASES is the shared table (tests/db/spicy_quiz_cases.sql is generated from it:
 * UPDATE_CASES=1 npm run test:unit).
 *
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { AppError, type ErrorCode } from './errors';

/** Up by one whenever the words of the terms change in a way that matters. */
export const SPICY_TERMS_VERSION = 1;
/** As stored in public.consents.version. */
export const spicyConsentVersion = (v: number = SPICY_TERMS_VERSION) => `spicy-${v}`;

/** The sections of the terms, in order, in src/i18n as `spicyQuiz.terms.<key>.title` and `.body`. */
export const SPICY_TERMS = ['adults', 'role', 'private', 'voice', 'photos', 'consent', 'threats', 'never', 'calls', 'credits', 'changes'] as const;
export type SpicyTermsSection = (typeof SPICY_TERMS)[number];

export type QuizOption = 'a' | 'b' | 'c';
export const QUIZ_OPTIONS: readonly QuizOption[] = ['a', 'b', 'c'];

/**
 * The questions, in src/i18n as `spicyQuiz.q.<id>.ask`, `.a`, `.b`, `.c` and `.why` (shown when
 * it was missed). `right` is the one answer that passes. The app shows the options in a new order
 * on each try; it sends the letters, never the order.
 */
export const SPICY_QUIZ = [
  { id: 'phone', right: 'b' },
  { id: 'camera', right: 'c' },
  { id: 'photos', right: 'a' },
  { id: 'threat', right: 'b' },
  { id: 'stop', right: 'c' },
] as const satisfies readonly { id: string; right: QuizOption }[];
export type QuizQuestion = (typeof SPICY_QUIZ)[number]['id'];

/** Where I stand with the terms, as spicy_terms() answers it. */
export interface SpicyTerms {
  /** The version in force now. */
  version: number;
  /** I passed the quiz for this version. */
  passed: boolean;
  /** When, if I did. */
  passedAt: number | null;
  /** I passed an older version once: the terms changed since. */
  outdated: boolean;
}

export const spicyTermsNone: SpicyTerms = { version: SPICY_TERMS_VERSION, passed: false, passedAt: null, outdated: false };

export interface QuizResult {
  passed: boolean;
  /** The questions I got wrong, in quiz order. Empty when passed. */
  wrong: QuizQuestion[];
}

/**
 * Everything pass_spicy_quiz checks, in its order: the version I read, the yes to the terms, an
 * answer to every question. Then the marking. Throws the refusal's code.
 */
export function checkQuiz(version: number, agree: boolean, answers: readonly string[]): QuizResult {
  if (version !== SPICY_TERMS_VERSION) throw new AppError('PL155');
  if (!agree) throw new AppError('PL156');
  if (answers.length !== SPICY_QUIZ.length || !answers.every((a) => (QUIZ_OPTIONS as readonly string[]).includes(a))) throw new AppError('PL157');
  const wrong = SPICY_QUIZ.filter((q, i) => answers[i] !== q.right).map((q) => q.id);
  return { passed: wrong.length === 0, wrong };
}

/** The options of one question in a new order for this try. `seed` changes on every try. */
export function shuffled(seed: number, question: number): QuizOption[] {
  const list = [...QUIZ_OPTIONS];
  let s = (Math.imul(seed, 2654435761) ^ Math.imul(question + 1, 40503)) >>> 0;
  for (let i = list.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = (s >>> 16) % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const RIGHT = SPICY_QUIZ.map((q) => q.right);

/**
 * [version, agree, answers, the wrong question ids joined by ",", "pass", or an error code]. Run
 * through checkQuiz here and through pass_spicy_quiz in SQL (tests/db/spicy_quiz.sql).
 */
export const QUIZ_CASES: readonly [number, boolean, string[], string | ErrorCode][] = [
  [1, true, [...RIGHT], 'pass'],
  [1, true, ['a', 'c', 'a', 'b', 'c'], 'phone'],
  [1, true, ['b', 'a', 'a', 'b', 'c'], 'camera'],
  [1, true, ['b', 'c', 'b', 'b', 'c'], 'photos'],
  [1, true, ['b', 'c', 'a', 'a', 'c'], 'threat'],
  [1, true, ['b', 'c', 'a', 'b', 'a'], 'stop'],
  [1, true, ['a', 'a', 'b', 'a', 'a'], 'phone,camera,photos,threat,stop'],
  [1, true, ['c', 'b', 'c', 'c', 'b'], 'phone,camera,photos,threat,stop'],
  [1, false, [...RIGHT], 'PL156'],
  [0, true, [...RIGHT], 'PL155'],
  [2, true, [...RIGHT], 'PL155'],
  [1, true, ['b', 'c', 'a', 'b'], 'PL157'],
  [1, true, ['b', 'c', 'a', 'b', 'c', 'a'], 'PL157'],
  [1, true, ['b', 'c', 'a', 'b', 'd'], 'PL157'],
  [1, true, ['b', 'c', 'a', 'b', ''], 'PL157'],
  [1, true, ['B', 'C', 'A', 'B', 'C'], 'PL157'],
  [1, true, [], 'PL157'],
];

/** One case as checkQuiz answers it, in the table's words. */
export function quizCaseResult(version: number, agree: boolean, answers: readonly string[]): string {
  try {
    const r = checkQuiz(version, agree, answers);
    return r.passed ? 'pass' : r.wrong.join(',');
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
}
