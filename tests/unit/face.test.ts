import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FACE_TRIES_PER_WEEK, FACE_WEEK_MS, faceRefusal } from '../../src/domain/face';

const now = Date.UTC(2026, 10, 19, 12);
const day = 24 * 60 * 60 * 1000;

test('a first face may be sent; one waits at a time', () => {
  assert.equal(faceRefusal([], [], now), null);
  assert.equal(faceRefusal([now - day], [{ at: now - day, status: 'pending' }], now), 'PL113');
});

test('a new face once a week, straight away after a held one', () => {
  assert.equal(faceRefusal([now - day], [{ at: now - day, status: 'approved' }], now), 'PL114');
  assert.equal(faceRefusal([now - 8 * day], [{ at: now - 8 * day, status: 'approved' }], now), null);
  assert.equal(faceRefusal([now - day], [{ at: now - day, status: 'held' }], now), null);
  // Removing the face does not give its week back.
  assert.equal(faceRefusal([now - day], [], now), 'PL114');
});

test('three tries a week at most, even after a held one', () => {
  const tries = [now - 3 * day, now - 2 * day, now - day];
  assert.equal(faceRefusal(tries, [{ at: now - day, status: 'held' }], now), 'PL114');
});

test('the SQL keeps the same numbers', () => {
  const sql = readFileSync('supabase/migrations/20261119000004_face_photo.sql', 'utf8');
  assert.equal(FACE_WEEK_MS, 7 * day);
  assert.ok(sql.includes(`interval '7 days') >= ${FACE_TRIES_PER_WEEK}`), 'three tries a week in add_photo');
  assert.ok(sql.includes("status = 'pending') then\n      raise exception using errcode = 'PL113'"), 'one waiting face in add_photo');
});
