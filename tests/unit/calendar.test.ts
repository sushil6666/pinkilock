/**
 * The calendar file for a plan (src/domain/calendar.ts): valid RFC 5545 lines, times in UTC, text
 * escaped, long lines folded, and nothing but what the plan screen shows. Plain Node.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { icsFor } from '../../src/domain/calendar';

const plan = {
  id: 'abc-123',
  title: 'Boba run with Ira (Pinkilock)',
  startsAt: Date.UTC(2026, 10, 20, 13, 30),
  minutes: 25,
  place: 'Carter Road Promenade, Bandra West',
  note: 'A pinky promise; check in with your codes.',
};

test('a plan becomes one event, in UTC, with a reminder', () => {
  const ics = icsFor(plan, Date.UTC(2026, 10, 18, 9, 0));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /\r\nUID:abc-123@pinkilock\r\n/);
  assert.match(ics, /\r\nDTSTART:20261120T133000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261120T135500Z\r\n/, '25 minutes later');
  assert.match(ics, /\r\nLOCATION:Carter Road Promenade\\, Bandra West\r\n/, 'commas escaped');
  assert.match(ics, /\r\nDESCRIPTION:A pinky promise\\; check in with your codes\.\r\n/, 'semicolons escaped');
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
});

test('long lines fold at 75 octets, and unfold back to the same text', () => {
  const long = { ...plan, place: 'Kala Ghoda, Fort, near the café with the blue door, a long name' + ' ✨'.repeat(20) };
  const ics = icsFor(long);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('LOCATION:Kala Ghoda\\, Fort\\, near the café'));
  assert.ok(unfolded.includes(' ✨'.repeat(20)), 'a character is never split');
});
