/**
 * The one place an error goes when the app shows it or decides to carry on without it
 * (docs/build-plan.md, WP0b). It becomes an AppError with a code and a trace id, is remembered
 * for diagnostics, and is sent to the server's client error log. Only the code, the trace id, the
 * screen and the build are sent: never the words, which can hold content.
 */
import { Platform } from 'react-native';
import { asAppError, withRef, type AppError, type ErrorCode } from '../domain/errors';
import { backend } from '../services';
import { buildLabel } from './build';
import { log, quiet } from './log';

const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : null;

/** Record and send. `where` is the screen as a route pattern (`/plan/[id]`), never a real id. */
export function report(e: unknown, where: string, fallback?: ErrorCode): AppError {
  const err = asAppError(e, fallback);
  log.seen(err, where);
  backend.logClientError({ code: err.code, trace: err.trace, route: where, appVersion: buildLabel, platform }).catch(quiet('report.send'));
  return err;
}

/** Report it and return what the screen should show: the words, then `CODE · TRACE` on its own line. */
export function shown(e: unknown, where: string, fallback?: ErrorCode): string {
  const err = report(e, where, fallback);
  return withRef(err.message, err);
}

/** Everything support needs, and nothing private: ids, codes, routes and times only. */
export function diagnostics(userId: string | null): string {
  const time = (at: number) => new Date(at).toISOString();
  return [
    `Pinkilock ${buildLabel} (${platform ?? 'unknown'}, ${backend.kind})`,
    `user ${userId ?? 'none'}`,
    `at ${time(Date.now())}`,
    '',
    'Errors shown:',
    ...(log.errors().length ? log.errors().slice(-5).map((e) => `${time(e.at)} ${e.code} · ${e.trace} ${e.where}`) : ['none']),
    '',
    'Last steps:',
    ...log.crumbs().map((c) => `${time(c.at)} ${c.level} ${c.event} ${JSON.stringify(c.fields)}`),
  ].join('\n');
}
