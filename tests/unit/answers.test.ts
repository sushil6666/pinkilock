import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answersIn } from '../../src/domain/answers';

test('answer time reads in plain words, and says nothing when unknown', () => {
  assert.equal(answersIn(null), null);
  assert.equal(answersIn(undefined), null);
  assert.equal(answersIn(5), 'Usually answers in minutes');
  assert.equal(answersIn(40), 'Usually answers in about 45 min');
  assert.equal(answersIn(95), 'Usually answers in about 2 hours');
  assert.equal(answersIn(60 * 30), 'Usually takes a day or more to answer');
});
