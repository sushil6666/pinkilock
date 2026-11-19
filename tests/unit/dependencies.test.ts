/**
 * Dependencies that ship in the app, patched in place until the Expo upgrade (G23, decision D093).
 *
 * expo-router 4 reads a link's query string with query-string 7, which decodes it with
 * decode-uri-component. Version 0.2.2 takes seconds to minutes on a short, malformed link
 * (1.5 KB of "%FF" froze it for 10 s), so a link someone sends could freeze the app.
 * 0.5.1 fixes it but is ESM only, so `vendor/decode-uri-component` holds it as CommonJS and an
 * override in package.json puts it under query-string. Plain Node.
 */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const root = join(__dirname, '..', '..');
const queryString = require.resolve('query-string', { paths: [require.resolve('expo-router', { paths: [root] })] });

test('query-string, as expo-router loads it, uses the patched decoder', () => {
  const decoder = realpathSync(require.resolve('decode-uri-component', { paths: [dirname(queryString)] }));
  assert.equal(decoder, realpathSync(join(root, 'vendor', 'decode-uri-component', 'index.js')));
});

test('a malformed link is read at once, not after seconds', () => {
  const { parse } = require(queryString) as { parse(q: string): Record<string, unknown> };
  for (const bad of ['%FF'.repeat(400) + '%', '%E0%A4'.repeat(400) + '%zz']) {
    const started = Date.now();
    parse(`a=${bad}&b=%C3%A5`);
    assert.ok(Date.now() - started < 200, `took ${Date.now() - started} ms`);
  }
  assert.deepEqual({ ...parse('a=%C3%A5&b=%E0%A4%A') }, { a: 'å', b: '%E0%A4%A' }, 'good parts decode, broken ones stay as typed');
});

test('the nanoid and postcss overrides hold', () => {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string }> };
  for (const [path, { version }] of Object.entries(lock.packages)) {
    if (path.endsWith('node_modules/nanoid')) assert.ok(version === '3.3.20', `${path} is ${version}`);
    if (path.endsWith('node_modules/postcss')) assert.ok(version === '8.5.33', `${path} is ${version}`);
    if (path.endsWith('node_modules/@xmldom/xmldom')) assert.ok(!version?.startsWith('0.7.'), `${path} is ${version}`);
  }
});
