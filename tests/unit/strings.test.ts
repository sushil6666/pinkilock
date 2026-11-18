/**
 * Every word on screen comes from src/i18n (docs/build-plan.md, WP9). This test reads the screens
 * and components as text and fails on words written straight into them: JSX text, text props, and
 * sentence-like string literals. It also checks the strings files themselves: placeholders match
 * between English and the pseudo-languages, and plurals pick their form.
 * Plain Node: `npm run test:unit`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { en } from '../../src/i18n/en';
import { fmtTime, setLocale, t } from '../../src/i18n';

const root = join(__dirname, '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

/** Words that are names, not language: they stay as they are in every language. */
const ALLOWED = new Set(['pinkilock', 'Pinkilock', 'Instagram', 'Snapchat', 'WhatsApp', 'Telegram', 'Signal']);

const TEXT_PROPS = 'label|title|placeholder|accessibilityLabel|accessibilityHint|eyebrow|body|hint|sub|aria-label|aria-valuetext|message|confirm';

/** Lines of words written into a screen, as `file:line  text`. */
export function hardCoded(file: string): string[] {
  const raw = readFileSync(file, 'utf8');
  // A line marked `i18n: data` holds stored values (sent to the server, read by the other person),
  // not words for this screen.
  const data = new Set(raw.split('\n').flatMap((l, i) => (l.includes('i18n: data') ? [i + 1] : [])));
  const src = raw
    // Comments say nothing on screen.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (m, pre) => pre + ' '.repeat(m.length - pre.length));
  const found: { at: number; text: string }[] = [];
  const words = (s: string) => {
    const w = s.replace(/\$\{[^}]*\}/g, ' ').match(/[A-Za-z]{2,}/g) ?? [];
    return w.filter((x) => !ALLOWED.has(x));
  };
  // JSX text: after a tag closes (`>`, not `=>`) or after an expression (`}`), up to the next tag.
  for (const m of src.matchAll(/(?<![=-])>([^<>{}]+)(?=[<{])|\}([^<>{}=;()&|]+)(?=<)/g)) {
    const text = (m[1] ?? m[2]).trim();
    // Code between two tags, like ` : !live ? `, is not text.
    if (!text || /[;=()&|]|^[\s\w.!]*\?|^[:?]/.test(text)) continue;
    if (/^(const|let|var|return|export|function|type|interface|if|else|case|default|import)\b/.test(text)) continue;
    if (words(text).length) found.push({ at: m.index!, text });
  }
  // Text props given a literal: label="Send", label={'Send'}, label={`Send ${x}`}.
  for (const m of src.matchAll(new RegExp(`\\b(?:${TEXT_PROPS})=(?:"([^"]*)"|\\{'([^']*)'\\}|\\{\`([^\`]*)\`\\})`, 'g'))) {
    const text = m[1] ?? m[2] ?? m[3];
    if (words(text).length) found.push({ at: m.index!, text });
  }
  // Sentence-like literals anywhere else: a capital, then a space and more words.
  for (const m of src.matchAll(/(['"`])([A-Z][a-z']*(?: [^'"`\n]*)?[a-z.?!])\1/g)) {
    const text = m[2];
    if (!text.includes(' ') || !words(text).length) continue;
    found.push({ at: m.index!, text });
  }
  const line = (i: number) => src.slice(0, i).split('\n').length;
  const kept = found.filter((f) => !data.has(line(f.at)));
  return [...new Map(kept.map((f) => [`${line(f.at)}  ${f.text}`, f])).keys()].map((l) => `${relative(root, file)}:${l}`);
}

test('no words written straight into a screen or component', () => {
  const files = [...walk(join(root, 'app')), ...walk(join(root, 'src', 'components'))];
  const all = files.flatMap(hardCoded);
  assert.deepEqual(all, [], `Put these through t() and src/i18n/en.ts:\n${all.join('\n')}`);
});

const leaves = (o: unknown, path = ''): [string, string][] =>
  typeof o === 'string' ? [[path, o]] : Object.entries(o as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every pseudo-language string keeps the same placeholders', () => {
  for (const tag of ['en-XA', 'ar-XB']) {
    setLocale(tag);
    for (const [key, english] of leaves(en)) {
      if (key.startsWith('errors.') || /\.(zero|one|two|few|many|other)$/.test(key)) continue;
      const shown = t(key as Parameters<typeof t>[0]);
      assert.deepEqual(holes(shown), holes(english), `${tag} ${key}`);
      assert.notEqual(shown, english, `${tag} ${key} is not translated`);
    }
  }
  setLocale('en');
});

test('plurals, filling and fallbacks', () => {
  setLocale('en');
  assert.equal(t('vouches.by', { count: 1 }), 'Vouched by 1 friend');
  assert.equal(t('vouches.by', { count: 3 }), 'Vouched by 3 friends');
  assert.equal(t('checkIn.showIt', { who: 'Riya' }), 'Show it to Riya.');
  setLocale('fr-FR');
  assert.equal(t('checkIn.button'), 'Check in', 'a language we do not have yet shows English');
  setLocale('en-XA');
  assert.match(t('checkIn.button'), /^\[Çĥéçķ îñ/);
  setLocale('en', 'en-GB');
  assert.equal(fmtTime(Date.UTC(2026, 10, 18, 14, 5), 'UTC'), '14:05');
  setLocale('en', 'en-US');
  assert.match(fmtTime(Date.UTC(2026, 10, 18, 14, 5), 'UTC'), /^2:05\sPM$/);
  setLocale('en');
});
