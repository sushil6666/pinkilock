/**
 * One trace id per tap (docs/build-plan.md, WP0b): every server call inside one Backend method
 * shares an id; the next tap gets a new one; between taps there is none. Plain Node.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeTrace, traced, tracedAll } from '../../src/services/traceScope';

const tick = () => new Promise((r) => setTimeout(r, 1));

test('the calls of one tap share an id, and the next tap gets its own', async () => {
  const seen: (string | null)[] = [];
  const api = tracedAll({
    kind: 'test',
    async save() {
      seen.push(activeTrace());
      await tick();
      seen.push(activeTrace());
      await this_inner();
    },
  });
  // A method calling another method stays in the same scope.
  const this_inner = traced(async () => {
    await tick();
    seen.push(activeTrace());
  });
  assert.equal(activeTrace(), null, 'no tap, no id');
  await api.save();
  assert.equal(new Set(seen).size, 1);
  assert.match(seen[0] ?? '', /^[0-9A-Z]{8}$/);
  assert.equal(activeTrace(), null, 'closed when the tap is done');
  await api.save();
  assert.notEqual(seen[3], seen[0], 'a new tap, a new id');
  assert.equal(api.kind, 'test');
});

test('a failing tap closes its scope too', async () => {
  const boom = traced(async () => {
    await tick();
    throw new Error('no');
  });
  await assert.rejects(boom());
  assert.equal(activeTrace(), null);
  const sync = traced(() => {
    throw new Error('no');
  });
  assert.throws(sync);
  assert.equal(activeTrace(), null);
});
