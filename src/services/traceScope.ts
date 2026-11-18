/**
 * One trace id per tap (docs/build-plan.md, WP0b). A tap calls one Backend method; that method may
 * make several server calls (an rpc, then a re-read). Each Backend method opens a scope, and every
 * call inside it carries the scope's id, so the events, pushes and errors of one tap share one id.
 *
 * JavaScript on a phone has no async context, so the scope is a counter: it opens at the first
 * method call, stays open while any method is still running, and closes when the last one settles.
 * Two taps at the very same moment share an id; that is rare and still points at the right moment.
 * Pure TypeScript, tested in tests/unit/trace_scope.test.ts.
 */
import { newTrace } from '../domain/errors';

let current: string | null = null;
let open = 0;

/** The id of the tap in progress, or null between taps. */
export const activeTrace = (): string | null => current;

/** `fn`, run inside a trace scope: the first open one is shared, and it closes when all are done. */
export function traced<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    if (open === 0) current = newTrace();
    open += 1;
    const close = () => {
      open -= 1;
      if (open === 0) current = null;
    };
    let out: R;
    try {
      out = fn(...args);
    } catch (e) {
      close();
      throw e;
    }
    if (out instanceof Promise) return out.finally(close) as R;
    close();
    return out;
  };
}

/** Every method of an object, traced. Other properties pass through as they are. */
export function tracedAll<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) if (typeof v === 'function') out[k] = traced(v as (...a: unknown[]) => unknown);
  return out as T;
}
