/**
 * Picks the backend once. With no Supabase keys in the environment the app runs on the mock, so
 * the whole flow can be tried on a phone before any account exists. Add the two keys to `.env`
 * (see .env.example) and the same screens talk to the live database.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import type { Backend } from './backend';
import { createMockBackend } from './mock/mockBackend';
import { createSupabaseBackend } from './supabase/supabaseBackend';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const wantsLive = process.env.EXPO_PUBLIC_BACKEND !== 'mock';

export const backend: Backend = wantsLive && url && key ? createSupabaseBackend(url, key, AsyncStorage) : createMockBackend();

export type { Backend, BackendEvent, Changes, Notice, Snapshot } from './backend';
