/**
 * The app's one logger (docs/build-plan.md, WP0b). Structured, with levels, and a ring of the last
 * 100 lines kept in memory as breadcrumbs for "Share diagnostics" in Me.
 *
 * It never holds content. A field survives only if it is a number, a boolean, or a short string
 * made of the characters ids, codes and routes use; anything else (a name, a note, a place, a
 * handle, a message from a library) is replaced with `[redacted]`.
 *
 * No React Native imports: src/services/supabase/supabaseBackend.ts uses it, and so do the Node tests.
 */
import { AppError } from '../domain/errors';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Field = string | number | boolean | null | undefined;
export type Fields = Record<string, Field>;

export interface Crumb { at: number; level: Level; event: string; fields: Record<string, string | number | boolean | null> }
export interface SeenError { at: number; code: string; trace: string; where: string }

const SAFE = /^[0-9A-Za-z_\-./[\]:·]{0,64}$/;
const MAX_CRUMBS = 100;
const crumbs: Crumb[] = [];
const errors: SeenError[] = [];

export function scrub(fields: Fields = {}): Crumb['fields'] {
  const out: Crumb['fields'] = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else out[k] = SAFE.test(v) ? v : '[redacted]';
  }
  return out;
}

const dev = typeof (globalThis as { __DEV__?: boolean }).__DEV__ !== 'undefined' && (globalThis as { __DEV__?: boolean }).__DEV__;

function write(level: Level, event: string, fields?: Fields) {
  const crumb: Crumb = { at: Date.now(), level, event: SAFE.test(event) ? event : '[redacted]', fields: scrub(fields) };
  crumbs.push(crumb);
  if (crumbs.length > MAX_CRUMBS) crumbs.shift();
  // Production builds print nothing; development prints the same scrubbed line.
  if (dev) (level === 'error' || level === 'warn' ? console.warn : console.log)(`[${level}] ${crumb.event}`, crumb.fields);
}

export const log = {
  debug: (event: string, fields?: Fields) => write('debug', event, fields),
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
  /** Remember an error the person saw, for diagnostics. */
  seen(e: AppError, where: string) {
    errors.push({ at: Date.now(), code: e.code, trace: e.trace, where: SAFE.test(where) ? where : '[redacted]' });
    if (errors.length > 20) errors.shift();
    write('error', 'error.shown', { code: e.code, trace: e.trace, where });
  },
  crumbs: (): readonly Crumb[] => crumbs,
  errors: (): readonly SeenError[] => errors,
};

/**
 * For a failure that is safe to carry on from (a haptic that did not fire, a background re-read
 * that will run again): record it instead of swallowing it. Use as `.catch(quiet('where'))`.
 */
export function quiet(where: string) {
  return (e: unknown) => log.warn('ignored', { where, code: e instanceof AppError ? e.code : 'other' });
}
