/**
 * Picks the backend once. With no Supabase keys in the environment the app runs on the mock, so
 * the whole flow can be tried on a phone before any account exists. Add the two keys to `.env`
 * (see .env.example) and the same screens talk to the live database.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import type { Backend } from './backend';
import { createMockBackend } from './mock/mockBackend';
import { encryptedStorage } from '../lib/sessionCrypto';
import { captchaToken } from '../lib/captcha';
import { openCheckout } from '../lib/razorpay';
import { createSupabaseBackend, type SessionStorage } from './supabase/supabaseBackend';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const wantsLive = process.env.EXPO_PUBLIC_BACKEND !== 'mock';
// Set by the production build profile (eas.json). A store build must never fall back to the mock.
const production = process.env.EXPO_PUBLIC_APP_ENV === 'production';
if (production && !(url && key)) {
  throw new Error('This production build has no Supabase keys. It must not run on mock data.');
}

// On a phone the session is encrypted, its keys in the keystore (src/lib/sessionCrypto.ts). In a
// browser there is no keystore, so it stays in the page's own storage.
const sessionStore: SessionStorage = Platform.OS === 'web'
  ? AsyncStorage
  : encryptedStorage(AsyncStorage, SecureStore, (bytes) => Crypto.getRandomBytes(bytes));

export const backend: Backend = (production || wantsLive) && url && key ? createSupabaseBackend(url, key, sessionStore, { captcha: captchaToken, platform: Platform.OS, checkout: openCheckout }) : createMockBackend({ captcha: captchaToken });

export type { Backend, BackendEvent, Changes, Notice, PrivacyRequestKind, PushPlatform, Snapshot } from './backend';
