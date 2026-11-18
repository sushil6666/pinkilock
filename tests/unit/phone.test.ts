/** Phone numbers for sign-in take the picked country's code (WP9). Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalisePhone } from '../../src/domain/phone';

test('a number written the local way gets the picked country code', () => {
  assert.equal(normalisePhone('98765 43210', '91'), '+919876543210');
  assert.equal(normalisePhone('098765 43210', '91'), '+919876543210');
  assert.equal(normalisePhone('07911 123456', '44'), '+447911123456');
  assert.equal(normalisePhone('(415) 555-0132', '1'), '+14155550132');
  assert.equal(normalisePhone('0151 12345678', '49'), '+4915112345678');
});

test('a number that already has its country code keeps it, whatever was picked', () => {
  assert.equal(normalisePhone('+44 7911 123456', '91'), '+447911123456');
  assert.equal(normalisePhone('0044 7911 123456', '91'), '+447911123456');
  assert.equal(normalisePhone('919876543210', '91'), '+919876543210');
});

test('what cannot be a number is refused', () => {
  assert.equal(normalisePhone('12345', '91'), null);
  assert.equal(normalisePhone('+0123456789', '91'), null);
  assert.equal(normalisePhone('', '91'), null);
});
