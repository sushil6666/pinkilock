/**
 * A friend's invite link (D109), /r/CODE. Someone with no profile yet opens it, sets up, and the
 * code is used once their profile exists: it waits on this phone until then, and goes once used.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REFERRAL_CODE, referralCode } from '../domain/talk';
import type { Backend } from '../services/backend';
import { quiet } from './log';

const KEY = 'pinkilock.referral';
const DUO_KEY = 'pinkilock.duo';
const DUO_TOKEN = /^[0-9a-f]{16}$/;

export async function keepReferral(raw: string): Promise<void> {
  const code = referralCode(raw);
  if (REFERRAL_CODE.test(code)) await AsyncStorage.setItem(KEY, code).catch(quiet('referral.keep'));
}

/** After onboarding: use the code that waited, once. A refusal (an old link, my own) is dropped. */
export async function claimKeptReferral(backend: Pick<Backend, 'claimReferral'>): Promise<void> {
  const code = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!code) return;
  await AsyncStorage.removeItem(KEY).catch(quiet('referral.drop'));
  await backend.claimReferral(code).catch(quiet('referral.claim'));
}

/**
 * A friend's Doubles invite (/duo/TOKEN, D118) opened before a profile exists: kept here while
 * onboarding runs, then onboarding goes back to it once, so joining the duo counts as their link.
 */
export async function keepDuo(token: string): Promise<void> {
  if (DUO_TOKEN.test(token)) await AsyncStorage.setItem(DUO_KEY, token).catch(quiet('duo.keep'));
}

export async function takeKeptDuo(): Promise<string | null> {
  const token = await AsyncStorage.getItem(DUO_KEY).catch(() => null);
  if (!token) return null;
  await AsyncStorage.removeItem(DUO_KEY).catch(quiet('duo.drop'));
  return DUO_TOKEN.test(token) ? token : null;
}
