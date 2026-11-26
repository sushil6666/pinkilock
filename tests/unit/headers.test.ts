/**
 * The website's security headers (web/_headers): the policy must let through what the app really
 * loads, and nothing else. Found by review: photos (D088) come from Supabase Storage's signed
 * links, which an img-src of 'self' data: blob: would block on pinkilock.com. Plain Node.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const csp = (() => {
  const line = readFileSync(join(__dirname, '..', '..', 'web', '_headers'), 'utf8').split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  assert.ok(line, 'the policy is there');
  const out = new Map<string, string[]>();
  for (const part of line.split(':').slice(1).join(':').split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out.set(name, values);
  }
  return out;
})();

test('photos from Supabase Storage can be shown', () => {
  assert.ok(csp.get('img-src')?.includes('https://SUPABASE_HOST'), 'img-src allows the project (signed photo links)');
});

test('the captcha and Razorpay Checkout (D104) may load their script and frame, and nothing else comes from another origin', () => {
  assert.deepEqual(csp.get('script-src'), ["'self'", 'https://challenges.cloudflare.com', 'https://checkout.razorpay.com']);
  assert.deepEqual(csp.get('frame-src'), ['https://challenges.cloudflare.com', 'https://api.razorpay.com', 'https://checkout.razorpay.com']);
  assert.deepEqual(csp.get('connect-src'), ["'self'", 'https://SUPABASE_HOST', 'wss://SUPABASE_HOST', 'https://api.razorpay.com', 'https://lumberjack.razorpay.com']);
  assert.ok(!csp.get('script-src')?.some((v) => v.includes('unsafe')), 'no inline script, no eval');
  assert.deepEqual(csp.get('frame-ancestors'), ["'none'"], 'nobody may frame the site');
});

test('the site itself may ask for the location ("Use my location", D087), and nothing else may', () => {
  const line = readFileSync(join(__dirname, '..', '..', 'web', '_headers'), 'utf8').split('\n').find((l) => l.trim().startsWith('Permissions-Policy:'));
  assert.ok(line);
  assert.match(line, /geolocation=\(self\)/, 'with geolocation=() the browser refuses before the person is even asked');
  assert.match(line, /camera=\(\)/);
  assert.match(line, /microphone=\(\)/);
});
