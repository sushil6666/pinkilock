/**
 * The credits wallet (D104). The stake rules and the packs exist twice (SQL and
 * src/domain/wallet.ts) and must agree: tests/db/wallet_cases.sql is generated from STAKE_CASES and
 * PACKS and run through the SQL by tests/db/wallet.sql. Regenerate: UPDATE_CASES=1 npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AppError } from '../../src/domain/errors';
import {
  COSTS, MAX_PAID, PACKS, REWARDS, SPICY_UNLOCK, STAKE_CASES, TREATS, spicyShare, split, splitTreat, stakeEnd, streakOf, topUp, topUpsHere,
} from '../../src/domain/wallet';
import { en } from '../../src/i18n/en';
import { hi } from '../../src/i18n/langs/hi';

const ROOT = join(__dirname, '..', '..');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};
const migration = readFileSync(join(ROOT, 'supabase', 'migrations', '20261125000003_wallet.sql'), 'utf8');

test('each stake ends as the shared table says', () => {
  for (const [status, flaked, hours, want] of STAKE_CASES) assert.equal(stakeEnd(status, flaked, hours), want, `${status}/${flaked}/${hours}`);
});

test('the SQL copy of the shared tables is up to date', () => {
  const file = join(ROOT, 'tests', 'db', 'wallet_cases.sql');
  const want = [
    '-- Generated from STAKE_CASES and PACKS in src/domain/wallet.ts. Do not edit: UPDATE_CASES=1 npm run test:unit',
    'create temp table stake_cases (status text, flaked text, hours numeric, want text);',
    'insert into stake_cases (status, flaked, hours, want) values',
    STAKE_CASES.map(([s, f, h, w]) => `  (${q(s)}, ${q(f)}, ${h}, ${q(w)})`).join(',\n') + ';',
    'create temp table pack_cases (id text, rupees int, credits int);',
    'insert into pack_cases (id, rupees, credits) values',
    PACKS.map((p) => `  (${q(p.id)}, ${p.rupees}, ${p.credits})`).join(',\n') + ';',
    '',
  ].join('\n');
  if (process.env.UPDATE_CASES) writeFileSync(file, want);
  assert.ok(existsSync(file), 'tests/db/wallet_cases.sql is missing: UPDATE_CASES=1 npm run test:unit');
  assert.equal(readFileSync(file, 'utf8'), want, 'tests/db/wallet_cases.sql is stale: UPDATE_CASES=1 npm run test:unit');
});

test('the prices, rewards and treats are the same numbers in SQL', () => {
  for (const [k, v] of Object.entries(COSTS)) assert.match(migration, new RegExp(`when '${k}' then ${v}\\b`), `cost ${k}`);
  for (const [k, v] of Object.entries(TREATS)) assert.match(migration, new RegExp(`when '${k}' then ${v}\\b`), `treat ${k}`);
  for (const [k, v] of Object.entries(REWARDS)) assert.match(migration, new RegExp(`when '${k}' then ${v}\\b`), `reward ${k}`);
  assert.match(migration, new RegExp(`> ${MAX_PAID} then`));
  assert.match(migration, new RegExp(`>= ${SPICY_UNLOCK}\\b`));
});

test('spending takes earned credits first; a treat and the Spicy unlock take bought credits only', () => {
  assert.deepEqual(split({ paid: 100, earned: 20 }, 50), { earned: 20, paid: 30 });
  assert.deepEqual(split({ paid: 0, earned: 60 }, 50), { earned: 50, paid: 0 });
  assert.equal(codeOf(() => split({ paid: 10, earned: 10 }, 50)), 'PL132');
  assert.equal(codeOf(() => splitTreat({ paid: 100 }, 150)), 'PL139');
  assert.equal(codeOf(() => spicyShare({ paid: 299 }, 'half', 0, 0)), 'PL139');
});

test('a top-up is a pack from the list and keeps the wallet small', () => {
  assert.equal(topUp({ paid: 0 }, 'p99').credits, 110);
  assert.equal(codeOf(() => topUp({ paid: 0 }, 'p1')), 'PL136');
  assert.equal(codeOf(() => topUp({ paid: 1500 }, 'p499')), 'PL137');
  assert.ok(PACKS.every((p) => p.credits >= p.rupees), 'a pack never gives fewer credits than rupees');
});

test('the Spicy unlock: one pays 600 or each pays 300, and never more than 600 between them', () => {
  assert.equal(spicyShare({ paid: 1000 }, 'full', 0, 0), 600);
  assert.equal(spicyShare({ paid: 1000 }, 'half', 0, 0), 300);
  assert.equal(spicyShare({ paid: 1000 }, 'half', 0, 300), 300);
  assert.equal(spicyShare({ paid: 1000 }, 'full', 0, 300), 300, 'paying all after they paid half pays only the rest');
  assert.equal(codeOf(() => spicyShare({ paid: 1000 }, 'half', 300, 0)), 'PL145');
  assert.equal(codeOf(() => spicyShare({ paid: 1000 }, 'full', 0, 600)), 'PL145');
});

test('a streak counts days in a row up to today', () => {
  assert.equal(streakOf(['2026-11-25', '2026-11-24', '2026-11-23', '2026-11-21'], '2026-11-25'), 3);
  assert.equal(streakOf(['2026-11-24'], '2026-11-25'), 0);
});

test('top-ups are offered only where the store allows them (the website, until Play Billing)', () => {
  assert.ok(topUpsHere('web'));
  assert.ok(!topUpsHere('android') && !topUpsHere('ios'));
});

test('the wallet never pays a person: no withdraw, payout or transfer anywhere', () => {
  const words = /withdraw|payout|transfer to|send credits|cash out/i;
  for (const [k, v] of Object.entries(en.wallet)) if (typeof v === 'string') assert.ok(!words.test(v) || /never|cannot|no /i.test(v), `wallet.${k}`);
  assert.ok(!/create or replace function public\.\w*(withdraw|payout|transfer)/i.test(migration));
});

test('every wallet string has a Hindi version', () => {
  const walk = (a: Record<string, unknown>, b: Record<string, unknown> | undefined, at: string) => {
    for (const [k, v] of Object.entries(a)) {
      if (typeof v === 'string') assert.ok(b && typeof b[k] === 'string', `hi ${at}.${k}`);
      else walk(v as Record<string, unknown>, b?.[k] as Record<string, unknown> | undefined, `${at}.${k}`);
    }
  };
  walk(en.wallet as unknown as Record<string, unknown>, (hi as unknown as Record<string, Record<string, unknown>>).wallet, 'wallet');
});
