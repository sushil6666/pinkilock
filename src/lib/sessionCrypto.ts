/**
 * The session store, encrypted (docs/build-plan.md, WP5; gap G9). The session (access and refresh
 * tokens) is large, and the phone's keystore (expo-secure-store) is small, so the pattern Supabase
 * documents for React Native is used: a fresh 256-bit key per item lives in the keystore, and the
 * item itself is kept AES-CTR encrypted in AsyncStorage. A backup or a rooted phone's AsyncStorage
 * file alone no longer gives the session away.
 *
 * Pure: storage, keystore and randomness are handed in, so tests/unit/session.test.ts runs it in
 * Node. src/services/index.ts wires the phone's real ones.
 */
import aesjs from 'aes-js';
import type { SessionStorage } from '../services/supabase/supabaseBackend';

export interface KeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** Keystore keys allow only letters, digits, '.', '-' and '_'. */
const keyName = (key: string) => `pk.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function encryptedStorage(data: SessionStorage, keys: KeyStore, random: (bytes: number) => Uint8Array): SessionStorage {
  return {
    async getItem(key) {
      const stored = await data.getItem(key);
      if (!stored) return null;
      const hexKey = await keys.getItemAsync(keyName(key));
      // A session saved before encryption existed is plain JSON with no key: hand it back once, and
      // the next write (Supabase refreshes the session within the hour) stores it encrypted.
      // Anything else without its key cannot be read: treat it as signed out rather than fail.
      if (!hexKey) return stored.startsWith('{') ? stored : null;
      const ctr = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hexKey), new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(stored)));
    },
    async setItem(key, value) {
      const raw = random(32);
      const ctr = new aesjs.ModeOfOperation.ctr(raw, new aesjs.Counter(1));
      const sealed = aesjs.utils.hex.fromBytes(ctr.encrypt(aesjs.utils.utf8.toBytes(value)));
      await keys.setItemAsync(keyName(key), aesjs.utils.hex.fromBytes(raw));
      await data.setItem(key, sealed);
    },
    async removeItem(key) {
      await data.removeItem(key);
      await keys.deleteItemAsync(keyName(key));
    },
  };
}
