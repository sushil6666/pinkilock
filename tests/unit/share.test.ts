import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shareText } from '../../src/lib/shareText';

test('the shared plan names who, what, where and when, and nothing else', () => {
  const text = shareText({ name: 'Ira', age: 21, idea: 'Boba run', place: 'Carter Road Promenade, Bandra West', when: 'Today, 7:00 PM', endsBy: '8:00 PM' });
  assert.match(text, /Ira \(21\)/);
  assert.match(text, /Carter Road Promenade/);
  assert.match(text, /by 8:00 PM, check on me/);
  assert.doesNotMatch(text, /@/);
});
