/**
 * The error catalogue exists twice (SQL and src/domain/errors.ts) and must match; the logger must
 * never keep content; and no failure may be swallowed. Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AppError, ERRORS, asAppError, errorRef, newTrace, splitRef, withRef } from '../../src/domain/errors';
import { bail, checkIn } from '../../src/domain/invites';
import type { Invite } from '../../src/domain/types';
import { log, scrub } from '../../src/lib/log';

const ROOT = join(__dirname, '..', '..');

/** code -> message, from every migration; a later migration's wording wins, as in the database. */
function sqlErrors(): Map<string, string> {
  const dir = join(ROOT, 'supabase', 'migrations');
  const found = new Map<string, string>();
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    for (const m of sql.matchAll(/errcode = '(PL\d{3})', message = '((?:[^']|'')*)'/g)) found.set(m[1], m[2].replace(/''/g, "'"));
  }
  return found;
}

test('every code the database raises is in the catalogue, with the same words', () => {
  const sql = sqlErrors();
  assert.ok(sql.size >= 20, 'the migrations were read');
  for (const [code, message] of sql) assert.equal((ERRORS as Record<string, string>)[code], message, `${code} differs between SQL and src/domain/errors.ts`);
});

test('every PL code in the catalogue is raised by the database', () => {
  const sql = sqlErrors();
  for (const code of Object.keys(ERRORS).filter((c) => c.startsWith('PL'))) assert.ok(sql.has(code), `${code} is in src/domain/errors.ts but no migration raises it`);
});

test('the shared rules throw the same codes the database does', () => {
  const invite = { id: 'i', fromId: 'a', toId: 'b', status: 'sent', startsAt: Date.now() + 3_600_000, checkIns: [] } as unknown as Invite;
  assert.throws(() => checkIn(invite, 'a', Date.now()), (e) => e instanceof AppError && e.code === 'PL034');
  assert.throws(() => bail(invite, 'a', Date.now()), (e) => e instanceof AppError && e.code === 'PL036');
});

test('a trace id is 8 characters the server accepts', () => {
  for (let i = 0; i < 200; i++) assert.match(newTrace(), /^[0-9A-Z]{8}$/);
});

test('the on-screen reference survives a round trip, and plain text is left alone', () => {
  const e = new AppError('PL033');
  const text = withRef(e.message, e);
  assert.deepEqual(splitRef(text), { message: 'This one is not open any more.', ref: errorRef(e) });
  assert.deepEqual(splitRef('Keep at least three.'), { message: 'Keep at least three.', ref: null });
  assert.deepEqual(splitRef('two\nlines'), { message: 'two\nlines', ref: null });
});

test('anything thrown becomes an error with a code', () => {
  assert.equal(asAppError(new Error('boom')).code, 'PC004');
  assert.equal(asAppError('a string', 'PC009').code, 'PC009');
  const mine = new AppError('PL020');
  assert.equal(asAppError(mine), mine);
});

test('the logger keeps ids, codes and numbers, and nothing that could be content', () => {
  const kept = scrub({ fn: 'send_invite', trace: 'AB12CD34', route: '/plan/[id]', n: 3, ok: true, id: '00000000-0000-0000-0000-0000000000e1' });
  assert.deepEqual(kept, { fn: 'send_invite', trace: 'AB12CD34', route: '/plan/[id]', n: 3, ok: true, id: '00000000-0000-0000-0000-0000000000e1' });
  const dropped = scrub({ note: 'call me 98765 43210', handle: '@aanya.frames', place: 'Linking Road, Bandra', name: 'Aanya Rao', long: 'x'.repeat(65) });
  for (const [k, v] of Object.entries(dropped)) assert.equal(v, '[redacted]', `${k} was kept`);
  log.info('a message with spaces is not an event name', { note: 'meet me at 5' });
  const last = log.crumbs()[log.crumbs().length - 1];
  assert.equal(last.event, '[redacted]');
  assert.equal(last.fields.note, '[redacted]');
});

test('the breadcrumb ring holds the last 100 lines', () => {
  for (let i = 0; i < 150; i++) log.debug('tick', { i });
  assert.equal(log.crumbs().length, 100);
  assert.equal(log.crumbs()[99].fields.i, 149);
});

test('no failure is swallowed: no empty catch anywhere in the app', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) {
        readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
          if (/\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|undefined|void 0)\s*\)/.test(line) || /catch\s*(\(\s*\w+\s*\))?\s*\{\s*\}/.test(line) || /,\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line))
            offenders.push(`${path.slice(ROOT.length + 1)}:${i + 1}`);
        });
      }
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'app'));
  assert.deepEqual(offenders, [], 'handle the error, or pass it to quiet(where) from src/lib/log');
});
