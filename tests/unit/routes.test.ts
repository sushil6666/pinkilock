/**
 * src/lib/routes.ts names every route (the browser tab's title) and says which ones need a
 * profile. A screen added to app/ without a line there would get no title and, worse, would be
 * treated however the default falls: this fails instead. Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { APP_NAME, KNOWN_ROUTES, needsProfile, titleFor } from '../../src/lib/routes';

const APP = join(__dirname, '..', '..', 'app');

/** app/(tabs)/index.tsx -> "(tabs)", app/plan/[id].tsx -> "plan/[id]", app/index.tsx -> "". */
function routeFiles(dir = APP): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    if (!name.endsWith('.tsx') || name === '_layout.tsx') return [];
    return [relative(APP, full).replace(/\\/g, '/').replace(/\.tsx$/, '').replace(/(^|\/)index$/, '')];
  });
}

test('every screen in app/ has a title, and every title has a screen', () => {
  assert.deepEqual([...KNOWN_ROUTES].sort(), routeFiles().sort());
});

test('titles name the screen and never the person', () => {
  assert.equal(titleFor(['(tabs)', 'plans']), `Plans · ${APP_NAME}`);
  assert.equal(titleFor(['plan', '[id]']), `Plan · ${APP_NAME}`);
  assert.equal(titleFor(['']), APP_NAME);
  assert.equal(titleFor(['something', 'new']), APP_NAME);
});

test('only the gate, onboarding, sign-in, not-found, the terms, a friend\'s vouch or invite link and the safety page open without a profile', () => {
  const open = KNOWN_ROUTES.filter((r) => !needsProfile(r.split('/')));
  assert.deepEqual(open.sort(), ['', '+not-found', 'account/sign-in', 'duo/[token]', 'legal/[doc]', 'onboarding', 'r/[code]', 'safety', 'vouch/[token]']);
  // A route nobody has listed is shut, not open.
  assert.equal(needsProfile(['something', 'new']), true);
});
