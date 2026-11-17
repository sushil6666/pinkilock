import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FREE_WINDOWS, suits, windowOf } from '../../src/domain/freeWindows';

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0).getTime();

test('a time falls in its window, by weekday and weekend', () => {
  assert.equal(windowOf(at(2026, 11, 18, 19)), 'wkd_evening'); // a Wednesday
  assert.equal(windowOf(at(2026, 11, 21, 13)), 'wke_afternoon'); // a Saturday
  assert.equal(windowOf(at(2026, 11, 18, 4)), null);
});

test('someone with no windows suits any time; otherwise only theirs', () => {
  assert.ok(suits(at(2026, 11, 18, 19), []));
  assert.ok(suits(at(2026, 11, 18, 19), ['wkd_evening']));
  assert.ok(!suits(at(2026, 11, 18, 9), ['wkd_evening']));
});

test('the ids in SQL are the ids here', () => {
  const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
  const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const m = sql.match(/free_windows <@ array\[([^\]]+)\]/);
  assert.ok(m, 'the SQL check exists');
  assert.deepEqual(m![1].split(',').map((s) => s.trim().replace(/'/g, '')), FREE_WINDOWS.map((w) => w.id));
});
