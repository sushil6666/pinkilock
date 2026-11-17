/** The encrypted session store (WP5): what reaches AsyncStorage is unreadable without the keystore. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { encryptedStorage } from '../../src/lib/sessionCrypto';
import { memoryStorage } from '../live/helpers.memory';

function keystore() {
  const m = new Map<string, string>();
  return {
    m,
    getItemAsync: async (k: string) => m.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void m.set(k, v),
    deleteItemAsync: async (k: string) => void m.delete(k),
  };
}

test('a session round-trips, and what is stored on disk does not contain it', async () => {
  const disk = memoryStorage();
  const keys = keystore();
  const store = encryptedStorage(disk, keys, (n) => new Uint8Array(randomBytes(n)));
  const session = JSON.stringify({ access_token: 'eyJhbGciOi.secret.token', refresh_token: 'r3fr3sh', user: { id: 'u1' } });
  await store.setItem('sb-auth-token', session);
  assert.equal(await store.getItem('sb-auth-token'), session);
  const onDisk = [...disk.dump().values()].join('');
  assert.ok(!onDisk.includes('secret') && !onDisk.includes('r3fr3sh'), 'the tokens are not readable on disk');
  assert.equal(keys.m.size, 1, 'one key in the keystore');
});

test('without its key, a stored session reads as signed out; removing clears both', async () => {
  const disk = memoryStorage();
  const keys = keystore();
  const store = encryptedStorage(disk, keys, (n) => new Uint8Array(randomBytes(n)));
  await store.setItem('k', 'value');
  keys.m.clear();
  assert.equal(await store.getItem('k'), null);
  await store.setItem('k', 'value');
  await store.removeItem('k');
  assert.equal(disk.dump().size, 0);
  assert.equal(keys.m.size, 0);
});

test('a plain session saved before encryption is still read, once, until it is rewritten', async () => {
  const disk = memoryStorage();
  const keys = keystore();
  await disk.setItem('k', '{"access_token":"old"}');
  const store = encryptedStorage(disk, keys, (n) => new Uint8Array(randomBytes(n)));
  assert.equal(await store.getItem('k'), '{"access_token":"old"}');
  await store.setItem('k', '{"access_token":"new"}');
  assert.ok(!(await disk.getItem('k'))!.includes('new'));
});

test('every write uses a fresh key', async () => {
  const disk = memoryStorage();
  const keys = keystore();
  const store = encryptedStorage(disk, keys, (n) => new Uint8Array(randomBytes(n)));
  await store.setItem('k', 'same');
  const first = [...disk.dump().values()][0];
  await store.setItem('k', 'same');
  assert.notEqual([...disk.dump().values()][0], first);
});
