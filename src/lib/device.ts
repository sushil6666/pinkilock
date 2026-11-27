/**
 * This app's own device id (D118): random, made once and kept on this phone or in this browser,
 * never a hardware id. The server uses it only to see one device on two accounts, so that a
 * friend's sign-up counts once (supabase/migrations/20261127000002_referrals.sql). Clearing the
 * app's data makes a new one; that device then has to be new to every account to count.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { DEVICE_ID } from '../domain/referrals';
import type { Backend } from '../services/backend';
import { quiet } from './log';

const KEY = 'pinkilock.device';

export async function deviceId(): Promise<string> {
  const kept = await AsyncStorage.getItem(KEY).catch(() => null);
  if (kept && DEVICE_ID.test(kept)) return kept;
  const made = Crypto.randomUUID().replace(/-/g, '');
  await AsyncStorage.setItem(KEY, made).catch(quiet('device.keep'));
  return made;
}

/** Tell the server which device this is. Never in the way of the app opening. */
export async function noteDevice(backend: Pick<Backend, 'noteDevice'>): Promise<void> {
  await backend.noteDevice(await deviceId()).catch(quiet('device.note'));
}
